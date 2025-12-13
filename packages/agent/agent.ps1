param(
    [string]$ConfigPath,
    [switch]$Once,
    [switch]$SkipCertificateValidation
)

function Get-AgentBasePath {
    function Normalize-Base([string]$path) {
        if (-not $path) { return $path }
        if ((Split-Path -Leaf $path) -eq 'src') {
            $parent = Split-Path -Parent $path
            if ($parent) { return $parent }
        }
        return $path
    }

    $entry = [System.Reflection.Assembly]::GetEntryAssembly()
    if ($entry) {
        $loc = $entry.Location
        if ($loc) {
            return Normalize-Base (Split-Path -Parent $loc)
        }
    }

    if ($PSScriptRoot -and -not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        return Normalize-Base $PSScriptRoot
    }
    if ($MyInvocation.MyCommand.Path) {
        return Normalize-Base (Split-Path -Parent $MyInvocation.MyCommand.Path)
    }
    return (Get-Location).Path
}

$base = Get-AgentBasePath

if (-not $ConfigPath -or [string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $base "agent.config.json"
}

$modulePath = Join-Path $base "src/Pulseboard.Agent.psm1"
if (-not (Test-Path $modulePath)) {
    throw "Agent module not found at $modulePath. Ensure dist includes src/ and psd1 beside the executable."
}
Import-Module $modulePath -Force

Invoke-PulseboardAgent `
    -ConfigPath $ConfigPath `
    -Once:$Once `
    -SkipCertificateValidation:$SkipCertificateValidation
