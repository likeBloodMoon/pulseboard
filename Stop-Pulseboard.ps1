param(
  [switch]$Web,
  [switch]$Agent,
  [switch]$All,
  [int]$WebPort = 3000,
  [int]$WebPortMax = 3010
)

$ErrorActionPreference = "Stop"

if (-not ($Web -or $Agent -or $All)) { $All = $true }

function Stop-ByPort {
  param([int]$Port)

  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }

  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      # ignore
    }
  }
  return $pids
}

function Stop-PulseboardNodeProcesses {
  $killed = @()
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      $cmd = $p.CommandLine
      if (-not $cmd) { continue }
      if (
        ($cmd -match "\\\\apps\\\\web\\\\") -or
        ($cmd -match "dev-wrapper\\.mjs") -or
        (($cmd -match "\\bnext\\b") -and ($cmd -match "\\bpulseboard\\b"))
      ) {
        try {
          Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
          $killed += $p.ProcessId
        } catch { }
      }
    }
  } catch { }
  return $killed | Select-Object -Unique
}

function Stop-AgentProcesses {
  $killed = @()

  foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
    try {
      if ($p.ProcessName -ieq "pulseboard-agent") {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        $killed += $p.Id
      }
    } catch { }
  }

  # Stop pwsh sessions that are running Invoke-PulseboardAgent (best-effort)
  try {
    $pwsh = Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" -ErrorAction SilentlyContinue
    foreach ($proc in ($pwsh | Where-Object { $_.CommandLine -match "Invoke-PulseboardAgent" })) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        $killed += $proc.ProcessId
      } catch { }
    }
  } catch { }

  return $killed | Select-Object -Unique
}

$killedWeb = @()
$killedAgent = @()

if ($All -or $Web) {
  Write-Host "Stopping web (ports $WebPort-$WebPortMax)..."
  $killedWeb += Stop-PulseboardNodeProcesses
  for ($p = $WebPort; $p -le $WebPortMax; $p++) {
    $killedWeb += Stop-ByPort -Port $p
  }
  $killedWeb = $killedWeb | Select-Object -Unique
}

if ($All -or $Agent) {
  Write-Host "Stopping agent..."
  $killedAgent = Stop-AgentProcesses
}

Write-Host ""
$webStr = ($killedWeb -join ", ")
if ([string]::IsNullOrWhiteSpace($webStr)) { $webStr = "(none)" }
$agentStr = ($killedAgent -join ", ")
if ([string]::IsNullOrWhiteSpace($agentStr)) { $agentStr = "(none)" }
Write-Host ("Stopped web PIDs: " + $webStr)
Write-Host ("Stopped agent PIDs: " + $agentStr)
