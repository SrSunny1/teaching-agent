# 材料物理实验教学 Agent · Windows 装环境
# 在项目根目录跑：  .\setup.ps1
# 每台机器跑一次即可。
#
# 如果 PowerShell 提示「禁止运行脚本」，先执行：
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Info($m) { Write-Host "  [-]  $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [X]  $m" -ForegroundColor Red; exit 1 }

Write-Host "=================================================="
Write-Host " 材料物理实验教学 Agent - 装环境 (Windows)"
Write-Host "=================================================="

# ── 0. 环境自检 ────────────────────────────────────────
Write-Host ""
Write-Host "[0/4] 检查本机环境"

# Windows 上 Python 命令通常是 python（装的时候勾了 Add to PATH）或 py 启动器
$PyCmd = $null
$PyArgs = @()

foreach ($candidate in @("python", "python3", "py")) {
    if (-not (Get-Command $candidate -ErrorAction SilentlyContinue)) { continue }
    if ($candidate -eq "py") {
        & py -3 -c "import sys" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $PyCmd = "py"; $PyArgs = @("-3"); break }
    } else {
        & $candidate -c "import sys" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $PyCmd = $candidate; $PyArgs = @(); break }
    }
}

if (-not $PyCmd) {
    Die "没找到 Python。请安装 Python 3.11+，安装时务必勾选 'Add python.exe to PATH'"
}

$PyVer = & $PyCmd @PyArgs -c "import sys; print('%d.%d.%d' % sys.version_info[:3])"
Ok "Python  $PyVer  (命令: $PyCmd)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die "没找到 Node.js。请安装 Node.js 18+（推荐 22）：https://nodejs.org"
}
Ok "Node    $(node -v)"
Ok "npm     $(npm -v)"

# ── 1. 后端依赖（虚拟环境，避免污染系统 Python）─────────
Write-Host ""
Write-Host "[1/4] 装后端 Python 依赖"
Push-Location backend

$VenvPy = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPy)) {
    Info "创建虚拟环境 backend\.venv"
    & $PyCmd @PyArgs -m venv .venv
    if (-not (Test-Path $VenvPy)) { Die "虚拟环境创建失败" }
}

& $VenvPy -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { Die "pip 升级失败" }

& $VenvPy -m pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) { Die "Python 依赖安装失败。把上面的报错发到群里" }
Ok "requirements.txt 装好了（虚拟环境 backend\.venv）"

# ── 2. 配置文件 ────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] 准备配置"
if (Test-Path ".env") {
    Ok ".env 已存在，不覆盖"
} else {
    Copy-Item ".env.example" ".env"
    Ok "已创建 .env（从 .env.example 复制）"
    Info "现在没有 API Key，界面走 mock 模式，照样能点、能看。"
    Info "要跑真实模型时，把 DeepSeek 的 Key 填进 .env 的 DEEPSEEK_API_KEY。"
}

# ── 3. 知识库入库 ──────────────────────────────────────
Write-Host ""
Write-Host "[3/4] 知识库入库（教材 + 任务书 -> 检索块）"
& $VenvPy knowledge/ingest.py | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Die "知识库入库失败" }
Ok "知识库已生成"

# ── 4. 前端依赖 ────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] 装前端 JS 依赖（首次较慢，约 1~3 分钟）"
Pop-Location
Push-Location frontend

npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Warn "npm install 失败。Windows 上常见的原因："
    Warn "  1) 路径太长 —— 把项目挪到短路径（例如 D:\a\）再试"
    Warn "  2) 公司/校园网 npm 源不通 —— npm config set registry https://registry.npmmirror.com"
    Warn "  3) 重试：rm -Recurse -Force node_modules 后再 npm install"
    Pop-Location
    exit 1
}
Ok "node_modules 装好了"
Pop-Location

# ── 收尾 ──────────────────────────────────────────────
Write-Host ""
Write-Host "=================================================="
Write-Host " 装完了。启动方式："
Write-Host "=================================================="
Write-Host ""
Write-Host "  最简单：双击 start.bat（开两个窗口 + 打开浏览器）"
Write-Host ""
Write-Host "  或自己开两个终端："
Write-Host "    终端 1  cd backend ; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
Write-Host "    终端 2  cd frontend ; npm run dev"
Write-Host ""
Write-Host "  浏览器打开  http://localhost:5173   ★ 界面在这里"
Write-Host "  (8000 是后端 API，打开只有一段 JSON，不是界面)"
Write-Host ""
Write-Host "  看自己模块：点左栏自己的模块，画布用样例数据渲染，"
Write-Host "  右上角标注「预览数据」。不需要后端、不需要 API Key。"
Write-Host ""
Write-Host "  提交前自检（在项目根目录）："
Write-Host "    python scripts\check-boundaries.py"
Write-Host "    backend\.venv\Scripts\python backend\tests\test_smoke.py"
Write-Host ""
