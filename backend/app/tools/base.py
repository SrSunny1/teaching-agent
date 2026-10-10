"""
工具基类。

新增一个工具 = 在 app/tools/ 下建一个文件夹 + 写 __init__.py 导出 TOOL。
不需要改这个文件，也不需要改 tools/__init__.py —— 那里是自动扫描的。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass
class ToolResult:
    """工具的统一返回。summary 一行给折叠态，detail 展开看原文。"""

    summary: str
    detail: str | None = None
    # 需要挂到右栏画布时填。artifact_type 必须与某个前端功能注册的类型一致
    artifact_type: str | None = None
    artifact: Any = None


@dataclass
class Tool:
    name: str
    # 展示文案模板，用 {参数名} 占位，例如 "检索知识库 ·「{query}」"
    label: str
    description: str
    # OpenAI function calling 的 JSON Schema
    parameters: dict
    run: Callable[[dict], Awaitable[ToolResult]]

    def spec(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def render_label(self, args: dict) -> str:
        """把参数填进文案模板。缺参数时退化为工具名，不抛异常。"""
        try:
            return self.label.format(**args)
        except (KeyError, IndexError, ValueError):
            return self.name
