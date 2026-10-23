# ── 阶段 1：构建前端 ──────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── 阶段 2：运行时（后端 + RAG 服务 + 前端静态文件，单容器）──────
FROM python:3.12-slim
WORKDIR /app

# 后端依赖 + RAG 服务的可选增强（pypdf / numpy，原系统核心为零依赖）
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt pypdf numpy

# 应用代码与随仓库分发的知识库快照（data/ 与 rag-system/data/ 共 ~10MB）
COPY backend/ backend/
COPY rag-system/ rag-system/
COPY data/ data/
COPY --from=frontend /build/dist backend/frontend_dist

# 后端启动时由 rag_autostart 自动拉起 /app/rag-system → 127.0.0.1:8765，
# /rag/* 经 main.py 反向代理到该服务，整站共用一个对外端口。
ENV PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-7860}"]
