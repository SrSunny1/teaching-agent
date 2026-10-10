@echo off
rem 材料物理实验教学 Agent · Windows 一键启动（双击运行）
rem 会开两个新窗口（后端 / 前端）并打开浏览器。
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "start.ps1"
pause
