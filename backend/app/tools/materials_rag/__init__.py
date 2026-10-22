"""
材料科学 RAG 知识库 —— 教学智能体接入用户已有 RAG 服务的后端工具。

对接的是工作目录下的「材料科学RAG系统」（独立服务，默认 http://127.0.0.1:8765），
接口定义与 sdk/agent_tools.json 完全一致，本工具只是把它的 HTTP API
包成教学智能体的工具协议，不改它的任何代码、不新增鉴权入口：

    status    GET  /api/meta            服务能力与知识库规模
    search    POST /api/search          检索原文段落（只检索不生成）
    ask       POST /api/ask             带证据引用的生成式回答
    list      GET  /api/documents       文献列表
    get       GET  /api/chunks/{id}     按 chunk_id 取证据原文
    add_text  POST /api/documents/text  文本入库

服务没启动时如实返回启动指引（双击 材料科学RAG系统/启动.bat）。
服务地址可用环境变量 MSRAG_BASE_URL（或 MSRAG_HOST / MSRAG_PORT）覆盖。
"""
from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from ..base import Tool, ToolResult

_START_HINT = (
    "知识库服务未连接。请先启动原 RAG 系统：\n"
    "  双击 材料科学RAG系统/启动.bat\n"
    "  或在该目录执行：python start.py\n"
    "启动后本工具即可正常调用。"
)


def _base_url() -> str:
    env = os.environ.get("MSRAG_BASE_URL", "").strip().rstrip("/")
    if env:
        return env
    host = os.environ.get("MSRAG_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = os.environ.get("MSRAG_PORT", "8765").strip() or "8765"
    return f"http://{host}:{port}"


def _request(method: str, path: str, payload: dict | None = None, timeout: float = 30.0) -> dict:
    req = urllib.request.Request(
        f"{_base_url()}{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if body.get("success") is True:
        return body.get("data") or {}
    raise RuntimeError(body.get("message") or f"接口返回异常：{path}")


def _fmt_chunk(c: dict, i: int) -> str:
    text = (c.get("content") or c.get("text") or c.get("quote") or "").strip()
    src = c.get("source") or c.get("document_title") or c.get("doc_title") or c.get("document_id") or ""
    sec = c.get("section_title") or c.get("section") or c.get("section_path") or ""
    if isinstance(sec, list):  # section_path 是列表，如 ['5 回火']
        sec = " / ".join(str(s) for s in sec)
    head = f"【{i}】{src}{' · ' + str(sec) if sec else ''}（{c.get('chunk_id', '')}，相关度 {c.get('score', '?')}）"
    return f"{head}\n{text[:400]}{'…' if len(text) > 400 else ''}"


async def _run(args: dict) -> ToolResult:
    action = str(args.get("action") or "search").strip().lower()
    try:
        return await asyncio.to_thread(_run_sync, action, args)
    except urllib.error.URLError as exc:
        return ToolResult(summary="知识库服务未连接", detail=f"{_START_HINT}\n\n（{type(exc).__name__}: {exc.reason if hasattr(exc, 'reason') else exc}）")
    except Exception as exc:  # 服务返回的错误也兜住，别把堆栈抛给对话
        msg = str(exc)
        if "Connection" in msg or "timed out" in msg or "WinError" in msg:
            return ToolResult(summary="知识库服务未连接", detail=_START_HINT)
        return ToolResult(summary="知识库调用失败", detail=f"{type(exc).__name__}: {msg}")


def _run_sync(action: str, args: dict) -> ToolResult:
    # ── 服务能力 / 知识库规模 ──
    if action == "status":
        meta = _request("GET", "/api/meta", timeout=15)
        caps = meta.get("capabilities") or {}
        stats = meta.get("stats") or {}
        lines = [
            f"服务：{meta.get('app', '')} v{meta.get('version', '')}（{_base_url()}）",
            f"知识库规模：{json.dumps(stats, ensure_ascii=False, default=str)[:300]}",
            f"能力：{json.dumps({k: v for k, v in caps.items() if k != 'config'}, ensure_ascii=False, default=str)[:400]}",
        ]
        return ToolResult(summary="知识库服务在线", detail="\n".join(lines))

    # ── 检索原文段落 ──
    if action == "search":
        query = str(args.get("query") or "").strip()
        if not query:
            return ToolResult(summary="缺少检索词", detail="请提供 query。")
        payload: dict = {"query": query}
        if args.get("topK"):
            payload["top_k"] = int(args["topK"])
        if args.get("documentIds"):
            payload["document_ids"] = args["documentIds"]
        data = _request("POST", "/api/search", payload, timeout=60)
        chunks = data.get("chunks") or []
        if not chunks:
            return ToolResult(summary=f"「{query}」无检索结果", detail="知识库中没找到相关段落，请如实告知用户，不要臆造。")
        body = "\n\n".join(_fmt_chunk(c, i) for i, c in enumerate(chunks, 1))
        return ToolResult(
            summary=f"「{query}」命中 {len(chunks)} 段原文",
            detail=f"检索到 {len(chunks)} 段（top_k={data.get('top_k')}）：\n\n{body}\n\n引用时标注 chunk_id，只依据以上证据作答。",
        )

    # ── 带引用的生成式回答 ──
    if action == "ask":
        question = str(args.get("question") or args.get("query") or "").strip()
        if not question:
            return ToolResult(summary="缺少问题", detail="请提供 question。")
        payload = {"question": question}
        if args.get("topK"):
            payload["top_k"] = int(args["topK"])
        if args.get("documentIds"):
            payload["document_ids"] = args["documentIds"]
        data = _request("POST", "/api/ask", payload, timeout=180)
        answer = (data.get("answer") or "").strip()
        cites = data.get("citations") or []
        mode = data.get("generation_mode") or ""
        cite_lines = [
            f"[{i}] {c.get('chunk_id', '')} · {c.get('source') or c.get('document_title') or c.get('doc_title') or ''}：{(c.get('quote') or '')[:120]}"
            for i, c in enumerate(cites, 1)
        ]
        detail = f"（生成模式：{mode} · 模型：{data.get('model') or '未接入'} · 耗时 {data.get('latency_ms', '?')}ms）\n\n{answer}"
        if cite_lines:
            detail += "\n\n引用证据：\n" + "\n".join(cite_lines)
        return ToolResult(summary=f"已回答：{question[:30]}{'…' if len(question) > 30 else ''}（{len(cites)} 条引用）", detail=detail)

    # ── 文献列表 ──
    if action == "list":
        qs = []
        if args.get("q"):
            qs.append(f"q={urllib.request.quote(str(args['q']))}")
        if args.get("docStatus"):
            qs.append(f"status={args['docStatus']}")
        limit = int(args.get("limit") or 100)
        qs.append(f"limit={limit}")
        data = _request("GET", "/api/documents?" + "&".join(qs), timeout=30)
        items = data.get("items") or []
        if not items:
            return ToolResult(summary="知识库还没有文献", detail="可以在原系统「文献库」页上传 PDF/Markdown，或用本工具 add_text 入库文本。")
        lines = [
            f"· {d.get('title') or d.get('filename') or d.get('document_id')}（{d.get('status', '?')}）"
            f" 来源：{d.get('source') or '—'} · id：{d.get('document_id') or d.get('id')}"
            for d in items
        ]
        return ToolResult(summary=f"知识库共 {data.get('total', len(items))} 篇文献", detail="\n".join(lines))

    # ── 取证据原文 ──
    if action == "get":
        chunk_id = str(args.get("chunkId") or "").strip()
        if not chunk_id:
            return ToolResult(summary="缺少 chunk_id", detail="请提供证据块 id（形如 chk_doc_xxx_0001_0000）。")
        data = _request("GET", f"/api/chunks/{urllib.request.quote(chunk_id)}", timeout=30)
        item = data.get("items")[0] if isinstance(data.get("items"), list) and data.get("items") else data
        text = item.get("content") or item.get("text") or json.dumps(item, ensure_ascii=False, default=str)
        return ToolResult(summary=f"证据 {chunk_id}", detail=text[:2000])

    # ── 文本入库 ──
    if action == "add_text":
        title = str(args.get("title") or "").strip()
        content = str(args.get("content") or "").strip()
        if not title or not content:
            return ToolResult(summary="入库信息不全", detail="add_text 需要 title（标题）与 content（正文），先向用户问齐再调用。")
        payload = {"title": title, "content": content}
        if args.get("source"):
            payload["source"] = str(args["source"])
        if args.get("tags"):
            payload["tags"] = str(args["tags"])
        data = _request("POST", "/api/documents/text", payload, timeout=60)
        doc = data.get("document") or data
        return ToolResult(
            summary=f"已入库：《{title}》",
            detail=f"文献 id：{doc.get('document_id') or doc.get('id') or '—'} · 状态：{doc.get('status', 'queued')}\n入库后系统会自动分块、向量化，稍等片刻即可检索。",
        )

    return ToolResult(summary=f"未知动作 {action}", detail="action 只支持：status / search / ask / list / get / add_text。")


TOOL = Tool(
    name="materials_rag",
    label="知识库RAG · {action}",
    description=(
        "材料科学 RAG 知识库（用户已有系统）。涉及课程知识、文献、实验讲义内容的问题，"
        "用 action=search 检索原文段落（精确引用时用），action=ask 获取带证据引用的回答；"
        "action=status 看知识库规模与能力；action=list 列文献；action=get 按 chunk_id 核查证据；"
        "action=add_text 把文本入库。回答必须依据检索证据并标注 chunk_id，检索不到就明确说明，不要臆造。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["status", "search", "ask", "list", "get", "add_text"],
                "description": "status 能力与规模；search 检索原文；ask 生成式回答；list 文献列表；get 取证据块；add_text 文本入库",
            },
            "query": {"type": "string", "description": "search：检索词或问题"},
            "question": {"type": "string", "description": "ask：要回答的问题"},
            "topK": {"type": "integer", "description": "返回证据条数，默认 6，范围 1~50"},
            "documentIds": {"type": "array", "items": {"type": "string"}, "description": "可选，限定文献范围"},
            "chunkId": {"type": "string", "description": "get：证据块 id，形如 chk_doc_xxx_0001_0000"},
            "q": {"type": "string", "description": "list：按标题/来源模糊搜索（用 q，不是 query）"},
            "docStatus": {"type": "string", "description": "list：按状态过滤 queued/parsing/chunking/embedding/ready/failed"},
            "limit": {"type": "integer", "description": "list：返回条数，默认 100"},
            "title": {"type": "string", "description": "add_text：文献标题"},
            "content": {"type": "string", "description": "add_text：正文内容"},
            "source": {"type": "string", "description": "add_text：来源说明"},
            "tags": {"type": "string", "description": "add_text：逗号分隔标签，如『铝合金,热处理』"},
        },
        "required": ["action"],
    },
    run=_run,
)
