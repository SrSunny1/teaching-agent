#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""端到端冒烟测试。

用法（需要服务已启动）：
    python tests/smoke_test.py
    python tests/smoke_test.py --base-url http://127.0.0.1:9000

覆盖链路：
    健康检查 → 文本入库 → 文件入库(multipart) → 处理状态轮询 → 章节树
    → 段落列表 → 证据溯源 → 检索 → 非流式问答 → SSE 流式问答 → 清理
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_SAMPLE_TEXT = """# 测试文献：钛合金增材制造组织调控

## 组织特征
激光粉末床熔融（LPBF）成形 Ti-6Al-4V 因极高的冷却速率（10^3~10^6 K/s）
形成细小针状 α' 马氏体，抗拉强度可达 1100 MPa 以上，但延伸率通常低于 10%。

## 后处理
800 ℃ 保温 2 h 真空退火可使 α' 分解为 α+β 层片组织，延伸率提升至 14% 以上，
强度略降至 950 MPa 左右。热等静压（HIP，920 ℃ / 100 MPa / 2 h）可闭合内部气孔，
显著改善疲劳性能。
"""


class SmokeTest:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.passed = 0
        self.failed = 0

    # ---------------------------------------------------------------- 请求
    def request(self, path: str, method: str = "GET", payload: Any = None,
                raw: bool = False) -> Any:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"} if data else {}
        request = urllib.request.Request(self.base_url + path, data=data,
                                         headers=headers, method=method)
        with self.opener.open(request, timeout=90) as response:
            body = response.read().decode("utf-8")
        if raw:
            return body
        envelope = json.loads(body)
        if not envelope.get("success"):
            error = envelope.get("error") or {}
            raise RuntimeError(f"{error.get('code')}: {error.get('message')}")
        return envelope.get("data")

    def upload_file(self, path: str, filename: str, **fields: str) -> Dict[str, Any]:
        boundary = "----smoke" + uuid.uuid4().hex
        content = Path(path).read_bytes()
        parts = bytearray()
        for name, value in fields.items():
            parts += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
                      f"{value}\r\n").encode("utf-8")
        parts += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                  f"filename=\"{filename}\"\r\nContent-Type: application/pdf\r\n\r\n").encode("utf-8")
        parts += content + f"\r\n--{boundary}--\r\n".encode("utf-8")
        request = urllib.request.Request(
            self.base_url + "/api/documents/upload", data=bytes(parts), method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with self.opener.open(request, timeout=90) as response:
            envelope = json.loads(response.read().decode("utf-8"))
        if not envelope.get("success"):
            error = envelope.get("error") or {}
            raise RuntimeError(f"{error.get('code')}: {error.get('message')}")
        return envelope["data"]

    # ---------------------------------------------------------------- 断言
    def check(self, condition: bool, message: str) -> None:
        if condition:
            self.passed += 1
            print(f"  ✓ {message}")
        else:
            self.failed += 1
            print(f"  ✗ {message}")

    # ---------------------------------------------------------------- 主流程
    def run(self) -> int:
        print(f"\n冒烟测试 → {self.base_url}\n" + "─" * 60)

        health = self.request("/health")
        self.check(health.get("status") == "ok", f"健康检查（已运行 {health.get('uptime_seconds')}s）")

        meta = self.request("/api/meta")["capabilities"]
        self.check("llm" in meta, f"能力探测：LLM={meta['llm']['enabled']}，"
                                  f"嵌入={meta['embedding']['provider']}")

        # ---- 文本入库 ----
        result = self.request("/api/documents/text", "POST", {
            "title": "钛合金增材制造组织调控（冒烟测试）",
            "content": _SAMPLE_TEXT, "source": "smoke-test", "tags": "钛合金,增材制造",
        })
        text_doc_id = result["document"]["id"]
        self.check(bool(text_doc_id), "文本入库")

        # ---- PDF 文件上传（用内置生成器造一份真实 PDF）----
        pdf_id = ""
        try:
            sys.path.insert(0, str(ROOT))
            from tools.make_sample_pdf import build_pdf, clean_markdown
            sample_md = ROOT / "samples" / "01_高熵合金.md"
            if sample_md.is_file():
                raw = sample_md.read_text(encoding="utf-8")
                pdf_bytes = build_pdf("冒烟测试 PDF", clean_markdown(raw))
                tmp = ROOT / "data" / "uploads" / "_smoke_test.pdf"
                tmp.parent.mkdir(parents=True, exist_ok=True)
                tmp.write_bytes(pdf_bytes)
                uploaded = self.upload_file(str(tmp), "smoke.pdf", title="冒烟测试 PDF")
                pdf_id = uploaded["document"]["id"]
                self.check(bool(pdf_id), f"PDF 上传（{len(pdf_bytes)} bytes）")
                tmp.unlink(missing_ok=True)
        except Exception as exc:
            self.check(False, f"PDF 上传失败：{exc}")

        # ---- 等待处理完成 ----
        for doc_id, label in ((text_doc_id, "文本"), (pdf_id, "PDF")):
            if not doc_id:
                continue
            doc = self._wait_document(doc_id)
            self.check(doc.get("status") == "ready",
                       f"{label} 文档处理完成：{doc.get('status')} / "
                       f"{doc.get('chunk_count')} 段 / 解析={doc.get('parser')}")

        # ---- 章节树 ----
        detail = self.request(f"/api/documents/{text_doc_id}")
        titles = [s["section_title"] for s in detail.get("sections", [])]
        self.check(len(titles) >= 2, f"章节树：{titles}")

        # ---- 段落 + 溯源 ----
        chunks = self.request(f"/api/documents/{text_doc_id}/chunks")["items"]
        self.check(len(chunks) > 0, f"段落列表：{len(chunks)} 段")
        if chunks:
            evidence = self.request("/api/chunks/" + urllib.parse.quote(chunks[0]["chunk_id"]))
            self.check("context" in evidence,
                       f"证据溯源：章节={evidence['context'].get('parent_section', {}).get('section_title')}")

        # ---- 检索 ----
        search = self.request("/api/search", "POST", {"query": "钛合金 退火 延伸率", "top_k": 3})
        self.check(search["returned"] > 0,
                   f"检索命中 {search['returned']} 条，首条相关度 {search['chunks'][0]['score']:.3f}")

        # ---- 非流式问答 ----
        conv = self.request("/api/conversations", "POST", {"title": "冒烟测试"})["conversation"]
        message = self.request(f"/api/conversations/{conv['id']}/messages", "POST",
                               {"question": "退火后钛合金的组织和性能如何变化？", "top_k": 4})
        assistant = message["assistant_message"]
        self.check(len(assistant["content"]) > 30,
                   f"非流式问答：{assistant['latency_ms']}ms / 引用 {len(assistant['citations'])} 条")

        # ---- SSE 流式 ----
        events = self._stream(conv["id"], "热等静压有什么作用？")
        kinds = {name for name, _ in events}
        self.check({"meta", "retrieval", "delta", "done"} <= kinds,
                   f"SSE 流式：事件 {sorted(kinds)} / delta×{sum(1 for n, _ in events if n == 'delta')}")

        # ---- 清理 ----
        for doc_id in (text_doc_id, pdf_id):
            if doc_id:
                self.request(f"/api/documents/{doc_id}", "DELETE")
        self.request(f"/api/conversations/{conv['id']}", "DELETE")
        self.check(True, "测试数据清理完成")

        print("─" * 60)
        print(f"  通过 {self.passed} 项，失败 {self.failed} 项\n")
        return 1 if self.failed else 0

    # ---------------------------------------------------------------- 辅助
    def _wait_document(self, doc_id: str, timeout: float = 300) -> Dict[str, Any]:
        # 默认 300s：启用 ppsV3 后，一个 PDF 要走完整套版面识别+OCR，
        # GPU 上单篇也要 1~4 分钟（CPU 更久）。给 60s 会稳定地误判成"卡住"。
        deadline = time.time() + timeout
        doc: Dict[str, Any] = {}
        while time.time() < deadline:
            doc = self.request(f"/api/documents/{doc_id}")["document"]
            if doc.get("status") in ("ready", "failed"):
                return doc
            time.sleep(0.5)
        return doc

    def _stream(self, conversation_id: str, question: str) -> List[tuple]:
        request = urllib.request.Request(
            self.base_url + f"/api/conversations/{conversation_id}/messages/stream",
            data=json.dumps({"question": question, "top_k": 4}).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST")
        events: List[tuple] = []
        with self.opener.open(request, timeout=90) as response:
            name = ""
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if line.startswith("event: "):
                    name = line[7:]
                elif line.startswith("data: ") and name:
                    try:
                        events.append((name, json.loads(line[6:])))
                    except json.JSONDecodeError:
                        events.append((name, {}))
        return events


def main() -> int:
    parser = argparse.ArgumentParser(description="材料科学 RAG 知识库 冒烟测试")
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    args = parser.parse_args()

    tester = SmokeTest(args.base_url)
    try:
        return tester.run()
    except urllib.error.URLError as exc:
        print(f"\n  ✗ 无法连接服务 {args.base_url}：{exc.reason}")
        print("    请先启动：python start.py\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
