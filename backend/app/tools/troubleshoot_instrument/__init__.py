"""
A1 子能力 · 仪器操作故障排查。

学生描述现象，反查 SOP 定位到具体环节。
表里的条目全部来自《教材》实验十、实验十二、实验三的「注意事项」与「实验步骤」。

TODO：目前是关键词匹配映射表。素材更多以后可以改成先 search_knowledge 召回，
      再让模型基于原文定位 —— 那时这张表退化成一个兜底。
"""
from __future__ import annotations

import re

from ..base import Tool, ToolResult

# 每条：症状关键词 → 疑似环节 / 排查顺序 / 纠正操作 / 出处
CASES = [
    {
        "keywords": ["千分表", "读数", "预压", "不准", "漂移", "零点"],
        "instrument": "热膨胀仪（PCY 型）",
        "symptom": "千分表读数异常 / 预压量不对",
        "steps": [
            "确认试样已放入石英试样管内的垫片，且与顶杆保持为一条直线",
            "查看千分表预压读数是否为 2–3 mm —— 这是最容易漏掉的一步",
            "若不是，松开千分表固定螺丝，前后移动千分表至预压量达标，再拧紧并清零",
            "确认已用石英标样（膨胀系数 0.55×10⁻⁶/℃）完成系统补偿值标定",
            "检查电炉端面至导支套端面距离是否为 20 mm，否则试样不在炉膛均温区",
        ],
        "ref": "《教材》实验十二 · 三、试验方法与仪器装置",
    },
    {
        "keywords": ["串口", "通讯", "通信", "连不上", "端口", "波特率"],
        "instrument": "热膨胀仪（PCY 型）",
        "symptom": "电脑与膨胀仪通讯不上",
        "steps": [
            "温度串行口端口号设为 1",
            "位移走 USB-232 串口的端口号",
            "通讯协议：温度 9600,e,7,1；位移 9600,n,8,1",
            "温度地址设为 0055",
            "设置完成后点「测试」，确认电脑显示数据与仪表一致，再点「确定」进入主界面",
        ],
        "ref": "《教材》实验十二 · 三、试验方法与仪器装置",
    },
    {
        "keywords": ["硬度", "压痕", "找不到", "测不出", "误差", "不准", "显微硬度"],
        "instrument": "HV-1000Z 数字显微硬度计",
        "symptom": "压痕找不到 / 硬度值偏差大",
        "steps": [
            "先确认聚焦：转塔转到 40 倍物镜，缓慢微量上升载物台直到目镜中试样表面清晰成像",
            "试样表面若有油脂或污物会影响准确性，用酒精或乙醚擦净",
            "细小件（细丝、薄片、小件）必须用细丝夹持台、薄片夹持台或平口夹持台夹持；无法夹持的要镶嵌抛光后再测",
            "确认试验力变换手轮的力值与屏幕显示一致（旋动时须缓慢）",
            "测压痕对角线时，先转左鼓轮对准左边顶点，再转右鼓轮对准右边顶点，然后转 90° 测另一条",
            "硬度换算注意：维氏与布氏之间没有固定换算关系，屏幕「换算」键只作参考",
        ],
        "ref": "《教材》实验十 · 四、实验步骤 与 五、注意事项",
    },
    {
        "keywords": ["压头", "金刚石", "脏", "污染", "油污"],
        "instrument": "显微硬度计",
        "symptom": "金刚石压头沾污",
        "steps": [
            "压头与压头轴是仪器最关键也最脆弱的部分，操作时绝不能触及压头",
            "沾上油污或灰尘时，用脱脂棉蘸工业酒精或乙醚，在压头顶尖处小心轻擦",
            "严禁在试验力加载中或未卸载时移动试件，否则会损坏仪器",
        ],
        "ref": "《教材》实验十 · 五、注意事项",
    },
    {
        "keywords": ["划痕", "拖尾", "抛光", "磨", "制样", "金相", "样品"],
        "instrument": "金相制样（磨抛）",
        "symptom": "试样表面有划痕 / 拖尾 / 组织模糊",
        "steps": [
            "划痕未消除：抛光不足，需延长抛光时间或更换抛光布与抛光膏",
            "出现拖尾：抛光时压力过大或时间过长，减轻压力、缩短时间",
            "组织发黑：腐蚀过度，重新抛光后缩短腐蚀时间",
            "组织不显现：腐蚀不足，延长腐蚀时间（碳钢用 4% 硝酸酒精溶液）",
            "边缘变圆：试样未镶嵌或夹持，需用环氧树脂镶嵌后再制样",
            "腐蚀不均匀：检查是否用钢板夹持 —— 钢板与试样材料不同会形成腐蚀电池",
            "出现假组织：粗磨时未彻底清除表面加工变形层",
        ],
        "ref": "《教材》实验三 · 二、实验原理（取样 / 镶嵌 / 粗磨 / 抛光 / 腐蚀）",
    },
    {
        "keywords": ["砂轮", "磨光", "铜", "铝", "堵塞", "过热", "烫"],
        "instrument": "粗磨（SiC 砂轮）",
        "symptom": "砂轮磨不动 / 试样过热",
        "steps": [
            "纯铜、纯铝、铅、锡等软而韧性好的材料不能用砂轮磨光：会阻塞砂粒间隙使砂轮失效，且摩擦力大易出危险",
            "磨光过程中必须用普通自来水不断冷却试样，避免试样过热引起相变或烫伤手指",
        ],
        "ref": "《教材》实验三 · 二、实验原理（试样的粗磨）",
    },
]

FALLBACK = {
    "instrument": "未定位到具体仪器",
    "steps": [
        "请补充说明：是哪台仪器、什么现象、做完哪一步之后出现的",
        "常见可自查项：电源与开关、耗材是否耗尽、试样是否放置到位、参数是否被改动",
        "仍然无法定位时，请找指导老师现场确认，不要自行拆装仪器",
    ],
    "ref": None,
}


def _match(symptom: str, instrument: str | None) -> dict:
    text = (symptom or "") + " " + (instrument or "")
    best, best_hits = None, 0
    for case in CASES:
        if instrument and case["instrument"] not in instrument and instrument not in case["instrument"]:
            continue
        hits = sum(1 for kw in case["keywords"] if re.search(re.escape(kw), text))
        if hits > best_hits:
            best, best_hits = case, hits
    return best or FALLBACK


async def _run(args: dict) -> ToolResult:
    symptom = str(args.get("symptom", "")).strip()
    instrument = args.get("instrument")
    instrument = str(instrument) if instrument else None

    case = _match(symptom, instrument)

    lines = [f"现象：{symptom or '（未描述）'}"]
    if case.get("instrument"):
        lines.append(f"疑似涉及：{case['instrument']}")
    if case.get("symptom"):
        lines.append(f"对应故障：{case['symptom']}")
    lines.append("\n排查顺序：")
    for i, s in enumerate(case["steps"], 1):
        lines.append(f"  {i}. {s}")
    if case.get("ref"):
        lines.append(f"\n出处：{case['ref']}")

    is_fallback = case is FALLBACK
    return ToolResult(
        summary="已定位到排查顺序" if not is_fallback else "现象描述不足，需要补充信息",
        detail="\n".join(lines),
    )


TOOL = Tool(
    name="troubleshoot_instrument",
    label="仪器故障排查 ·「{symptom}」",
    description=(
        "根据学生描述的异常现象，反查仪器操作规范并定位到具体环节，给出排查顺序与纠正操作。"
        "覆盖热膨胀仪、显微硬度计、金相制样相关设备。"
        "学生说「测不出来」「读数不对」「试样有问题」这类现象时调用。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "symptom": {"type": "string", "description": "学生描述的现象，尽量保留原话"},
            "instrument": {
                "type": "string",
                "description": "涉及的仪器名，不确定就留空",
            },
        },
        "required": ["symptom"],
    },
    run=_run,
)
