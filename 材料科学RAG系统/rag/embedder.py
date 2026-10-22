"""嵌入层：三级降级，保证任何环境都能跑通 RAG 全流程。

    api    -> 调用 OpenAI 兼容的 /embeddings（SiliconFlow / 智谱 / 本地 Ollama 等）
    local  -> 进程内加载 sentence-transformers / FlagEmbedding（若已安装）
    hash   -> 纯 Python 的哈希词袋向量（零依赖兜底）

降级是自动的：没 Key / 网络不通 / 模型缺失，都不会让流水线中断，
只是检索质量从"语义级"降到"词法级"，并在元数据里如实标注，
让上层 UI 能明确告诉用户当前处于哪种模式。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Sequence, Tuple

from rag.exceptions import EmbeddingError
from rag.text_utils import tokenize_for_bm25

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[a-z0-9]+")


def _stable_index(token: str, dim: int, salt: str = "") -> int:
    """跨进程稳定的哈希索引（不能用 Python 内置 hash，字符串哈希带随机盐）。"""
    digest = hashlib.md5((salt + token).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % dim


class HashEmbedder:
    """零依赖哈希向量：把词/字二元组投影到固定维度并 L2 归一化。

    语义能力有限，但对"同一批术语反复出现"的文献检索其实相当有效，
    足够支撑一次完整的端到端演示。
    """

    def __init__(self, dim: int = 512):
        self.dim = dim

    @property
    def name(self) -> str:
        return "hash"

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        return [self._one(text) for text in texts]

    def _one(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        if not text:
            return vec

        for token in tokenize_for_bm25(str(text)):
            vec[_stable_index(token, self.dim)] += 1.0

        words = _WORD_RE.findall(str(text).lower())
        for token in words:
            vec[_stable_index("w:" + token, self.dim)] += 1.0
        for first, second in zip(words, words[1:]):
            vec[_stable_index("b:" + first + "_" + second, self.dim)] += 0.5

        norm = sum(value * value for value in vec) ** 0.5
        if norm > 0:
            vec = [value / norm for value in vec]
        return vec


class ApiEmbedder:
    """OpenAI 兼容 /embeddings 接口（同时兼容自部署的 bge-m3 服务）。"""

    def __init__(self, base_url: str, api_key: str, model: str,
                 endpoint: str = "/embeddings", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or ""
        self.model = model
        self.endpoint = endpoint if endpoint.startswith("/") else "/" + endpoint
        self.timeout = timeout
        self._dim: Optional[int] = None

    @property
    def name(self) -> str:
        return "api"

    @property
    def dim(self) -> Optional[int]:
        return self._dim

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []
        # 大多数服务端对单批条数有限制，切片发送
        out: List[List[float]] = []
        batch_size = 16
        for start in range(0, len(texts), batch_size):
            out.extend(self._request(list(texts[start:start + batch_size])))
        return out

    def _request(self, batch: List[str]) -> List[List[float]]:
        last_error: Optional[Exception] = None
        # 先按 OpenAI 标准用 "input"，失败再退回自部署服务的 "texts"
        for payload_key in ("input", "texts"):
            payload = {"model": self.model, payload_key: batch}
            try:
                raw = self._post(payload)
                vectors = self._extract_vectors(raw)
                if vectors and len(vectors) == len(batch):
                    if self._dim is None and vectors:
                        self._dim = len(vectors[0])
                    return vectors
                raise EmbeddingError(
                    f"嵌入服务返回的向量数量不匹配（期望 {len(batch)}，实际 {len(vectors or [])}）"
                )
            except Exception as exc:
                last_error = exc
                continue
        raise EmbeddingError(f"嵌入服务调用失败: {last_error}")

    def _post(self, payload: Dict[str, Any]) -> Any:
        url = self.base_url + self.endpoint
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=self.timeout) as response:
            body = response.read().decode("utf-8")
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise EmbeddingError(f"嵌入服务返回的不是合法 JSON: {body[:200]}") from exc

    @staticmethod
    def _extract_vectors(raw: Any) -> List[List[float]]:
        """兼容四种常见响应形态。"""
        if isinstance(raw, list):
            if raw and isinstance(raw[0], (int, float)):
                return [list(raw)]
            return [list(item) for item in raw]
        if not isinstance(raw, dict):
            return []
        for key in ("vectors", "embeddings", "embedding", "data"):
            if key not in raw:
                continue
            value = raw[key]
            if key == "data" and isinstance(value, list):
                vectors = []
                for item in value:
                    if isinstance(item, dict) and "embedding" in item:
                        vectors.append(list(item["embedding"]))
                    elif isinstance(item, list):
                        vectors.append(list(item))
                return vectors
            if isinstance(value, list):
                if value and isinstance(value[0], (int, float)):
                    return [list(value)]
                return [list(item) for item in value]
        return []


class LocalEmbedder:
    """进程内模型（sentence-transformers / FlagEmbedding），仅在已安装时启用。"""

    def __init__(self, model_name: str = "BAAI/bge-m3", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self._model = None
        self._kind = ""

    @property
    def name(self) -> str:
        return "local"

    def load(self) -> bool:
        if self._model is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            self._model = SentenceTransformer(self.model_name, device=self.device)
            self._kind = "sentence-transformers"
            return True
        except Exception:
            pass
        try:
            from FlagEmbedding import BGEM3FlagModel  # type: ignore
            self._model = BGEM3FlagModel(self.model_name, use_fp16=False, devices=[self.device])
            self._kind = "flagembedding"
            return True
        except Exception as exc:
            logger.debug("本地嵌入模型不可用: %s", exc)
            return False

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not self.load():
            raise EmbeddingError("本地嵌入模型不可用")
        if self._kind == "sentence-transformers":
            vectors = self._model.encode(
                list(texts), batch_size=8, normalize_embeddings=True, show_progress_bar=False)
            return [list(map(float, vector)) for vector in vectors]
        output = self._model.encode(list(texts), batch_size=8, max_length=2048)
        dense = output.get("dense_vecs", [])
        return [list(map(float, vector)) for vector in dense]


class Embedder:
    """统一入口：按优先级选择实现，并在失败时自动降级。"""

    def __init__(self, settings: Any):
        self.settings = settings
        self.impl: Any = HashEmbedder(settings.embedding_dim)
        self.provider = "hash"
        self.model = "hash-bow"
        self.notes: List[str] = []
        self._dim = int(settings.embedding_dim)
        self._select()

    # ---------------------------------------------------------------- 选择实现
    def _select(self) -> None:
        mode = (self.settings.embedding_provider or "auto").lower()

        if mode in ("auto", "api"):
            if self.settings.embedding_api_key and self.settings.embedding_base_url:
                try:
                    candidate = ApiEmbedder(
                        base_url=self.settings.embedding_base_url,
                        api_key=self.settings.embedding_api_key,
                        model=self.settings.embedding_model,
                        endpoint=self.settings.embedding_endpoint,
                        timeout=self.settings.embedding_timeout,
                    )
                    # 用一次极小请求探活，避免整条流水线在中途才失败
                    probe = candidate.embed(["材料科学"])
                    if probe and probe[0]:
                        self.impl, self.provider = candidate, "api"
                        self.model = self.settings.embedding_model
                        self._dim = len(probe[0])
                        return
                except Exception as exc:
                    self.notes.append(f"远端嵌入不可用（{type(exc).__name__}），已降级")

        if mode in ("auto", "local"):
            try:
                candidate = LocalEmbedder(self.settings.embedding_model)
                if candidate.load():
                    probe = candidate.embed(["材料科学"])
                    if probe and probe[0]:
                        self.impl, self.provider = candidate, "local"
                        self.model = self.settings.embedding_model
                        self._dim = len(probe[0])
                        return
            except Exception as exc:
                self.notes.append(f"本地嵌入不可用（{type(exc).__name__}），已降级")

        self.impl = HashEmbedder(self.settings.embedding_dim)
        self.provider = "hash"
        self.model = "hash-bow"
        self._dim = self.settings.embedding_dim
        self.notes.append("当前使用零依赖哈希向量，检索为词法级；配置 API Key 后可升级为语义检索")

    # ---------------------------------------------------------------- 对外接口
    @property
    def dim(self) -> int:
        return self._dim

    def embed_passages(self, texts: Sequence[str]) -> List[List[float]]:
        return self.impl.embed(list(texts))

    def embed_query(self, text: str) -> List[float]:
        vectors = self.impl.embed([text])
        if not vectors:
            raise EmbeddingError("嵌入结果为空")
        return vectors[0]

    def describe(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "dim": self._dim,
            "notes": list(self.notes),
        }
