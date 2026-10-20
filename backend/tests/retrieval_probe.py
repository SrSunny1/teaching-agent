#!/usr/bin/env python3
"""
检索质量探测。不需要 API Key、不需要网络：

    cd backend && python tests/retrieval_probe.py

干的事只有一件：**验证「知识库内的能命中、知识库外的能拒绝」这条不变量还成立。**

为什么需要它：MIN_COVERAGE 那个阈值是个经验值。语料一变（加了新实验、
换了检索算法、扩了术语表），它就可能不再合适 —— 到时候「库外问题」
会被喂着不相干的原文给模型，然后被编成答案。这个脚本就是用来及早发现的。

调完 search_knowledge 的 _score 或 MIN_COVERAGE 之后，务必跑一遍。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.tools.search_knowledge import MIN_COVERAGE, _content_tokens, _load, _score  # noqa: E402

# 知识库**内**的问题 —— 必须命中（教材 7 个实验 + 课程讲义/教学大纲 + 任务书四大劳育模块）
IN_SCOPE = [
    "250目筛分的作用",
    "回火温度对硬度的影响",
    "金相试样为什么要镶嵌",
    "面心立方晶胞有多少原子",
    "维氏硬度怎么测",
    "实验废弃物怎么分类",
    "45钢淬火后为什么要回火",
    "位错滑移是什么",
    "奥氏体转变成马氏体",
    "溶胶-凝胶法的注意事项",
    "仪器怎么养护",
    "珠光体和索氏体有什么区别",
    # 新增课程讲义 / 教学大纲覆盖的内容
    "金相试样制备的步骤",
    "金相试样腐蚀剂怎么选",
    "苦味酸酒精溶液用来显示什么",
    "过冷度对结晶组织的影响",
    "冷却曲线上的水平段为什么出现",
    "均匀形核和非均匀形核的区别",
    "维氏硬度压痕对角线怎么测",
    "热膨胀系数和熔点有什么关系",
    "非简谐振动为什么导致热膨胀",
    "45钢860℃淬火后200℃回火",
    "BCC有没有密排面",
    "调质处理是什么",
    "面心立方(111)晶面为什么是密排面",
    "差示扫描量热是测什么的",
]

# 知识库**外**的问题 —— 必须拒绝，模型应该回答「知识库未收录」
OUT_OF_SCOPE = [
    "铝合金焊接工艺",
    "Python 怎么写入文件",
    "今天天气怎么样",
    "钢筋混凝土配合比",
    "机器学习模型训练",
    "股票怎么开户",
    "写一首关于春天的诗",
    "怎么用 FC 游戏机",
    "半导体光刻工艺",
    "手机电池怎么充电",
]


def top_score(query: str) -> float:
    rows = _load()
    if not rows:
        return 0.0
    terms = _content_tokens(query)
    return max((_score(terms, c, query) for c in rows), default=0.0)


def main() -> int:
    rows = _load()
    print("=" * 62)
    print("检索质量探测")
    print("=" * 62)
    print(f" 知识库块数：{len(rows)}    阈值 MIN_COVERAGE = {MIN_COVERAGE}")
    print()

    if not rows:
        print(" × 知识库为空。先跑 python knowledge/ingest.py")
        return 1

    in_scores = [(q, top_score(q)) for q in IN_SCOPE]
    out_scores = [(q, top_score(q)) for q in OUT_OF_SCOPE]

    print("【库内问题 —— 应当命中】")
    miss = []
    for q, s in in_scores:
        ok = s >= MIN_COVERAGE
        if not ok:
            miss.append((q, s))
        print(f"  {'√' if ok else '×'} {s:6.3f}  {q}")

    print()
    print("【库外问题 —— 应当拒绝】")
    false_alarm = []
    for q, s in out_scores:
        ok = s < MIN_COVERAGE
        if not ok:
            false_alarm.append((q, s))
        print(f"  {'√' if ok else '×'} {s:6.3f}  {q}")

    lo_in = min(s for _, s in in_scores)
    hi_out = max(s for _, s in out_scores)

    print()
    print("-" * 62)
    print(f"  库内最低：{lo_in:.3f}   库外最高：{hi_out:.3f}   阈值：{MIN_COVERAGE:.3f}")

    if lo_in > hi_out:
        margin = lo_in - hi_out
        print(f"  √ 分得开，余量 {margin:.3f}")
        print(f"    阈值可用的安全区间：({hi_out:.3f}, {lo_in:.3f})")
    else:
        print(f"  × 分不开！库外最高分超过了库内最低分")

    print("-" * 62)

    bad = bool(miss) or bool(false_alarm) or lo_in <= hi_out
    if bad:
        print()
        if miss:
            print(f"  × {len(miss)} 个库内问题被误拒（漏检）：")
            for q, s in miss:
                print(f"      {s:.3f}  {q}")
        if false_alarm:
            print(f"  × {len(false_alarm)} 个库外问题被误收（会诱导模型编造）：")
            for q, s in false_alarm:
                print(f"      {s:.3f}  {q}")
        print()
        print("  怎么办：")
        print("    - 如果库内被误拒 → 调低 MIN_COVERAGE，或给相关术语补 aliases")
        print("    - 如果库外被误收 → 调高 MIN_COVERAGE")
        print("    - 如果两者分不开 → 说明 _score 需要改（而不是调阈值）")
        return 1

    print()
    print(" √ 全部通过：库内全命中、库外全拒绝、两者分得开")
    return 0


if __name__ == "__main__":
    sys.exit(main())
