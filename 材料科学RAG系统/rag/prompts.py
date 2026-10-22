"""材料科学领域的提示词工程 + 无 LLM 时的抽取式降级作答。

这里替换了原项目的"热力循环/ORC"领域提示词，改为材料科学专属：
强调成分配方—工艺—组织—性能（composition / processing / structure / properties）
这条材料学四要素主线，并要求模型对数值、单位、晶体结构保持严谨。
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence

from rag.text_utils import collapse_whitespace, truncate, tokenize_for_bm25
from rag.types import RetrievedChunk

SYSTEM_PROMPT = """你是「材料科学 RAG 知识库」的助手，专注于材料科学与工程领域的文献问答。

你的回答必须遵守以下规则：

1. **只依据给定证据作答**。证据来自用户上传的文献片段，编号形如 [证据 1]、[证据 2]。
   凡是证据中没有的内容，一律不要补充，更不要凭常识臆测。
2. **证据不足时明确说明**。若证据无法回答问题，直接回答"现有文献不足以回答该问题"，
   并说明还缺少哪方面的资料，不要硬凑。
3. **不编造任何标识符**。chunk_id、文献标题、页码、DOI 只能原样引用证据中给出的值，
   禁止自行生成或推测。
4. **引用规范**：给出结论时，在句末用 [证据 N] 标注依据来源；同一个结论可引用多条证据。
5. **专业术语严谨**：
   - 保留并正确使用材料学四要素：成分（composition）—工艺（processing）—组织（structure）—性能（properties）；
   - 数值必须带上原始单位（如 MPa、GPa、wt.%、at.%、K、℃、nm），不得擅自换算；
   - 晶体结构、晶面指数、相变符号（如 α、β、γ、M_s、A_c3）按原文写法保留；
   - 中英文术语可并列给出，例如"屈服强度（yield strength）"。
6. **回答结构**：先给一句直接结论，再分条展开；涉及数据对比时用简短列表或表格。
7. **语言**：用简体中文回答，除非用户明确要求英文。

以下是检索到的证据：
"""

INSUFFICIENT_EVIDENCE_ANSWER = (
    "现有知识库中没有检索到与该问题相关的证据，不足以回答。\n\n"
    "建议：\n"
    "1. 确认相关文献是否已上传并完成索引；\n"
    "2. 换用更具体或更通用的关键词再问一次；\n"
    "3. 若文献是扫描件（图片型 PDF），需要 OCR 后才能解析。"
)


def build_context(chunks: Sequence[RetrievedChunk], max_chars: int = 12000) -> str:
    """把检索到的证据拼成上下文（超出预算则截断）。"""
    parts: List[str] = []
    used = 0
    for index, chunk in enumerate(chunks, start=1):
        header = (
            f"[证据 {index}]\n"
            f"chunk_id: {chunk.chunk_id}\n"
            f"文献: {chunk.document_title or chunk.document_id}\n"
            f"章节: {_path_text(chunk.section_path) or chunk.section_title or '（未标注）'}\n"
            f"页码: {_page_text(chunk)}\n"
            f"相关度: {chunk.score:.4f}\n"
        )
        body = collapse_whitespace(chunk.content)
        remaining = max_chars - used - len(header)
        if remaining <= 0:
            break
        if len(body) > remaining:
            body = body[:remaining] + "...[内容已截断]"
        parts.append(header + "正文:\n" + body)
        used += len(header) + len(body)

    context = "\n\n".join(parts)
    return context + ("\n\n（以上证据已截断）" if used >= max_chars else "")


def build_messages(question: str, context: str, system_prompt: str = SYSTEM_PROMPT) -> List[Dict[str, str]]:
    if not context.strip():
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]
    return [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                f"用户问题：{question}\n\n"
                f"已检索证据：\n{context}\n\n"
                "请严格基于上述证据回答，并在句末标注引用的证据编号。"
            ),
        },
    ]


def _path_text(path: Sequence[str]) -> str:
    return " › ".join(str(item) for item in path if item)


def _page_text(chunk: RetrievedChunk) -> str:
    if chunk.page_start and chunk.page_end and chunk.page_start != chunk.page_end:
        return f"第 {chunk.page_start}–{chunk.page_end} 页"
    if chunk.page_start:
        return f"第 {chunk.page_start} 页"
    return "（未标注）"


# ---------------------------------------------------------------------------
# 抽取式降级：没有任何大模型时，也要给出"能读"的答案
# ---------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"(?<=[。！？；!?;])\s*|\n+")
_SENTENCE_END = re.compile(r"[。！？；!?;]\s*$")
# 解析 Markdown/PDF 时残留的项目符号前缀
_BULLET_PREFIX = re.compile(r"^[\s・•●◦▪>*\-–—]+")


def _clean_sentence(text: str) -> str:
    text = collapse_whitespace(text)
    text = _BULLET_PREFIX.sub("", text)
    text = re.sub(r"^\d+[\.、\)]\s*", "", text)
    return text.strip()


def extractive_answer(question: str, chunks: Sequence[RetrievedChunk],
                      max_sentences: int = 8, quote_chars: int = 240) -> str:
    """从证据中挑出与问题最相关的句子，组织成一段可引用的摘要。

    这不是"编造答案"，而是**把证据里真正相关的原文句子挑出来**，
    每条都带 [证据 N] 标注，用户一眼能看到依据。
    当没有配置大模型 Key 时用它兜底，保证端到端流程仍然完整可用。
    """
    if not chunks:
        return INSUFFICIENT_EVIDENCE_ANSWER

    query_tokens = set(tokenize_for_bm25(question))
    candidates: List[tuple] = []

    for index, chunk in enumerate(chunks, start=1):
        for sentence in _SENTENCE_SPLIT.split(chunk.content or ""):
            text = _clean_sentence(sentence)
            if not text or len(text) < 14 or len(text) > 400:
                continue
            # 没有句末标点的多半是标题行，信息量不足
            if not _SENTENCE_END.search(text):
                continue
            tokens = set(tokenize_for_bm25(text))
            if not tokens:
                continue
            overlap = len(query_tokens & tokens)
            if overlap == 0:
                # 与问题毫无词汇交集的句子，对读者没有价值
                continue
            score = overlap / (len(query_tokens) ** 0.5 + 1e-9) + min(len(text), 400) / 4000.0
            candidates.append((score, index, text))

    candidates.sort(key=lambda item: item[0], reverse=True)
    picked: List[tuple] = []
    seen: set = set()
    for _, index, text in candidates:
        key = text[:40]
        if key in seen:
            continue
        seen.add(key)
        picked.append((index, f"- {truncate(text, quote_chars)} [证据 {index}]"))
        if len(picked) >= max_sentences:
            break

    if not picked:
        return INSUFFICIENT_EVIDENCE_ANSWER
    # 按证据编号排序，读起来像摘要，而不是按分数来回跳
    picked.sort(key=lambda item: item[0])
    picked = [text for _, text in picked]
    intro = (
        "**（抽取式作答）**未配置大模型 API Key，以下为知识库原文证据的自动摘录与排序，"
        "未经语言模型润色。配置 `MSRAG_LLM_API_KEY` 后可获得完整的生成式回答。\n\n"
        f"针对问题「{question}」，检索到 {len(chunks)} 条相关证据，要点如下：\n\n"
    )
    outro = "\n\n以上每条均标注了证据编号，可在下方引用卡片中查看原文出处。"
    return intro + "\n".join(picked) + outro


# 版面解析写入正文的截图引用。引用卡片要单独展示配图，
# 而"引用原文"应当是纯文本——否则用户会看到一串 Markdown 语法。
_IMAGE_REF_RE = re.compile(r"!\[[^\]]*\]\((/api/assets/[^)\s]+)\)")


def strip_image_refs(text: str) -> str:
    """去掉正文里的图片引用语法，得到干净的可读文本。"""
    return _IMAGE_REF_RE.sub("", text or "").strip()


def extract_image_refs(text: str) -> List[str]:
    """按出现顺序取出正文引用的截图 URL（去重）。"""
    seen: List[str] = []
    for url in _IMAGE_REF_RE.findall(text or ""):
        if url not in seen:
            seen.append(url)
    return seen


def build_citations(answer: str, chunks: Sequence[RetrievedChunk], max_citations: int = 6,
                    quote_chars: int = 600) -> List[Dict[str, Any]]:
    """生成引用列表。

    沿用原项目的保守策略：**不轻信模型自己编的引用**。
    先看答案里实际提到了哪些证据编号 / chunk_id，提到了就优先用；
    没提到则退化为"按检索排序取前 N 条"，保证引用永不为空也不越界。
    """
    if not chunks:
        return []

    mentioned: List[int] = []
    for match in re.finditer(r"\[?证据\s*(\d+)\]?", answer):
        index = int(match.group(1))
        if 1 <= index <= len(chunks) and index not in mentioned:
            mentioned.append(index)

    ordered: List[tuple] = []
    if mentioned:
        for position, index in enumerate(mentioned[:max_citations]):
            ordered.append((index - 1, chunks[index - 1]))
    else:
        for position, chunk in enumerate(chunks[:max_citations]):
            if any(chunk.chunk_id == existing.chunk_id for _, existing in ordered):
                continue
            ordered.append((position, chunk))
            if len(ordered) >= max_citations:
                break

    citations: List[Dict[str, Any]] = []
    for _, chunk in ordered:
        content = chunk.content or ""
        images = list(chunk.images) if chunk.images else extract_image_refs(content)
        citations.append({
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "document_title": chunk.document_title,
            "parent_key": chunk.parent_key,
            "section_title": chunk.section_title,
            "section_path": list(chunk.section_path),
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "quote": truncate(collapse_whitespace(strip_image_refs(content)), quote_chars),
            "images": images,
            "score": round(chunk.score, 6),
        })
    return citations
