# Pulseboard Agent (binary build)

This folder holds the agent build outputs. If you need to re-create the Windows agent `.exe` yourself, use PowerShell and `ps2exe`:

1) Open PowerShell in this folder:
   ```powershell
   Set-Location $PSScriptRoot
   ```
2) Install the packager (once):
   ```powershell
   Install-Module ps2exe -Scope CurrentUser -Force
   ```
3) Build the agent executable from the module:
   ```powershell
   Invoke-ps2exe -inputFile .\src\Pulseboard.Agent.psm1 -outputFile .\pulseboard-agent.exe -noConsole -noPause
   ```
4) Configure the agent via `agent.config.json` (fill in your `baseUrl`, `deviceId`, and `agentToken`).

Notes:
- The source PowerShell module lives at `dist\src\Pulseboard.Agent.psm1`.
- `agent.config.json` and `config.sample.json` here are templates only; do not commit real tokens.
- If you already have `pulseboard-agent.exe` built, no need to rebuild unless you change the module.
