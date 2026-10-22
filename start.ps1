# ⚠️ 本文件必须以「UTF-8 with BOM」保存！
#
# 否则 Windows PowerShell 5.1 会按 GBK 解码，中文注释变成乱码，
# 乱码字节里会出现引号/花括号 → 语法报错「表达式或语句中包含意外的标记」。
# 用 VS Code 时看右下角编码，必须是「UTF-8 with BOM」，不是「UTF-8」。
#
# 改完自查：
#   powershell.exe -Command "$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('setup.ps1',[ref]$null,[ref]$e);$e"

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

# ★ 让 uvicorn 的 --reload 在 WSL 挂载盘（/mnt/... 这类 DrvFs）上也能工作：
#   watchfiles 默认靠 inotify，而 DrvFs 不支持，结果是「永远不重载」，
#   改了 chat.py / tools 一点反应都没有，还不报错。强制轮询。
#   项目在 Windows 原生盘或 WSL 的 Linux 侧时这行是多余的（多一点开销），但无害。
$env:WATCHFILES_FORCE_POLLING = "true"

# 后端：新开一个窗口
Write-Host "  [OK] 启动后端（新窗口）  http://localhost:8000" -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$PSScriptRoot\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
)

# 知识库 RAG 服务：新开一个窗口（材料科学RAG系统 不存在时跳过）
$RagDir = Join-Path $PSScriptRoot "材料科学RAG系统"
if (Test-Path (Join-Path $RagDir "start.py")) {
    Write-Host "  [OK] 启动知识库 RAG 服务（新窗口）  http://127.0.0.1:8765" -ForegroundColor Green
    Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit", "-Command",
        "Set-Location '$RagDir'; & '$PSScriptRoot\backend\.venv\Scripts\python.exe' start.py --no-browser"
    )
}

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
