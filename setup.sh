#!/usr/bin/env bash
# 一键装环境。每台机器跑一次即可，跑完就不用再跑。
#   ./setup.sh
#
# 跑完之后启动方式见 README.md「一、跑起来」。
set -euo pipefail

cd "$(dirname "$0")"

ok()   { printf '\033[32m  ✓\033[0m %s\n' "$1"; }
info() { printf '\033[36m  ·\033[0m %s\n' "$1"; }
warn() { printf '\033[33m  !\033[0m %s\n' "$1"; }
die()  { printf '\033[31m  ✗\033[0m %s\n' "$1" >&2; exit 1; }

echo "=================================================="
echo " 材料物理实验教学 Agent · 装环境"
echo "=================================================="

# ── 0. 环境自检 ────────────────────────────────────────
echo
echo "[0/4] 检查本机环境"

command -v python3 >/dev/null 2>&1 || die "没找到 python3。请先安装 Python 3.11+"
command -v node >/dev/null 2>&1    || die "没找到 node。请先安装 Node.js 18+（推荐 22）"
command -v npm >/dev/null 2>&1     || die "没找到 npm。请先安装 Node.js 18+"

ok "python3  $(python3 -V 2>&1 | cut -d' ' -f2)"
ok "node     $(node -v)"
ok "npm      $(npm -v)"

# WSL 挂载盘上 npm 会报 ENOTEMPTY，提前提示
if [[ "$PWD" == /mnt/* ]]; then
  warn "项目在 Windows 挂载盘（/mnt/）上，npm 安装可能报 ENOTEMPTY。"
  warn "建议把项目移到 WSL 的 Linux 侧（~/ 下）再装。"
fi

# ── 1. 后端依赖 ────────────────────────────────────────
echo
echo "[1/4] 装后端 Python 依赖"
cd backend
python3 -m pip install -q -r requirements.txt
ok "requirements.txt 装好了"

# ── 2. 配置文件 ────────────────────────────────────────
echo
echo "[2/4] 准备配置"
if [[ -f .env ]]; then
  ok ".env 已存在，不覆盖"
else
  cp .env.example .env
  ok "已创建 .env（从 .env.example 复制）"
  info "现在没有 API Key，界面走 mock 模式，照样能点、能看。"
  info "要跑真实模型时，把 DeepSeek 的 Key 填进 .env 的 DEEPSEEK_API_KEY。"
fi

# ── 3. 知识库入库 ──────────────────────────────────────
echo
echo "[3/4] 知识库入库（教材 + 任务书 → 检索块）"
python3 knowledge/ingest.py | tail -3
ok "知识库已生成"

# ── 4. 前端依赖 ────────────────────────────────────────
echo
echo "[4/4] 装前端 JS 依赖（首次较慢，约 1~3 分钟）"
cd ../frontend
npm install --no-audit --no-fund >/dev/null 2>&1
ok "node_modules 装好了"

# ── 收尾 ──────────────────────────────────────────────
echo
echo "=================================================="
echo " 装完了。启动方式："
echo "=================================================="
echo
echo "  终端 1 —— 后端"
echo "    cd backend && uvicorn app.main:app --reload --port 8000"
echo
echo "  终端 2 —— 前端"
echo "    cd frontend && npm run dev"
echo
echo "  然后浏览器打开  http://localhost:5173   ★ 界面在这里"
echo "  （8000 是后端 API，打开只有一段 JSON，不是界面）"
echo
echo "  看自己模块的效果：点左栏自己的模块，画布会用样例数据渲染，"
echo "  右上角标注「预览数据」。不需要后端、不需要 API Key。"
echo
echo "  提交前自检：python scripts/check-boundaries.py"
echo
