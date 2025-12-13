$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'

$script:AgentVersion = '0.1.0'
$script:NvidiaSmiPath = $null
$script:HwLibLoaded = $false
$script:HwLibNamespace = $null
$script:HwLibLastError = $null
$script:HwLibPathCache = @{}
$script:HwLibAssembly = $null
$script:NetPrev = @{}
$script:NetProbe = @{
    lastAt = [datetime]'1900-01-01'
    ping = @{}
    publicIpLastAt = [datetime]'1900-01-01'
    publicIp = $null
    lastProbe = $null
}

function Get-AgentBasePath {
    function Normalize-Base([string]$path) {
        if (-not $path) { return $path }
        if ((Split-Path -Leaf $path) -eq 'src') {
            $parent = Split-Path -Parent $path
            if ($parent) { return $parent }
        }
        return $path
    }

    if ($PSScriptRoot -and -not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        return (Normalize-Base $PSScriptRoot)
    }
    if ($MyInvocation.MyCommand.Path) {
        return (Normalize-Base (Split-Path -Parent $MyInvocation.MyCommand.Path))
    }
    $entry = [System.Reflection.Assembly]::GetEntryAssembly()
    if ($entry) {
        $loc = $entry.Location
        if ($loc) {
            return (Normalize-Base (Split-Path -Parent $loc))
        }
    }
    return (Get-Location).Path
}

function Resolve-HwLibPath {
    param(
        [Parameter(Mandatory)] [string]$DllName
    )

    if ($script:HwLibPathCache.ContainsKey($DllName)) {
        return $script:HwLibPathCache[$DllName]
    }

    $candidates = @()

    # Module/exe base
    $base = Get-AgentBasePath
    if ($base) { $candidates += $base }

    # Parent of base (handles dist/src -> dist)
    try {
        $parent = Split-Path -Parent $base
        if ($parent) { $candidates += $parent }
    } catch { }

    # Current working directory
    $candidates += (Get-Location).Path

    foreach ($cand in $candidates) {
        $p = Join-Path $cand $DllName
        if (Test-Path $p) {
            $script:HwLibPathCache[$DllName] = $p
            return $p
        }
    }

    return $null
}

function Read-AgentConfig {
    param(
        [Parameter(Mandatory)]
        [string]$ConfigPath
    )

    if (-not (Test-Path $ConfigPath)) {
        throw "Config file not found at $ConfigPath"
    }

    $json = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
    if (-not $json.baseUrl -or -not $json.deviceId -or -not $json.agentToken) {
        throw "Config missing required fields: baseUrl, deviceId, agentToken"
    }

    if (-not $json.networkProbeIntervalSeconds) { $json | Add-Member -NotePropertyName networkProbeIntervalSeconds -NotePropertyValue 10 -Force }
    if (-not $json.networkTargets) { $json | Add-Member -NotePropertyName networkTargets -NotePropertyValue @("gateway", "1.1.1.1", "8.8.8.8") -Force }
    if (-not $json.networkDnsTestHost) { $json | Add-Member -NotePropertyName networkDnsTestHost -NotePropertyValue "one.one.one.one" -Force }
    if ($null -eq $json.enablePublicIp) { $json | Add-Member -NotePropertyName enablePublicIp -NotePropertyValue $false -Force }

    return $json
}

function Get-AgentHeaders {
    param(
        [Parameter(Mandatory)]
        $Config
    )

    return @{
        'x-device-id'    = $Config.deviceId
        'x-agent-token'  = $Config.agentToken
        'user-agent'     = "pulseboard-agent/$($script:AgentVersion)"
        'content-type'   = 'application/json'
        'accept'         = 'application/json'
    }
}

function Get-PerfCounterFirst {
    param([string[]]$Paths)
    foreach ($p in $Paths) {
        try {
            $c = Get-Counter -Counter $p -ErrorAction Stop
            $s = $c.CounterSamples | Where-Object { $_.CookedValue -gt 0 } | Select-Object -First 1
            if ($s) { return [math]::Round($s.CookedValue, 1) }
        } catch { }
    }
    return $null
}

function Convert-LinkSpeedToMbps {
    param([object]$LinkSpeed)
    if (-not $LinkSpeed) { return $null }
    $s = "$LinkSpeed".Trim()
    if (-not $s) { return $null }
    if ($s -match '([0-9]+(\.[0-9]+)?)\s*Gbps') { return [math]::Round(([double]$matches[1]) * 1000, 1) }
    if ($s -match '([0-9]+(\.[0-9]+)?)\s*Mbps') { return [math]::Round(([double]$matches[1]), 1) }
    if ($s -match '([0-9]+(\.[0-9]+)?)\s*Kbps') { return [math]::Round(([double]$matches[1]) / 1000, 3) }
    return $null
}

function Get-PrimaryRoute {
    try {
        return (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop | Sort-Object RouteMetric, IfMetric | Select-Object -First 1)
    } catch { return $null }
}

function Get-DefaultGateway {
    try {
        $route = Get-PrimaryRoute
        if ($route -and $route.NextHop) { return $route.NextHop }
    } catch { }
    try {
        $gw = (Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1).DefaultIPGateway[0]
        if ($gw) { return $gw }
    } catch { }
    return $null
}

function Get-BaseUrlHost {
    param([Parameter(Mandatory)] $Config)
    try {
        $u = [uri]$Config.baseUrl
        if ($u -and $u.Host) { return $u.Host }
    } catch { }
    return $null
}

function Update-PingWindow {
    param(
        [Parameter(Mandatory)] [string]$Target,
        [Parameter(Mandatory)] [object[]]$Replies,
        [int]$Window = 30
    )
    if (-not $script:NetProbe.ping.ContainsKey($Target)) {
        $script:NetProbe.ping[$Target] = New-Object System.Collections.Generic.List[object]
    }
    $list = $script:NetProbe.ping[$Target]
    foreach ($r in $Replies) { $list.Add($r) }
    while ($list.Count -gt $Window) { $list.RemoveAt(0) }
}

function Get-PingStats {
    param([Parameter(Mandatory)] [string]$Target)
    if (-not $script:NetProbe.ping.ContainsKey($Target)) { return $null }
    $list = $script:NetProbe.ping[$Target]
    if (-not $list -or $list.Count -eq 0) { return $null }

    $sent = $list.Count
    $ok = @($list | Where-Object { $_ -ne $null -and $_ -is [double] })
    $recv = $ok.Count
    $loss = if ($sent -gt 0) { [math]::Round((($sent - $recv) / $sent) * 100, 1) } else { 0 }

    $avg = $null; $min = $null; $max = $null; $jitter = $null; $last = $null
    if ($recv -gt 0) {
        $avg = [math]::Round((($ok | Measure-Object -Average).Average), 1)
        $min = [math]::Round((($ok | Measure-Object -Minimum).Minimum), 1)
        $max = [math]::Round((($ok | Measure-Object -Maximum).Maximum), 1)
        $lastVal = ($ok | Select-Object -Last 1)
        if ($lastVal -ne $null) { $last = [math]::Round($lastVal, 1) }
        if ($recv -ge 2) {
            $mean = ($ok | Measure-Object -Average).Average
            $var = ($ok | ForEach-Object { [math]::Pow(($_ - $mean), 2) } | Measure-Object -Average).Average
            $jitter = [math]::Round([math]::Sqrt($var), 1)
        }
    }

    return @{
        target = $Target
        lastMs = $last
        avgMs = $avg
        minMs = $min
        maxMs = $max
        jitterMs = $jitter
        lossPct = $loss
        window = $sent
    }
}

function Invoke-NetworkProbe {
    param([Parameter(Mandatory)] $Config)

    $now = Get-Date
    $interval = [int]$Config.networkProbeIntervalSeconds
    if ($interval -lt 2) { $interval = 2 }
    if ((($now - $script:NetProbe.lastAt).TotalSeconds) -lt $interval) { return $script:NetProbe.lastProbe }
    $script:NetProbe.lastAt = $now

    $targets = @()
    foreach ($t in @($Config.networkTargets)) {
        if (-not $t) { continue }
        if ($t -eq "gateway") {
            $gw = Get-DefaultGateway
            if ($gw) { $targets += $gw }
        } elseif ($t -eq "baseUrlHost") {
            $h = Get-BaseUrlHost -Config $Config
            if ($h) { $targets += $h }
        } else {
            $targets += $t
        }
    }
    $targets = $targets | Where-Object { $_ } | Select-Object -Unique

    $pingResults = @()
    foreach ($target in $targets) {
        $ms = $null
        try {
            $reply = Test-Connection -ComputerName $target -Count 1 -ErrorAction SilentlyContinue
            if ($reply -and $reply.ResponseTime -ne $null) { $ms = [double]$reply.ResponseTime }
        } catch { $ms = $null }
        Update-PingWindow -Target $target -Replies @($ms)
        $pingResults += (Get-PingStats -Target $target)
    }

    $dnsMs = $null
    $dnsOk = $false
    $dnsHost = $Config.networkDnsTestHost
    if (-not $dnsHost) { $dnsHost = "one.one.one.one" }
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        Resolve-DnsName -Name $dnsHost -ErrorAction Stop | Out-Null
        $sw.Stop()
        $dnsMs = [math]::Round($sw.Elapsed.TotalMilliseconds, 1)
        $dnsOk = $true
    } catch { $dnsOk = $false }

    if ($Config.enablePublicIp -and ((($now - $script:NetProbe.publicIpLastAt).TotalMinutes) -ge 60 -or -not $script:NetProbe.publicIp)) {
        try {
            $script:NetProbe.publicIpLastAt = $now
            $ip = Invoke-RestMethod -Uri "https://api.ipify.org?format=text" -Method Get -TimeoutSec 5
            if ($ip) { $script:NetProbe.publicIp = ($ip | Out-String).Trim() }
        } catch { }
    }

    $http = $null
    try {
        $base = "$($Config.baseUrl)".TrimEnd('/')
        if ($base) {
            $url = "$base/api/debug/samples"
            $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
            $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 5 -ErrorAction Stop
            $sw2.Stop()
            $http = @{
                url = $url
                ok = $true
                status = [int]$resp.StatusCode
                ms = [math]::Round($sw2.Elapsed.TotalMilliseconds, 1)
            }
        }
    } catch {
        try {
            if ($url) {
                $http = @{
                    url = $url
                    ok = $false
                    status = $null
                    ms = $null
                }
            }
        } catch { }
    }

    $probe = @{
        at = $now.ToUniversalTime().ToString("o")
        intervalSec = $interval
        ping = $pingResults | Where-Object { $_ -ne $null }
        dns = @{ host = $dnsHost; ok = $dnsOk; ms = $dnsMs }
        http = $http
        publicIp = $script:NetProbe.publicIp
    }
    $script:NetProbe.lastProbe = $probe
    return $probe
}

function Get-NetworkMetrics {
    param([Parameter(Mandatory)] $Config)
    $now = Get-Date
    $route = Get-PrimaryRoute
    $defaultIf = if ($route) { $route.InterfaceIndex } else { $null }
    $gateway = Get-DefaultGateway

    $dnsServers = @()
    try {
        $dnsServers = (Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop | Select-Object -ExpandProperty ServerAddresses) | Where-Object { $_ } | Select-Object -Unique
    } catch { $dnsServers = @() }

    $adapters = @()
    try { $adapters = Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq "Up" } } catch { $adapters = @() }

    $stats = @()
    try { $stats = Get-NetAdapterStatistics -ErrorAction Stop } catch { $stats = @() }

    $ifList = @()
    $sumRxBps = 0
    $sumTxBps = 0

    foreach ($a in $adapters) {
        $s = $stats | Where-Object { $_.Name -eq $a.Name } | Select-Object -First 1
        $rxBytes = if ($s) { [double]$s.ReceivedBytes } else { $null }
        $txBytes = if ($s) { [double]$s.SentBytes } else { $null }
        $rxErr = if ($s) { $s.ReceivedErrors } else { $null }
        $txErr = if ($s) { $s.OutboundErrors } else { $null }
        $rxDisc = if ($s) { $s.ReceivedDiscardedPackets } else { $null }
        $txDisc = if ($s) { $s.OutboundDiscardedPackets } else { $null }

        $rxBps = $null
        $txBps = $null
        $key = [string]$a.ifIndex
        if ($rxBytes -ne $null -and $txBytes -ne $null) {
            if ($script:NetPrev.ContainsKey($key)) {
                $prev = $script:NetPrev[$key]
                $elapsed = ($now - $prev.at).TotalSeconds
                if ($elapsed -gt 0.2) {
                    $rxBps = [math]::Round((($rxBytes - $prev.rxBytes) / $elapsed), 1)
                    $txBps = [math]::Round((($txBytes - $prev.txBytes) / $elapsed), 1)
                }
            }
            $script:NetPrev[$key] = @{ at = $now; rxBytes = $rxBytes; txBytes = $txBytes }
        }

        if ($rxBps -ne $null) { $sumRxBps += $rxBps }
        if ($txBps -ne $null) { $sumTxBps += $txBps }

        $ipv4 = @()
        $ipv6 = @()
        try {
            $ipv4 = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress)
            $ipv6 = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress)
        } catch { }

        $ifList += [pscustomobject]@{
            name = $a.Name
            ifIndex = $a.ifIndex
            description = $a.InterfaceDescription
            mac = $a.MacAddress
            linkSpeedMbps = (Convert-LinkSpeedToMbps -LinkSpeed $a.LinkSpeed)
            ipv4 = $ipv4
            ipv6 = $ipv6
            rxBytes = $rxBytes
            txBytes = $txBytes
            rxBps = $rxBps
            txBps = $txBps
            rxErrors = $rxErr
            txErrors = $txErr
            rxDiscards = $rxDisc
            txDiscards = $txDisc
        }
    }

    $probe = Invoke-NetworkProbe -Config $Config

    return [pscustomobject]@{
        defaultIfIndex = $defaultIf
        gateway = $gateway
        dnsServers = $dnsServers
        totals = [pscustomobject]@{ rxBps = [math]::Round($sumRxBps, 1); txBps = [math]::Round($sumTxBps, 1) }
        interfaces = $ifList
        probe = $probe
    }
}

function Get-NvidiaSmiPath {
    if ($script:NvidiaSmiPath) { return $script:NvidiaSmiPath }
    $candidates = @(
        "$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
        "$env:ProgramFiles(x86)\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
        "C:\\Windows\\System32\\nvidia-smi.exe",
        "nvidia-smi.exe"
    )
    foreach ($c in $candidates) {
        if (Get-Command $c -ErrorAction SilentlyContinue) {
            $script:NvidiaSmiPath = $c
            return $c
        }
    }
    return $null
}

function Get-NvidiaSmiTemps {
    $path = Get-NvidiaSmiPath
    if (-not $path) { return $null }
    try {
        $output = & $path --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null
        if ($output) {
            $val = $output.Trim() -replace "[^0-9\\.]", ""
            if ($val) {
                $temp = [double]$val
                return [pscustomobject]@{
                    gpuTempC = $temp
                    cpuTempC = $null
                    boardTempC = $null
                    source = "nvidia-smi"
                    reason = ""
                }
            }
        }
    } catch { return $null }
    return $null
}

function Get-AmdGpuTemps {
    $paths = @(
        "\\GPU Adapter(*)\\Temperature",
        "\\GPU Adapter(*)\\Temperature C",
        "\\GPU Temperature(*)\\Temperature",
        "\\GPU Engine(*)\\Temperature C",
        "\\ATI GPU(*)\\Temperature",
        "\\AMDGPU(*)\\Temperature",
        "\\GPU Thermal(*)\\Temperature"
    )
    foreach ($p in $paths) {
        try {
            $c = Get-Counter -Counter $p -ErrorAction Stop
            $s = $c.CounterSamples | Where-Object { $_.CookedValue -gt 0 } | Select-Object -First 1
            if ($s) {
                return [pscustomobject]@{
                    gpuTempC = [math]::Round($s.CookedValue, 1)
                    cpuTempC = $null
                    boardTempC = $null
                    source = "amd-perf"
                    reason = ""
                }
            }
        } catch { }
    }
    return $null
}

function Get-AmdCustomTemps {
    $cmd = $env:PULSEBOARD_AMD_TEMP_CMD
    if (-not $cmd -or [string]::IsNullOrWhiteSpace($cmd)) { return $null }
    $parts = $cmd -split ' '
    if ($parts.Length -eq 0) { return $null }
    try {
        $exe = $parts[0]
        $args = @()
        if ($parts.Length -gt 1) { $args = $parts[1..($parts.Length-1)] }
        $out = & $exe @args 2>$null
        if ($out) {
            $text = ($out | Out-String)
            $match = [regex]::Match($text, "([0-9]+(\.[0-9]+)?)")
            if ($match.Success) {
                $val = [double]$match.Groups[1].Value
                return [pscustomobject]@{
                    gpuTempC = $val
                    cpuTempC = $null
                    boardTempC = $null
                    source = "amd-custom"
                    reason = ""
                }
            }
        }
    } catch { return $null }
    return $null
}

function Get-HwinfoTemps {
    $procs = Get-Process -Name "HWiNFO64","HWiNFO32" -ErrorAction SilentlyContinue
    if (-not $procs) {
        return @{
            cpuTempC = $null
            gpuTempC = $null
            boardTempC = $null
            source = "none"
            reason = "HWiNFO not detected (shared memory disabled or not running)"
        }
    }

    # Placeholder: shared memory parsing not implemented here
    return @{
        cpuTempC = $null
        gpuTempC = $null
        boardTempC = $null
        source = "hwinfo"
        reason = "HWiNFO detected but shared memory parsing not implemented"
    }
}

function Get-HardwareMonitorTemps {
    param(
        [Parameter(Mandatory)] [string]$DllName,
        [Parameter(Mandatory)] [string]$Namespace,
        [Parameter(Mandatory)] [string]$Source
    )

    $dllPath = Resolve-HwLibPath -DllName $DllName
    if (-not $dllPath) {
        $script:HwLibLastError = "DLL not found: $DllName"
        return $null
    }

    try {
        if (-not $script:HwLibLoaded -or $script:HwLibNamespace -ne $Namespace) {
            try {
                $script:HwLibAssembly = [System.Reflection.Assembly]::LoadFrom($dllPath)
            } catch {
                $script:HwLibLastError = $_.Exception.Message
                return $null
            }
            $script:HwLibLoaded = $true
            $script:HwLibNamespace = $Namespace
            $script:HwLibLastError = $null
        }

        $computerTypeName = "$Namespace.Computer"
        $sensorTypeName = "$Namespace.SensorType"
        $hardwareTypeName = "$Namespace.HardwareType"

        $computerType = $script:HwLibAssembly.GetType($computerTypeName, $false, $true)
        $sensorType = $script:HwLibAssembly.GetType($sensorTypeName, $false, $true)
        $hardwareType = $script:HwLibAssembly.GetType($hardwareTypeName, $false, $true)

        if (-not $computerType -or -not $sensorType -or -not $hardwareType) {
            $script:HwLibLastError = "Hardware lib type not found: $computerTypeName"
            return $null
        }

        if (-not $script:HwLibComputer -or $script:HwLibComputerNamespace -ne $Namespace -or -not $script:HwLibComputerOpened) {
            try {
                if ($script:HwLibComputer) {
                    try { $script:HwLibComputer.Close() } catch { }
                }
                $computer = [Activator]::CreateInstance($computerType)
                $computer.IsCpuEnabled = $true
                $computer.IsGpuEnabled = $true
                $computer.IsMotherboardEnabled = $true
                $computer.IsControllerEnabled = $true
                $computer.Open()
                $script:HwLibComputer = $computer
                $script:HwLibComputerNamespace = $Namespace
                $script:HwLibComputerOpened = $true
            } catch {
                $script:HwLibLastError = $_.Exception.Message
                $script:HwLibComputer = $null
                $script:HwLibComputerOpened = $false
                return $null
            }
        }
        $computer = $script:HwLibComputer

        $sensorType = $script:HwLibAssembly.GetType($sensorTypeName, $false, $true)
        $hardwareType = $script:HwLibAssembly.GetType($hardwareTypeName, $false, $true)
        if (-not $sensorType -or -not $hardwareType) {
            $script:HwLibLastError = "Hardware lib sensor types not found: $sensorTypeName / $hardwareTypeName"
            return $null
        }

        $temps = @{
            cpuTempC         = $null
            gpuTempC         = $null # GPU core
            gpuMemoryTempC   = $null
            gpuHotspotTempC  = $null
            boardTempC       = $null
        }
        $cpuSensors = New-Object 'System.Collections.Generic.List[pscustomobject]'
        $gpuCoreTemps = New-Object 'System.Collections.Generic.List[double]'
        $gpuMemTemps = New-Object 'System.Collections.Generic.List[double]'
        $gpuHotspotTemps = New-Object 'System.Collections.Generic.List[double]'
        $boardTemps = New-Object 'System.Collections.Generic.List[double]'
        $allTemps = New-Object 'System.Collections.Generic.List[pscustomobject]'

        $processHardware = {
            param($hwItem)
            $hwItem.Update()
            foreach ($sensor in $hwItem.Sensors) {
                if ($sensor.SensorType -ne $sensorType::Temperature) { continue }
                $val = $sensor.Value
                if ($val -eq $null) { continue }
                $rounded = [math]::Round([double]$val, 1)
                if ($rounded -le 5 -or $rounded -ge 120) { continue }

                $name = [string]$sensor.Name
                $lower = $name.ToLowerInvariant()

                switch ($hwItem.HardwareType) {
                    { $_ -eq $hardwareType::Cpu } {
                        $cpuSensors.Add([pscustomobject]@{ name = $name; value = $rounded })
                    }
                    { $_ -eq $hardwareType::GpuNvidia -or $_ -eq $hardwareType::GpuAmd } {
                        if ($lower -match "hot spot|hotspot|junction") {
                            $gpuHotspotTemps.Add($rounded)
                        } elseif ($lower -match "memory|vram|hbm") {
                            $gpuMemTemps.Add($rounded)
                        } else {
                            $gpuCoreTemps.Add($rounded)
                        }
                    }
                    { $_ -eq $hardwareType::Motherboard -or $_ -eq $hardwareType::SuperIO } {
                        $boardTemps.Add($rounded)
                        if ($lower -match "cpu|package|tctl|tdie|die" -and $lower -notmatch "gpu") {
                            $cpuSensors.Add([pscustomobject]@{ name = $name; value = $rounded })
                        }
                    }
                }

                $allTemps.Add([pscustomobject]@{ name = $name; value = $rounded })
            }

            foreach ($sub in $hwItem.SubHardware) {
                & $processHardware $sub
            }
        }

        foreach ($hw in $computer.Hardware) {
            & $processHardware $hw
        }

        if ($cpuSensors.Count -gt 0) {
            $candidates = $cpuSensors.ToArray()
            $priority = @("Package","Tctl","Tdie","Die","Core Max","CCD")
            foreach ($pat in $priority) {
                $vals = @($candidates | Where-Object { $_.name -match $pat } | Select-Object -ExpandProperty value)
                if ($vals.Count -gt 0) {
                    $temps.cpuTempC = [math]::Round(($vals | Measure-Object -Maximum).Maximum, 1)
                    break
                }
            }
            if (-not $temps.cpuTempC) {
                $vals = @($candidates | Select-Object -ExpandProperty value)
                if ($vals.Count -gt 0) {
                    $temps.cpuTempC = [math]::Round(($vals | Measure-Object -Maximum).Maximum, 1)
                }
            }
        }
        if ($gpuCoreTemps.Count -gt 0) { $temps.gpuTempC = [math]::Round(($gpuCoreTemps | Measure-Object -Maximum).Maximum, 1) }
        if ($gpuMemTemps.Count -gt 0) { $temps.gpuMemoryTempC = [math]::Round(($gpuMemTemps | Measure-Object -Maximum).Maximum, 1) }
        if ($gpuHotspotTemps.Count -gt 0) { $temps.gpuHotspotTempC = [math]::Round(($gpuHotspotTemps | Measure-Object -Maximum).Maximum, 1) }
        if ($boardTemps.Count -gt 0) { $temps.boardTempC = [math]::Round(($boardTemps | Measure-Object -Maximum).Maximum, 1) }

        if (-not $temps.cpuTempC -and -not $temps.gpuTempC -and -not $temps.gpuMemoryTempC -and -not $temps.boardTempC) {
            $script:HwLibLastError = "No temperature sensors returned from $DllName"
            return $null
        }

        return [pscustomobject]@{
            cpuTempC   = $temps.cpuTempC
            gpuTempC   = $temps.gpuTempC
            gpuMemoryTempC = $temps.gpuMemoryTempC
            boardTempC = $temps.boardTempC
            cpuTempMaxC = $temps.cpuTempC
            gpuHotspotTempC = $temps.gpuHotspotTempC
            temps = $allTemps.ToArray()
            source     = $Source
            reason     = ""
        }
    } catch {
        $script:HwLibLastError = $_.Exception.Message
        return $null
    }
}

function Close-HardwareMonitorSession {
    try {
        if ($script:HwLibComputer) {
            try { $script:HwLibComputer.Close() } catch { }
        }
    } finally {
        $script:HwLibComputer = $null
        $script:HwLibComputerOpened = $false
        $script:HwLibComputerNamespace = $null
    }
}

function Get-PulseboardTemps {
    # Default response
    $result = @{
        cpuTempC   = $null
        gpuTempC   = $null
        gpuMemoryTempC = $null
        gpuHotspotTempC = $null
        boardTempC = $null
        cpuTempMaxC = $null
        temps = @()
        tempSource = "none"
        tempReason = "No trusted sensor provider available"
    }

    $attemptedLib = $false
    $foundDll = $false

    # Hardware monitor DLLs (prefer LibreHardwareMonitor)
    $hwLibs = @(
        @{ Dll = "LibreHardwareMonitorLib.dll"; Namespace = "LibreHardwareMonitor.Hardware"; Source = "librehw" }
    )
    foreach ($lib in $hwLibs) {
        $attemptedLib = $true
        $dllPath = Join-Path (Get-AgentBasePath) $lib.Dll
        if (Test-Path $dllPath) { $foundDll = $true }

        $hwTemps = Get-HardwareMonitorTemps -DllName $lib.Dll -Namespace $lib.Namespace -Source $lib.Source
        if ($hwTemps) {
            $result.cpuTempC = $hwTemps.cpuTempC
            $result.gpuTempC = $hwTemps.gpuTempC
            $result.gpuMemoryTempC = $hwTemps.gpuMemoryTempC
            $result.gpuHotspotTempC = $hwTemps.gpuHotspotTempC
            $result.boardTempC = $hwTemps.boardTempC
            $result.cpuTempMaxC = $hwTemps.cpuTempMaxC
            $result.temps = $hwTemps.temps
            $result.tempSource = $hwTemps.source
            $result.tempReason = $hwTemps.reason
            return $result
        }
    }

    if ($attemptedLib -and -not $foundDll) {
        $result.tempReason = "Hardware monitor DLL not found beside agent (Libre/OpenHardware)"
    } elseif ($foundDll -and $script:HwLibLastError) {
        $result.tempReason = "Hardware monitor DLL error: $($script:HwLibLastError)"
        $result.tempSource = "hwlib-error"
    } elseif ($foundDll) {
        $result.tempReason = "Hardware monitor DLL loaded but no temperature sensors returned"
        $result.tempSource = "hwlib"
    }

    # HWiNFO (best-effort placeholder) - only accept if any temp exists
    $hw = Get-HwinfoTemps
    if ($hw -and ($hw.cpuTempC -ne $null -or $hw.gpuTempC -ne $null -or $hw.boardTempC -ne $null)) {
        $result.cpuTempC = $hw.cpuTempC
        $result.gpuTempC = $hw.gpuTempC
        $result.boardTempC = $hw.boardTempC
        $result.tempSource = "hwinfo"
        $result.tempReason = $hw.reason
        return $result
    }

    # NVIDIA
    if ($result.cpuTempC -eq $null -and $result.gpuTempC -eq $null -and $result.boardTempC -eq $null) {
        $nv = Get-NvidiaSmiTemps
        if ($nv) {
            $result.gpuTempC = $nv.gpuTempC
            $result.cpuTempC = $nv.cpuTempC
            $result.boardTempC = $nv.boardTempC
            $result.tempSource = "nvidia-smi"
            $result.tempReason = ""
            return $result
        }
    }

    # AMD perf counters
    if ($result.cpuTempC -eq $null -and $result.gpuTempC -eq $null -and $result.boardTempC -eq $null) {
        $amd = Get-AmdGpuTemps
        if ($amd) {
            $result.gpuTempC = $amd.gpuTempC
            $result.cpuTempC = $amd.cpuTempC
            $result.boardTempC = $amd.boardTempC
            $result.tempSource = "amd-perf"
            $result.tempReason = ""
            return $result
        }
    }

    # AMD custom CLI (optional, user-provided via env PULSEBOARD_AMD_TEMP_CMD)
    if ($result.cpuTempC -eq $null -and $result.gpuTempC -eq $null -and $result.boardTempC -eq $null) {
        $amdCli = Get-AmdCustomTemps
        if ($amdCli) {
            $result.gpuTempC = $amdCli.gpuTempC
            $result.cpuTempC = $amdCli.cpuTempC
            $result.boardTempC = $amdCli.boardTempC
            $result.tempSource = "amd-custom"
            $result.tempReason = ""
            return $result
        }
    }

    # ACPI/perf fallback (only if nothing else)
    if ($result.cpuTempC -eq $null -and $result.gpuTempC -eq $null -and $result.boardTempC -eq $null -and $result.tempSource -eq "none") {
        $cpuPerf = Get-PerfCounterFirst @("\\Thermal Zone Information(*)\\Temperature")
        if ($cpuPerf -ne $null) {
            $result.cpuTempC = $cpuPerf
            $result.boardTempC = $cpuPerf
            $result.tempSource = "perf"
            $result.tempReason = ""
            return $result
        }

        # WMI ACPI ThermalZone (alternative)
        try {
            $acpi = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1
            if ($acpi -and $acpi.CurrentTemperature) {
                $celsius = [math]::Round(($acpi.CurrentTemperature / 10) - 273.15, 1)
                if ($celsius -ge 20 -and $celsius -lt 110) {
                    $result.cpuTempC = $celsius
                    $result.boardTempC = $celsius
                    $result.tempSource = "acpi"
                    $result.tempReason = ""
                    return $result
                } else {
                    $result.tempReason = "ACPI thermal reading out of range ($celsius °C)"
                }
            }
        } catch { }
    }

    # No providers
    if ($result.tempSource -eq "none" -and $result.tempReason -eq "No trusted sensor provider available") {
        $result.tempReason = "HWiNFO not detected (shared memory disabled) and no GPU/temp counters available"
    }
    return $result
}

function Get-SystemMetrics {
    param([Parameter(Mandatory)] $Config)
    $cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $os = Get-CimInstance Win32_OperatingSystem
    $memTotal = [math]::Round((($os.TotalVisibleMemorySize * 1KB) / 1GB), 2)
    $memFree = [math]::Round((($os.FreePhysicalMemory * 1KB) / 1GB), 2)
    $memUsed = [math]::Round($memTotal - $memFree, 2)

    $diskTotal = $null
    $diskFree = $null
    $diskUsed = $null
    $diskLabel = $null
    $disks = @()
    try {
        $rawDisks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3 AND Size>0"
        foreach ($d in $rawDisks) {
            try {
                $sizeGB = $null
                $freeGB = $null
                $usedGB = $null
                $pct = $null
                if ($d.Size -ne $null -and $d.Size -gt 0) {
                    $sizeGB = [math]::Round($d.Size / 1GB, 2)
                    if ($d.FreeSpace -ne $null) {
                        $freeGB = [math]::Round($d.FreeSpace / 1GB, 2)
                        $usedGB = [math]::Round($sizeGB - $freeGB, 2)
                        if ($sizeGB -gt 0) {
                            $pct = [math]::Round(($usedGB / $sizeGB) * 100, 1)
                        }
                    }
                }
                $disks += [pscustomobject]@{
                    id         = $d.DeviceID
                    label      = $d.VolumeName
                    fileSystem = $d.FileSystem
                    isReady    = $true
                    sizeGB     = $sizeGB
                    freeGB     = $freeGB
                    usedGB     = $usedGB
                    percent    = $pct
                }
            } catch { }
        }
        $primary = $disks | Sort-Object sizeGB -Descending | Select-Object -First 1
        if ($primary) {
            $diskTotal = $primary.sizeGB
            $diskFree = $primary.freeGB
            $diskUsed = $primary.usedGB
            $diskLabel = if ($primary.label) { $primary.label } else { "System drive" }
        }
    } catch { }

    $procCount = (Get-Process | Measure-Object).Count
    $temps = Get-PulseboardTemps
    $net = Get-NetworkMetrics -Config $Config

    return [pscustomobject]@{
        cpuPercent   = [math]::Round($cpuLoad, 2)
        memUsedGB    = $memUsed
        memTotalGB   = $memTotal
        diskUsedGB   = $diskUsed
        diskFreeGB   = $diskFree
        diskTotalGB  = $diskTotal
        diskLabel    = $diskLabel
        disks        = $disks
        processCount = $procCount
        uptimeSec    = [math]::Round((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalSeconds)
        cpuTempC     = $temps.cpuTempC
        gpuTempC     = $temps.gpuTempC
        gpuMemoryTempC = $temps.gpuMemoryTempC
        gpuHotspotTempC = $temps.gpuHotspotTempC
        cpuTempMaxC = $temps.cpuTempMaxC
        boardTempC   = $temps.boardTempC
        temps        = $temps.temps
        tempSource   = $temps.tempSource
        tempReason   = $temps.tempReason
        net          = $net
        timestamp    = (Get-Date).ToUniversalTime().ToString("o")
    }
}

function Get-MetricsLogPath {
    param(
        [Parameter(Mandatory)] $Config
    )

    $base = Get-AgentBasePath

    $pathToUse = $Config.metricsLogPath
    if (-not $pathToUse -or [string]::IsNullOrWhiteSpace($pathToUse)) {
        $pathToUse = "./agent-metrics.log"
    }

    if ([System.IO.Path]::IsPathRooted($pathToUse)) {
        return [System.IO.Path]::GetFullPath($pathToUse)
    }

    $combined = Join-Path $base $pathToUse
    return [System.IO.Path]::GetFullPath($combined)
}

function Write-MetricsLogEntry {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] $Sample
    )

    $path = Get-MetricsLogPath -Config $Config
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $json = $Sample | ConvertTo-Json -Depth 10 -Compress
    Add-Content -Path $path -Value $json -Encoding utf8
}

function Invoke-AgentHeartbeat {
    param(
        [Parameter(Mandatory)]
        $Config,
        $Metrics,
        [bool]$SkipCertificateValidation = $false
    )

    $uri = "$($Config.baseUrl.TrimEnd('/'))/api/agent/heartbeat"
    $body = @{
        deviceId     = $Config.deviceId
        agentVersion = $script:AgentVersion
        hostname     = $env:COMPUTERNAME
        osVersion    = (Get-CimInstance Win32_OperatingSystem).Caption
        metrics      = $(if ($Metrics) { $Metrics } else { Get-SystemMetrics -Config $Config })
    } | ConvertTo-Json -Depth 8

    $params = @{
        Uri                  = $uri
        Method               = 'Post'
        Body                 = $body
        Headers              = Get-AgentHeaders -Config $Config
    }

    if ($SkipCertificateValidation) {
        add-type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(
        ServicePoint srvPoint, X509Certificate certificate,
        WebRequest request, int certificateProblem) {
        return true;
    }
}
"@
        [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    }

    return Invoke-RestMethod @params
}

function Get-NextAgentJob {
    param(
        [Parameter(Mandatory)]
        $Config,
        [bool]$SkipCertificateValidation = $false
    )

    $uri = "$($Config.baseUrl.TrimEnd('/'))/api/agent/jobs/next"
    $params = @{
        Uri     = $uri
        Method  = 'Get'
        Headers = Get-AgentHeaders -Config $Config
    }

    if ($SkipCertificateValidation) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    try {
        return Invoke-RestMethod @params
    } catch {
        Write-Verbose "No job available or request failed: $_"
        return $null
    }
}

function Send-AgentJobLog {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] [string]$JobId,
        [Parameter(Mandatory)] [string[]]$Lines,
        [bool]$SkipCertificateValidation = $false
    )

    $uri = "$($Config.baseUrl.TrimEnd('/'))/api/agent/jobs/$JobId/log"
    $body = @{ lines = $Lines } | ConvertTo-Json -Depth 3
    $params = @{
        Uri     = $uri
        Method  = 'Post'
        Body    = $body
        Headers = Get-AgentHeaders -Config $Config
    }

    if ($SkipCertificateValidation) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    Invoke-RestMethod @params | Out-Null
}

function Send-AgentJobResult {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] [string]$JobId,
        [Parameter(Mandatory)] $Result,
        [bool]$SkipCertificateValidation = $false
    )

    $uri = "$($Config.baseUrl.TrimEnd('/'))/api/agent/jobs/$JobId/finish"
    $body = @{
        status = $Result.status
        output = $Result.output
    } | ConvertTo-Json -Depth 5

    $params = @{
        Uri     = $uri
        Method  = 'Post'
        Body    = $body
        Headers = Get-AgentHeaders -Config $Config
    }

    if ($SkipCertificateValidation) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    Invoke-RestMethod @params | Out-Null
}

function Invoke-NetworkDiagnostics {
    param(
        [Parameter(Mandatory)] $Job
    )

    $logs = New-Object System.Collections.Generic.List[string]

    $gateway = (Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1).DefaultIPGateway[0]
    if ($gateway) {
        $logs.Add("Pinging gateway $gateway ...")
        $pingGateway = Test-Connection -Count 2 -ComputerName $gateway -ErrorAction SilentlyContinue
    }

    $logs.Add("Pinging internet (8.8.8.8) ...")
    $pingInternet = Test-Connection -Count 2 -ComputerName 8.8.8.8 -ErrorAction SilentlyContinue

    $dnsHost = $Job.parameters.dnsHost
    if (-not $dnsHost) { $dnsHost = 'one.one.one.one' }
    $logs.Add("Resolving $dnsHost ...")
    try {
        $resolve = Resolve-DnsName -Name $dnsHost -ErrorAction Stop
    } catch {
        $resolve = $null
        $logs.Add("DNS resolution failed: $_")
    }

    $route = (Get-NetRoute | Select-Object -First 5)

    return @{
        status = 'success'
        output = @{
            pingGateway = $pingGateway | Select-Object Address, ResponseTime
            pingInternet = $pingInternet | Select-Object Address, ResponseTime
            dns = $resolve | Select-Object Name, IPAddress
            route = $route
            logs = $logs
        }
    }
}

function Invoke-SystemSnapshot {
    $os = Get-CimInstance Win32_OperatingSystem
    $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{ Name = 'SizeGB'; Expression = { [math]::Round($_.Size / 1GB, 2) } }, @{ Name = 'FreeGB'; Expression = { [math]::Round($_.FreeSpace / 1GB, 2) } }
    $net = Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress, PrefixLength

    return @{
        status = 'success'
        output = @{
            hostname = $env:COMPUTERNAME
            os = $os.Caption
            lastBoot = $os.LastBootUpTime
            disks = $disks
            network = $net
        }
    }
}

function Invoke-AgentJob {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] $Job,
        [bool]$SkipCertificateValidation = $false
    )

    $jobId = $Job.id
    $jobType = $Job.type
    $logBuffer = New-Object System.Collections.Generic.List[string]
    $logBuffer.Add("Starting job $jobType ($jobId)")

    switch ($jobType) {
        'NETDIAG' { $result = Invoke-NetworkDiagnostics -Job $Job }
        'SYSINFO' { $result = Invoke-SystemSnapshot }
        default {
            $logBuffer.Add("Unknown job type '$jobType'")
            $result = @{
                status = 'error'
                output = @{ message = "Unknown job type: $jobType" }
            }
        }
    }

    if ($logBuffer.Count -gt 0) {
        Send-AgentJobLog -Config $Config -JobId $jobId -Lines $logBuffer.ToArray() -SkipCertificateValidation:$SkipCertificateValidation
    }

    Send-AgentJobResult -Config $Config -JobId $jobId -Result $result -SkipCertificateValidation:$SkipCertificateValidation
}

function Invoke-PulseboardAgent {
    param(
        [Parameter(Mandatory)]
        [string]$ConfigPath,
        [switch]$Once,
        [switch]$SkipCertificateValidation
    )

    $config = Read-AgentConfig -ConfigPath $ConfigPath
    $lastMetricsAt = Get-Date '1900-01-01'
    $lastJobPollAt = Get-Date '1900-01-01'

    try {
        while ($true) {
            try {
                $now = Get-Date

                $sinceMetrics = ($now - $lastMetricsAt).TotalSeconds
                if ($sinceMetrics -ge $config.metricsIntervalSeconds) {
                    $metrics = Get-SystemMetrics -Config $config
                    $sample = [pscustomobject]@{
                        timestamp    = (Get-Date).ToUniversalTime().ToString("o")
                        deviceId     = $config.deviceId
                        agentVersion = $script:AgentVersion
                        hostname     = $env:COMPUTERNAME
                        metrics      = $metrics
                    }

                    Write-MetricsLogEntry -Config $config -Sample $sample

                    Invoke-AgentHeartbeat -Config $config -Metrics $metrics -SkipCertificateValidation:$SkipCertificateValidation | Out-Null
                    $lastMetricsAt = Get-Date
                }

                $sinceJobs = ($now - $lastJobPollAt).TotalSeconds
                if ($sinceJobs -ge $config.pollIntervalSeconds) {
                    $job = Get-NextAgentJob -Config $config -SkipCertificateValidation:$SkipCertificateValidation
                    if ($job) {
                        Invoke-AgentJob -Config $config -Job $job -SkipCertificateValidation:$SkipCertificateValidation
                    }
                    $lastJobPollAt = Get-Date
                }
            } catch {
                try {
                    $base = Get-AgentBasePath
                    $errPath = Join-Path $base "agent-errors.log"
                    $line = "[{0}] {1}" -f ((Get-Date).ToUniversalTime().ToString("o")), ($_ | Out-String).Trim()
                    Add-Content -Path $errPath -Value $line -Encoding utf8
                } catch { }
            }

            if ($Once) { break }
            Start-Sleep -Milliseconds 200
        }
    } finally {
        Close-HardwareMonitorSession
    }
}

Export-ModuleMember -Function *-*
