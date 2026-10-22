"""RAG 全流程编排。

上传/录入 -> 解析 -> 父子双层分块 -> 嵌入 -> 写向量库 -> 状态回写
提问 -> 问题嵌入 -> 混合检索 -> 上下文组装 -> 生成（流式）-> 引用落库

与原项目的差异（插件化取舍）：
    - 去掉了"独立 worker 进程 + 多进程 spawn"，改为后台线程 + job 进度表，
      省掉一套进程管理，代价是失去超时 kill（对小规模语料影响不大）。
    - 去掉了用户/审批/可见性，所有文献即入即索。
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

from core.config import get_settings, reload_settings
from core.ids import new_id
from core.logging import elapsed
from core.store import Store

from rag.exceptions import RagError
from rag.types import AnswerResult, RetrievedChunk
from rag.chunker import Chunker
from rag.embedder import Embedder
from rag.llm import LLMClient
from .parsers.service import DocumentParser, image_page, sha256_of
from rag.prompts import (INSUFFICIENT_EVIDENCE_ANSWER, build_citations,
                      build_context, build_messages, extractive_answer)
from rag.vectorstore import VectorStore

logger = logging.getLogger(__name__)

INGEST_STAGES = [
    ("parsing", "解析文档"),
    ("chunking", "分块"),
    ("embedding", "向量化"),
    ("indexing", "写入索引"),
]

# 段落的正文里没内联配图时，最多补几张"同页的版面配图"，避免把整页的图
# 一股脑塞给每个段落。
_FALLBACK_IMAGE_LIMIT = 3


def _page_images_map(artifacts: Dict[str, Any]) -> Dict[int, List[str]]:
    """把版面配图按页码建索引。

    用途：问"系统总体架构图"命中的通常是没有内联图片的纯文字段落，
    但那张图就在同一页上——按页兜底，答案才带得上原文配图。
    """
    mapping: Dict[int, List[str]] = {}
    for item in (artifacts.get("images") or []):
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not url:
            continue
        page = item.get("page")
        if not isinstance(page, int):
            # 老数据没有 page 字段，就从文件名兜底解析（image_003_0015.png -> 3）
            page = image_page(str(item.get("file") or ""))
        if isinstance(page, int):
            mapping.setdefault(page, []).append(url)
    return mapping


class RagPipeline:
    """RAG 的主干。所有对外能力都从这里暴露。"""

    def __init__(self, settings: Optional[Any] = None):
        self.settings = settings or get_settings()
        self.store = Store(self.settings.database_path)
        self.vectorstore = VectorStore(self.settings.vector_index_path)
        self.parser = DocumentParser(mode=self.settings.parser_mode)
        self.chunker = Chunker(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            min_chunk_tokens=self.settings.min_chunk_tokens,
        )
        self.embedder = Embedder(self.settings)
        self.llm = LLMClient(
            base_url=self.settings.llm_base_url,
            api_key=self.settings.llm_api_key,
            model=self.settings.llm_model,
            endpoint=self.settings.llm_endpoint,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
            timeout=self.settings.llm_timeout,
        )
        self._lock = threading.Lock()

    # ================================================================ 热更新
    def reconfigure(self) -> Dict[str, Any]:
        """设置页保存配置后调用：重读配置并重建 LLM / 嵌入 / 解析客户端。

        不用重启服务即可生效。注意检索索引本身不变——换了嵌入模型需要重建索引，
        这里会在返回值里提示调用方。
        """
        previous_embed = self.embedder.provider
        previous_model = self.embedder.describe().get("model")

        self.settings = reload_settings()
        self.parser = DocumentParser(mode=self.settings.parser_mode)
        self.embedder = Embedder(self.settings)
        self.llm = LLMClient(
            base_url=self.settings.llm_base_url,
            api_key=self.settings.llm_api_key,
            model=self.settings.llm_model,
            endpoint=self.settings.llm_endpoint,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
            timeout=self.settings.llm_timeout,
        )

        try:
            from rag.parsers.ppsv3_adapter import invalidate_cache
            invalidate_cache()
        except Exception:  # 探测缓存清不掉不影响主流程
            pass

        changed_embed = self.embedder.provider != previous_embed
        return {
            "llm_enabled": self.llm.enabled,
            "embed_provider": self.embedder.provider,
            "embed_provider_changed": changed_embed,
            "previous_embed_model": previous_model,
            "needs_reindex": changed_embed,
        }

    # ================================================================ 录入
    def register_document(self, title: str, source: str = "", tags: Optional[List[str]] = None,
                          file_name: str = "", file_ext: str = "", file_size: int = 0,
                          file_hash: str = "", file_path: str = "") -> Dict[str, Any]:
        doc_id = new_id("document")
        self.store.create_document({
            "id": doc_id,
            "title": title or file_name or "未命名文献",
            "source": source or "",
            "file_name": file_name,
            "file_ext": file_ext,
            "file_size": file_size,
            "file_hash": file_hash,
            "file_path": file_path,
            "status": "queued",
            "stage": "pending",
            "tags": list(tags or []),
        })
        return self.store.get_document(doc_id)  # type: ignore[return-value]

    def submit_ingest(self, document_id: str, payload: bytes, filename: str = "",
                      ext: str = "") -> Dict[str, Any]:
        """后台线程执行摄入，立即返回 job（前端据此轮询进度）。"""
        job = self.store.create_job({
            "id": new_id("job"),
            "document_id": document_id,
            "job_type": "ingest",
            "status": "running",
            "progress": 0,
            "stage": "parsing",
            "message": "已排队，开始解析",
        })

        def runner() -> None:
            try:
                self._run_ingest(document_id, job["id"], payload, filename, ext)
            except Exception as exc:  # 任何异常都要写回 failed，不能让 UI 一直转圈
                logger.exception("摄入失败: %s", exc)
                message = str(exc)[:500]
                try:
                    self.store.update_document(document_id, status="failed", stage="failed",
                                               error_message=message)
                    self.store.update_job(job["id"], status="failed", progress=100,
                                          stage="failed", error=message,
                                          message=f"处理失败: {exc}", finished_at=_now())
                except Exception:
                    # 兜底写得也失败（例如数据库被锁），异常若逃出线程，
                    # 这个 job 会永远停在 running，前端就一直转圈。
                    logger.exception("写回失败状态时出错，job=%s 可能停留在 running", job["id"])

        threading.Thread(target=runner, daemon=True,
                         name=f"ingest-{document_id[:12]}").start()
        return job

    def ingest_sync(self, document_id: str, payload: bytes, filename: str = "",
                    ext: str = "") -> Dict[str, Any]:
        """同步执行摄入（启动脚本灌样例语料时用）。"""
        job = self.store.create_job({
            "id": new_id("job"), "document_id": document_id, "job_type": "ingest",
            "status": "running", "progress": 0, "stage": "parsing",
        })
        self._run_ingest(document_id, job["id"], payload, filename, ext)
        return self.store.get_job(job["id"])  # type: ignore[return-value]

    def _run_ingest(self, document_id: str, job_id: str, payload: bytes,
                    filename: str, ext: str) -> None:
        start = time.perf_counter()

        def progress(percent: int, stage: str, message: str) -> None:
            self.store.update_job(job_id, progress=percent, stage=stage, message=message)
            self.store.update_document(document_id, status=stage, stage=stage)

        # ---------- 1. 解析 ----------
        progress(5, "parsing", "正在解析文档")
        try:
            # 传 document_id 让版面解析能把截图归档到该文献名下
            parsed = self.parser.parse_bytes(
                payload, ext or _guess_ext(filename), filename, document_id=document_id
            )
        except RagError:
            raise
        except Exception as exc:
            raise RagError(f"解析失败: {exc}") from exc

        self.store.update_document(
            document_id,
            page_count=parsed.page_count,
            parser=parsed.parser,
            meta={"quality": parsed.quality, "artifacts": _public_artifacts(parsed.artifacts)},
        )
        progress(30, "chunking", f"解析完成（{parsed.page_count} 页 / {len(parsed.blocks)} 段）")

        # ---------- 2. 分块 ----------
        parents, children = self.chunker.split(document_id, parsed)
        if not children:
            raise RagError("分块结果为空，文档可能没有有效正文")

        # 章节与段落在同一个事务里落地：中途失败不会留下"有章节没段落"的半篇文献
        self.store.replace_structure(
            document_id,
            sections=[{
                "id": p.id, "parent_key": p.parent_key, "section_id": p.section_id,
                "section_title": p.section_title, "section_path": p.section_path,
                "level": p.level, "preview": p.preview, "page_start": p.page_start,
                "page_end": p.page_end, "child_count": p.child_count,
            } for p in parents],
            chunks=[{
                "id": c.id, "chunk_id": c.chunk_id, "parent_key": c.parent_key,
                "section_title": c.section_title, "section_path": c.section_path,
                "content": c.content, "page_start": c.page_start, "page_end": c.page_end,
                "chunk_index": c.chunk_index, "index_in_parent": c.index_in_parent,
                "token_count": c.token_count, "embedding_status": "not_embedded",
                "meta": {"images": c.images} if c.images else {},
            } for c in children],
        )
        progress(45, "embedding", f"完成分块（{len(parents)} 章节 / {len(children)} 段落）")

        # ---------- 3. 嵌入 ----------
        texts = [c.content for c in children]
        vectors = self._embed_with_progress(texts, job_id, document_id, 45, 85)
        if len(vectors) != len(children):
            raise RagError("嵌入结果数量与分块数量不一致")

        # ---------- 4. 写向量库 ----------
        progress(88, "indexing", "正在写入向量索引")
        with self._lock:
            self.vectorstore.replace_document(
                document_id,
                [(c.chunk_id, vectors[i], c.content) for i, c in enumerate(children)],
            )
        self.store.mark_chunks_embedded(document_id)

        total_tokens = sum(c.token_count for c in children)
        progress(100, "ready", "索引完成")
        self.store.update_document(
            document_id,
            status="ready", stage="ready", error_message=None,
            chunk_count=len(children), token_count=total_tokens,
            embed_provider=self.embedder.provider,
        )
        self.store.update_job(
            job_id, status="succeeded", progress=100, stage="ready",
            message=f"处理完成：{len(children)} 个段落，耗时 {elapsed(start)} ms",
            finished_at=_now(),
        )
        logger.info("摄入完成 %s：%s 段 / %s ms", document_id, len(children), elapsed(start))

    def _embed_with_progress(self, texts: Sequence[str], job_id: str, document_id: str,
                             start_pct: int, end_pct: int) -> List[List[float]]:
        batch = 16
        results: List[List[float]] = []
        total = len(texts)
        for offset in range(0, total, batch):
            chunk_texts = list(texts[offset:offset + batch])
            results.extend(self.embedder.embed_passages(chunk_texts))
            done = min(offset + batch, total)
            pct = start_pct + int((end_pct - start_pct) * done / max(total, 1))
            self.store.update_job(job_id, progress=pct, stage="embedding",
                                  message=f"正在向量化 {done}/{total}")
        return results

    def reingest(self, document_id: str) -> Dict[str, Any]:
        doc = self.store.get_document(document_id)
        if not doc:
            raise RagError("文献不存在")
        if not doc.get("file_path"):
            raise RagError("该文献没有本地文件，无法重新解析")
        path = Path(doc["file_path"])
        if not path.exists():
            raise RagError("原始文件已丢失，无法重新解析")
        self.store.update_document(document_id, status="queued", stage="pending",
                                   error_message=None)
        return self.submit_ingest(document_id, path.read_bytes(),
                                  doc.get("file_name") or "", doc.get("file_ext") or "")

    def delete_document(self, document_id: str) -> bool:
        with self._lock:
            self.vectorstore.delete_document(document_id)
        doc = self.store.get_document(document_id)
        if doc and doc.get("file_path"):
            try:
                Path(doc["file_path"]).unlink(missing_ok=True)  # type: ignore[call-arg]
            except OSError:
                pass
        # 版面截图跟着文献一起走，否则 data/assets 会无限堆积孤儿图片
        import shutil

        assets_dir = self.settings.data_dir / "assets" / document_id
        try:
            shutil.rmtree(assets_dir, ignore_errors=True)
        except OSError:
            pass
        return self.store.delete_document(document_id)

    # ================================================================ 检索
    def search(self, query: str, top_k: Optional[int] = None,
               document_ids: Optional[Sequence[str]] = None) -> List[RetrievedChunk]:
        query = (query or "").strip()
        if not query:
            return []
        top_k = max(1, min(top_k or self.settings.top_k, self.settings.max_top_k))
        start = time.perf_counter()

        query_vec = self.embedder.embed_query(query)
        hits = self.vectorstore.hybrid_search(
            query=query, query_vec=query_vec, top_k=top_k, document_ids=document_ids,
            sparse_weight=self.settings.bm25_weight, enable_sparse=self.settings.enable_bm25,
        )
        if not hits:
            return []

        details = self.store.get_chunks_by_keys([key for key, *_ in hits])
        results: List[RetrievedChunk] = []
        for chunk_id, fused, dense, sparse in hits:
            item = details.get(chunk_id)
            if not item:
                continue
            if fused < self.settings.min_relevance:
                continue
            results.append(RetrievedChunk(
                chunk_id=chunk_id,
                document_id=item["document_id"],
                document_title=item.get("document_title") or "",
                content=item["content"],
                score=fused, dense_score=dense, sparse_score=sparse,
                parent_key=item.get("parent_key") or "",
                section_title=item.get("section_title") or "",
                section_path=item.get("section_path") or [],
                page_start=item.get("page_start"), page_end=item.get("page_end"),
                token_count=item.get("token_count") or 0,
                images=item.get("images") or [],
            ))
        # 段落正文没内联配图时，用同页的版面配图兜底：问"图 3 的架构图"
        # 命中的往往是没有配图的纯文字段落，但那张图就在同一页上。
        # 只在检索结果上补，文献详情的段落列表不受影响（否则会被同页配图刷屏）。
        self._fill_page_images(results)

        logger.debug("检索 %r 命中 %s 条（%s ms）", query[:30], len(results), elapsed(start))
        return results

    def _fill_page_images(self, results: List[RetrievedChunk]) -> None:
        """给没有内联配图的检索结果补上同页的版面配图（每段最多 3 张）。"""
        cache: Dict[str, Dict[int, List[str]]] = {}
        for item in results:
            if item.images:
                continue
            doc_id = item.document_id
            if doc_id not in cache:
                doc = self.store.get_document(doc_id) or {}
                cache[doc_id] = _page_images_map((doc.get("meta") or {}).get("artifacts") or {})
            page_images = cache[doc_id]
            if not page_images:
                continue
            start = item.page_start or 0
            end = item.page_end or start
            for page in range(start, end + 1):
                for url in page_images.get(page, []):
                    if url not in item.images:
                        item.images.append(url)
            del item.images[_FALLBACK_IMAGE_LIMIT:]

    # ================================================================ 生成
    def answer(self, question: str, top_k: Optional[int] = None,
               document_ids: Optional[Sequence[str]] = None,
               temperature: Optional[float] = None,
               max_tokens: Optional[int] = None) -> AnswerResult:
        start = time.perf_counter()
        chunks = self.search(question, top_k=top_k, document_ids=document_ids)

        if not chunks:
            return AnswerResult(answer=INSUFFICIENT_EVIDENCE_ANSWER, retrieval=[],
                                generation_mode="none", latency_ms=elapsed(start))

        context = build_context(chunks, self.settings.max_context_chars)

        if not self.llm.enabled:
            text = extractive_answer(question, chunks)
            return AnswerResult(
                answer=text, citations=build_citations(text, chunks, self.settings.max_citations,
                                                       self.settings.quote_chars),
                retrieval=chunks, generation_mode="extractive",
                latency_ms=elapsed(start), context_chars=len(context),
            )

        messages = build_messages(question, context)
        try:
            result = self.llm.chat(messages, temperature=temperature, max_tokens=max_tokens)
        except RagError as exc:
            # 生成失败时不丢弃检索成果，降级为抽取式，保证"问了就有回应"
            logger.warning("生成失败，降级为抽取式作答: %s", exc)
            text = extractive_answer(question, chunks)
            return AnswerResult(
                answer=text, citations=build_citations(text, chunks, self.settings.max_citations,
                                                       self.settings.quote_chars),
                retrieval=chunks, generation_mode="extractive-fallback",
                latency_ms=elapsed(start), context_chars=len(context),
            )

        text = (result.get("content") or "").strip()
        return AnswerResult(
            answer=text or INSUFFICIENT_EVIDENCE_ANSWER,
            citations=build_citations(text, chunks, self.settings.max_citations,
                                      self.settings.quote_chars),
            retrieval=chunks, generation_mode="llm",
            model=result.get("model") or self.settings.llm_model,
            usage=result.get("usage") or {},
            latency_ms=elapsed(start), context_chars=len(context),
        )

    def stream_answer(self, question: str, top_k: Optional[int] = None,
                      document_ids: Optional[Sequence[str]] = None,
                      temperature: Optional[float] = None,
                      max_tokens: Optional[int] = None) -> Iterator[Dict[str, Any]]:
        """产出 SSE 事件字典：meta / retrieval / delta / done / error。"""
        start = time.perf_counter()
        try:
            chunks = self.search(question, top_k=top_k, document_ids=document_ids)
        except Exception as exc:
            yield {"event": "error", "data": {"code": "retrieval_failed", "message": str(exc)}}
            return

        yield {
            "event": "retrieval",
            "data": {
                "query": question,
                "top_k": top_k or self.settings.top_k,
                "returned": len(chunks),
                "chunks": [chunk.to_dict(include_content=False) for chunk in chunks],
            },
        }

        if not chunks:
            yield {"event": "meta", "data": {"generation_mode": "none"}}
            for piece in _chunk_text(INSUFFICIENT_EVIDENCE_ANSWER):
                yield {"event": "delta", "data": {"text": piece}}
            yield {
                "event": "done",
                "data": {"answer": INSUFFICIENT_EVIDENCE_ANSWER, "citations": [],
                         "generation_mode": "none", "latency_ms": elapsed(start)},
            }
            return

        context = build_context(chunks, self.settings.max_context_chars)
        mode = "llm" if self.llm.enabled else "extractive"
        yield {"event": "meta", "data": {
            "generation_mode": mode,
            "model": self.settings.llm_model if self.llm.enabled else None,
            "context_chars": len(context),
        }}

        if not self.llm.enabled:
            text = extractive_answer(question, chunks)
            for piece in _chunk_text(text):
                yield {"event": "delta", "data": {"text": piece}}
            yield {
                "event": "done",
                "data": {
                    "answer": text,
                    "citations": build_citations(text, chunks, self.settings.max_citations,
                                                 self.settings.quote_chars),
                    "generation_mode": "extractive",
                    "latency_ms": elapsed(start),
                    "context_chars": len(context),
                },
            }
            return

        messages = build_messages(question, context)
        buffer: List[str] = []
        try:
            for delta in self.llm.stream(messages, temperature=temperature, max_tokens=max_tokens):
                buffer.append(delta)
                yield {"event": "delta", "data": {"text": delta}}
        except RagError as exc:
            # 已经流出的部分保留，再补一句降级说明，避免用户看到半截答案
            notice = f"\n\n> ⚠ 生成中断（{exc.message}），以下为证据摘录：\n\n"
            yield {"event": "delta", "data": {"text": notice}}
            fallback = extractive_answer(question, chunks)
            for piece in _chunk_text(fallback):
                yield {"event": "delta", "data": {"text": piece}}
            yield {
                "event": "done",
                "data": {
                    "answer": "".join(buffer) + notice + fallback,
                    "citations": build_citations(fallback, chunks, self.settings.max_citations,
                                                 self.settings.quote_chars),
                    "generation_mode": "extractive-fallback",
                    "latency_ms": elapsed(start),
                    "context_chars": len(context),
                },
            }
            return

        text = "".join(buffer).strip() or INSUFFICIENT_EVIDENCE_ANSWER
        yield {
            "event": "done",
            "data": {
                "answer": text,
                "citations": build_citations(text, chunks, self.settings.max_citations,
                                             self.settings.quote_chars),
                "generation_mode": "llm",
                "model": self.settings.llm_model,
                "latency_ms": elapsed(start),
                "context_chars": len(context),
            },
        }

    # ================================================================ 诊断
    def capabilities(self) -> Dict[str, Any]:
        from .parsers.paddle_adapter import describe as describe_ocr
        try:
            ocr = describe_ocr()
        except Exception:
            ocr = {"installed": False}
        return {
            "llm": self.llm.describe(),
            "embedding": self.embedder.describe(),
            "bm25": self.settings.enable_bm25,
            "ocr": ocr,
            "parser_mode": self.settings.parser_mode,
            "config": {
                "chunk_size": self.settings.chunk_size,
                "chunk_overlap": self.settings.chunk_overlap,
                "top_k": self.settings.top_k,
                "bm25_weight": self.settings.bm25_weight,
                "max_context_chars": self.settings.max_context_chars,
                "max_upload_mb": self.settings.max_upload_mb,
                "allowed_extensions": self.settings.allowed_extensions,
            },
        }

    def stats(self) -> Dict[str, Any]:
        data = self.store.stats()
        data.update({"vectors": self.vectorstore.count()})
        return data


# ---------------------------------------------------------------------------
def _now() -> str:
    from core.store import now_iso
    return now_iso()


def _guess_ext(filename: str) -> str:
    return Path(filename).suffix.lower() if filename else ".txt"


def _public_artifacts(artifacts: Dict[str, Any]) -> Dict[str, Any]:
    """挑出值得存进 documents.meta 的解析产物。

    图片清单也放行——文献详情要能展示版面截图。但整篇可能有上百张，
    这里只留前 60 张，避免 meta 被撑爆；完整清单仍随段落存在 chunks 里。
    """
    out: Dict[str, Any] = {}
    for key, value in (artifacts or {}).items():
        if key in ("sha256", "page_mode", "bytes"):
            out[key] = value
        elif key == "images" and isinstance(value, list):
            out["images"] = value[:60]
            out["image_count"] = len(value)
    return out


def _chunk_text(text: str, size: int = 24) -> Iterator[str]:
    """把长文本切成小片，让打字机效果更自然。"""
    for offset in range(0, len(text), size):
        yield text[offset:offset + size]
