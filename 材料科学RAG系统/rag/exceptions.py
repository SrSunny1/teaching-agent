"""RAG 流水线异常。沿用原项目的分层异常设计（便于上层精确转 HTTP 码）。"""

from __future__ import annotations

from typing import Any, Dict, Optional


class RagError(Exception):
    """RAG 领域异常基类。"""

    code = "rag_error"
    http_status = 500

    def __init__(self, message: str = "", details: Optional[Dict[str, Any]] = None):
        self.message = message or self.__class__.__doc__ or "RAG 处理失败"
        self.details = details or {}
        super().__init__(self.message)


class UnsupportedFileError(RagError):
    """不支持的文件类型。"""

    code = "unsupported_file"
    http_status = 415


class FileTooLargeError(RagError):
    """上传文件超过大小限制。"""

    code = "file_too_large"
    http_status = 413


class ParseError(RagError):
    """文档解析失败。"""

    code = "parse_failed"
    http_status = 422


class EmptyDocumentError(RagError):
    """文档没有提取到可用文本（可能是扫描件，需要 OCR）。"""

    code = "empty_document"
    http_status = 422


class EmbeddingError(RagError):
    """向量化失败。"""

    code = "embedding_failed"
    http_status = 502


class RetrievalError(RagError):
    """检索失败。"""

    code = "retrieval_failed"
    http_status = 502


class GenerationError(RagError):
    """大模型生成失败。"""

    code = "generation_failed"
    http_status = 502


class NotFoundError(RagError):
    """资源不存在。"""

    code = "not_found"
    http_status = 404


class ConflictError(RagError):
    """资源冲突（例如重复文件）。"""

    code = "conflict"
    http_status = 409


class ValidationError(RagError):
    """请求参数校验失败。"""

    code = "invalid_request"
    http_status = 400
