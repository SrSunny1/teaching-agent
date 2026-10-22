@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 材料科学 RAG 知识库

echo.
echo   ============================================================
echo    材料科学 RAG 知识库 · 一键启动
echo   ============================================================
echo.

rem ---- 查找可用的 Python ----
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
    where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
    echo   [错误] 没有找到 Python。
    echo   请先安装 Python 3.9 及以上版本，并勾选 "Add to PATH"。
    echo   官网: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo   使用解释器: %PY%
%PY% -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)"
if errorlevel 1 (
    echo   [错误] Python 版本过低，需要 3.9 及以上。
    pause
    exit /b 1
)

echo.
%PY% start.py %*

echo.
echo   服务已停止。
pause
