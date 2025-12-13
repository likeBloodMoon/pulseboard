param(
  [ValidateSet("Dev", "Prod")]
  [string]$Mode = "Dev",

  [switch]$StartAgent,

  [string]$AgentConfigPath = ".\\dist\\agent.config.json",

  [switch]$NoInstall,

  [switch]$NoNewWindows
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  if ($PSScriptRoot) {
    return (Resolve-Path $PSScriptRoot).Path
  }
  if ($PSCommandPath) {
    return (Resolve-Path (Split-Path -Parent $PSCommandPath)).Path
  }
  if ($MyInvocation.MyCommand.Path) {
    return (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
  }
  return (Get-Location).Path
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

function Ensure-NpmDeps {
  if ($NoInstall) { return }
  if (Test-Path ".\\node_modules") { return }
  Write-Host "Installing npm dependencies..."
  npm install
}

function Start-Web {
  Ensure-NpmDeps

  if ($NoNewWindows) {
    Write-Host "Starting web ($Mode) in current window..."
    if ($Mode -eq "Prod") {
      Write-Host "Building web app..."
      npm --workspace apps/web run build
      npm --workspace apps/web run start
    } else {
      npm run dev
    }
    return
  }

  Write-Host "Starting web ($Mode) in new window..."
  if ($Mode -eq "Prod") {
    Write-Host "Building web app..."
    npm --workspace apps/web run build
  }

  $cmd = if ($Mode -eq "Prod") { "cd `"$repoRoot`"; npm --workspace apps/web run start" } else { "cd `"$repoRoot`"; npm run dev" }
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $cmd
  ) | Out-Null
}

function Start-Agent {
  $configFull = Resolve-Path $AgentConfigPath -ErrorAction Stop
  $exe = Join-Path $repoRoot "dist\\pulseboard-agent.exe"

  if (Test-Path $exe) {
    $cmd = "`"$exe`""
    if ($NoNewWindows) {
      Write-Host "Starting agent exe in current window..."
      & $exe
      return
    }

    Write-Host "Starting agent exe in new window..."
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) | Out-Null
    return
  }

  $psCmd = @"
`$ErrorActionPreference='Stop'
Set-Location `"$repoRoot`"
Import-Module `"$repoRoot\\dist\\Pulseboard.Agent.psd1`" -Force
Invoke-PulseboardAgent -ConfigPath `"$($configFull.Path)`"
"@

  if ($NoNewWindows) {
    Write-Host "Starting agent module in current window..."
    pwsh -NoLogo -NoProfile -Command $psCmd
    return
  }

  Write-Host "Starting agent module in new window..."
  Start-Process -FilePath "pwsh" -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-NoExit",
    "-Command", $psCmd
  ) | Out-Null
}

Start-Web
if ($StartAgent) {
  Start-Agent
}

Write-Host ""
Write-Host "Done."
Write-Host "Web: http://localhost:3000"
Write-Host ("Agent config: " + $AgentConfigPath)
