"""统一 ID 生成器。沿用原项目的可读前缀风格。"""

from __future__ import annotations

import secrets
import time
from typing import Dict

_PREFIX_MAP: Dict[str, str] = {
    "document": "doc",
    "chunk": "chk",
    "parent": "par",
    "conversation": "conv",
    "message": "msg",
    "citation": "cit",
    "job": "job",
}


def new_id(kind: str) -> str:
    """生成带语义前缀的唯一 ID，例如 doc_9f3c2a1b8e7d。"""
    prefix = _PREFIX_MAP.get(kind, kind)
    stamp = format(int(time.time() * 1000) % 0xFFFFFFFFFF, "010x")
    rand = secrets.token_hex(4)
    return f"{prefix}_{stamp}{rand}"


def request_id() -> str:
    """用于响应信封与日志关联。"""
    return f"req_{secrets.token_hex(8)}"
