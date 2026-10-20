"""
A1 知识库问答的检索层。

当前实现是**关键词打分**（无需额外依赖，开箱即用）。
TODO：chunks.jsonl 建好后，换成 chroma 向量检索 + 关键词混合召回。
      向量库不可用时自动退回当前实现，保证演示不中断。
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from ... import config
from ..base import Tool, ToolResult

CHUNKS = Path(config.DATA_DIR) / "chunks.jsonl"
TERMS = Path(config.KNOWLEDGE_DIR) / "terms.json"

# 覆盖率低于这个值就当作没检索到。
# 语料从 57 块扩到 116 块（加入课程讲义/教学大纲）后重新标定：
# 过滤疑问词后，库内最低 0.653、库外最高 0.380，所以 0.50 落在安全区间中间。
# ★ 别拍脑袋改这个值 —— 先跑 `cd backend && python tests/retrieval_probe.py`，
#   它会告诉你当前的库内/库外分布和可用区间。语料一变（加实验、换算法）就要重跑。
MIN_COVERAGE = 0.50

# 章节权重：原理和内容比报告要求更值得召回
SECTION_WEIGHT = {
    "实验原理": 1.4,
    "实验内容": 1.3,
    "注意事项": 1.2,
    "实验材料及设备": 1.0,
    "实验目的": 0.8,
    "实验报告及要求": 0.6,
}

# 查询里出现这些词时，对相应章节做小幅加成。
# 例如问「实验目的是什么」时，不该让「实验原理」里偶然出现「目的」的段落压过
# 真正的「实验目的」段落。加成只影响排序，不改变覆盖率阈值。
SECTION_HINTS = {
    "实验目的": ("目的", "意义", "目标", "学什么"),
    "实验内容": ("步骤", "流程", "内容", "怎么做", "操作"),
    "实验报告及要求": ("报告", "要求", "评分", "思考题"),
    "注意事项": ("注意", "错误", "易错", "安全"),
    "实验原理": ("原理", "机理", "机制", "为什么", "影响", "步骤"),
}

# 英文按单词、数字整体保留（「250 目」的 250 是个有意义的词）、中文按 2-gram
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-]*|\d+|[一-鿿]{2,}")


def _tokens(text: str) -> list[str]:
    """粗分词：英文按单词，中文按 2-gram 滑窗。够用且不引依赖。"""
    out: list[str] = []
    for piece in _TOKEN_RE.findall(text):
        if piece[0].isascii():
            out.append(piece.lower())
        else:
            out.extend(piece[i : i + 2] for i in range(len(piece) - 1))
    return out


# 疑问词/语气词。中文 2-gram 会把「什么」「怎么」「是什」「么要」切成大量
# 与知识无关的碎片；它们几乎不可能出现在语料里，却会把查询覆盖率拉低，
# 导致「库内问题」分数虚低。查询侧过滤掉它们，语料侧保留原样（IDF 不重算）。
_STOP_CHARS = set("什么怎么是为的了呢吗吧啊哪谁这那与否")

# 这些词含「为 / 的」等虚词，但本身是课程里的实义词。
# 只按字符过滤会把「目的」「行为」误删，导致「实验目的是什么」检索跑偏。
_CONTENT_WORDS = {"目的", "行为", "为了", "目的性"}


def _content_tokens(text: str) -> list[str]:
    return [
        t
        for t in _tokens(text)
        if t in _CONTENT_WORDS or not any(ch in _STOP_CHARS for ch in t)
    ]


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


@lru_cache(maxsize=1)
def _load_terms() -> tuple[dict, ...]:
    """术语表。文件不存在或坏了都不影响检索主流程，只是画布上没有术语卡。"""
    if not TERMS.exists():
        return ()
    try:
        data = json.loads(TERMS.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[search_knowledge] 术语表读取失败，本次不展示术语：{exc}")
        return ()
    return tuple(t for t in data if isinstance(t, dict) and t.get("zh"))


def _norm(s: str) -> str:
    """归一化：去掉所有空白、转小写。

    ★ 必须做这一步 ——「250 目」和「250目」字面不同，直接比较匹配不上。
    学生提问不会严格照抄术语表的写法。
    """
    return re.sub(r"\s+", "", str(s)).lower()


def _match_terms(query: str, limit: int = 3) -> list[dict]:
    """在术语表里找与 query 相关的术语。

    每条术语可带 `aliases` 字段，列出学生可能用的口语说法。
    例如「250 目标准实验筛」的 aliases 含「250目」「筛分」，
    这样问「250目筛分的作用」也能命中 —— 靠数据补，不靠猜。

    匹配规则（按相关度排序）：
      1. 术语名（或别名）出现在 query 里 —— 命中越长越相关
      2. query 是术语名的一部分 —— 用户只打了半截（「维氏」→「维氏硬度」）
    """
    terms = _load_terms()
    q = _norm(query)
    if not terms or not q:
        return []

    scored: list[tuple[float, dict]] = []

    for t in terms:
        candidates = [t.get("zh"), t.get("en")]
        aliases = t.get("aliases")
        if isinstance(aliases, list):
            candidates.extend(aliases)

        best = 0.0
        for cand in candidates:
            c = _norm(cand or "")
            if not c:
                continue
            if c in q:
                best = max(best, len(c) * 2.0)  # 术语出现在提问里，越具体越相关
            elif len(q) >= 2 and q in c:
                best = max(best, len(q) * 1.0)  # 用户只打了半截

        if best > 0:
            scored.append((best, t))

    scored.sort(key=lambda pair: pair[0], reverse=True)

    seen: set[str] = set()
    out: list[dict] = []
    for _, t in scored:
        key = str(t.get("zh"))
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out


@lru_cache(maxsize=1)
def _idf() -> dict[str, float]:
    """每个词在知识库里的稀有度（IDF）。

    ★ 这是让「知识库未收录」这个问题能被正确拒绝的关键。
    没有它，「工艺」这种在材料学文本里到处都是的 2-gram 会让
    「铝合金焊接工艺」这种库外问题拿到虚高的分数，模型就会以为检索到了东西然后编答案。
    """
    rows = _load()
    n = len(rows)
    if n == 0:
        return {}
    df: Counter = Counter()
    for c in rows:
        for t in set(_tokens(c["text"])):
            df[t] += 1
    return {t: math.log((n + 1) / (d + 1)) for t, d in df.items()}


def _score(query_terms: list[str], chunk: dict, query: str = "") -> float:
    """IDF 加权的**查询覆盖率**：query 里有多少（按稀有度加权的）词被这个块覆盖了。

    为什么不用「命中次数 / 块长度」：
      那样长块吃亏、常见词占便宜。实测「铝合金焊接工艺」（库外）能拿到 0.73，
      反而比该命中的「250目筛分」的 0.15 还高 —— 阈值怎么设都不对。
    覆盖率 + IDF 之后，库里没有的词（铝合、焊接）会以最大权重进分母却不进分子，
    覆盖率自然塌下来，库内库外就分得开了。

    ★ 查询侧的疑问词/语气词先过滤（见 `_content_tokens`）。否则「位错滑移是什么」
      里的「什么」「是什」「移是」会白白拉低覆盖率，把库内问题误判成库外。
    """
    uniq = {
        t
        for t in query_terms
        if t in _CONTENT_WORDS or not any(ch in _STOP_CHARS for ch in t)
    }
    if not uniq:
        return 0.0

    rows = _load()
    idf = _idf()
    # 语料里从没出现过的词，按最高稀有度算 —— 它们正是「库里没有」的信号
    default_idf = math.log(len(rows) + 1) if rows else 1.0

    total = sum(idf.get(t, default_idf) for t in uniq)
    if total <= 0:
        return 0.0

    bag = set(_tokens(chunk["text"]))
    # 把 doc / experiment / section 也计入匹配：问「实验一的实验目的是什么」时，
    # 「实验一」只出现在 metadata 里，不加入的话真正的那条会被别的段落挤掉。
    meta = chunk.get("metadata", {})
    bag.update(_tokens(f"{meta.get('doc', '')} {meta.get('experiment', '')} {meta.get('section', '')}"))

    hit = sum(idf.get(t, default_idf) for t in uniq if t in bag)

    coverage = hit / total
    section = chunk["metadata"].get("section", "")
    weight = SECTION_WEIGHT.get(section, 1.0)
    boost = 1.0
    if query:
        hints = SECTION_HINTS.get(section, ())
        if any(hint in query for hint in hints):
            # 「目的/意义」类问题优先给实验目的段落；其他章节提示只做温和加成。
            boost = 2.0 if section == "实验目的" else 1.6
    return coverage * weight * boost


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

    terms = _content_tokens(query)
    ranked = sorted(rows, key=lambda c: _score(terms, c, query), reverse=True)
    # ★ 低于阈值的一律不要 —— 宁可回答「知识库未收录」，也不能拿不相干的原文
    #   喂给模型然后被编成答案。这是「不编造」这条硬要求的实现点。
    hits = [c for c in ranked if _score(terms, c, query) >= MIN_COVERAGE][:top_k]

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
        # doc 是具体文档名（如「课程讲义·晶体结构与晶体缺陷」）；旧数据没有 doc 时退回 source。
        doc = meta.get("doc") or meta.get("source", "")
        loc = f"《{doc}》{meta['experiment']} · {meta['section']}"
        lines.append(f"【{i}】{loc}\n{c['text']}")

    # 挂到右栏画布：把命中的原文和出处摊开给评委看。
    # 纯聊天框看不出「答案有据可依」，这块画布能。
    artifact = {
        "query": query,
        "chunks": [
            {
                "source": c["metadata"].get("source", ""),
                "doc": c["metadata"].get("doc", c["metadata"].get("source", "")),
                "experiment": c["metadata"].get("experiment", ""),
                "section": c["metadata"].get("section", ""),
                "text": c["text"],
            }
            for c in hits
        ],
        # 术语卡：术语表在 backend/knowledge/terms.json，由 _match_terms 按 query 匹配
        "terms": _match_terms(query),
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
        "检索课程知识库（教材 7 个实验 + 材料物理专业实验1/2 教学大纲与配套课件 + 劳动教育四大模块）。"
        "任何涉及课程内容的问题都必须先调这个工具拿到原文，再基于原文作答并标注出处。"
        "不要凭记忆回答课程问题。讲义给出通用口径而教材给出具体钢种实测值时，两个口径要分别注明，"
        "不能用一个覆盖另一个。"
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
