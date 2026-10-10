@echo off
rem ============================================================
rem  Material Physics Lab Teaching Agent - Windows start
rem  Double-click to run. Opens backend + frontend windows
rem  and your browser. Closing those windows stops the servers.
rem ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "start.ps1"
pause
