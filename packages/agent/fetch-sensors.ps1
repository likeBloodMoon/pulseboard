param(
    [string]$OutputDir = "$PSScriptRoot",
    [string]$Provider = "librehardwaremonitor" # or openhardwaremonitor
)

$ErrorActionPreference = "Stop"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

function Download-And-Extract {
    param(
        [string]$Url,
        [string]$ZipPath,
        [string]$DllName
    )

    Write-Host "Downloading $Url ..."
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath

    $extractDir = Join-Path ([System.IO.Path]::GetDirectoryName($ZipPath)) "temp_sensors"
    Remove-Item -Recurse -Force -Path $extractDir -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    Expand-Archive -Path $ZipPath -DestinationPath $extractDir -Force

    $dllPath = Get-ChildItem -Path $extractDir -Recurse -Filter $DllName | Select-Object -First 1
    if (-not $dllPath) {
        throw "Could not find $DllName inside downloaded archive."
    }

    $dest = Join-Path $OutputDir $DllName
    Copy-Item -Force -Path $dllPath.FullName -Destination $dest
    Write-Host "Placed $DllName at $dest"

    Remove-Item -Recurse -Force -Path $extractDir -ErrorAction SilentlyContinue
    Remove-Item -Force -Path $ZipPath -ErrorAction SilentlyContinue
}

if ($Provider -ieq "librehardwaremonitor") {
    $zip = Join-Path $env:TEMP "librehw.zip"
    $urls = @(
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/latest/download/LibreHardwareMonitor-net8.0.zip",
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/latest/download/LibreHardwareMonitor-net7.0.zip",
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/latest/download/LibreHardwareMonitor-net6.0.zip",
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.3/LibreHardwareMonitor-net8.0.zip",
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.3/LibreHardwareMonitor-net7.0.zip",
        "https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.2/LibreHardwareMonitor-net6.0.zip"
    )
    $downloaded = $false
    foreach ($u in $urls) {
        try {
            Download-And-Extract -Url $u -ZipPath $zip -DllName "LibreHardwareMonitorLib.dll"
            $downloaded = $true
            break
        } catch {
            continue
        }
    }
    if (-not $downloaded) {
        throw "Failed to download LibreHardwareMonitor (tried net8/net7/net6)."
    }
} elseif ($Provider -ieq "openhardwaremonitor") {
    $url = "https://openhardwaremonitor.org/files/openhardwaremonitor-v0.9.6.zip"
    $zip = Join-Path $env:TEMP "ohm.zip"
    Download-And-Extract -Url $url -ZipPath $zip -DllName "OpenHardwareMonitorLib.dll"
} else {
    throw "Unknown provider '$Provider'. Use 'librehardwaremonitor' or 'openhardwaremonitor'."
}
