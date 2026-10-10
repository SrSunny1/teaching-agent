"""
A1 知识库问答的检索层。

当前实现是**关键词打分**（无需额外依赖，开箱即用）。
TODO：chunks.jsonl 建好后，换成 chroma 向量检索 + 关键词混合召回。
      向量库不可用时自动退回当前实现，保证演示不中断。
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from ... import config
from ..base import Tool, ToolResult

CHUNKS = Path(config.DATA_DIR) / "chunks.jsonl"

# 章节权重：原理和内容比报告要求更值得召回
SECTION_WEIGHT = {
    "实验原理": 1.4,
    "实验内容": 1.3,
    "注意事项": 1.2,
    "实验材料及设备": 1.0,
    "实验目的": 0.8,
    "实验报告及要求": 0.6,
}

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-]*|[一-鿿]{2,}")


def _tokens(text: str) -> list[str]:
    """粗分词：英文按单词，中文按 2-gram 滑窗。够用且不引依赖。"""
    out: list[str] = []
    for piece in _TOKEN_RE.findall(text):
        if piece[0].isascii():
            out.append(piece.lower())
        else:
            out.extend(piece[i : i + 2] for i in range(len(piece) - 1))
    return out


@lru_cache(maxsize=1)
def _load() -> tuple[dict, ...]:
    if not CHUNKS.exists():
        return ()
    rows = []
    with CHUNKS.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return tuple(rows)


def _score(query_terms: list[str], chunk: dict) -> float:
    text = chunk["text"]
    meta = chunk["metadata"]
    haystack = _tokens(text)
    if not haystack:
        return 0.0

    from collections import Counter

    bag = Counter(haystack)
    hits = sum(bag.get(t, 0) for t in set(query_terms))
    if hits == 0:
        return 0.0

    # 命中密度，避免长块靠体量取胜
    density = hits / (len(haystack) ** 0.5)
    weight = SECTION_WEIGHT.get(meta.get("section", ""), 1.0)
    return density * weight


async def _run(args: dict) -> ToolResult:
    query = str(args.get("query", "")).strip()
    top_k = int(args.get("top_k", config.RAG_TOP_K) or config.RAG_TOP_K)

    if not query:
        return ToolResult(summary="查询为空", detail="请给出要检索的关键词。")

    rows = _load()
    if not rows:
        return ToolResult(
            summary="知识库为空",
            detail=(
                "还没有入库任何内容。请把教材和任务书放进 backend/knowledge/raw/，"
                "然后运行：\n\n    cd backend && python knowledge/ingest.py\n\n"
                "入库后重启后端。在入库之前，不要凭记忆回答课程问题。"
            ),
        )

    terms = _tokens(query)
    ranked = sorted(rows, key=lambda c: _score(terms, c), reverse=True)
    hits = [c for c in ranked if _score(terms, c) > 0][:top_k]

    if not hits:
        return ToolResult(
            summary="知识库未收录",
            detail=(
                f"以「{query}」为关键词没有检索到任何内容。"
                "请如实告诉学生知识库中未收录这个问题，并给出最接近的相关条目，不要编造。"
            ),
        )

    lines = []
    for i, c in enumerate(hits, 1):
        meta = c["metadata"]
        loc = f"《{meta['source']}》{meta['experiment']} · {meta['section']}"
        lines.append(f"【{i}】{loc}\n{c['text']}")

    # 挂到右栏画布：把命中的原文和出处摊开给评委看。
    # 纯聊天框看不出「答案有据可依」，这块画布能。
    artifact = {
        "query": query,
        "chunks": [
            {
                "source": c["metadata"].get("source", ""),
                "experiment": c["metadata"].get("experiment", ""),
                "section": c["metadata"].get("section", ""),
                "text": c["text"],
            }
            for c in hits
        ],
        # TODO(同学1)：术语抽取还没做。补一张术语表后在这里按 query 匹配填充。
        "terms": [],
    }

    return ToolResult(
        summary=f"命中 {len(hits)} 条 · " + " / ".join(f"{c['metadata']['experiment']}" for c in hits[:2]),
        detail="\n\n".join(lines),
        artifact_type="knowledge",
        artifact=artifact,
    )


TOOL = Tool(
    name="search_knowledge",
    label="检索知识库 ·「{query}」",
    description=(
        "检索课程知识库（教材 7 个实验 + 劳动教育四大模块）。"
        "任何涉及课程内容的问题都必须先调这个工具拿到原文，再基于原文作答并标注出处。"
        "不要凭记忆回答课程问题。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "检索关键词，用课程里的原词，例如「250目筛分」「回火脆性」"},
            "top_k": {"type": "integer", "description": "召回条数，默认 4"},
        },
        "required": ["query"],
    },
    run=_run,
)
