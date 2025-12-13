@echo off
setlocal
set ROOT=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%Start-Pulseboard.ps1" %*
PAUSE
endlocal
