#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""材料科学 RAG 知识库 —— Python 插件客户端。

给「另一个智能体」用的最小接入方式：把 sdk/ 目录拷进你的工程，然后

    from materials_rag_client import MaterialsRagClient

    rag = MaterialsRagClient("http://127.0.0.1:8765")
    result = rag.ask("高熵合金有哪些强化机制？")
    print(result["answer"])

    流式：
    for text in rag.ask_stream("钙钛矿为什么不稳定？"):
        print(text, end="", flush=True)

零第三方依赖（只用标准库 urllib），Python 3.8+ 可直接运行。

命令行用法：
    python materials_rag_client.py --ask "问题"
    python materials_rag_client.py --search "关键词"
    python materials_rag_client.py --add-file /path/to/paper.pdf
    python materials_rag_client.py --add-text "标题" --content "正文..."
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence


class RagClientError(RuntimeError):
    """服务端返回错误或连接失败。"""

    def __init__(self, message: str, code: str = "client_error", status: int = 0):
        self.code = code
        self.status = status
        super().__init__(message)


class MaterialsRagClient:
    """材料科学 RAG 知识库的 HTTP 客户端。"""

    def __init__(self, base_url: str = "http://127.0.0.1:8765", timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        # 绕过系统代理，避免本机回环被代理截走
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    # ---------------------------------------------------------------- 底层
    def _url(self, path: str) -> str:
        return self.base_url + path

    def _request(self, path: str, method: str = "GET", payload: Any = None,
                 timeout: Optional[float] = None) -> Any:
        data = None
        headers: Dict[str, str] = {}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self._url(path), data=data, headers=headers,
                                         method=method)
        try:
            with self._opener.open(request, timeout=timeout or self.timeout) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            raise RagClientError(f"HTTP {exc.code}: {detail[:300]}", status=exc.code) from exc
        except urllib.error.URLError as exc:
            raise RagClientError(
                f"无法连接 RAG 服务（{self.base_url}）：{exc.reason}。"
                "请确认服务已启动：python start.py", code="connection_error") from exc

        try:
            envelope = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RagClientError(f"响应不是合法 JSON: {body[:200]}") from exc
        if not envelope.get("success"):
            error = envelope.get("error") or {}
            raise RagClientError(error.get("message", "未知错误"),
                                 code=error.get("code", "server_error"))
        return envelope.get("data")

    # ---------------------------------------------------------------- 状态
    def health(self) -> Dict[str, Any]:
        return self._request("/health")

    def meta(self) -> Dict[str, Any]:
        """服务能力与知识库规模，适合做插件的握手检查。"""
        return self._request("/api/meta")

    def stats(self) -> Dict[str, Any]:
        return self._request("/api/stats")

    def wait_ready(self, timeout: float = 30.0) -> bool:
        """轮询等待服务就绪（把插件和 RAG 服务一起拉起时很有用）。"""
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                self.health()
                return True
            except RagClientError:
                time.sleep(0.5)
        return False

    # ---------------------------------------------------------------- 知识库
    def list_documents(self, q: str = "", status: str = "",
                       limit: int = 100) -> List[Dict[str, Any]]:
        params = urllib.parse.urlencode({"q": q, "status": status, "limit": limit})
        return self._request(f"/api/documents?{params}")["items"]

    def get_document(self, document_id: str) -> Dict[str, Any]:
        return self._request(f"/api/documents/{document_id}")

    def delete_document(self, document_id: str) -> bool:
        return bool(self._request(f"/api/documents/{document_id}", method="DELETE")["deleted"])

    def add_file(self, path: str, title: str = "", source: str = "",
                 tags: Sequence[str] = ()) -> Dict[str, Any]:
        """上传 PDF / Markdown / 文本文件。"""
        file_path = Path(path)
        if not file_path.is_file():
            raise RagClientError(f"文件不存在: {path}", code="invalid_request")
        boundary = "----msrag" + uuid.uuid4().hex
        content = file_path.read_bytes()
        suffix = file_path.suffix.lower() or ".txt"
        mime = {".pdf": "application/pdf", ".md": "text/markdown"}.get(suffix, "text/plain")

        def field(name: str, value: str) -> bytes:
            return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
                    f"{value}\r\n").encode("utf-8")

        body = bytearray()
        body += field("title", title or file_path.stem)
        body += field("source", source or file_path.name)
        if tags:
            body += field("tags", ",".join(tags))
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                 f"filename=\"{file_path.name}\"\r\nContent-Type: {mime}\r\n\r\n").encode("utf-8")
        body += content
        body += f"\r\n--{boundary}--\r\n".encode("utf-8")

        request = urllib.request.Request(
            self._url("/api/documents/upload"), data=bytes(body), method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                envelope = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise RagClientError(f"HTTP {exc.code}: {detail}", status=exc.code) from exc
        if not envelope.get("success"):
            error = envelope.get("error") or {}
            raise RagClientError(error.get("message", "上传失败"), code=error.get("code", ""))
        return envelope["data"]

    def add_text(self, title: str, content: str, source: str = "",
                 tags: Sequence[str] = ()) -> Dict[str, Any]:
        """直接把一段文本写入知识库（无需文件）。"""
        if not content.strip():
            raise RagClientError("content 不能为空", code="invalid_request")
        return self._request("/api/documents/text", method="POST", payload={
            "title": title, "content": content, "source": source,
            "tags": ",".join(tags) if tags else "",
        })

    def wait_for_document(self, document_id: str, timeout: float = 180.0,
                          poll_interval: float = 1.0) -> Dict[str, Any]:
        """等待文献处理完成（解析 → 分块 → 嵌入 → 索引）。"""
        import time
        deadline = time.time() + timeout
        last: Dict[str, Any] = {}
        while time.time() < deadline:
            last = self.get_document(document_id)["document"]
            if last.get("status") in ("ready", "failed"):
                return last
            time.sleep(poll_interval)
        return last

    # ---------------------------------------------------------------- 检索 / 问答
    def search(self, query: str, top_k: int = 6,
               document_ids: Optional[Sequence[str]] = None) -> List[Dict[str, Any]]:
        """只检索、不生成。返回证据块列表（含 content 与相关度）。"""
        data = self._request("/api/search", method="POST", payload={
            "query": query, "top_k": top_k, "document_ids": list(document_ids or []),
        })
        return data["chunks"]

    def ask(self, question: str, top_k: int = 6,
            document_ids: Optional[Sequence[str]] = None,
            temperature: Optional[float] = None,
            max_tokens: Optional[int] = None) -> Dict[str, Any]:
        """无状态问答：一次性返回答案 + 引用 + 检索明细。"""
        payload: Dict[str, Any] = {
            "question": question, "top_k": top_k,
            "document_ids": list(document_ids or []),
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        return self._request("/api/ask", method="POST", payload=payload)

    def ask_stream(self, question: str, top_k: int = 6,
                   document_ids: Optional[Sequence[str]] = None,
                   conversation_id: Optional[str] = None) -> Iterator[str]:
        """流式问答：逐段产出文本增量。

        需要会话上下文时先 create_conversation()，再把 id 传进来；
        不传则为无状态检索问答（内部仍会建一个临时会话用于落库）。
        """
        if not conversation_id:
            conversation_id = self.create_conversation(question[:40])["id"]
        payload = {
            "question": question, "top_k": top_k,
            "document_ids": list(document_ids or []),
        }
        request = urllib.request.Request(
            self._url(f"/api/conversations/{conversation_id}/messages/stream"),
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            method="POST")
        try:
            response = self._opener.open(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            raise RagClientError(f"HTTP {exc.code}", status=exc.code) from exc
        with response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    data = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                text = data.get("text")
                if text:
                    yield text

    # ---------------------------------------------------------------- 会话
    def create_conversation(self, title: str = "新会话") -> Dict[str, Any]:
        return self._request("/api/conversations", method="POST",
                             payload={"title": title})["conversation"]

    def list_conversations(self) -> List[Dict[str, Any]]:
        return self._request("/api/conversations")["items"]

    def get_conversation(self, conversation_id: str) -> Dict[str, Any]:
        return self._request(f"/api/conversations/{conversation_id}")

    def delete_conversation(self, conversation_id: str) -> bool:
        return bool(self._request(f"/api/conversations/{conversation_id}",
                                  method="DELETE")["deleted"])

    # ---------------------------------------------------------------- 证据
    def get_evidence(self, chunk_id: str) -> Dict[str, Any]:
        """取某个证据块的原文、所属章节与相邻块。"""
        return self._request(f"/api/chunks/{urllib.parse.quote(chunk_id, safe='')}")


# ---------------------------------------------------------------------------
def _main() -> int:
    parser = argparse.ArgumentParser(description="材料科学 RAG 知识库 客户端")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--ask", help="提问")
    parser.add_argument("--stream", action="store_true", help="流式输出")
    parser.add_argument("--search", help="仅检索")
    parser.add_argument("--add-file", help="上传文件")
    parser.add_argument("--add-text", help="新增文本标题")
    parser.add_argument("--content", help="文本内容（配合 --add-text）")
    parser.add_argument("--list", action="store_true", help="列出文献")
    parser.add_argument("--meta", action="store_true", help="查看服务能力")
    parser.add_argument("--top-k", type=int, default=6)
    args = parser.parse_args()

    client = MaterialsRagClient(args.base_url)

    try:
        if args.meta:
            print(json.dumps(client.meta(), ensure_ascii=False, indent=2))
        elif args.list:
            for item in client.list_documents():
                print(f"  [{item['status']:<8}] {item['title']}  "
                      f"({item['chunk_count']} 段 / {item['page_count']} 页)")
        elif args.add_file:
            data = client.add_file(args.add_file)
            doc = client.wait_for_document(data["document"]["id"])
            print(f"  已入库: {doc['title']} -> {doc.get('status')}")
        elif args.add_text:
            content = args.content or sys.stdin.read()
            data = client.add_text(args.add_text, content)
            doc = client.wait_for_document(data["document"]["id"])
            print(f"  已入库: {doc['title']} -> {doc.get('status')}")
        elif args.search:
            for index, chunk in enumerate(client.search(args.search, top_k=args.top_k), 1):
                print(f"\n[{index}] {chunk['document_title']} · {chunk.get('section_title') or ''} "
                      f"· 第{chunk.get('page_start')}页 · 相关度 {chunk['score']:.3f}")
                print("    " + (chunk["content"] or "")[:300].replace("\n", " "))
        elif args.ask:
            if args.stream:
                for text in client.ask_stream(args.ask, top_k=args.top_k):
                    print(text, end="", flush=True)
                print()
            else:
                result = client.ask(args.ask, top_k=args.top_k)
                print(result["answer"])
                print(f"\n--- 模式 {result['generation_mode']} · {result['latency_ms']} ms · "
                      f"{len(result['citations'])} 条引用 ---")
                for index, citation in enumerate(result["citations"], 1):
                    print(f"  [{index}] {citation['document_title']} · "
                          f"{citation.get('section_title') or ''} · 相关度 {citation['score']:.3f}")
        else:
            parser.print_help()
    except RagClientError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main())
