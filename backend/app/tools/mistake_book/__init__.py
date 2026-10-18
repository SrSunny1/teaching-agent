"""
材料科学错题集 —— 画布插件的后端工具。

四种动作（action 参数区分）：
- list    浏览错题库：返回全部或指定分类的条目；
- draw    抽题：按主题/分类抽 1~N 条内置错题（作业帮式五件套数据齐全）；
- record  落画布：把对话里解析出的错题（题目/错误作答/根因/正解/避坑）
          规范化后推给画布。分析由模型在对话中完成，本工具只做校验与整形；
- extract 从知识库抽取：按主题检索 chunks.jsonl 的原文片段，
          作为出题素材返回，供模型据此出题并溯源。

数据形状（camelCase）见 frontend/src/features/mistakeBook/AGENTS.md。
"""
from __future__ import annotations

import json
import random
import re
import time
from pathlib import Path

from ... import config
from ..base import Tool, ToolResult
from . import bank

CHUNKS = Path(config.DATA_DIR) / "chunks.jsonl"

# 轻量分词：英文按词、数字整体、中文 2-gram（与库内其他检索口径一致）
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-]*|\d+|[一-鿿]{2,}")


def _tokens(text: str) -> list[str]:
    out: list[str] = []
    for piece in _TOKEN_RE.findall(text):
        if piece[0].isascii():
            out.append(piece.lower())
        else:
            out.extend(piece[i : i + 2] for i in range(len(piece) - 1))
    return out


def _load_chunks() -> list[dict]:
    if not CHUNKS.exists():
        return []
    rows = []
    with CHUNKS.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return rows


def _artifact(mode: str, entries: list[dict], note: str = "", extra: dict | None = None) -> dict:
    data = {
        "mode": mode,
        "entries": entries,
        "total": len(entries),
        "note": note,
    }
    if extra:
        data.update(extra)
    return data


def _normalize_entry(raw: dict, source: str) -> dict:
    """把模型/用户给的错题字段整形为标准条目。必填缺失时保留空串，由前端引导补全。"""
    kind = str(raw.get("rootCauseKind") or "").strip()
    if kind not in bank.ROOT_CAUSE_KINDS:
        kind = "其他"
    reminders = raw.get("reminders") or []
    if isinstance(reminders, str):
        reminders = [s.strip() for s in re.split(r"[；;\n]", reminders) if s.strip()]
    refs = raw.get("knowledgeRefs") or []
    if isinstance(refs, str):
        refs = [s.strip() for s in re.split(r"[；;\n]", refs) if s.strip()]
    return {
        "id": raw.get("id") or f"m-{int(time.time() * 1000)}",
        "createdAt": raw.get("createdAt") or time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": raw.get("source") or source,
        "category": str(raw.get("category") or "未分类").strip(),
        "question": str(raw.get("question") or "").strip(),
        "studentAnswer": str(raw.get("studentAnswer") or "").strip(),
        "rootCauseKind": kind,
        "rootCause": str(raw.get("rootCause") or "").strip(),
        "knowledgePoint": str(raw.get("knowledgePoint") or "").strip(),
        "knowledgeRefs": refs,
        "correctAnswer": str(raw.get("correctAnswer") or "").strip(),
        "reminders": [str(r).strip() for r in reminders if str(r).strip()],
    }


async def _run(args: dict) -> ToolResult:
    action = str(args.get("action") or "draw").strip().lower()

    # ── 浏览 ─────────────────────────────────────────
    if action == "list":
        category = str(args.get("category") or "").strip() or None
        entries = bank.ENTRIES if not category else [e for e in bank.ENTRIES if e["category"] == category]
        return ToolResult(
            summary=f"错题库共 {len(bank.ENTRIES)} 条 · 当前筛选 {len(entries)} 条",
            detail=(
                "内置错题库覆盖：" + "、".join(bank.categories())
                + "。\n大纲预存方向：" + "、".join(bank.SYLLABUS_TOPICS)
                + "\n\n每条错题含：题目原文 / 学生典型错误作答 / 错误根源 / 标准正确解答 / 同类易错提醒。"
                + "\n按分类浏览时把 category 设为上面任意一个分类名。"
            ),
            artifact_type="mistakeBook",
            artifact=_artifact("bank", entries, note="内置错题库浏览"),
        )

    # ── 抽题 ─────────────────────────────────────────
    if action == "draw":
        topic = str(args.get("topic") or "").strip()
        category = str(args.get("category") or "").strip() or None
        try:
            count = max(1, min(3, int(args.get("count") or 1)))
        except (TypeError, ValueError):
            count = 1
        matched = bank.match_entries(topic, category)
        if not matched:
            matched = bank.ENTRIES
            note = "没有精确匹配的主题，已随机抽取；可换关键词再抽"
        else:
            note = f"按「{topic or category}」匹配到 {len(matched)} 条，取前 {min(count, len(matched))} 条"
        picked = random.sample(matched, k=min(count, len(matched)))
        return ToolResult(
            summary=f"抽出 {len(picked)} 条错题 · {picked[0]['category']}" if picked else "错题库为空",
            detail="\n\n".join(
                f"【{e['category']}】{e['question']}\n错误作答：{e['studentAnswer']}\n根因：{e['rootCauseKind']} —— {e['rootCause']}"
                for e in picked
            ),
            artifact_type="mistakeBook",
            artifact=_artifact("bank", picked, note=note),
        )

    # ── 从知识库抽取出题素材 ──────────────────────────
    if action == "extract":
        topic = str(args.get("topic") or "").strip()
        if not topic:
            return ToolResult(summary="缺少主题", detail="请给出要从知识库抽取习题的主题，例如「回火」「250目筛分」。")
        try:
            top_k = max(2, min(5, int(args.get("topK") or 3)))
        except (TypeError, ValueError):
            top_k = 3

        chunks = _load_chunks()
        if not chunks:
            return ToolResult(
                summary="知识库为空",
                detail="chunks.jsonl 不存在。请先运行：cd backend && python knowledge/ingest.py",
            )

        q_terms = set(_tokens(topic))
        scored = []
        for c in chunks:
            bag = set(_tokens(c.get("text", "")))
            cover = len(q_terms & bag) / len(q_terms) if q_terms else 0.0
            if cover > 0:
                scored.append((cover, c))
        scored.sort(key=lambda p: p[0], reverse=True)
        hits = scored[:top_k]

        if not hits:
            return ToolResult(
                summary="知识库未收录该主题",
                detail=f"以「{topic}」没有检索到原文，请如实告知用户，不要编造习题。",
            )

        candidates = [
            {
                "source": c["metadata"].get("source", ""),
                "experiment": c["metadata"].get("experiment", ""),
                "section": c["metadata"].get("section", ""),
                "text": c["text"],
                "score": round(s, 3),
            }
            for s, c in hits
        ]
        related = bank.match_entries(topic)[:2]
        detail_lines = [
            f"「{topic}」在知识库中命中 {len(candidates)} 段原文（已按相关度排序）：",
            *[f"\n【{i}】《{c['source']}》{c['experiment']} · {c['section']}\n{c['text'][:300]}{'…' if len(c['text']) > 300 else ''}" for i, c in enumerate(candidates, 1)],
            "\n请基于以上原文出题：题干、干扰项、学生典型错误、根因、正解与避坑提醒，并标注出处。",
        ]
        if related:
            detail_lines.append("内置题库中相关的既有条目也一并推给了画布，可参考其五件套格式。")
        return ToolResult(
            summary=f"「{topic}」命中 {len(candidates)} 段原文 · 可出题",
            detail="\n".join(detail_lines),
            artifact_type="mistakeBook",
            artifact=_artifact("extract", related, note=f"知识库出题素材 · 主题：{topic}", extra={"candidates": candidates}),
        )

    # ── 落画布（对话解析 / 手动录入共用） ─────────────
    if action == "record":
        entry = _normalize_entry(args, source=str(args.get("source") or "对话解析"))
        if not entry["question"] or not entry["studentAnswer"]:
            return ToolResult(
                summary="信息不全，未入画布",
                detail=(
                    "record 至少需要 question（题目原文）与 studentAnswer（学生错误作答）。"
                    "缺哪项就先向用户追问，凑齐后再调用。五件套越齐，画布拆解越完整。"
                ),
            )
        missing = [k for k in ("rootCause", "correctAnswer") if not entry[k]]
        warn = f"（缺少{'、'.join(missing)}，画布已标黄提示补全）" if missing else ""
        return ToolResult(
            summary=f"错题已推送到画布 · {entry['category']} · 根因：{entry['rootCauseKind']}{warn}",
            detail=(
                f"题目：{entry['question']}\n错误作答：{entry['studentAnswer']}\n"
                f"根因：{entry['rootCauseKind']} —— {entry['rootCause'] or '（待补全）'}\n"
                f"正解：{entry['correctAnswer'] or '（待补全）'}"
            ),
            artifact_type="mistakeBook",
            artifact=_artifact("record", [entry], note=warn or "解析完成"),
        )

    return ToolResult(
        summary=f"未知动作 {action}",
        detail="action 只支持：list / draw / record / extract。",
    )


TOOL = Tool(
    name="mistake_book",
    label="错题集 · {action}",
    description=(
        "材料科学错题集工具。用户要「浏览/抽错题」时用 action=list 或 draw；"
        "对话中出现了一道错题并已完成拆解（题目、学生错误作答、错误根因、正确解答、避坑提醒）时，"
        "必须用 action=record 把五件套推送进错题集画布，rootCauseKind 只能取："
        "概念混淆/公式误用/模型理解偏差/忽略边界条件/计算失误/其他；"
        "用户想「从知识库出题」时用 action=extract 检索原文素材。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "draw", "record", "extract"],
                "description": "list 浏览题库；draw 抽题；record 把解析完的错题推送进画布；extract 从知识库抽出题素材",
            },
            "category": {"type": "string", "description": "错题分类，如 热处理/相图/晶体学（list、draw 可用）"},
            "topic": {"type": "string", "description": "主题关键词，如 回火、250目筛分（draw、extract 用）"},
            "count": {"type": "integer", "description": "抽题数量，1~3，默认 1"},
            "topK": {"type": "integer", "description": "extract 召回的原文段数，2~5，默认 3"},
            "question": {"type": "string", "description": "record：题目原文"},
            "studentAnswer": {"type": "string", "description": "record：学生的典型错误作答"},
            "rootCauseKind": {"type": "string", "description": "record：错误根源类型（封闭集合）"},
            "rootCause": {"type": "string", "description": "record：错误根源的具体说明"},
            "knowledgePoint": {"type": "string", "description": "record：对应知识点"},
            "knowledgeRefs": {"type": "array", "items": {"type": "string"}, "description": "record：出处，如《教材》实验二十"},
            "correctAnswer": {"type": "string", "description": "record：标准正确解答"},
            "reminders": {"type": "array", "items": {"type": "string"}, "description": "record：同类易错提醒，1~3 条"},
            "source": {"type": "string", "description": "record：来源说明，默认「对话解析」"},
        },
        "required": ["action"],
    },
    run=_run,
)
