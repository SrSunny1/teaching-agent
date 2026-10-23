"""父子双层分块器（移植自原项目 chunk_service，参数可配置）。

为什么是"父子双层"？
    - **子块**（chunk）：真正写入向量库的检索单元，粒度小、语义集中，检索准。
    - **父块**（section）：章节级上下文，不参与检索，但在生成时用于补齐背景、
      在溯源时用于定位"这段证据属于哪个章节"。
只做单层切分时，答案常因缺少章节背景而失真；双层是原项目验证过的做法。
"""

from __future__ import annotations

import re
from typing import List, Optional, Sequence, Tuple

from core.ids import new_id
from rag.text_utils import estimate_token_count
from rag.types import ChildChunk, ParentChunk, ParsedBlock, ParsedDocument

_TOKEN_RE = re.compile(
    r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]"
    r"|[A-Za-z0-9]+(?:[-_/'][A-Za-z0-9]+)*"
    r"|[^\s]"
)

# 章节标题的正则特征
_SECTION_KEYWORDS = re.compile(
    r"^\s*(摘\s*要|abstract|引\s*言|前\s*言|绪\s*论|结\s*论|结论与展望|致\s*谢|"
    r"参考文献|references|实验(方法|部分)?|试验(方法|部分)?|结果与讨论|讨论|"
    r"introduction|conclusion|experimental|results|discussion|methods?)\s*[:：]?\s*$",
    re.IGNORECASE,
)
_NUM_HEADING = re.compile(r"^\s*\d+(?:[\.\-]\d+)*[\.、]?\s+\S")


class Chunker:
    """把解析后的文档切成父子双层块。"""

    def __init__(self, chunk_size: int = 700, chunk_overlap: int = 120,
                 min_chunk_tokens: int = 30):
        self.chunk_size = max(120, chunk_size)
        # 重叠不能超过块大小的一半，否则检索噪声过大
        self.chunk_overlap = max(0, min(chunk_overlap, self.chunk_size // 2))
        self.min_chunk_tokens = max(0, min_chunk_tokens)

    def split(self, document_id: str, doc: ParsedDocument) -> Tuple[List[ParentChunk], List[ChildChunk]]:
        blocks = doc.blocks or _blocks_from_pages(doc)
        if not blocks:
            blocks = _blocks_from_pages(doc)
        sections = self._build_sections(blocks)

        parents: List[ParentChunk] = []
        children: List[ChildChunk] = []

        child_index = 0
        for section_no, (title, path, level, section_blocks) in enumerate(sections, start=1):
            parent_key = f"sec_{document_id}_{section_no:04d}"
            section_id = f"sec_{section_no:04d}"

            segments = _expand_segments(section_blocks, self.chunk_size)
            packed = self._pack(segments)

            if not packed:
                continue

            page_start = min((b.page_number for b in section_blocks), default=None)
            page_end = max((b.page_number for b in section_blocks), default=None)
            joined = "\n\n".join(packed)
            parents.append(ParentChunk(
                id=new_id("parent"),
                parent_key=parent_key,
                document_id=document_id,
                section_id=section_id,
                section_title=title,
                section_path=path,
                level=level,
                preview=_truncate(joined, 500),
                page_start=page_start,
                page_end=page_end,
                child_count=len(packed),
            ))

            for idx, text in enumerate(packed):
                children.append(ChildChunk(
                    id=new_id("chunk"),
                    chunk_id=f"chk_{document_id}_{section_no:04d}_{idx:04d}",
                    document_id=document_id,
                    parent_key=parent_key,
                    section_title=title,
                    section_path=list(path),
                    content=text,
                    page_start=_page_of(section_blocks, text) or page_start,
                    page_end=page_start,
                    chunk_index=child_index,
                    index_in_parent=idx,
                    token_count=estimate_token_count(text),
                    images=_extract_images(text),
                ))
                child_index += 1

        return parents, children

    # ---------------------------------------------------------------- 章节切分
    def _build_sections(self, blocks: Sequence[ParsedBlock]) -> List[Tuple[str, List[str], int, List[ParsedBlock]]]:
        sections: List[Tuple[str, List[str], int, List[ParsedBlock]]] = []
        current_title = "正文"
        current_path: List[str] = ["正文"]
        current_blocks: List[ParsedBlock] = []
        current_level = 1

        def flush() -> None:
            nonlocal current_blocks
            if current_blocks:
                sections.append((current_title, list(current_path), current_level, list(current_blocks)))
            current_blocks = []

        for block in blocks:
            text = block.text.strip()
            if not text:
                continue
            if _is_heading(block, text):
                flush()
                level = int(block.meta.get("level", 0)) or _guess_level(text)
                current_title = text
                current_path = [text]
                current_level = level
                continue
            current_blocks.append(block)

        flush()
        if not sections and blocks:
            sections.append(("正文", ["正文"], 1, list(blocks)))
        return sections

    # ---------------------------------------------------------------- 贪心装箱
    def _pack(self, segments: Sequence[str]) -> List[str]:
        chunks: List[str] = []
        current_parts: List[str] = []
        current_tokens = 0

        def flush() -> str:
            nonlocal current_parts, current_tokens
            text = "\n\n".join(part for part in current_parts if part).strip()
            current_parts = []
            current_tokens = 0
            return text

        for segment in segments:
            tokens = estimate_token_count(segment)
            if current_tokens + tokens <= self.chunk_size:
                current_parts.append(segment)
                current_tokens += tokens
                continue

            if current_parts:
                finished = flush()
                if finished:
                    chunks.append(finished)
                # 相邻块之间保留重叠，避免答案跨越边界时证据断裂
                overlap = _tail_tokens(finished, self.chunk_overlap)
                if overlap:
                    current_parts.append(overlap)
                    current_tokens += estimate_token_count(overlap)

            if tokens > self.chunk_size and current_parts:
                finished = flush()
                if finished:
                    chunks.append(finished)

            current_parts.append(segment)
            current_tokens += estimate_token_count(segment)

        tail = flush()
        if tail:
            # 过短的尾巴并入上一块，避免产生无意义碎片
            if chunks and estimate_token_count(tail) < self.min_chunk_tokens:
                chunks[-1] = chunks[-1] + "\n\n" + tail
            else:
                chunks.append(tail)
        return [c for c in chunks if c.strip()]


# ---------------------------------------------------------------- 辅助函数
def _is_heading(block: ParsedBlock, text: str) -> bool:
    if block.block_type == "title":
        return True
    if len(text) > 60:
        return False
    if _SECTION_KEYWORDS.match(text):
        return True
    if block.label.startswith("h") and block.label[1:].isdigit():
        return True
    return False


def _guess_level(text: str) -> int:
    match = re.match(r"^\s*(\d+(?:[\.\-]\d+)*)", text)
    if match:
        return len(match.group(1).split("."))
    return 1


def _expand_segments(blocks: Sequence[ParsedBlock], limit: int) -> List[str]:
    """把超长段落按 token 预算再切一刀，保证每个 segment 都装得进一个块。"""
    segments: List[str] = []
    for block in blocks:
        text = block.text.strip()
        if not text:
            continue
        if estimate_token_count(text) <= limit:
            segments.append(text)
            continue
        spans = [m.span() for m in _TOKEN_RE.finditer(text)]
        start = 0
        while start < len(spans):
            end = min(start + limit, len(spans))
            segments.append(text[spans[start][0]:spans[end - 1][1]])
            if end >= len(spans):
                break
            start = end - limit // 8  # 留一点重叠，避免硬切
            if start <= 0:
                start = end
    return segments


def _tail_tokens(text: str, count: int) -> str:
    """取文本末尾 count 个 token（按原文切片，保留原始排版）。"""
    if count <= 0 or not text:
        return ""
    spans = [m.span() for m in _TOKEN_RE.finditer(text)]
    if len(spans) <= count:
        return ""
    return text[spans[-count][0]:].strip()


def _page_of(blocks: Sequence[ParsedBlock], text: str) -> Optional[int]:
    head = text[:40]
    for block in blocks:
        if block.text.strip().startswith(head[:20]):
            return block.page_number
    return None


def _blocks_from_pages(doc: ParsedDocument) -> List[ParsedBlock]:
    blocks: List[ParsedBlock] = []
    for page in doc.pages:
        for para in re.split(r"\n\s*\n", page.text):
            para = para.strip()
            if para:
                blocks.append(ParsedBlock(
                    block_id=f"p{page.page_number:03d}_{len(blocks):03d}",
                    text=para,
                    page_number=page.page_number,
                ))
    return blocks


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


# 版面解析写入正文的截图引用，例如 ![image_003_0002](/api/assets/doc_xxx/a.png)
_IMAGE_REF_RE = re.compile(r"!\[[^\]]*\]\((/api/assets/[^)\s]+)\)")


def _extract_images(text: str) -> List[str]:
    """抽出段落里引用的版面截图 URL。

    图片引用本来就嵌在正文里，随分块自然落到对应段落，所以不需要额外的
    位置对齐——直接按出现顺序去重即可。
    """
    if "/api/assets/" not in text:
        return []
    seen: List[str] = []
    for url in _IMAGE_REF_RE.findall(text):
        if url not in seen:
            seen.append(url)
    return seen
