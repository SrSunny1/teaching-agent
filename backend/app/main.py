"""FastAPI 入口。只有两个端点，契约见 README.md 的「三、契约」。"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import config
from .chat import run_chat
from .events import encode
from .tools import TOOLS

app = FastAPI(title="材料物理实验教学 Agent", version="0.1.0")

# 竞赛演示用，放开 CORS。生产环境应收紧。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
async def root() -> dict:
    """根路径说明。

    后端是 API 服务，本身没有页面 —— 直接打开 :8000 只会看到一句 Not Found，
    容易让人以为项目坏了。这里明确告诉访问者界面在哪。
    """
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
async def chat(req: ChatRequest) -> StreamingResponse:
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
