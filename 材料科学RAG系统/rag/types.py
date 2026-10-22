"""RAG 流水线的数据结构定义。

沿用原项目的分层：Page（页）-> Block（块）-> Parent（章节父块）-> Chunk（检索子块）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ParsedBlock:
    """解析产出的最小内容单元（一段文字 / 一个标题 / 一个表格）。"""

    block_id: str
    text: str
    page_number: int = 1
    block_type: str = "text"      # text | title | table | figure_caption | list
    label: str = ""
    section_title: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedPage:
    page_number: int
    text: str
    blocks: List[ParsedBlock] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedDocument:
    page_count: int = 0
    pages: List[ParsedPage] = field(default_factory=list)
    blocks: List[ParsedBlock] = field(default_factory=list)
    parser: str = "unknown"
    quality: Dict[str, Any] = field(default_factory=dict)
    artifacts: Dict[str, Any] = field(default_factory=dict)

    @property
    def full_text(self) -> str:
        return "\n\n".join(page.text for page in self.pages)


@dataclass
class ParentChunk:
    """章节级父块：提供上下文与溯源，不直接参与向量检索。"""

    id: str
    parent_key: str
    document_id: str
    section_id: str
    section_title: str
    section_path: List[str]
    level: int
    preview: str
    page_start: Optional[int]
    page_end: Optional[int]
    child_count: int = 0


@dataclass
class ChildChunk:
    """检索子块：真正写入向量库的单元。"""

    id: str
    chunk_id: str
    document_id: str
    parent_key: str
    section_title: str
    section_path: List[str]
    content: str
    page_start: Optional[int]
    page_end: Optional[int]
    chunk_index: int
    index_in_parent: int
    token_count: int
    # 版面解析产出的截图（URL 列表）。随段落一起检索返回，让答案能带上原文配图。
    images: List[str] = field(default_factory=list)


@dataclass
class RetrievedChunk:
    """一次检索结果条目。"""

    chunk_id: str
    document_id: str
    document_title: str
    content: str
    score: float
    dense_score: float = 0.0
    sparse_score: float = 0.0
    parent_key: str = ""
    section_title: str = ""
    section_path: List[str] = field(default_factory=list)
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    token_count: int = 0
    images: List[str] = field(default_factory=list)

    def to_dict(self, include_content: bool = True) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "document_title": self.document_title,
            "parent_key": self.parent_key,
            "section_title": self.section_title,
            "section_path": self.section_path,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "score": round(self.score, 6),
            "dense_score": round(self.dense_score, 6),
            "sparse_score": round(self.sparse_score, 6),
            "token_count": self.token_count,
            "images": self.images,
        }
        if include_content:
            data["content"] = self.content
        return data


@dataclass
class AnswerResult:
    """生成阶段的完整产物。"""

    answer: str
    citations: List[Dict[str, Any]] = field(default_factory=list)
    retrieval: List[RetrievedChunk] = field(default_factory=list)
    model: str = ""
    latency_ms: int = 0
    usage: Dict[str, Any] = field(default_factory=dict)
    generation_mode: str = "llm"   # llm | extractive（无 LLM 时的降级模式）
    context_chars: int = 0
