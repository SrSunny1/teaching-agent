"""
★ SSE 事件构造。与 frontend/src/lib/types.ts、README.md 的「三、契约」 三处必须同步。

只允许这 7 种事件，谁都不许私自加第 8 种。要加先在群里说。
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator, Awaitable, Callable


def thinking(text: str) -> dict:
    return {"type": "thinking", "text": text}


def token(text: str) -> dict:
    return {"type": "token", "text": text}


def tool_call(call_id: str, name: str, label: str, args: dict) -> dict:
    return {"type": "tool_call", "id": call_id, "name": name, "label": label, "args": args}


def tool_result(call_id: str, summary: str, detail: str | None = None) -> dict:
    return {"type": "tool_result", "id": call_id, "summary": summary, "detail": detail}


def artifact(artifact_type: str, data: Any) -> dict:
    return {"type": "artifact", "artifactType": artifact_type, "data": data}


def error(message: str) -> dict:
    return {"type": "error", "message": message}


def done() -> dict:
    return {"type": "done"}


def encode(event: dict) -> str:
    """序列化成一行 SSE。ensure_ascii=False 保证中文可读，方便调试。"""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


Emit = Callable[[dict], Awaitable[None]]


async def stream(events: AsyncIterator[dict]) -> AsyncIterator[str]:
    async for e in events:
        yield encode(e)
    yield "data: [DONE]\n\n"
