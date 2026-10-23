"""零依赖 HTTP 服务层。

用标准库 http.server 实现，而不是 FastAPI —— 因为插件的核心诉求是
「拷到任何机器上 `python start.py` 就能跑」，不能假设目标环境能装包。
代价是自己处理路由、multipart 与 SSE，收益是完全可控的依赖闭合。
"""

from __future__ import annotations

import json
import logging
import mimetypes
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Tuple

from core.config import Settings, get_settings
from core.ids import new_id, request_id
from core.logging import elapsed

from rag.exceptions import RagError
from rag.pipeline import RagPipeline

logger = logging.getLogger(__name__)

_START_TIME = time.time()


# ===========================================================================
# 请求 / 响应 抽象
# ===========================================================================
class Request:
    def __init__(self, method: str, path: str, query: Dict[str, List[str]],
                 headers: Dict[str, str], body: bytes):
        self.method = method
        self.path = path
        self.query = query
        self.headers = headers
        self.body = body

    def json(self) -> Dict[str, Any]:
        if not self.body:
            return {}
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def header(self, name: str, default: str = "") -> str:
        """大小写无关地读取请求头。"""
        return self.headers.get(name.lower(), default)

    def query_one(self, key: str, default: str = "") -> str:
        values = self.query.get(key)
        return values[0] if values else default

    def query_int(self, key: str, default: int) -> int:
        raw = self.query_one(key, "")
        try:
            return int(raw)
        except ValueError:
            return default


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


# ===========================================================================
# multipart 解析
# ===========================================================================
def parse_multipart(body: bytes, boundary: str) -> Tuple[Dict[str, str], Dict[str, Tuple[str, bytes]]]:
    """解析 multipart/form-data，返回 (文本字段, {文件名: (文件名, 内容)})。"""
    fields: Dict[str, str] = {}
    files: Dict[str, Tuple[str, bytes]] = {}
    delimiter = b"--" + boundary.encode("utf-8")

    parts = body.split(delimiter)
    for part in parts:
        part = part.strip(b"\r\n")
        if not part or part.startswith(b"--"):
            continue
        head, _, raw = part.partition(b"\r\n\r\n")
        if not _:
            continue
        header_text = head.decode("utf-8", errors="replace")
        name_match = re.search(r'name="([^"]*)"', header_text)
        if not name_match:
            continue
        name = name_match.group(1)
        filename_match = re.search(r'filename="([^"]*)"', header_text)
        if filename_match:
            files[name] = (filename_match.group(1), raw)
        else:
            fields[name] = raw.decode("utf-8", errors="replace")
    return fields, files


# ===========================================================================
# 路由
# ===========================================================================
Route = Tuple[str, re.Pattern, Callable[[Request, Dict[str, str]], Any]]


class ApiServer:
    def __init__(self, pipeline: RagPipeline, settings: Settings):
        self.pipeline = pipeline
        self.settings = settings
        self.routes: List[Route] = []
        self._register()

    # ---------------------------------------------------------------- 注册
    def _add(self, method: str, pattern: str, handler: Callable) -> None:
        self.routes.append((method, re.compile("^" + pattern + "$"), handler))

    def _register(self) -> None:
        self._add("GET", "/health", self.h_health)
        self._add("GET", "/api/meta", self.h_meta)
        self._add("GET", "/api/stats", self.h_stats)

        self._add("GET", "/api/documents", self.h_list_documents)
        self._add("POST", "/api/documents/upload", self.h_upload_document)
        self._add("POST", "/api/documents/text", self.h_create_text_document)
        self._add("GET", r"/api/documents/([^/]+)", self.h_get_document)
        self._add("DELETE", r"/api/documents/([^/]+)", self.h_delete_document)
        self._add("POST", r"/api/documents/([^/]+)/reingest", self.h_reingest_document)
        self._add("GET", r"/api/documents/([^/]+)/chunks", self.h_list_chunks)

        self._add("GET", r"/api/chunks/(.+)", self.h_get_chunk)
        self._add("GET", r"/api/jobs/([^/]+)", self.h_get_job)

        self._add("GET", "/api/conversations", self.h_list_conversations)
        self._add("POST", "/api/conversations", self.h_create_conversation)
        self._add("GET", r"/api/conversations/([^/]+)/messages", self.h_list_messages)
        self._add("GET", r"/api/conversations/([^/]+)", self.h_get_conversation)
        self._add("PATCH", r"/api/conversations/([^/]+)", self.h_rename_conversation)
        self._add("DELETE", r"/api/conversations/([^/]+)", self.h_delete_conversation)
        self._add("POST", r"/api/conversations/([^/]+)/messages/stream", self.h_stream_message)
        self._add("POST", r"/api/conversations/([^/]+)/messages", self.h_create_message)

        self._add("POST", "/api/search", self.h_search)
        self._add("POST", "/api/ask", self.h_ask)

        # 设置页：在插件内配置 Key 与解析选项，保存后立即生效
        self._add("GET", "/api/settings", self.h_get_settings)
        self._add("PUT", "/api/settings", self.h_update_settings)
        self._add("POST", "/api/settings/test", self.h_test_settings)
        self._add("POST", "/api/settings/ppsv3/detect", self.h_detect_ppsv3)

    # ---------------------------------------------------------------- 分发
    def dispatch(self, request: Request) -> Tuple[int, Dict[str, str], bytes, bool]:
        """返回 (status, headers, body, is_stream_marker)。"""
        rid = request_id()
        try:
            for method, pattern, handler in self.routes:
                if method != request.method:
                    continue
                match = pattern.match(request.path)
                if not match:
                    continue
                try:
                    payload = handler(request, match.groupdict() or _groups(match))
                except RagError as exc:
                    return _json_error(exc.http_status, exc.code, exc.message, rid, exc.details)
                except ApiError as exc:
                    return _json_error(exc.status, exc.code, exc.message, rid, exc.details)
                if isinstance(payload, tuple) and len(payload) == 2 and payload[0] == "__SSE__":
                    headers = {
                        "Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-cache, no-transform",
                        # SSE 是长度未知的持续响应，不能带 Content-Length；
                        # 在 HTTP/1.1 keep-alive 下客户端会一直等长度而挂起，
                        # 因此显式声明流结束后关闭连接。
                        "Connection": "close",
                        "X-Request-ID": rid,
                    }
                    return 200, headers, payload[1], True
                return 200, {"Content-Type": "application/json; charset=utf-8",
                             "X-Request-ID": rid}, _json_ok(payload, rid), False
            return _json_error(404, "not_found", f"接口不存在: {request.method} {request.path}", rid)
        except Exception as exc:  # 兜底，绝不把堆栈抛给客户端
            logger.exception("处理请求时发生未捕获异常")
            # 异常文本可能含文件路径、上游 URL 等内部信息，默认不回给客户端；
            # 客户端凭 request_id 去 data/logs 里定位即可。
            # 本地 debug 模式才附上细节，方便排查。
            details = f"{type(exc).__name__}: {exc}" if getattr(self.settings, "debug", False) else None
            return _json_error(500, "internal_error",
                               f"服务器内部错误（request_id: {rid}）", rid, details)

    # ================================================================ 处理器
    def h_health(self, request: Request, params: Dict[str, str]) -> Any:
        return {
            "status": "ok",
            "app": self.settings.app_name,
            "version": self.settings.version,
            "uptime_seconds": int(time.time() - _START_TIME),
        }

    def h_meta(self, request: Request, params: Dict[str, str]) -> Any:
        return {
            "app": self.settings.app_name,
            "version": self.settings.version,
            "domain": self.settings.domain_label,
            "base_url": self.settings.base_url,
            "capabilities": self.pipeline.capabilities(),
            "config": self.pipeline.capabilities()["config"],
            "stats": self.pipeline.stats(),
            "theme": {
                "name": "materials-lab",
                "supports_dark_mode": True,
                "suggested_questions": [
                    "高熵合金的主要强化机制有哪些？",
                    "钙钛矿太阳能电池稳定性差的原因是什么？",
                    "如何通过热处理调控铝合金的析出相？",
                    "锂电池正极材料 NCM 与 LFP 各有什么优劣？",
                ],
            },
        }

    def h_stats(self, request: Request, params: Dict[str, str]) -> Any:
        stats = self.pipeline.stats()
        recent = self.pipeline.store.list_documents(limit=5)["items"]
        stats["recent_documents"] = recent
        stats["vector_index"] = self.pipeline.vectorstore.stats()
        return stats

    # ---------------- 文献 ----------------
    def h_list_documents(self, request: Request, params: Dict[str, str]) -> Any:
        result = self.pipeline.store.list_documents(
            q=request.query_one("q"), status=request.query_one("status"),
            limit=request.query_int("limit", 100), offset=request.query_int("offset", 0),
        )
        return result

    def h_upload_document(self, request: Request, params: Dict[str, str]) -> Any:
        # 注意：Request.headers 的键在构造时已统一转成小写
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            raise ApiError(415, "invalid_request", "请使用 multipart/form-data 上传文件")
        boundary_match = re.search(r"boundary=([^;]+)", content_type)
        if not boundary_match:
            raise ApiError(400, "invalid_request", "缺少 multipart boundary")
        fields, files = parse_multipart(request.body, boundary_match.group(1).strip('"'))

        if "file" not in files:
            raise ApiError(400, "invalid_request", "缺少 file 字段")

        filename, content = files["file"]
        ext = Path(filename).suffix.lower()
        if ext not in self.settings.allowed_extensions:
            raise ApiError(415, "unsupported_file",
                           f"不支持的文件类型 {ext}，支持：{', '.join(self.settings.allowed_extensions)}")
        if len(content) > self.settings.upload_max_bytes:
            raise ApiError(413, "file_too_large",
                           f"文件超过 {self.settings.max_upload_mb} MB 限制")
        if ext == ".pdf" and not content.startswith(b"%PDF"):
            # 有些浏览器/工具会改扩展名，按内容再判一次更安全
            logger.warning("文件扩展名为 pdf 但缺少 PDF 头，仍继续尝试解析")

        tags = [t.strip() for t in (fields.get("tags") or "").split(",") if t.strip()]
        from rag.parsers.service import sha256_of
        file_hash = sha256_of(content)
        existing = self.pipeline.store.find_by_hash(file_hash)
        if existing:
            raise ApiError(409, "conflict",
                           f"该文件已存在于知识库：{existing['title']}",
                           {"document_id": existing["id"]})

        doc = self.pipeline.register_document(
            title=fields.get("title") or Path(filename).stem,
            source=fields.get("source") or "", tags=tags,
            file_name=filename, file_ext=ext, file_size=len(content), file_hash=file_hash,
        )
        stored = _save_upload(self.settings, doc["id"], filename, content)
        self.pipeline.store.update_document(doc["id"], file_path=str(stored))
        job = self.pipeline.submit_ingest(doc["id"], content, filename, ext)
        return {"document": doc, "job": job}

    def h_create_text_document(self, request: Request, params: Dict[str, str]) -> Any:
        payload = request.json()
        content = (payload.get("content") or "").strip()
        title = (payload.get("title") or "").strip()
        if not content:
            raise ApiError(400, "invalid_request", "content 不能为空")
        if len(content.encode("utf-8")) > self.settings.upload_max_bytes:
            raise ApiError(413, "file_too_large",
                           f"文本超过 {self.settings.max_upload_mb} MB 限制")
        if not title:
            title = content.strip().splitlines()[0][:60] or "未命名文本"

        tags = payload.get("tags")
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        tags = list(tags or [])

        from rag.parsers.service import sha256_of
        data = content.encode("utf-8")
        file_hash = sha256_of(data)
        existing = self.pipeline.store.find_by_hash(file_hash)
        if existing:
            raise ApiError(409, "conflict", f"该内容已存在：{existing['title']}",
                           {"document_id": existing["id"]})

        doc = self.pipeline.register_document(
            title=title, source=payload.get("source") or "手动录入", tags=tags,
            file_name=f"{title[:40]}.md", file_ext=".md", file_size=len(data),
            file_hash=file_hash,
        )
        stored = _save_upload(self.settings, doc["id"], "document.md", data)
        self.pipeline.store.update_document(doc["id"], file_path=str(stored))
        job = self.pipeline.submit_ingest(doc["id"], data, "document.md", ".md")
        return {"document": doc, "job": job}

    def h_get_document(self, request: Request, params: Dict[str, str]) -> Any:
        doc_id = _first(params)
        doc = self.pipeline.store.get_document(doc_id)
        if not doc:
            raise ApiError(404, "not_found", "文献不存在")
        sections = self.pipeline.store.query(
            "SELECT * FROM sections WHERE document_id = ? ORDER BY section_id", (doc_id,))
        return {
            "document": doc,
            "sections": [{
                "id": row["id"], "parent_key": row["parent_key"], "section_id": row["section_id"],
                "section_title": row["section_title"], "section_path": _json_load(row["section_path"], []),
                "level": row["level"], "preview": row["preview"],
                "page_start": row["page_start"], "page_end": row["page_end"],
                "child_count": row["child_count"],
            } for row in sections],
        }

    def h_delete_document(self, request: Request, params: Dict[str, str]) -> Any:
        doc_id = _first(params)
        ok = self.pipeline.delete_document(doc_id)
        if not ok:
            raise ApiError(404, "not_found", "文献不存在")
        return {"deleted": True, "document_id": doc_id}

    def h_reingest_document(self, request: Request, params: Dict[str, str]) -> Any:
        doc_id = _first(params)
        try:
            job = self.pipeline.reingest(doc_id)
        except RagError as exc:
            raise ApiError(422, exc.code, exc.message)
        return {"document_id": doc_id, "job": job}

    def h_list_chunks(self, request: Request, params: Dict[str, str]) -> Any:
        doc_id = _first(params)
        doc = self.pipeline.store.get_document(doc_id)
        if not doc:
            raise ApiError(404, "not_found", "文献不存在")
        items = self.pipeline.store.list_chunks(
            doc_id, q=request.query_one("q"), limit=request.query_int("limit", 200))
        for item in items:
            item["document_title"] = doc["title"]
        return {"items": items, "document": doc, "total": len(items)}

    def h_get_chunk(self, request: Request, params: Dict[str, str]) -> Any:
        chunk_id = urllib.parse.unquote(_first(params))
        chunk = self.pipeline.store.get_chunk_by_key(chunk_id)
        if not chunk:
            raise ApiError(404, "not_found", "段落不存在")
        doc = self.pipeline.store.get_document(chunk["document_id"])
        chunk["document_title"] = doc["title"] if doc else ""

        context: Dict[str, Any] = {}
        if chunk.get("parent_key"):
            parent = self.pipeline.store.query_one(
                "SELECT * FROM sections WHERE parent_key = ?", (chunk["parent_key"],))
            if parent:
                context["parent_section"] = {
                    "parent_key": parent["parent_key"],
                    "section_title": parent["section_title"],
                    "section_path": _json_load(parent["section_path"], []),
                    "preview": parent["preview"],
                    "page_start": parent["page_start"], "page_end": parent["page_end"],
                }
        siblings = self.pipeline.store.query(
            "SELECT * FROM chunks WHERE parent_key = ? ORDER BY chunk_index",
            (chunk.get("parent_key") or "",))
        ordered = [row["chunk_id"] for row in siblings]
        if chunk_id in ordered:
            index = ordered.index(chunk_id)
            neighbors = []
            for offset in (-1, 1):
                pos = index + offset
                if 0 <= pos < len(ordered):
                    neighbors.append({"position": "prev" if offset < 0 else "next",
                                      "chunk_id": ordered[pos]})
            context["neighbors"] = neighbors
        return {"chunk": chunk, "document": doc, "context": context}

    def h_get_job(self, request: Request, params: Dict[str, str]) -> Any:
        job = self.pipeline.store.get_job(_first(params))
        if not job:
            raise ApiError(404, "not_found", "任务不存在")
        return job

    # ---------------- 会话 / 问答 ----------------
    def h_list_conversations(self, request: Request, params: Dict[str, str]) -> Any:
        items = self.pipeline.store.list_conversations(limit=request.query_int("limit", 50))
        return {"items": items, "total": len(items)}

    def h_create_conversation(self, request: Request, params: Dict[str, str]) -> Any:
        payload = request.json()
        title = (payload.get("title") or "新会话").strip()
        conv = self.pipeline.store.create_conversation(new_id("conversation"), title[:120])
        return {"conversation": conv}

    def h_get_conversation(self, request: Request, params: Dict[str, str]) -> Any:
        conv_id = _first(params)
        conv = self.pipeline.store.get_conversation(conv_id)
        if not conv:
            raise ApiError(404, "not_found", "会话不存在")
        return {"conversation": conv, "messages": self.pipeline.store.list_messages(conv_id)}

    def h_list_messages(self, request: Request, params: Dict[str, str]) -> Any:
        conv_id = _first(params)
        return {"messages": self.pipeline.store.list_messages(conv_id)}

    def h_rename_conversation(self, request: Request, params: Dict[str, str]) -> Any:
        payload = request.json()
        title = (payload.get("title") or "").strip()
        if not title:
            raise ApiError(400, "invalid_request", "title 不能为空")
        self.pipeline.store.rename_conversation(_first(params), title[:120])
        return {"ok": True}

    def h_delete_conversation(self, request: Request, params: Dict[str, str]) -> Any:
        conv_id = _first(params)
        ok = self.pipeline.store.delete_conversation(conv_id)
        if not ok:
            raise ApiError(404, "not_found", "会话不存在")
        return {"deleted": True, "conversation_id": conv_id}

    def _question_payload(self, request: Request) -> Tuple[str, Optional[int], List[str], Optional[float], Optional[int]]:
        payload = request.json()
        question = (payload.get("question") or "").strip()
        if not question:
            raise ApiError(400, "invalid_request", "question 不能为空")
        top_k = payload.get("top_k")
        if top_k is not None:
            try:
                top_k = max(1, min(int(top_k), self.settings.max_top_k))
            except (TypeError, ValueError):
                top_k = None
        document_ids = payload.get("document_ids") or []
        if not isinstance(document_ids, list):
            document_ids = []
        temperature = _opt_float(payload.get("temperature"))
        max_tokens = _opt_int(payload.get("max_tokens"))
        return question, top_k, [str(i) for i in document_ids], temperature, max_tokens

    def h_create_message(self, request: Request, params: Dict[str, str]) -> Any:
        conv_id = _first(params)
        conv = self.pipeline.store.get_conversation(conv_id)
        if not conv:
            raise ApiError(404, "not_found", "会话不存在")

        question, top_k, document_ids, temperature, max_tokens = self._question_payload(request)
        user_msg = self.pipeline.store.add_message({
            "id": new_id("message"), "conversation_id": conv_id, "role": "user",
            "content": question,
        })
        # 首次提问时给会话起个名字，方便回溯
        if conv.get("title") in ("新会话", ""):
            self.pipeline.store.rename_conversation(conv_id, question[:40])

        result = self.pipeline.answer(question, top_k=top_k, document_ids=document_ids or None,
                                      temperature=temperature, max_tokens=max_tokens)
        assistant_msg = self.pipeline.store.add_message({
            "id": new_id("message"), "conversation_id": conv_id, "role": "assistant",
            "content": result.answer, "model": result.model or None,
            "latency_ms": result.latency_ms,
            "meta": {"generation_mode": result.generation_mode, "usage": result.usage,
                     "context_chars": result.context_chars},
        })
        self._persist_citations(assistant_msg["id"], result.citations)

        return {
            "user_message": dict(user_msg, citations=[]),
            "assistant_message": dict(assistant_msg, citations=result.citations),
            "retrieval": {
                "top_k": top_k or self.settings.top_k,
                "returned": len(result.retrieval),
                "document_ids": document_ids,
                "chunks": [c.to_dict(include_content=False) for c in result.retrieval],
            },
        }

    def h_stream_message(self, request: Request, params: Dict[str, str]) -> Any:
        conv_id = _first(params)
        conv = self.pipeline.store.get_conversation(conv_id)
        if not conv:
            raise ApiError(404, "not_found", "会话不存在")
        question, top_k, document_ids, temperature, max_tokens = self._question_payload(request)

        user_msg = self.pipeline.store.add_message({
            "id": new_id("message"), "conversation_id": conv_id, "role": "user",
            "content": question,
        })
        if conv.get("title") in ("新会话", ""):
            self.pipeline.store.rename_conversation(conv_id, question[:40])

        generator = self.pipeline.stream_answer(
            question, top_k=top_k, document_ids=document_ids or None,
            temperature=temperature, max_tokens=max_tokens,
        )

        def wrapped() -> Iterator[Dict[str, Any]]:
            meta = {
                "conversation_id": conv_id,
                "user_message_id": user_msg["id"],
                "assistant_message_id": new_id("message"),
            }
            yield {"event": "meta", "data": meta}
            final: Dict[str, Any] = {}
            for event in generator:
                if event.get("event") == "meta":
                    merged = dict(meta)
                    merged.update(event.get("data") or {})
                    yield {"event": "meta", "data": merged}
                    continue
                if event.get("event") == "done":
                    final = event.get("data") or {}
                yield event

            content = final.get("answer") or ""
            assistant_msg = self.pipeline.store.add_message({
                "id": meta["assistant_message_id"], "conversation_id": conv_id,
                "role": "assistant", "content": content,
                "model": final.get("model"), "latency_ms": final.get("latency_ms"),
                "meta": {"generation_mode": final.get("generation_mode"),
                         "context_chars": final.get("context_chars")},
            })
            citations = final.get("citations") or []
            self._persist_citations(assistant_msg["id"], citations)
            yield {"event": "done", "data": dict(final, message=assistant_msg,
                                                 citations=citations)}

        # 注意要返回生成器对象（调用它），而不是函数本身
        return ("__SSE__", wrapped())

    def _persist_citations(self, message_id: str, citations: List[Dict[str, Any]]) -> None:
        rows = []
        for item in citations or []:
            rows.append({
                "id": new_id("citation"), "message_id": message_id,
                "document_id": item.get("document_id"), "document_title": item.get("document_title"),
                "chunk_id": item.get("chunk_id"), "parent_key": item.get("parent_key"),
                "section_title": item.get("section_title"),
                "section_path": item.get("section_path") or [],
                "page_start": item.get("page_start"), "page_end": item.get("page_end"),
                "quote": item.get("quote"), "score": item.get("score"),
                "images": item.get("images") or [],
            })
        if rows:
            self.pipeline.store.add_citations(message_id, rows)

    # ---------------- 插件式无状态接口 ----------------
    def h_search(self, request: Request, params: Dict[str, str]) -> Any:
        payload = request.json()
        query = (payload.get("query") or payload.get("question") or "").strip()
        if not query:
            raise ApiError(400, "invalid_request", "query 不能为空")
        top_k = _opt_int(payload.get("top_k")) or self.settings.top_k
        document_ids = payload.get("document_ids") or None
        chunks = self.pipeline.search(query, top_k=top_k, document_ids=document_ids)
        return {
            "query": query, "top_k": top_k, "returned": len(chunks),
            "chunks": [c.to_dict() for c in chunks],
        }

    def h_ask(self, request: Request, params: Dict[str, str]) -> Any:
        payload = request.json()
        question = (payload.get("question") or "").strip()
        if not question:
            raise ApiError(400, "invalid_request", "question 不能为空")
        top_k = _opt_int(payload.get("top_k"))
        document_ids = payload.get("document_ids") or None
        result = self.pipeline.answer(
            question, top_k=top_k, document_ids=document_ids,
            temperature=_opt_float(payload.get("temperature")),
            max_tokens=_opt_int(payload.get("max_tokens")),
        )
        return {
            "answer": result.answer,
            "citations": result.citations,
            "retrieval": {"returned": len(result.retrieval),
                          "chunks": [c.to_dict(include_content=False) for c in result.retrieval]},
            "generation_mode": result.generation_mode,
            "model": result.model,
            "usage": result.usage,
            "latency_ms": result.latency_ms,
        }

    # ---------------------------------------------------------------- 设置
    def h_get_settings(self, request: Request, params: Dict[str, str]) -> Any:
        """返回可配置项。密钥只给掩码；ppsV3 状态只读缓存，不触发耗时探测。"""
        from core.settings_store import read_settings
        from rag.parsers.ppsv3_adapter import cached_status

        data = read_settings(mask=True)
        data["ppsv3"] = cached_status()
        data["effective"] = {
            "llm_enabled": self.settings.has_llm,
            "llm_model": self.settings.llm_model if self.settings.has_llm else None,
        }
        return data

    def h_update_settings(self, request: Request, params: Dict[str, str]) -> Any:
        """保存配置：写回 .env + 同步进程环境 + 重建客户端（无需重启）。"""
        from core.settings_store import write_settings

        payload = request.json() or {}
        if not isinstance(payload, dict):
            raise ApiError(400, "invalid_request", "请求体需为 JSON 对象")

        result = write_settings(payload)
        applied = self.pipeline.reconfigure()
        # reconfigure 会重载 settings，这里同步引用，避免继续用旧快照
        self.settings = self.pipeline.settings

        return {
            "saved": True,
            "updated": result["updated"],
            "warnings": result["warnings"],
            "applied": applied,
            "effective": {
                "llm_enabled": self.settings.has_llm,
                "llm_model": self.settings.llm_model if self.settings.has_llm else None,
            },
            "capabilities": self.pipeline.capabilities(),
        }

    def h_test_settings(self, request: Request, params: Dict[str, str]) -> Any:
        """用当前（或临时提交的）配置发一个最小请求，验证 Key 是否有效。"""
        from core.settings_store import probe_endpoint

        payload = request.json() or {}
        settings = self.settings

        base_url = (payload.get("base_url") or settings.llm_base_url).strip()
        model = (payload.get("model") or settings.llm_model).strip()
        api_key = payload.get("api_key")
        # 前端回传掩码 = 用户没改，用进程内真实值
        if not api_key or (isinstance(api_key, str) and "*" in api_key):
            api_key = settings.llm_api_key

        if not api_key:
            raise ApiError(400, "invalid_request", "请先填写 API Key 再测试")

        outcome = probe_endpoint(base_url, api_key, model, settings.llm_endpoint)
        outcome["base_url"] = base_url
        outcome["model"] = model
        return outcome

    def h_detect_ppsv3(self, request: Request, params: Dict[str, str]) -> Any:
        """强制重新检测 ppsV3 环境（较慢，可能耗时数十秒）。"""
        from rag.parsers.ppsv3_adapter import detect

        payload = request.json() or {}
        python = (payload.get("python") or self.settings.ppsv3_python or "").strip()
        device = (payload.get("device") or self.settings.ppsv3_device or "cpu").strip()
        accurate = bool(payload.get("accurate", self.settings.ppsv3_accurate))
        try:
            info = detect(python=python, device=device, accurate=accurate)
        except Exception as exc:
            raise ApiError(500, "detect_failed", f"环境检测失败：{exc}") from exc
        info["enabled"] = self.settings.ppsv3_enabled
        return info


# ===========================================================================
# 静态站点 + HTTP 适配器
# ===========================================================================
class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MaterialsRAG/1.0"

    # ---------------- 工具 ----------------
    @property
    def api(self) -> ApiServer:
        return self.server.api  # type: ignore[attr-defined]

    @property
    def app_settings(self) -> Settings:
        return self.server.app_settings  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.debug("%s - %s", self.address_string(), fmt % args)

    def _read_body(self) -> Optional[bytes]:
        """读取请求体；超限时立即回 413，**不把超大的 body 读进内存**。

        返回 None 表示已经应答完毕，调用方不要再处理这个请求。
        """
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return b""

        # 留 2MB 余量给 multipart 边界与各段头部等包装开销
        limit = self.app_settings.upload_max_bytes + 2 * 1024 * 1024
        if length > limit:
            logger.warning("请求体过大已拒绝：%s bytes（上限 %s）", length, limit)
            payload = json.dumps({
                "success": False,
                "error": {
                    "code": "payload_too_large",
                    "message": (f"请求体过大（约 {length // (1024 * 1024)} MB），"
                                f"上限约 {limit // (1024 * 1024)} MB"),
                },
            }, ensure_ascii=False).encode("utf-8")
            self._send(413, {"Content-Type": "application/json; charset=utf-8"}, payload)
            # body 没读完，这条连接不能复用
            self.close_connection = True
            return None

        return self.rfile.read(length)

    def _build_request(self, body: bytes) -> Request:
        parsed = urllib.parse.urlparse(self.path)
        return Request(
            method=self.command, path=urllib.parse.unquote(parsed.path),
            query=urllib.parse.parse_qs(parsed.query),
            headers={key.lower(): value for key, value in self.headers.items()},
            body=body,
        )

    def _send(self, status: int, headers: Dict[str, str], body: bytes) -> None:
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _send_stream(self, generator: Iterable[Dict[str, Any]]) -> None:
        # 流结束后必须关闭连接，否则 keep-alive 下客户端不知道响应何时结束
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self._cors_headers()
        self.end_headers()
        try:
            for event in generator:
                name = event.get("event", "message")
                data = json.dumps(event.get("data") or {}, ensure_ascii=False)
                chunk = f"event: {name}\ndata: {data}\n\n".encode("utf-8")
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            logger.debug("客户端断开 SSE 连接")
        except Exception as exc:
            logger.warning("SSE 推送异常: %s", exc)
            try:
                error = json.dumps({"message": str(exc), "code": "stream_error"},
                                   ensure_ascii=False)
                self.wfile.write(f"event: error\ndata: {error}\n\n".encode("utf-8"))
                self.wfile.flush()
            except Exception:
                pass

    def _cors_headers(self) -> None:
        """按请求的 Origin 匹配白名单回显。

        默认白名单为空 = 不下发 CORS 头，也就是只允许同源访问。这是刻意的：
        服务只监听本机，若默认放行 `*`，用户浏览器里任意网页都能静默读走知识库。
        插件的正常接入方式是 SDK / 命令行（服务端调用，不受 CORS 约束）；
        确有浏览器跨域需求时，用 MSRAG_CORS_ORIGINS 显式放行。
        """
        origins = list(getattr(self.app_settings, "cors_origins", None) or [])
        origin = ""
        try:
            origin = self.headers.get("Origin", "") or ""
        except Exception:
            origin = ""

        allow = ""
        if "*" in origins:
            allow = "*"
        elif origin and origin in origins:
            allow = origin

        if allow:
            self.send_header("Access-Control-Allow-Origin", allow)
            # 白名单回显必须带 Vary，否则中间缓存会把某个源的响应发给别的源
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Allow-Methods",
                             "GET, POST, PUT, PATCH, DELETE, OPTIONS")

        self.send_header("X-Content-Type-Options", "nosniff")

    # 允许直接外发的截图类型；不在表内的一律 404，避免把知识库里的
    # 任意文件（含 .db / .json）当成静态资源泄漏出去。
    _ASSET_TYPES = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".gif": "image/gif",
    }

    def _serve_asset(self, relative: str) -> None:
        """提供版面解析产出的截图：``/api/assets/<document_id>/<file>``。"""
        from urllib.parse import unquote

        relative = unquote(relative or "")
        assets_root = (self.app_settings.data_dir / "assets").resolve()
        target = (assets_root / relative).resolve()
        # 双重防护：既不许逃出 assets 根目录，也不许名字里带 ..
        try:
            target.relative_to(assets_root)
        except ValueError:
            self._send(403, {"Content-Type": "text/plain; charset=utf-8"},
                       "禁止访问".encode("utf-8"))
            return
        if ".." in Path(relative).parts:
            self._send(403, {"Content-Type": "text/plain; charset=utf-8"},
                       "禁止访问".encode("utf-8"))
            return
        content_type = self._ASSET_TYPES.get(target.suffix.lower())
        if not content_type or not target.is_file():
            self._send(404, {"Content-Type": "text/plain; charset=utf-8"},
                       "图片不存在".encode("utf-8"))
            return
        self._send(200, {
            "Content-Type": content_type,
            "Cache-Control": "private, max-age=86400",
        }, target.read_bytes())

    def _serve_static(self, path: str) -> None:
        web_dir: Path = self.app_settings.web_dir
        # 默认首页
        relative = path.lstrip("/") or "index.html"
        if relative in ("", "/"):
            relative = "index.html"
        target = (web_dir / relative).resolve()
        try:
            target.relative_to(web_dir.resolve())
        except ValueError:
            self._send(403, {"Content-Type": "text/plain; charset=utf-8"},
                       "禁止访问".encode("utf-8"))
            return
        if not target.is_file():
            target = web_dir / "index.html"
        if not target.is_file():
            self._send(404, {"Content-Type": "text/plain; charset=utf-8"},
                       "页面不存在".encode("utf-8"))
            return
        content_type, _ = mimetypes.guess_type(str(target))
        if target.suffix in (".js", ".mjs"):
            content_type = "application/javascript; charset=utf-8"
        elif target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        self._send(200, {"Content-Type": content_type or "application/octet-stream"},
                   target.read_bytes())

    # ---------------- HTTP 动词 ----------------
    def do_GET(self) -> None:  # noqa: N802
        self._handle(b"")

    def do_POST(self) -> None:  # noqa: N802
        body = self._read_body()
        if body is None:
            return
        self._handle(body)

    def do_PATCH(self) -> None:  # noqa: N802
        body = self._read_body()
        if body is None:
            return
        self._handle(body)

    def do_PUT(self) -> None:  # noqa: N802
        body = self._read_body()
        if body is None:
            return
        self._handle(body)

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle(b"")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle(self, body: bytes) -> None:
        request = self._build_request(body)
        # 版面截图是二进制，不能走 JSON 序列化，因此在路由分发之前单独处理
        if request.path.startswith("/api/assets/"):
            self._serve_asset(request.path[len("/api/assets/"):])
            return
        if request.path.startswith("/api/") or request.path == "/health":
            status, headers, payload, is_stream = self.api.dispatch(request)
            if is_stream:
                self._send_stream(payload)  # type: ignore[arg-type]
                return
            headers = dict(headers)
            headers["Content-Length"] = str(len(payload))
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self._cors_headers()
            self.end_headers()
            if payload:
                self.wfile.write(payload)
            return
        self._serve_static(request.path)


class RagHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: Tuple[str, int], api: ApiServer, settings: Settings):
        self.api = api
        self.app_settings = settings
        super().__init__(address, _Handler)


# ===========================================================================
# 辅助函数
# ===========================================================================
def _groups(match: "re.Match[str]") -> Dict[str, str]:
    return {str(index): value for index, value in enumerate(match.groups(), start=1)}


def _first(params: Dict[str, str]) -> str:
    if not params:
        return ""
    return next(iter(params.values()))


def _json_ok(data: Any, rid: str) -> bytes:
    return json.dumps({"success": True, "data": data, "request_id": rid},
                      ensure_ascii=False, default=str).encode("utf-8")


def _json_error(status: int, code: str, message: str, rid: str, details: Any = None) -> tuple:
    payload: Dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    body = json.dumps({"success": False, "error": payload, "request_id": rid},
                      ensure_ascii=False, default=str).encode("utf-8")
    return (status, {"Content-Type": "application/json; charset=utf-8",
                     "X-Request-ID": rid}, body, False)


def _json_load(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return default
    return value


def _opt_float(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _opt_int(value: Any) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _save_upload(settings: Settings, document_id: str, filename: str, content: bytes) -> Path:
    directory = settings.upload_dir / document_id
    directory.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w\u4e00-\u9fff.\-]+", "_", filename)[:120] or "document"
    target = directory / safe
    target.write_bytes(content)
    return target


def create_server(settings: Optional[Settings] = None,
                  pipeline: Optional[RagPipeline] = None) -> RagHTTPServer:
    settings = settings or get_settings()
    pipeline = pipeline or RagPipeline(settings)
    api = ApiServer(pipeline, settings)
    return RagHTTPServer((settings.host, settings.port), api, settings)
