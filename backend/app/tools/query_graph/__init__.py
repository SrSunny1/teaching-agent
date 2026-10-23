"""
A4 / A5 图谱数据。

主干链取自《教材》实验四的论述：
    成分 → 相组成 → 组织形态 → 性能 → 可调控工艺

优先读 data/graph.json（如果内容组已经产出），否则用下面的种子图。
种子图够跑通链路和演示，正式内容由内容负责人替换。
"""
from __future__ import annotations

import json
from pathlib import Path

from ... import config
from ..base import Tool, ToolResult

GRAPH_FILE = Path(config.DATA_DIR) / "graph.json"

# relation 封闭集合：前置依赖 / 因果 / 对比 / 组成
# type     封闭集合：成分 / 相 / 组织 / 性能 / 工艺 / 缺陷

SEED_NODES = [
    # 成分
    {"id": "carbon", "label": "含碳量", "type": "成分", "desc": "决定碳钢室温组织的最基本成分变量，范围 0.02–6.69%", "refs": ["教材 实验四"]},
    {"id": "steel45", "label": "45 钢", "type": "成分", "desc": "含碳量约 0.45% 的亚共析钢，热处理实验的典型材料", "refs": ["教材 实验二十"]},
    # 相
    {"id": "ferrite", "label": "铁素体", "type": "相", "desc": "碳溶于 α-Fe 的间隙固溶体，强度硬度低、塑性韧性好", "refs": ["教材 实验四"]},
    {"id": "cementite", "label": "渗碳体", "type": "相", "desc": "Fe₃C，硬而脆的化合物相", "refs": ["教材 实验四"]},
    {"id": "austenite", "label": "奥氏体", "type": "相", "desc": "碳溶于 γ-Fe 的固溶体，高温相，淬火的母相", "refs": ["教材 实验二十"]},
    {"id": "martensite", "label": "马氏体", "type": "相", "desc": "碳在 α-Fe 中的过饱和固溶体，淬火产物，硬度高脆性大", "refs": ["教材 实验二十"]},
    # 组织
    {"id": "pearlite", "label": "珠光体", "type": "组织", "desc": "铁素体与渗碳体的层片状机械混合物，共析产物", "refs": ["教材 实验四"]},
    {"id": "ledeburite", "label": "莱氏体", "type": "组织", "desc": "共晶白口铸铁的室温组织，由珠光体与渗碳体组成", "refs": ["教材 实验四"]},
    {"id": "sorbite", "label": "索氏体", "type": "组织", "desc": "细密珠光体，正火（空冷）产物", "refs": ["教材 实验二十"]},
    {"id": "tempered_martensite", "label": "回火马氏体", "type": "组织", "desc": "低温回火（150–250℃）产物，57–60 HRC", "refs": ["教材 实验二十"]},
    {"id": "tempered_troostite", "label": "回火托氏体", "type": "组织", "desc": "中温回火（350–500℃）产物，40–48 HRC，弹性极限高", "refs": ["教材 实验二十"]},
    {"id": "tempered_sorbite", "label": "回火索氏体", "type": "组织", "desc": "高温回火（500–600℃）产物，25–35 HRC，综合力学性能好", "refs": ["教材 实验二十"]},
    # 性能
    {"id": "hardness", "label": "硬度", "type": "性能", "desc": "材料局部抵抗硬物压入表面的能力", "refs": ["教材 实验十"]},
    {"id": "strength", "label": "强度", "type": "性能", "desc": "室温下细小均匀的晶粒分布有助于提高强度", "refs": ["教材 实验四"]},
    {"id": "toughness", "label": "塑性韧性", "type": "性能", "desc": "较粗大的晶粒容易导致韧性降低", "refs": ["教材 实验四"]},
    {"id": "corrosion", "label": "耐腐蚀性", "type": "性能", "desc": "晶界、孔隙和夹杂物等缺陷常是腐蚀起始点", "refs": ["教材 实验四"]},
    # 工艺
    {"id": "annealing", "label": "退火", "type": "工艺", "desc": "加热后随炉冷却，得到接近平衡的组织，硬度最低", "refs": ["教材 实验二十"]},
    {"id": "normalizing", "label": "正火", "type": "工艺", "desc": "加热后空冷，得到细密索氏体，强度硬度高于退火", "refs": ["教材 实验二十"]},
    {"id": "quenching", "label": "淬火", "type": "工艺", "desc": "加热到相变温度以上后快冷，得到马氏体", "refs": ["教材 实验二十"]},
    {"id": "tempering", "label": "回火", "type": "工艺", "desc": "淬火后重新加热到 Ac1 以下，降低内应力与脆性", "refs": ["教材 实验二十"]},
    {"id": "quench_temper", "label": "调质处理", "type": "工艺", "desc": "淬火 + 高温回火，获得良好的综合力学性能", "refs": ["教材 实验二十"]},
    # 缺陷
    {"id": "dislocation", "label": "位错", "type": "缺陷", "desc": "刃型、螺型、混合型；滑移、增殖、交割、塞积", "refs": ["教材 实验一"]},
    {"id": "grain_boundary", "label": "晶界", "type": "缺陷", "desc": "晶界贫铬易导致不锈钢晶间腐蚀", "refs": ["教材 实验四"]},
]

SEED_EDGES = [
    {"source": "carbon", "target": "pearlite", "relation": "因果"},
    {"source": "carbon", "target": "ledeburite", "relation": "因果"},
    {"source": "ferrite", "target": "pearlite", "relation": "组成"},
    {"source": "cementite", "target": "pearlite", "relation": "组成"},
    {"source": "austenite", "target": "martensite", "relation": "因果"},
    {"source": "quenching", "target": "martensite", "relation": "因果"},
    {"source": "annealing", "target": "pearlite", "relation": "因果"},
    {"source": "normalizing", "target": "sorbite", "relation": "因果"},
    {"source": "tempering", "target": "tempered_martensite", "relation": "因果"},
    {"source": "tempering", "target": "tempered_troostite", "relation": "因果"},
    {"source": "tempering", "target": "tempered_sorbite", "relation": "因果"},
    {"source": "quenching", "target": "tempering", "relation": "前置依赖"},
    {"source": "quench_temper", "target": "tempered_sorbite", "relation": "因果"},
    {"source": "martensite", "target": "tempered_martensite", "relation": "对比"},
    {"source": "pearlite", "target": "sorbite", "relation": "对比"},
    {"source": "martensite", "target": "hardness", "relation": "因果"},
    {"source": "pearlite", "target": "hardness", "relation": "因果"},
    {"source": "tempered_sorbite", "target": "toughness", "relation": "因果"},
    {"source": "grain_boundary", "target": "corrosion", "relation": "因果"},
    {"source": "dislocation", "target": "strength", "relation": "因果"},
    {"source": "steel45", "target": "carbon", "relation": "组成"},
    {"source": "hardness", "target": "toughness", "relation": "对比"},
]

# 问题图谱：以问题为节点，边表示前置依赖
SEED_QUESTIONS = [
    {"id": "q1", "label": "为什么淬火后一定要回火？", "type": "工艺", "desc": "考察淬火内应力与脆性", "refs": ["教材 实验二十"]},
    {"id": "q2", "label": "回火温度如何影响硬度？", "type": "工艺", "desc": "三类回火区间与硬度对应关系", "refs": ["教材 实验二十"]},
    {"id": "q3", "label": "含碳量如何决定室温组织？", "type": "成分", "desc": "对照铁碳相图与组织组成", "refs": ["教材 实验四"]},
    {"id": "q4", "label": "珠光体与索氏体有什么差别？", "type": "组织", "desc": "层片间距与冷速的关系", "refs": ["教材 实验二十"]},
    {"id": "q5", "label": "马氏体为什么硬而脆？", "type": "相", "desc": "过饱和固溶与晶格畸变", "refs": ["教材 实验二十"]},
    {"id": "q6", "label": "金相试样为什么会出现划痕？", "type": "缺陷", "desc": "抛光工序与缺陷对应", "refs": ["教材 实验三"]},
    {"id": "q7", "label": "细晶强化为什么能同时提高强度和韧性？", "type": "性能", "desc": "教材明确指出这是特例", "refs": ["教材 实验四"]},
]

SEED_Q_EDGES = [
    {"source": "q1", "target": "q5", "relation": "前置依赖"},
    {"source": "q2", "target": "q1", "relation": "前置依赖"},
    {"source": "q4", "target": "q3", "relation": "前置依赖"},
    {"source": "q5", "target": "q3", "relation": "前置依赖"},
    {"source": "q6", "target": "q3", "relation": "对比"},
    {"source": "q7", "target": "q3", "relation": "对比"},
]


def _load() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    if GRAPH_FILE.exists():
        try:
            payload = json.loads(GRAPH_FILE.read_text(encoding="utf-8"))
            return (
                payload.get("nodes", SEED_NODES),
                payload.get("edges", SEED_EDGES),
                payload.get("questionNodes", SEED_QUESTIONS),
                payload.get("questionEdges", SEED_Q_EDGES),
            )
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[query_graph] 读取 {GRAPH_FILE} 失败，退回种子图：{exc}")
    return SEED_NODES, SEED_EDGES, SEED_QUESTIONS, SEED_Q_EDGES


async def _run(args: dict) -> ToolResult:
    mode = str(args.get("mode", "knowledge")).lower()
    focus = args.get("focus")
    focus = str(focus) if focus else None

    nodes, edges, q_nodes, q_edges = _load()

    if mode == "question":
        matched_q = None
        if focus:
            matched_q = next(
                (q for q in q_nodes if q["id"] == focus or focus in q["label"] or focus in q.get("desc", "")),
                None,
            )
        focus_id = matched_q["id"] if matched_q else focus
        payload = {"mode": "question", "nodes": q_nodes, "edges": q_edges, "focus": focus_id}
        detail = (
            f"问题图谱：{len(q_nodes)} 个问题节点，{len(q_edges)} 条依赖关系。\n"
            "边表示问题之间的前置依赖 / 因果 / 对比关系，学生可以从任一问题回溯其依赖的知识点。\n\n"
            + "\n".join(f"- {n['label']}" for n in q_nodes)
        )
        return ToolResult(summary=f"问题图谱 · {len(q_nodes)} 个问题", detail=detail,
                          artifact_type="module1", artifact=payload)

    matched_n = None
    if focus:
        matched_n = next(
            (n for n in nodes if n["id"] == focus or focus in n["label"] or focus in n.get("desc", "")),
            None,
        )
    focus_id = matched_n["id"] if matched_n else focus

    if focus_id:
        related = [
            e for e in edges if e["source"] == focus_id or e["target"] == focus_id
        ]
        label = next((n["label"] for n in nodes if n["id"] == focus_id), focus_id)
        detail = f"聚焦「{label}」，关联 {len(related)} 条关系。"
    else:
        def _tag(n: dict) -> str:
            return n.get("type") or f"L{n.get('level', '?')}"

        detail = (
            f"知识图谱：{len(nodes)} 个概念节点，{len(edges)} 条关系。\n"
            "主干链：微观结构 → 结晶与凝固 / 相变 → 性质（相与组织）→ 制备与热处理工艺 → 材料性能（《材料物理专业实验1/2》讲义与《教材》）。\n\n"
            + "\n".join(f"- [{_tag(n)}] {n['label']}" for n in nodes)
        )

    payload = {"mode": "knowledge", "nodes": nodes, "edges": edges, "focus": focus_id}
    return ToolResult(
        summary=f"知识图谱 · {len(nodes)} 节点 / {len(edges)} 关系",
        detail=detail,
        artifact_type="module1",
        artifact=payload,
    )


TOOL = Tool(
    name="query_graph",
    label="查询图谱 · {mode}",
    description=(
        "查询课程知识图谱（mode='knowledge'）或三层级问题图谱（mode='question'），并在画布/图谱工作台中高亮聚焦。"
        "知识图谱覆盖《材料物理专业实验1/2》五级知识点网络（微观结构、结晶与凝固、相变、性质、工艺、性能）；"
        "问题图谱按第一层级（基础理解）→ 第二层级（实验表征）→ 第三层级（综合应用与工艺设计）组织问题链。"
        "学生询问知识点联系、梳理知识体系、或查看问题链时必须调用。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["knowledge", "question"],
                "description": "knowledge 知识图谱；question 问题图谱",
            },
            "focus": {"type": "string", "description": "可选，聚焦的知识点名称、问题关键词或节点 id（如 '金相样品的制备'、'回火'、'表面硬度'）"},
        },
        "required": ["mode"],
    },
    run=_run,
)
