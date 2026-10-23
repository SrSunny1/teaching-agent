"""LLM 客户端：OpenAI 兼容接口，支持流式。

零依赖：用标准库 urllib 发请求（并绕过系统代理，避免 Windows 上
localhost 被代理截走的老问题）。用 urllib 也能逐行读取 SSE 流。
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Iterator, List, Optional, Sequence

from rag.exceptions import GenerationError

logger = logging.getLogger(__name__)


class LLMClient:
    """DeepSeek / OpenAI 兼容 /chat/completions 客户端。"""

    def __init__(self, base_url: str, api_key: str, model: str,
                 endpoint: str = "/chat/completions",
                 temperature: float = 0.2, max_tokens: int = 2048,
                 timeout: int = 120):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = (api_key or "").strip()
        self.model = model
        self.endpoint = endpoint if endpoint.startswith("/") else "/" + endpoint
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout

    @property
    def enabled(self) -> bool:
        key = self.api_key
        return bool(self.base_url) and bool(key) and key.lower() not in {"replace_me", "none", ""}

    @property
    def url(self) -> str:
        return self.base_url + self.endpoint

    def describe(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "provider": self.base_url,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

    # ---------------------------------------------------------------- 一次性
    def chat(self, messages: Sequence[Dict[str, str]], temperature: Optional[float] = None,
             max_tokens: Optional[int] = None) -> Dict[str, Any]:
        payload = self._payload(messages, temperature, max_tokens, stream=False)
        raw = self._post(payload, stream=False)
        return self._parse_non_stream(raw)

    # ---------------------------------------------------------------- 流式
    def stream(self, messages: Sequence[Dict[str, str]], temperature: Optional[float] = None,
               max_tokens: Optional[int] = None) -> Iterator[str]:
        """逐段产出增量文本。"""
        payload = self._payload(messages, temperature, max_tokens, stream=True)
        request = self._build_request(payload)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            response = opener.open(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")[:400]
            except Exception:
                pass
            raise GenerationError(f"大模型返回 {exc.code}: {body}") from exc
        except Exception as exc:
            raise GenerationError(f"无法连接大模型服务: {exc}") from exc

        try:
            with response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = self._extract_delta(chunk)
                    if delta:
                        yield delta
        except GenerationError:
            raise
        except Exception as exc:
            raise GenerationError(f"读取流式响应失败: {exc}") from exc

    # ---------------------------------------------------------------- 内部
    def _payload(self, messages: Sequence[Dict[str, str]], temperature: Optional[float],
                 max_tokens: Optional[int], stream: bool) -> Dict[str, Any]:
        return {
            "model": self.model,
            "messages": list(messages),
            "temperature": self.temperature if temperature is None else temperature,
            "max_tokens": self.max_tokens if max_tokens is None else max_tokens,
            "stream": stream,
        }

    def _build_request(self, payload: Dict[str, Any]) -> urllib.request.Request:
        if not self.enabled:
            raise GenerationError("未配置大模型 API Key，无法调用生成服务")
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if payload.get("stream") else "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        return urllib.request.Request(self.url, data=data, headers=headers, method="POST")

    def _post(self, payload: Dict[str, Any], stream: bool = False) -> Any:
        request = self._build_request(payload)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")[:400]
            except Exception:
                pass
            raise GenerationError(f"大模型返回 {exc.code}: {detail}") from exc
        except Exception as exc:
            raise GenerationError(f"无法连接大模型服务: {exc}") from exc
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise GenerationError(f"大模型返回的不是合法 JSON: {body[:200]}") from exc

    @staticmethod
    def _extract_delta(chunk: Dict[str, Any]) -> str:
        choices = chunk.get("choices") or []
        if not choices:
            return ""
        delta = choices[0].get("delta") or {}
        if isinstance(delta, dict):
            return delta.get("content") or ""
        return choices[0].get("text") or ""

    @staticmethod
    def _parse_non_stream(raw: Dict[str, Any]) -> Dict[str, Any]:
        choices = raw.get("choices") or []
        if not choices:
            raise GenerationError(f"大模型响应缺少 choices: {str(raw)[:200]}")
        message = choices[0].get("message") or {}
        content = message.get("content") or choices[0].get("text") or ""
        usage = raw.get("usage") or {}
        return {
            "content": content,
            "model": raw.get("model", ""),
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
            },
            "finish_reason": choices[0].get("finish_reason"),
        }
