## Pulseboard PowerShell Agent

Lightweight device-side agent responsible for heartbeats, metrics, and executing allowlisted diagnostics jobs against the Pulseboard API.

### Quickstart

1) Copy `config.sample.json` to `agent.config.json` and fill in `baseUrl`, `deviceId`, and `agentToken` from the dashboard.  
2) Run the agent in the foreground:

```powershell
pwsh ./agent.ps1 -ConfigPath ./agent.config.json
```

3) Optional: package to an `.exe` using `ps2exe` (see `build.ps1`).

### What it does now

- Collects system metrics every second and appends JSON lines to `agent-metrics.log` (path configurable via `metricsLogPath`). Each line includes `timestamp`, `deviceId`, `agentVersion`, `hostname`, and a `metrics` object (CPU, memory, uptime).
- Sends heartbeats with the latest metrics to the Pulseboard API on the same cadence.
- Polls for jobs every 5 seconds (`pollIntervalSeconds`) and executes allowlisted job types (`NETDIAG`, `SYSINFO`), streaming logs and final results.
- Best-effort temperatures (CPU/GPU/board): reads ACPI thermal zones, Windows perf counters, NVIDIA `nvidia-smi`, and optional AMD custom CLI (set env `PULSEBOARD_AMD_TEMP_CMD`). If your hardware/driver doesn’t expose sensors, temps will stay `N/A`. HWiNFO support is placeholder-only (shared memory not parsed).
- Sensor vendor support: You can auto-fetch a vendor-neutral sensor library. Run `pwsh ./fetch-sensors.ps1 -Provider librehardwaremonitor` (default) to download `LibreHardwareMonitorLib.dll` next to the agent/exe. Alternatively, `-Provider openhardwaremonitor` for the OHM DLL. Run the agent elevated if perf counters are restricted.

### Notes

- No arbitrary command execution. Job handling is hard-coded and versioned.
- TLS validation can be skipped for lab use with `-SkipCertificateValidation`.
- Logs are written to console; you can redirect to file or Windows Event Log later.
- When packaged as an `.exe`, the agent will load `agent.config.json` from the same directory as the executable if `-ConfigPath` is not provided, and will write `agent-metrics.log` alongside it by default. A missing/empty path now falls back to that directory.

### EXE packaging options

- `ps2exe` (PowerShell module): fastest path. Install with `Install-Module ps2exe -Scope CurrentUser` then run `.\build.ps1 -Output .\dist\pulseboard-agent.exe`. The build script now stages `src/`, `Pulseboard.Agent.psd1`, and `agent.config.json` next to the exe so module loading works from the packaged folder.
- Native PS1: if you prefer not to package, distribute `agent.ps1` and run with `pwsh -File agent.ps1`.
- Future options: a .NET single-file wrapper (PowerShell SDK) or Golang/Rust reimplementation (mentioned in roadmap) can be added later if we need a smaller footprint or cross-platform binary.
