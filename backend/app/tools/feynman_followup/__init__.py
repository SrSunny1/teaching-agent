"""费曼追问记录、逐句标注与轮次门槛。

追问内容由对话模型生成；本工具负责三件事：
  1. 规范化时间线；
  2. 把模型给的「引文 + 类型」定位成互不重叠的分段（`_annotate`），供画布逐句高亮；
  3. 确保三轮前不发布总评。

★ 模型只负责「指出是哪句话」，不负责给字符下标 —— 中文里模型给的偏移经常差一两个字，
  标到隔壁词上比不标更糟。定位一律在这里用子串匹配做。
"""
from __future__ import annotations

from ..base import Tool, ToolResult


def _text(value: object, limit: int = 1200) -> str:
    return str(value or "").strip()[:limit]


_MARK_KINDS = {"vague", "jump", "good"}


def _compact(text: str) -> tuple[str, list[int]]:
    """去掉全部空白字符，并记录每个保留字符在**原串**中的下标。

    这样模型给的引文即使和原文的换行/空格对不齐，也还能定位。
    """
    kept: list[str] = []
    index: list[int] = []
    for position, char in enumerate(text):
        if char.isspace():
            continue
        kept.append(char)
        index.append(position)
    return "".join(kept), index


def _segment(text: str, kind: str | None = None, note: str = "") -> dict:
    segment = {"text": text, "kind": kind}
    if note:
        segment["note"] = note
    return segment


def _annotate(answer: str, marks: object) -> list[dict]:
    """把模型给的「引文 + 类型」切成**互不重叠的完整分段**，供前端直接渲染。

    ★ 为什么由这里算、而不是让模型吐字符下标：中文里模型给的偏移不可靠，
      经常差一两个字，标到隔壁词上比不标更糟。所以模型只负责「指出是哪句话」，
      定位用子串匹配在这里做，且**对不上就直接丢弃** —— 宁可少标，不可标错。
    """
    if not answer:
        return []

    compact, index = _compact(answer)
    spans: list[tuple[int, int, str, str]] = []

    for item in (marks if isinstance(marks, list) else []):
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind", "")).strip().lower()
        if kind not in _MARK_KINDS:
            continue
        quote, _ = _compact(str(item.get("quote", "")))
        if not quote:
            continue
        found = compact.find(quote)
        if found < 0:
            continue  # 引文对不上原文：丢弃，不猜位置
        start = index[found]
        end = index[found + len(quote) - 1] + 1
        spans.append((start, end, kind, _text(item.get("note"), 300)))

    # 按起点排序；与已保留区间重叠的一律丢掉（先到先得），保证输出互不重叠
    spans.sort(key=lambda span: (span[0], -span[1]))
    kept: list[tuple[int, int, str, str]] = []
    for span in spans:
        if kept and span[0] < kept[-1][1]:
            continue
        kept.append(span)

    if not kept:
        return [_segment(answer)]

    # 切成完整分段：没被标注盖住的部分 kind=None（前端按普通文字渲染）
    out: list[dict] = []
    cursor = 0
    for start, end, kind, note in kept:
        if start > cursor:
            out.append(_segment(answer[cursor:start]))
        out.append(_segment(answer[start:end], kind, note))
        cursor = end
    if cursor < len(answer):
        out.append(_segment(answer[cursor:]))
    return out


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
                rounds.append({
                    "question": question,
                    "userAnswer": answer,
                    "critique": critique,
                    # 逐句标注：分段在这里算好，前端只负责渲染（见 _annotate）
                    "annotated": _annotate(answer, item.get("marks")),
                })

    # ★ 门槛按「学生真的回答过的轮次」算，**不是**按 rounds 的长度。
    #   因为 Agent 现在在刚抛出问题、学生还没答时也会调一次工具（否则画布整个问答过程都是空的），
    #   那种空回答的轮次不该算进三轮门槛 —— 否则总评会被提前放出来。
    answered = sum(1 for item in rounds if item["userAnswer"])
    complete = answered >= 3
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
        summary = f"{artifact['concept']} · 已完成 {answered} 轮 · {score} 分"
        detail = overall
    else:
        pending = len(rounds) - answered
        summary = f"{artifact['concept']} · 已回答 {answered} 轮" + (f"、待答 {pending} 轮" if pending else "")
        detail = f"至少完成三轮有效追问后才能给出总分和总评（当前已回答 {answered} 轮）。"

    return ToolResult(summary=summary, detail=detail, artifact_type="feynman", artifact=artifact)


TOOL = Tool(
    name="feynman_followup",
    label="更新费曼追问 · {concept}",
    description=(
        "用于费曼追问模块，把追问时间线同步到右侧画布。"
        "★ 调用时机只有两个，缺一不可："
        "(1) 你抛出一次追问之后 —— 立刻调用，userAnswer 传空字符串，画布会显示「等待你的回答」；"
        "(2) 收到学生的回答之后 —— 调用，带上回答和逐句标注 marks。"
        "举例：学生说「开始追问我一个问题吧」，你回「请用自己的话讲讲 45 钢淬火后再回火为什么硬度下降」，"
        "**这一轮就要调用一次 (1)**，而不是等他回答了再第一次调用。"
        "画布必须从你问出第一个问题那一刻起就有内容；攒着不记，学生会以为这个功能坏了。"
        "按顺序先找表述模糊点，再检查逻辑跳跃，再逐层追问；答非所问时先用一个简短问题澄清，然后回到主线，避免反复纠缠。"
        "每次传入截至目前的完整 rounds，字段为 question、userAnswer、critique；如学生尚未回答，userAnswer 留空。"
        "★ 学生已回答的每一轮，marks 是必填项，给 1~3 处逐句标注：把他的表述问题直接标在他自己写的那句话上，"
        "quote 必须是该句原话里原样出现的片段（直接复制，不要改写），kind 用 vague/jump/good。"
        "这是画布上逐句高亮的唯一数据来源 —— userAnswer 非空却漏了 marks，学生看到的就只是一段普通文字。"
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
                        "marks": {
                            "type": "array",
                            "description": (
                                "对该轮 userAnswer 的逐句标注，画布靠它把学生的原话逐句高亮出来。"
                                "★ 只要 userAnswer 非空，这一项就是必填、至少给 1 处：漏了它，"
                                "学生在画布上就只能看到一段没有任何标注的普通文字，功能等于没生效。"
                                "quote 必须是 userAnswer 里【原样出现】的一段文字：直接复制，"
                                "不要改写、不要补标点、不要加省略号，对不上位置会被丢弃。"
                                "kind：vague=表述模糊（说了名词但没界定）、"
                                "jump=逻辑跳跃（缺了一步推理）、good=讲对了的关键处。"
                                "标 1~3 处，挑最值得说的；就算整段都讲对了，也要用 good 指出"
                                "讲得最好的那一句并说明为什么对。"
                            ),
                            "items": {
                                "type": "object",
                                "properties": {
                                    "quote": {"type": "string", "description": "学生原话里的原文片段"},
                                    "kind": {"type": "string", "enum": ["vague", "jump", "good"]},
                                    "note": {"type": "string", "description": "针对这一句的点评，一两句话，说清问题在哪"},
                                },
                                "required": ["quote", "kind", "note"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    # ★ critique 刻意**不**放进 required：学生还没回答时那一轮本来就没有可点评的，
                    #   强制必填会让模型不愿意记录「刚抛出问题」的轮次，画布就一直空着。
                    "required": ["question", "userAnswer"],
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
