# 材料物理实验教学 Agent · Windows 一键启动
# 在项目根目录跑：  .\start.ps1
# 会开两个新窗口（后端 / 前端）并打开浏览器。

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$VenvPy = ".\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPy)) {
    Write-Host "  [X]  没找到虚拟环境，请先跑一次 setup.ps1（或双击 setup.bat）" -ForegroundColor Red
    exit 1
}

# 后端：新开一个窗口
Write-Host "  [OK] 启动后端（新窗口）  http://localhost:8000" -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$PSScriptRoot\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
)

# 前端：新开一个窗口
Write-Host "  [OK] 启动前端（新窗口）  http://localhost:5173" -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$PSScriptRoot\frontend'; npm run dev"
)

# 等前端起来再开浏览器
Write-Host "  [..] 等前端就绪…"
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Write-Host "  [OK] 前端已就绪，打开浏览器" -ForegroundColor Green
            Start-Process "http://localhost:5173"
            exit 0
        }
    } catch { }
}
Write-Host "  [!]  等了 30 秒前端还没起来，请看前端那个窗口的报错。" -ForegroundColor Yellow
