#!/usr/bin/env python3
"""
把课程语料灌进「材料科学RAG系统」，让「知识库」模块真正覆盖课程知识边界。

    python scripts/rag_ingest_course.py                  # 灌入（幂等：同名文献跳过）
    python scripts/rag_ingest_course.py --force          # 同名文献删掉重灌
    python scripts/rag_ingest_course.py --base-url http://127.0.0.1:9000

语料来源：data/chunks.jsonl —— backend/knowledge/ingest.py 已经把
教材.docx / 教学大纲 doc / 课程讲义 md / 劳育任务书与公开摘编 全部抽成了文本块。
这里按 metadata.doc 聚合回「一篇文献」，走 RAG 的 POST /api/documents/text 入库；
docx/ppt 原始文件 RAG 解析不了，而 chunks.jsonl 里已是抽好的正文，所以走文本口。

前置条件：RAG 服务已启动（双击 材料科学RAG系统/启动.bat，或在该目录 python start.py）。
"""
# ─────────────────────────────────────────────────────────────
# ★ 控制台输出只用 GBK 能编码的符号：√（通过）和 ×（失败）。
#   不要改成 ✓ ✗ —— Windows 中文控制台（cp936）遇到编不了的字符
#   直接 UnicodeEncodeError 崩掉。约定见 scripts/module.py 头注。
# ─────────────────────────────────────────────────────────────

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHUNKS = ROOT / "data" / "chunks.jsonl"

DEFAULT_BASE_URL = "http://127.0.0.1:8765"


def _request(method: str, url: str, payload: dict | None = None, timeout: float = 120.0) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if body.get("success") is True:
        return body.get("data") or {}
    msg = (body.get("error") or {}).get("message") or body.get("message") or "接口返回异常"
    raise RuntimeError(msg)


def load_documents() -> "OrderedDict[str, list[str]]":
    """chunks.jsonl 按文献聚合：doc 名 -> 保持原顺序的块文本列表。"""
    docs: "OrderedDict[str, list[str]]" = OrderedDict()
    with CHUNKS.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            meta = row.get("metadata") or {}
            doc = meta.get("doc") or meta.get("source") or "未命名"
            text = (row.get("text") or "").strip()
            if text:
                docs.setdefault(doc, []).append(text)
    return docs


def main() -> int:
    parser = argparse.ArgumentParser(description="把课程语料灌进材料科学RAG系统")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"RAG 服务地址，默认 {DEFAULT_BASE_URL}")
    parser.add_argument("--force", action="store_true", help="同名文献先删后灌（默认跳过）")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    if not CHUNKS.exists():
        print(f"  × 没找到 {CHUNKS}，先跑 backend/knowledge/ingest.py 生成语料。")
        return 1

    docs = load_documents()
    if not docs:
        print("  × chunks.jsonl 里没有可用文本。")
        return 1

    # ── 服务探活 ──
    try:
        meta = _request("GET", f"{base}/api/meta", timeout=10)
    except (urllib.error.URLError, OSError, RuntimeError) as exc:
        print(f"  × RAG 服务连不上（{base}）：{exc}")
        print("    先启动：双击 材料科学RAG系统/启动.bat，或在该目录 python start.py")
        return 1
    stats = meta.get("stats") or {}
    print(f"  √ 服务在线：现有文献 {stats.get('documents', '?')} 篇")

    # ── 幂等：已入库的同名文献跳过（--force 时先删） ──
    existing = _request("GET", f"{base}/api/documents?limit=500", timeout=30)
    by_title: dict[str, list[str]] = {}
    for item in existing.get("items") or []:
        title = item.get("title") or ""
        doc_id = item.get("document_id") or item.get("id") or ""
        if title and doc_id:
            by_title.setdefault(title, []).append(doc_id)

    added, skipped, failed = 0, 0, 0
    for title, parts in docs.items():
        if title in by_title:
            if not args.force:
                skipped += 1
                print(f"    · 跳过（已存在）：{title}")
                continue
            for doc_id in by_title[title]:
                try:
                    _request("DELETE", f"{base}/api/documents/{urllib.request.quote(doc_id)}", timeout=30)
                except Exception as exc:
                    print(f"    ! 删除旧文献失败 {title}（{exc}），仍会尝试重灌")
        content = "\n\n".join(parts)
        try:
            _request(
                "POST",
                f"{base}/api/documents/text",
                {
                    "title": title,
                    "content": content,
                    "source": "课程知识库 chunks.jsonl（教材/大纲/讲义/劳育）",
                    "tags": "课程,材料物理实验,劳动教育",
                },
            )
            added += 1
            print(f"    √ 已入库：{title}（{len(parts)} 块 / {len(content)} 字）")
        except Exception as exc:
            failed += 1
            print(f"    × 入库失败：{title} —— {exc}")

    print(f"\n  完成：新入库 {added} 篇，跳过 {skipped} 篇，失败 {failed} 篇")
    if added:
        print("  入库后系统会自动分块、向量化，稍等片刻即可在「知识库」里检索/问答。")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
