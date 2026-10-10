"""
冒烟测试。不需要 API Key、不需要网络、不依赖 pytest：

    cd backend && python tests/test_smoke.py

覆盖三件最容易悄悄坏掉的事：
  1. 热处理模型的数值是否还落在教材区间内（改曲线时最容易改坏）
  2. Agent 工具调用循环能否正确拼接流式分片、回灌结果、产出 artifact
  3. 工具/功能的自动注册是否还在工作（有人手滑改了目录结构就会断）

★ 改动 simulate_heat_treatment 的 TEMPER_CURVE，或改动 chat.py 的流式解析后，必须重跑。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.config as config  # noqa: E402

FAILURES: list[str] = []


def check(ok: bool, label: str, extra: str = "") -> None:
    print(f"  {'✓' if ok else '✗'} {label}")
    if extra:
        print(f"      {extra}")
    if not ok:
        FAILURES.append(label)


# ─────────────────────────────────────────────────────────
# 1. 热处理模型 vs 教材区间
# ─────────────────────────────────────────────────────────

def test_heat_treatment_bands() -> None:
    print("\n[1] 热处理模型 vs 《教材》实验二十 区间（45 钢 / 水冷）")
    from app.tools.simulate_heat_treatment import _simulate

    # 510–600 归高温回火；500–510 是教材自身重叠的过渡带，豁免
    bands = [
        (150, 250, 57, 60, "低温回火"),
        (350, 500, 40, 48, "中温回火"),
        (510, 600, 25, 35, "高温回火"),
    ]
    bad = []
    for lo, hi, hlo, hhi, name in bands:
        for t in range(lo, hi + 1, 10):
            h = _simulate("water", t, 0.45)["hardnessHrc"]
            if not (hlo <= h <= hhi):
                bad.append(f"{name} {t}℃ → {h} HRC（教材 {hlo}–{hhi}）")

    check(not bad, "所有取样点落在教材区间内", "；".join(bad) if bad else "37 个点全部通过")

    # 冷却方式的定性关系：退火 < 正火 < 淬火
    a = _simulate("furnace", 0, 0.45)["hardnessHrc"]
    n = _simulate("air", 0, 0.45)["hardnessHrc"]
    q = _simulate("water", 0, 0.45)["hardnessHrc"]
    check(a < n < q, "硬度排序 退火 < 正火 < 淬火", f"{a} < {n} < {q}")

    # 含碳量基准：0.45%C 处不能再打折，否则 200℃ 会掉到 57 以下
    check(
        _simulate("water", 200, 0.45)["hardnessHrc"] == 59,
        "45 钢 200℃ 回火 = 59 HRC（含碳量基准未被重复扣减）",
    )


# ─────────────────────────────────────────────────────────
# 2. Agent 工具调用循环
# ─────────────────────────────────────────────────────────

class _Fn:
    def __init__(self, n=None, a=None):
        self.name, self.arguments = n, a


class _TC:
    def __init__(self, i, id=None, name=None, args=None):
        self.index, self.id, self.function = i, id, _Fn(name, args)


class _Delta:
    def __init__(self, c=None, tc=None, r=None):
        self.content, self.tool_calls, self.reasoning_content = c, tc, r


class _Chunk:
    def __init__(self, d):
        self.choices = [type("C", (), {"delta": d})()]


class _Stream:
    def __init__(self, chunks):
        self.chunks = chunks

    def __aiter__(self):
        self.i = 0
        return self

    async def __anext__(self):
        if self.i >= len(self.chunks):
            raise StopAsyncIteration
        c = self.chunks[self.i]
        self.i += 1
        return c


def _turns(repeat_name: bool) -> list:
    """repeat_name=True 模拟「每片都重复带工具名」的供应商。"""
    def named():
        return _TC(0, id="call_1", name="simulate_heat_treatment")

    turn1 = [
        _Chunk(_Delta(r="用户在问热处理，先算一下。")),
        _Chunk(_Delta(tc=[_TC(0, id="call_1", name="simulate_heat_treatment", args='{"cool')])),
        _Chunk(_Delta(tc=[_TC(0, args='ing":"water","temper_temp":200,')] + ([named()] if repeat_name else []))),
        _Chunk(_Delta(tc=[_TC(0, args='"carbon":0.45}')] + ([named()] if repeat_name else []))),
    ]
    turn2 = [
        _Chunk(_Delta(c="45 钢水冷后经 200℃ 回火，得到")),
        _Chunk(_Delta(c="**回火马氏体**，硬度约 59 HRC。")),
    ]
    return [turn1, turn2]


async def _drive(turns: list) -> list:
    import app.chat as chat

    config.API_KEY = "fake-key-for-test"
    counter = {"n": 0}

    class _Completions:
        async def create(self, **kw):
            i = counter["n"]
            counter["n"] += 1
            return _Stream(turns[i])

    class _Client:
        def __init__(self, **kw):
            self.chat = type("X", (), {"completions": _Completions()})()

    original = chat.AsyncOpenAI
    chat.AsyncOpenAI = _Client
    try:
        return [
            e
            async for e in chat.run_chat(
                [{"role": "user", "content": "45钢淬火后200℃回火,硬度多少?"}]
            )
        ]
    finally:
        chat.AsyncOpenAI = original


def test_agent_loop() -> None:
    print("\n[2] Agent 工具调用循环")
    for label, repeat in [
        ("工具名只在首片给出一次（OpenAI / DeepSeek）", False),
        ("工具名每片都重复出现（部分供应商）", True),
    ]:
        evts = asyncio.run(_drive(_turns(repeat)))
        types = [e["type"] for e in evts]
        calls = [e for e in evts if e["type"] == "tool_call"]
        arts = [e for e in evts if e["type"] == "artifact"]

        ok = (
            bool(calls)
            and bool(arts)
            and calls[0]["name"] == "simulate_heat_treatment"
            and calls[0]["args"].get("temper_temp") == 200
            and arts[0]["data"]["hardnessHrc"] == 59
            and types[-1] == "done"
            and "tool_result" in types
        )
        check(ok, label, f"事件序列 {' → '.join(types)}")

    # 未知工具不能让整条流崩掉
    import app.chat as chat

    async def unknown():
        turns = [
            [_Chunk(_Delta(tc=[_TC(0, id="c9", name="no_such_tool", args="{}")]))],
            [_Chunk(_Delta(c="好的。"))],
        ]
        return await _drive(turns)

    evts = asyncio.run(unknown())
    check(
        any(e["type"] == "done" for e in evts) and any(e["type"] == "tool_result" for e in evts),
        "未知工具被优雅处理，不中断事件流",
    )


# ─────────────────────────────────────────────────────────
# 3. 自动注册
# ─────────────────────────────────────────────────────────

def test_auto_registration() -> None:
    print("\n[3] 自动注册（改了目录结构会在这里断掉）")
    from app.tools import TOOLS

    expected = {
        "search_knowledge",
        "troubleshoot_instrument",
        "aggregate_safety_rules",
        "load_structure",
        "query_graph",
        "simulate_heat_treatment",
        "diagnose_micrograph",
    }
    missing = expected - set(TOOLS)
    check(not missing, f"7 个工具全部自动发现（实际 {len(TOOLS)} 个）", f"缺失：{missing}" if missing else "")

    # 前端功能目录 ↔ artifactType 的一致性（粗查：每个 feature 都有 index.ts）
    feats = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "features"
    if feats.exists():
        dirs = sorted(p.name for p in feats.iterdir() if p.is_dir())
        no_index = [d for d in dirs if not (feats / d / "index.ts").exists()]
        check(not no_index, f"前端 {len(dirs)} 个功能目录都有 index.ts", f"缺失：{no_index}" if no_index else "")


def main() -> int:
    print("=" * 62)
    print("材料物理实验教学 Agent · 冒烟测试")
    print("=" * 62)
    test_heat_treatment_bands()
    test_agent_loop()
    test_auto_registration()

    print("\n" + "=" * 62)
    if FAILURES:
        print(f"✗ {len(FAILURES)} 项失败：")
        for f in FAILURES:
            print(f"    - {f}")
        return 1
    print("✓ 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
