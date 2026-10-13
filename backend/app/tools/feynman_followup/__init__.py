"""费曼追问记录与轮次门槛。

追问内容由对话模型生成；本工具负责规范化时间线，并确保三轮前不发布总评。
"""
from __future__ import annotations

from ..base import Tool, ToolResult


def _text(value: object, limit: int = 1200) -> str:
    return str(value or "").strip()[:limit]


async def _run(args: dict) -> ToolResult:
    concept = _text(args.get("concept"), 120)
    raw_rounds = args.get("rounds")
    rounds = []
    if isinstance(raw_rounds, list):
        for item in raw_rounds[:12]:
            if not isinstance(item, dict):
                continue
            question = _text(item.get("question"))
            answer = _text(item.get("userAnswer"))
            critique = _text(item.get("critique"))
            if question:
                rounds.append({"question": question, "userAnswer": answer, "critique": critique})

    complete = len(rounds) >= 3
    score = args.get("score") if complete else None
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        score = None
    elif score is not None:
        score = max(0, min(100, round(score)))

    overall = _text(args.get("overall")) if complete else ""
    suggestions = args.get("suggestions", []) if complete else []
    if not isinstance(suggestions, list):
        suggestions = []
    suggestions = [_text(item, 300) for item in suggestions[:6] if _text(item, 300)]

    artifact = {
        "concept": concept or "待确定概念",
        "rounds": rounds,
        "score": score,
        "overall": overall,
        "suggestions": suggestions,
    }
    if complete and score is not None and overall:
        summary = f"{artifact['concept']} · 已完成 {len(rounds)} 轮 · {score} 分"
        detail = overall
    else:
        summary = f"{artifact['concept']} · 已记录 {len(rounds)} 轮，继续追问后再评价"
        detail = "至少完成三轮追问后才能给出总分和总评。"

    return ToolResult(summary=summary, detail=detail, artifact_type="feynman", artifact=artifact)


TOOL = Tool(
    name="feynman_followup",
    label="更新费曼追问 · {concept}",
    description=(
        "用于费曼追问模块，将本次概念讲解的追问时间线更新到画布。学生开始用自己的话解释概念时调用。"
        "按顺序先找表述模糊点，再检查逻辑跳跃，再逐层追问；答非所问时先用一个简短问题澄清，然后回到主线，避免反复纠缠。"
        "每次传入截至目前的完整 rounds，字段为 question、userAnswer、critique；如学生尚未回答，userAnswer 留空。"
        "严格至少三轮有效追问后才填写 score、overall、suggestions；不足三轮时省略这些字段，继续提出下一轮问题。"
        "三轮后总评必须指出具体哪句话模糊、哪一步推理跳跃，并给出可执行的改进建议。分数为 0 到 100 的整数。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "concept": {"type": "string", "description": "学生正在解释的概念"},
            "rounds": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string"},
                        "userAnswer": {"type": "string"},
                        "critique": {"type": "string"},
                    },
                    "required": ["question", "userAnswer", "critique"],
                    "additionalProperties": False,
                },
            },
            "score": {"type": "integer", "minimum": 0, "maximum": 100},
            "overall": {"type": "string"},
            "suggestions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["concept", "rounds"],
        "additionalProperties": False,
    },
    run=_run,
)
