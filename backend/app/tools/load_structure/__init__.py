"""
A3 晶体结构 3D 的几何计算。

★ 晶体学计算全部在这里完成，前端只负责渲染 —— 这是为了减轻只有 1 人的前端负担。
返回的 atoms / bonds / sites 直接喂给 three.js，前端不做任何坐标运算。

⚠️ 待办：间隙位置的**个数**请对照《教材》实验一「三、实验内容」核一遍再上演示。
   目前给出的是几何位置集合，用于可视化足够，但讲「每个晶胞含几个间隙」时要按教材口径。
"""
from __future__ import annotations

import math
from itertools import product

from ..base import Tool, ToolResult

COS30 = math.cos(math.pi / 6)
A = 1.0  # 常规晶胞边长，归一化处理
C_OVER_A = 1.633  # HCP 理想轴比


def _corners() -> list[tuple[float, float, float]]:
    return [(x * A, y * A, z * A) for x, y, z in product((0, 1), repeat=3)]


def _face_centers() -> list[tuple[float, float, float]]:
    return [
        (0.5 * A, 0.5 * A, 0),
        (0.5 * A, 0.5 * A, A),
        (0.5 * A, 0, 0.5 * A),
        (0.5 * A, A, 0.5 * A),
        (0, 0.5 * A, 0.5 * A),
        (A, 0.5 * A, 0.5 * A),
    ]


def _edge_centers() -> list[tuple[float, float, float]]:
    pts = []
    for axis in range(3):
        for a, b in product((0.0, 1.0), repeat=2):
            p = [0.0, 0.0, 0.0]
            p[axis] = 0.5 * A
            others = [i for i in range(3) if i != axis]
            p[others[0]] = a * A
            p[others[1]] = b * A
            pts.append(tuple(p))
    return pts


# ── 各结构的原子位置（常规晶胞） ──

def _atoms_sc() -> list[tuple[float, float, float]]:
    return _corners()


def _atoms_bcc() -> list[tuple[float, float, float]]:
    return _corners() + [(0.5 * A, 0.5 * A, 0.5 * A)]


def _atoms_fcc() -> list[tuple[float, float, float]]:
    return _corners() + _face_centers()


def _atoms_hcp() -> list[tuple[float, float, float]]:
    """六方棱柱表示法 —— 与教材插图一致的画法：12 顶点 + 2 底心 + 3 内部原子。"""
    c = A * C_OVER_A
    r = A
    corners = []
    for z in (0.0, c):
        for k in range(6):
            ang = k * math.pi / 3
            corners.append((r * math.cos(ang), r * math.sin(ang), z))
    basal = [(0.0, 0.0, 0.0), (0.0, 0.0, c)]
    # 三个内部原子：半径 a/√3，相位 30°/150°/270°，位于 c/2 高度
    inner = []
    for k in range(3):
        ang = math.pi / 6 + k * 2 * math.pi / 3
        inner.append((r / math.sqrt(3) * math.cos(ang), r / math.sqrt(3) * math.sin(ang), c / 2))
    return corners + basal + inner


ATOMS = {
    "sc": _atoms_sc,
    "bcc": _atoms_bcc,
    "fcc": _atoms_fcc,
    "hcp": _atoms_hcp,
}

# 最近邻距离（以 a 为单位）
NN = {"sc": 1.0, "bcc": math.sqrt(3) / 2, "fcc": math.sqrt(2) / 2, "hcp": 1.0}

STRUCTURE_LABEL = {
    "sc": "简单立方 (SC)",
    "bcc": "体心立方 (BCC)",
    "fcc": "面心立方 (FCC)",
    "hcp": "密排六方 (HCP)",
}

# 每个晶胞的原子数（教材口径）
ATOMS_PER_CELL = {"sc": 1, "bcc": 2, "fcc": 4, "hcp": 6}
COORDINATION = {"sc": 6, "bcc": 8, "fcc": 12, "hcp": 12}
PACKING = {"sc": 0.52, "bcc": 0.68, "fcc": 0.74, "hcp": 0.74}


def _sites(structure: str) -> list[dict]:
    """全部间隙位置。

    ★ 不管 feature 是什么，都把可用的间隙类型一起返回 —— 因为看间隙时
    晶格骨架也要在（否则学生看不到间隙「挤在谁之间」）。前端按 `kind` 过滤即可。
    """
    out: list[dict] = []

    if structure == "fcc":
        out += [_mark(p, "八面体间隙") for p in _edge_centers() + [(0.5 * A, 0.5 * A, 0.5 * A)]]
        out += [
            _mark((x * A, y * A, z * A), "四面体间隙")
            for x, y, z in product((0.25, 0.75), repeat=3)
        ]
    elif structure == "bcc":
        out += [_mark(p, "八面体间隙") for p in _face_centers() + _edge_centers()]
        pts: set = set()
        for face_axis in range(3):
            for u, v in ((0.5, 0.25), (0.5, 0.75), (0.25, 0.5), (0.75, 0.5)):
                for fixed in (0.0, 1.0):
                    p = [0.0, 0.0, 0.0]
                    p[face_axis] = fixed * A
                    others = [i for i in range(3) if i != face_axis]
                    p[others[0]] = u * A
                    p[others[1]] = v * A
                    pts.add(tuple(round(v2, 6) for v2 in p))
        out += [_mark(p, "四面体间隙") for p in sorted(pts)]
    elif structure == "hcp":
        # ⬜ 待办：HCP 的间隙位置还没实现（教材实验一要求算）。
        #    涉及六方晶胞的间隙几何，需要对照教材核一遍个数再补。
        pass

    return out


def _mark(p: tuple[float, float, float], kind: str) -> dict:
    return {"x": p[0], "y": p[1], "z": p[2], "kind": kind}


def _bonds(atoms: list[tuple[float, float, float]], nn: float, tol: float = 0.06) -> list[list[int]]:
    """把最近邻连成键。O(n²) 足够，晶胞最多几十个原子。"""
    out = []
    for i in range(len(atoms)):
        for j in range(i + 1, len(atoms)):
            d = math.dist(atoms[i], atoms[j])
            if abs(d - nn) <= tol:
                out.append([i, j])
    return out


def _stacking(structure: str) -> str | None:
    if structure == "fcc":
        return "ABCABC…（密排面 {111}）"
    if structure == "hcp":
        return "ABAB…（密排面 {0001}）"
    return None


async def _run(args: dict) -> ToolResult:
    structure = str(args.get("structure", "fcc")).lower()
    feature = str(args.get("feature", "cell")).lower()
    if structure not in ATOMS:
        structure = "fcc"

    raw = ATOMS[structure]()
    atoms = [{"x": p[0], "y": p[1], "z": p[2]} for p in raw]

    payload = {
        "structure": structure,
        "feature": feature,
        "atoms": atoms,
        "bonds": _bonds(raw, NN[structure]),
        "sites": _sites(structure),
        "cell": {"a": A, "b": A, "c": A * C_OVER_A if structure == "hcp" else A},
        "stacking": _stacking(structure),
        "params": {
            "atomsPerCell": ATOMS_PER_CELL[structure],
            "coordination": COORDINATION[structure],
            "packing": PACKING[structure],
            "nearestNeighbor": NN[structure],
        },
    }

    detail_lines = [
        f"结构：{STRUCTURE_LABEL[structure]}",
        f"每个晶胞原子数：{ATOMS_PER_CELL[structure]}",
        f"配位数：{COORDINATION[structure]}",
        f"致密度：{PACKING[structure]}",
    ]
    if payload["stacking"]:
        detail_lines.append(f"密排面堆垛顺序：{payload['stacking']}")
    if payload["sites"]:
        detail_lines.append(f"{feature} 位置数（几何）：{len(payload['sites'])}")
    detail_lines.append("\n出处：《教材》实验一 · 二、实验原理")

    return ToolResult(
        summary=f"{STRUCTURE_LABEL[structure]} · {len(atoms)} 个原子位点"
        + (f" · {len(payload['sites'])} 个间隙" if payload["sites"] else ""),
        detail="\n".join(detail_lines),
        artifact_type="visual3d",
        artifact=payload,
    )


TOOL = Tool(
    name="load_structure",
    label="加载晶体结构 · {structure}",
    description=(
        "加载并计算晶体结构的 3D 几何数据，用于右栏可视化。"
        "支持简单立方、体心立方、面心立方、密排六方，以及四面体/八面体间隙、"
        "晶面与密排面堆垛顺序。学生问晶胞、原子数、配位数、间隙、位错时调用。"
        "structure 必须严格对应用户明确指定的结构：简单立方=sc、体心立方=bcc、面心立方=fcc、密排六方=hcp；"
        "不要把用户指定的结构替换成默认值或其他结构。不要凭记忆描述晶胞图形，一律调这个工具。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "structure": {
                "type": "string",
                "enum": ["sc", "bcc", "fcc", "hcp"],
                "description": "晶体结构类型",
            },
            "feature": {
                "type": "string",
                "enum": ["cell", "octahedral", "tetrahedral", "plane", "stacking", "dislocation"],
                "description": "要看什么：cell 晶胞本体、octahedral/tetrahedral 间隙、plane 晶面、stacking 密排面堆垛、dislocation 位错",
            },
        },
        "required": ["structure"],
    },
    run=_run,
)
