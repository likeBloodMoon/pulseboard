param(
    [string]$Output = "$PSScriptRoot/dist/pulseboard-agent.exe"
)

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Warning "ps2exe module not found. Install with: Install-Module ps2exe -Scope CurrentUser"
    exit 1
}

$distDir = Split-Path $Output -Parent
$null = New-Item -ItemType Directory -Force -Path $distDir

# stage supporting files beside the exe (module + config)
$srcDir = Join-Path $PSScriptRoot 'src'
$psd1 = Join-Path $PSScriptRoot 'Pulseboard.Agent.psd1'
$config = Join-Path $PSScriptRoot 'agent.config.json'
$configSample = Join-Path $PSScriptRoot 'config.sample.json'

Copy-Item -Recurse -Force -Path $srcDir -Destination (Join-Path $distDir 'src')
Copy-Item -Force -Path $psd1 -Destination $distDir
# Only place config if it doesn't already exist in dist (avoid overwriting user baseUrl/deviceId)
if ((Test-Path $config) -and -not (Test-Path (Join-Path $distDir 'agent.config.json'))) {
    Copy-Item -Force -Path $config -Destination $distDir
}
Copy-Item -Force -Path $configSample -Destination (Join-Path $distDir 'config.sample.json')

$scriptPath = Join-Path $PSScriptRoot 'agent.ps1'

Invoke-PS2EXE -inputFile $scriptPath -outputFile $Output -noConsole -title 'Pulseboard Agent' -product 'Pulseboard' -copyright '(c) Pulseboard'

Write-Host "Built agent executable at $Output"
Write-Host "Staged module/config in $distDir"
