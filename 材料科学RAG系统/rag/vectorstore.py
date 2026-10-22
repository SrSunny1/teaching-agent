"""向量库 + BM25 混合检索（纯 Python 实现，可选 numpy 加速）。

原项目用 Milvus（HNSW + COSINE）。插件化之后不能再要求用户先起一套
Milvus + etcd + MinIO，所以这里换成：**内存倒排 + 稠密向量线性扫描**，
并把索引落盘成一个 JSON 文件。

规模判断：线性扫描的复杂度是 O(块数 × 维度)。在几万段落以内
（本插件的定位：个人/团队的知识库），毫秒级完成，完全够用；
若 numpy 可用会自动切换成矩阵运算，速度再提升一个量级。
"""

from __future__ import annotations

import functools
import json
import logging
import math
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from rag.text_utils import tokenize_for_bm25

logger = logging.getLogger(__name__)

try:  # numpy 只是可选加速项
    import numpy as _np  # type: ignore
except Exception:  # pragma: no cover
    _np = None  # type: ignore

_BM25_K1 = 1.5
_BM25_B = 0.75
_INDEX_VERSION = 1


def _synchronized(method):
    """把方法体包进实例的可重入锁。

    入库在后台线程写 items/_df/_matrix，检索在请求线程读它们；
    不加锁时检索会撞上 "dictionary changed size during iteration"，
    或读到已被置空的 _matrix 而抛 TypeError。
    """

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)

    return wrapper


class VectorStore:
    """单文件向量索引：稠密向量 + BM25 稀疏通道。"""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        self.items: Dict[str, Dict[str, Any]] = {}   # chunk_id -> {doc, vec, text, tf}
        self._df: Dict[str, int] = {}
        self._total_len = 0
        self._matrix = None                          # numpy 加速缓存
        self._keys: List[str] = []
        self._dirty = False

        # 入库跑在后台线程，检索跑在请求线程：两者会同时碰 items/_df/_matrix。
        # 没有这把锁时，入库期间检索会抛 "dictionary changed size during iteration"。
        # 用 RLock 是因为 hybrid_search 会再调 dense_search / bm25_search。
        self._lock = threading.RLock()
        self.load()

    # ---------------------------------------------------------------- 持久化
    @_synchronized
    def load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("向量索引读取失败，将以空索引启动: %s", exc)
            return
        if int(raw.get("version", 0)) != _INDEX_VERSION:
            logger.warning("向量索引版本不匹配，已忽略旧索引")
            return
        for chunk_id, item in (raw.get("items") or {}).items():
            vector = item.get("vec") or []
            self.items[chunk_id] = {
                "doc": item.get("doc"),
                "vec": vector,
                "text": item.get("text", ""),
                "tf": item.get("tf") or {},
                "len": int(item.get("len") or 0),
            }
        self._rebuild_stats()
        logger.info("已加载向量索引：%s 条", len(self.items))

    @_synchronized
    def save(self) -> None:
        payload = {
            "version": _INDEX_VERSION,
            "count": len(self.items),
            "items": {
                chunk_id: {
                    "doc": item["doc"],
                    "vec": [round(float(v), 5) for v in item["vec"]],
                    "text": item.get("text", ""),
                    "tf": item.get("tf") or {},
                    "len": item.get("len") or 0,
                }
                for chunk_id, item in self.items.items()
            },
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # 原子写：先写临时文件再替换，避免中途崩溃写坏索引
        fd, tmp_name = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fp:
                json.dump(payload, fp, ensure_ascii=False)
            os.replace(tmp_name, self.path)
        finally:
            if os.path.exists(tmp_name):
                try:
                    os.remove(tmp_name)
                except OSError:
                    pass
        self._dirty = False

    def _rebuild_stats(self) -> None:
        self._df = {}
        self._total_len = 0
        for item in self.items.values():
            self._total_len += item.get("len") or 0
            for token in (item.get("tf") or {}):
                self._df[token] = self._df.get(token, 0) + 1
        self._matrix = None
        self._keys = []

    # ---------------------------------------------------------------- 写入
    @_synchronized
    def replace_document(self, document_id: str, records: Sequence[Tuple[str, List[float], str]]) -> int:
        """整体替换一篇文献的向量。records = [(chunk_id, vector, text), ...]"""
        # persist=False：索引随后就整体重写一次，这里不必先序列化一遍
        removed = self.delete_document(document_id, persist=False)
        for chunk_id, vector, text in records:
            tokens = tokenize_for_bm25(text)
            tf: Dict[str, int] = {}
            for token in tokens:
                tf[token] = tf.get(token, 0) + 1
            self.items[chunk_id] = {
                "doc": document_id,
                "vec": list(vector),
                "text": text,
                "tf": tf,
                "len": len(tokens),
            }
            self._total_len += len(tokens)
            for token in tf:
                self._df[token] = self._df.get(token, 0) + 1
        self._matrix = None
        self._dirty = True
        if records or removed:
            self.save()
        return len(records)

    @_synchronized
    def delete_document(self, document_id: str, persist: bool = True) -> int:
        removed = 0
        for chunk_id in [key for key, item in self.items.items() if item.get("doc") == document_id]:
            item = self.items.pop(chunk_id)
            removed += 1
            self._total_len -= item.get("len") or 0
            for token in (item.get("tf") or {}):
                self._df[token] = self._df.get(token, 0) - 1
                if self._df[token] <= 0:
                    self._df.pop(token, None)
        if removed:
            self._matrix = None
            self._dirty = True
            if persist:
                self.save()
        return removed

    @_synchronized
    def has_document(self, document_id: str) -> bool:
        return any(item.get("doc") == document_id for item in self.items.values())

    # ---------------------------------------------------------------- 检索
    @_synchronized
    def count(self) -> int:
        return len(self.items)

    def _ensure_matrix(self) -> None:
        if _np is None or self._matrix is not None:
            return
        if not self.items:
            self._keys, self._matrix = [], None
            return
        self._keys = list(self.items.keys())
        dim = len(self.items[self._keys[0]]["vec"])
        matrix = _np.zeros((len(self._keys), dim), dtype=_np.float32)
        for row, key in enumerate(self._keys):
            matrix[row] = _np.asarray(self.items[key]["vec"], dtype=_np.float32)
        self._matrix = matrix

    @_synchronized
    def dense_search(self, query_vec: Sequence[float], top_k: int,
                     document_ids: Optional[Iterable[str]] = None) -> List[Tuple[str, float]]:
        if not self.items:
            return []
        allowed = set(document_ids) if document_ids else None

        if _np is not None:
            self._ensure_matrix()
            if self._matrix is not None:
                query = _np.asarray(query_vec, dtype=_np.float32)
                query_norm = _np.linalg.norm(query)
                if query_norm == 0:
                    return []
                scores = (self._matrix @ query) / (
                    _np.linalg.norm(self._matrix, axis=1) * query_norm + 1e-9)
                pairs = []
                for index, score in enumerate(scores):
                    key = self._keys[index]
                    item = self.items[key]
                    if allowed is not None and item.get("doc") not in allowed:
                        continue
                    pairs.append((key, float(score)))
                pairs.sort(key=lambda pair: pair[1], reverse=True)
                return pairs[:top_k]

        query_norm = math.sqrt(sum(value * value for value in query_vec)) or 1.0
        pairs: List[Tuple[str, float]] = []
        for chunk_id, item in self.items.items():
            if allowed is not None and item.get("doc") not in allowed:
                continue
            vector = item["vec"]
            if len(vector) != len(query_vec):
                continue
            dot = 0.0
            norm = 0.0
            for left, right in zip(vector, query_vec):
                dot += left * right
                norm += left * left
            denom = (math.sqrt(norm) or 1.0) * query_norm
            pairs.append((chunk_id, dot / denom if denom else 0.0))
        pairs.sort(key=lambda pair: pair[1], reverse=True)
        return pairs[:top_k]

    @_synchronized
    def bm25_search(self, query: str, top_k: int,
                    document_ids: Optional[Iterable[str]] = None) -> List[Tuple[str, float]]:
        tokens = set(tokenize_for_bm25(query))
        if not tokens or not self.items:
            return []
        allowed = set(document_ids) if document_ids else None
        total = len(self.items)
        avg_len = (self._total_len / total) if total else 1.0

        scores: Dict[str, float] = {}
        for token in tokens:
            df = self._df.get(token, 0)
            if df == 0:
                continue
            idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
            for chunk_id, item in self.items.items():
                if allowed is not None and item.get("doc") not in allowed:
                    continue
                tf = (item.get("tf") or {}).get(token)
                if not tf:
                    continue
                length = item.get("len") or 1
                denom = tf + _BM25_K1 * (1 - _BM25_B + _BM25_B * length / avg_len)
                scores[chunk_id] = scores.get(chunk_id, 0.0) + idf * tf * (_BM25_K1 + 1) / denom

        pairs = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
        return pairs[:top_k]

    @_synchronized
    def hybrid_search(self, query: str, query_vec: Sequence[float], top_k: int,
                      document_ids: Optional[Iterable[str]] = None,
                      sparse_weight: float = 0.35,
                      enable_sparse: bool = True
                      ) -> List[Tuple[str, float, float, float]]:
        """返回 [(chunk_id, 融合分, 稠密分, 稀疏分)]。"""

        fetch = max(top_k * 3, top_k + 10)
        dense = dict(self.dense_search(query_vec, fetch, document_ids))
        sparse = dict(self.bm25_search(query, fetch, document_ids)) if enable_sparse else {}

        dense_max = max(dense.values(), default=1.0) or 1.0
        sparse_max = max(sparse.values(), default=1.0) or 1.0
        dense_w = 1.0 - sparse_weight

        keys = set(dense) | set(sparse)
        results: List[Tuple[str, float, float, float]] = []
        for key in keys:
            d_score = dense.get(key, 0.0) / (abs(dense_max) or 1.0)
            s_score = sparse.get(key, 0.0) / (abs(sparse_max) or 1.0)
            fused = dense_w * d_score + sparse_weight * s_score
            results.append((key, fused, dense.get(key, 0.0), sparse.get(key, 0.0)))
        results.sort(key=lambda item: item[1], reverse=True)
        return results[:top_k]

    # ---------------------------------------------------------------- 诊断
    @_synchronized
    def stats(self) -> Dict[str, Any]:
        return {
            "vectors": len(self.items),
            "documents": len({item.get("doc") for item in self.items.values()}),
            "vocab": len(self._df),
            "accelerated": _np is not None,
        }
