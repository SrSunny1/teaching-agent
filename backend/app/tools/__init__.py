"""
★ 工具自动发现。

用 pkgutil 扫描本目录下的所有子包，收集其中导出的 TOOL。
新增工具不需要改这个文件 —— 建好文件夹、导出 TOOL 即可。

详见 协作流程.md 的「三、协作规则」
"""
from __future__ import annotations

import importlib
import pkgutil
from typing import Iterator

from .base import Tool, ToolResult

# 不是工具包的模块，跳过
_SKIP = {"base"}


def _iter_tools() -> Iterator[Tool]:
    for mod_info in pkgutil.iter_modules(__path__):
        if mod_info.name in _SKIP or mod_info.name.startswith("_"):
            continue
        module = importlib.import_module(f"{__name__}.{mod_info.name}")
        tool = getattr(module, "TOOL", None)
        if tool is None:
            print(f"[tools] 跳过 {mod_info.name}：没有导出 TOOL")
            continue
        yield tool


TOOLS: dict[str, Tool] = {}
for _t in _iter_tools():
    if _t.name in TOOLS:
        raise RuntimeError(f"工具名重复：{_t.name}。每个工具名必须全局唯一。")
    TOOLS[_t.name] = _t


# 对应前端模块已移除的旧工具：保留在 TOOLS 里供冒烟测试与直接调用，但不再放进 specs() 喂给模型
_RETIRED = {
    "simulate_heat_treatment",
    "query_graph",
    "aggregate_safety_rules",
    "troubleshoot_instrument",
}


def specs() -> list[dict]:
    return [t.spec() for t in TOOLS.values() if t.name not in _RETIRED]


__all__ = ["TOOLS", "Tool", "ToolResult", "specs"]
