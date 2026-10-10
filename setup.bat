@echo off
rem 材料物理实验教学 Agent · Windows 装环境（双击运行）
rem 跑一次即可，跑完就不用再跑。
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "setup.ps1"
pause
