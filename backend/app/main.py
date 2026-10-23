"""FastAPI entry point, including authenticated student records and chat."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Depends, HTTPException, Request
from .auth import router as auth_router, student
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, rag_autostart
from .chat import run_chat
from .events import encode
from .tools import TOOLS

@asynccontextmanager
async def lifespan(_: FastAPI):
    # 知识库 RAG 服务随教学 Agent 一起起来（已在跑则跳过），评委无需手动启动
    rag_autostart.ensure_started()
    yield


app = FastAPI(title="材料物理实验教学 Agent", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)

# 竞赛演示用，放开 CORS。生产环境应收紧。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    """前端统一以 /api/* 调后端。本地开发由 vite proxy 剥掉前缀；
    单容器部署时没有 vite，由本层完成同样的剥离。"""
    if request.url.path.startswith("/api/"):
        request.scope["path"] = request.url.path[4:]
    return await call_next(request)


# ── /rag/* 反代：单容器部署时把 RAG 后台挂到同一域名下 ──────────────
RAG_BASE = os.environ.get("MSRAG_BASE_URL", "http://127.0.0.1:8765")
_HOP_BY_HOP = {"host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade"}


@app.get("/rag", include_in_schema=False)
async def rag_index():
    return RedirectResponse("/rag/")


@app.api_route("/rag/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], include_in_schema=False)
async def rag_proxy(request: Request, path: str):
    """反向代理到容器内 127.0.0.1:8765 的 RAG 服务。

    原系统前端用 API='' 同源请求；网关层对 app.js 做一次内容改写，
    把 API 前缀指回 /rag，整个 RAG 后台即可挂在 /rag/ 下工作，
    不改原系统一行代码。
    """
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            upstream = await client.request(
                request.method,
                f"{RAG_BASE}/{path}",
                params=request.query_params,
                content=body,
                headers=headers,
            )
    except httpx.HTTPError:
        raise HTTPException(502, "知识库服务正在启动，请稍后重试")
    content = upstream.content
    if path.endswith("app.js") and "javascript" in upstream.headers.get("content-type", ""):
        content = content.replace(b"API = ''", b"API = '/rag'")
    resp_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in _HOP_BY_HOP | {"content-encoding"}
    }
    return Response(content=content, status_code=upstream.status_code, headers=resp_headers)


# 前端构建产物（Docker 镜像把 frontend/dist 拷成 backend/frontend_dist）。
# 存在则整站同源托管；本地开发时不存在，/ 仍返回 API 说明 JSON。
FRONT_DIST = Path(__file__).resolve().parents[1] / "frontend_dist"


class ChatMessage(BaseModel):
    role: str
    content: str
    # 用户上传的图片（data URL）。聊天模型是纯文本的、看不见它 ——
    # chat.py 会把它填进 diagnose_micrograph 的工具参数，见那里的注释。
    image: str | None = None


class FeatureContext(BaseModel):
    """当前对话所属的功能模块（左栏那 6 个模块之一）。

    ★ 字段名叫 feature 不叫 module —— backend/app/tools/aggregate_safety_rules
      里已经有一个 `module` 参数，指的是「劳育模块」（《任务书》模块一~四），
      跟这里说的前端功能模块是完全不同的概念，别混。

    长度上限是防呆：persona 会被拼进系统提示词，不能让一个人写两千字把提示词撑爆。
    """

    id: str = Field(default="", max_length=64)
    title: str = Field(default="", max_length=64)
    persona: str = Field(default="", max_length=200)


class ChatRequest(BaseModel):
    session_id: str = "local"
    messages: list[ChatMessage]
    feature: FeatureContext | None = None


@app.get("/")
async def root():
    """根路径。单容器部署时返回前端 index.html；
    本地开发（无构建产物）时返回 API 说明，避免误把 :8000 当界面。"""
    index = FRONT_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return {
        "service": "材料物理实验教学 Agent · 后端 API",
        "notice": "这是后端 API，不是界面。",
        "ui": "http://localhost:5173",
        "endpoints": {
            "GET /health": "健康检查（前端启动时探测它）",
            "POST /chat": "对话（SSE 流式，契约见 README.md 的「三、契约」）",
            "GET /docs": "自动生成的接口文档",
        },
        "model": config.MODEL,
        "has_key": config.has_api_key(),
        "tools": sorted(TOOLS),
    }


@app.get("/health")
async def health() -> dict:
    """前端启动时探测这个端点，决定走真实流还是 mock。"""
    return {
        "ok": True,
        "model": config.MODEL,
        "has_key": config.has_api_key(),
        "tools": sorted(TOOLS),
    }


@app.post("/chat")
async def chat(req: ChatRequest, who: str = Depends(student)) -> StreamingResponse:
    history = [m.model_dump() for m in req.messages]
    feature = req.feature.model_dump() if req.feature else None

    async def gen():
        async for event in run_chat(history, feature=feature):
            yield encode(event)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # 关掉 nginx 之类反代的缓冲，否则流式会被攒成一坨
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/rag-autostart-log")
async def rag_autostart_log(who: str = Depends(student)) -> dict:
    """远程排障：单容器部署时知识库服务的拉起日志写在容器 /tmp，
    Render 后台看不到子进程输出，开这个口子方便登录后远程看。"""
    import tempfile

    p = Path(tempfile.gettempdir()) / "msrag-autostart.log"
    log_text = p.read_text(errors="replace")[-4000:] if p.exists() else "(暂无拉起日志)"
    return {
        "reachable": rag_autostart._reachable(),
        "key_info": {
            "has_key": config.has_api_key(),
            "len": len(config.API_KEY),
            "prefix": config.API_KEY[:3] if config.API_KEY else "",
            "model": config.MODEL,
            "base_url": config.BASE_URL,
        },
        "log": log_text,
    }


# ── 前端静态文件挂载：放最后，显式路由（/api、/rag、/health…）优先 ──
if FRONT_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONT_DIST, html=True), name="frontend")
