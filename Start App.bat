@echo off
setlocal
cd /d "%~dp0"
start "Asset Dashboard" powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
start "" http://localhost:8765/index.html
