"""
B1 热处理工艺沙盒的数值模型。

⚠️ 这套区间与 frontend/src/features/heatTreatment/model.ts 必须完全一致。
两边任何一个数字变了，另一边要同步改，并在群里通知。

数值来源：《教材》实验二十 二、实验原理
  - 低温回火 150–250℃ → 回火马氏体，57–60 HRC
  - 中温回火 350–500℃ → 回火托氏体，40–48 HRC
  - 高温回火 500–600℃ → 回火索氏体，25–35 HRC
"""
from __future__ import annotations

from ..base import Tool, ToolResult

# 取点规则：曲线的每一段端点都落在教材给的区间端点上。
# 注意教材的区间本身在 250℃ 与 500℃ 附近相邻/重叠（中温 350–500℃ 是 40–48 HRC，
# 高温 500–600℃ 是 25–35 HRC，500℃ 处两者相差 5 HRC），
# 因此 250–350℃ 与 500–550℃ 是**过渡区**，不归属任何一个区间，这是真实情况而非模型缺陷。
TEMPER_CURVE: list[tuple[int, int]] = [
    (150, 60), (200, 59), (250, 57),               # 低温回火 57–60
    (300, 52), (350, 48),                          # 过渡区
    (400, 44), (450, 42), (500, 40),               # 中温回火 40–48
    (510, 35), (550, 30), (600, 25),               # 高温回火 25–35
]

# 教材在 500℃ 处自相矛盾：中温回火（350–500℃）的下限是 40 HRC，
# 高温回火（500–600℃）的上限是 35 HRC，两者对 500℃ 给出不同答案。
# 我们的处理：500℃ 判为**中温回火**（40 HRC），510℃ 起进入高温回火。
# 500–510℃ 这 10 度是不归属任何区间的过渡带，界面上要如实提示，不要假装没有这回事。
OVERLAP_NOTE = "教材在 500℃ 处中温/高温回火区间重叠（40 HRC vs 35 HRC），本模型取 500℃ 归中温回火。"

COOLING_LABEL = {"furnace": "炉冷（退火）", "air": "空冷（正火）", "water": "水冷（淬火）"}


def _interp(t: int) -> int:
    if t <= TEMPER_CURVE[0][0]:
        return TEMPER_CURVE[0][1]
    if t >= TEMPER_CURVE[-1][0]:
        return TEMPER_CURVE[-1][1]
    for (x0, y0), (x1, y1) in zip(TEMPER_CURVE, TEMPER_CURVE[1:]):
        if x0 <= t <= x1:
            ratio = (t - x0) / (x1 - x0)
            return round(y0 + ratio * (y1 - y0))
    return TEMPER_CURVE[-1][1]


def _carbon_factor(carbon: float) -> float:
    """教材那条曲线本身就是 45 钢（0.45%C）的实测值，所以 0.45 处**不能**再修正，
    否则等于把基准重复扣一次（曾导致 200℃ 回火算成 53 HRC，落在教材 57–60 之外）。
    只在偏离 0.45 时按亚共析钢淬火硬度的经验趋势做温和修正。"""
    if carbon >= 0.45:
        return 1.0
    return 0.4 + 0.6 * (carbon / 0.45) ** 0.5


def _temper_structure(t: int) -> str:
    if t < 250:
        return "回火马氏体"
    if t < 350:
        return "回火马氏体 + 回火托氏体（过渡区）"
    if t <= 500:
        return "回火托氏体"
    return "回火索氏体"


def _simulate(cooling: str, temper: int, carbon: float) -> dict:
    carbon = min(2.11, max(0.02, carbon))

    if cooling == "furnace":
        return {
            "structure": "铁素体 + 珠光体" if carbon < 0.77 else "珠光体 + 二次渗碳体",
            "hardnessHrc": round(14 + carbon * 6),
            "curve": [],
            "diagnosis": "炉冷（退火）：冷速最慢，组织接近平衡态，硬度最低、塑性最好。用于消除内应力、改善切削加工性。",
            "warning": None,
        }

    if cooling == "air":
        return {
            "structure": "细片状珠光体（索氏体）+ 铁素体" if carbon < 0.77 else "索氏体 + 二次渗碳体",
            "hardnessHrc": round(22 + carbon * 14),
            "curve": [],
            "diagnosis": "空冷（正火）：冷速快于退火，得到较细密的索氏体，强度硬度高于退火。常作预备热处理。",
            "warning": None,
        }

    # 水冷（淬火）
    factor = _carbon_factor(carbon)

    if temper <= 0:
        return {
            "structure": "马氏体 + 残余奥氏体",
            "hardnessHrc": round(62 * factor),
            "curve": [list(p) for p in TEMPER_CURVE],
            "diagnosis": "淬火后不回火：硬度最高但内应力极大、脆性大，直接使用极易开裂。",
            "warning": "⚠ 淬火后不回火将导致脆性过大，工件存在开裂风险。",
        }

    hardness = round(_interp(temper) * factor)
    warning = None

    if temper < 150:
        diagnosis = "低于常规回火温度下限（150℃），组织转变不充分，内应力消除有限。"
        warning = "⚠ 回火温度低于 150℃，不属于教材所列的三类回火。"
    elif temper < 250:
        diagnosis = "低温回火区间（150–250℃）：降低回火应力、减少脆性，同时保持高硬度。用于切削工具、量具、滚动轴承钢、渗碳钢。"
    elif temper < 350:
        diagnosis = "处于低温回火与中温回火之间的过渡区，实际生产中较少采用。"
        warning = "⚠ 350℃ 附近为回火脆性敏感区，应避开。"
    elif temper <= 500:
        diagnosis = "中温回火区间（350–500℃）：获得高的弹性极限，同时保持较高韧性。主要用于各种弹簧及热锻模具。"
    elif temper <= 600:
        diagnosis = "高温回火区间（500–600℃）：获得强度、硬度与冲击韧度的良好配合。淬火 + 高温回火称为调质处理，用于连杆、螺栓、主轴。"
    else:
        diagnosis = "回火温度超过 600℃，已接近退火效果，硬度大幅下降，失去淬火强化的意义。"
        warning = "⚠ 回火温度高于 600℃，超出教材所列区间。"

    return {
        "structure": _temper_structure(temper),
        "hardnessHrc": hardness,
        "curve": [list(p) for p in TEMPER_CURVE],
        "diagnosis": diagnosis,
        "warning": warning,
    }


async def _run(args: dict) -> ToolResult:
    cooling = str(args.get("cooling", "water"))
    if cooling not in COOLING_LABEL:
        cooling = "water"
    temper = int(args.get("temper_temp", 0) or 0)
    carbon = float(args.get("carbon", 0.45) or 0.45)

    r = _simulate(cooling, temper, carbon)

    temper_txt = "不回火" if temper <= 0 else f"{temper}℃ 回火"
    summary = f"{COOLING_LABEL[cooling]} + {temper_txt} → {r['structure']}，约 {r['hardnessHrc']} HRC"

    detail = (
        f"工艺：45 钢，加热 860℃ 保温 15–20 min，{COOLING_LABEL[cooling]}"
        + (f"，回火 {temper}℃" if temper > 0 else "，不回火")
        + f"\n含碳量：{carbon:.2f}%\n组织：{r['structure']}\n硬度：{r['hardnessHrc']} HRC\n\n"
        + r["diagnosis"]
        + (f"\n\n注意：{OVERLAP_NOTE}" if 480 <= temper <= 540 else "")
        + "\n\n出处：《教材》实验二十 · 二、实验原理"
    )

    return ToolResult(
        summary=summary,
        detail=detail,
        artifact_type="heatTreatment",
        artifact={
            "cooling": cooling,
            "temperTemp": temper,
            "carbon": carbon,
            "structure": r["structure"],
            "hardnessHrc": r["hardnessHrc"],
            "curve": r["curve"],
            "diagnosis": r["diagnosis"],
            "warning": r["warning"],
        },
    )


TOOL = Tool(
    name="simulate_heat_treatment",
    label="热处理沙盒 · {cooling} + {temper_temp}℃",
    description=(
        "计算 45 钢在给定冷却方式、回火温度和含碳量下的显微组织与硬度，"
        "并生成回火温度-硬度曲线。学生问热处理工艺、淬火回火、硬度与组织关系时调用。"
        "数值区间取自实验教材，不要凭记忆回答这类问题。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "cooling": {
                "type": "string",
                "enum": ["furnace", "air", "water"],
                "description": "冷却方式：furnace 炉冷（退火）、air 空冷（正火）、water 水冷（淬火）",
            },
            "temper_temp": {
                "type": "integer",
                "description": "回火温度 ℃，范围 100–650。仅在淬火（water）时有意义，不回火填 0。",
            },
            "carbon": {
                "type": "number",
                "description": "含碳量 %，范围 0.02–2.11，45 钢为 0.45",
            },
        },
        "required": ["cooling"],
    },
    run=_run,
)
