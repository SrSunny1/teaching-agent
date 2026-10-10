@echo off
rem ============================================================
rem  Material Physics Lab Teaching Agent - Windows setup
rem  Double-click to run. Run ONCE, then you never need it again.
rem ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "setup.ps1"
pause
