#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""材料科学 RAG 知识库 —— 一键启动脚本。

用法：
    python start.py                 # 灌样例 + 起服务 + 跑冒烟 + 开浏览器
    python start.py --no-browser    # 不开浏览器（服务器/远程环境）
    python start.py --port 9000     # 换端口
    python start.py --reset         # 清空知识库后重建
    python start.py --no-smoke      # 跳过启动自检
    python start.py --no-wait       # 启动后立即返回（配合外部调度）

设计说明：
    后端刻意只依赖 Python 标准库，所以这里**不做 pip install**。
    可选依赖（numpy / pypdf / paddleocr）是"装了更好"，不是"不装不能跑"。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def _banner(title: str, char: str = "─") -> None:
    width = 62
    print("\n" + char * width)
    print(f"  {title}")
    print(char * width)


def _step(index: int, total: int, message: str) -> None:
    print(f"  [{index}/{total}] {message}", flush=True)


def check_environment() -> Dict[str, Any]:
    """环境体检：只报告，不阻断。"""
    report: Dict[str, Any] = {"python": ".".join(map(str, sys.version_info[:3]))}

    optional = {
        "numpy": "向量检索加速（纯 Python 也能跑，只是慢一点）",
        "pypdf": "PDF 兼容性增强（内置解析器已可独立工作）",
        "paddleocr": "扫描件 OCR 版面解析",
        "sentence_transformers": "本地语义向量模型",
        "FlagEmbedding": "本地 bge-m3 向量模型",
    }
    import importlib.util
    for module, benefit in optional.items():
        try:
            report[module] = importlib.util.find_spec(module) is not None
        except Exception:
            report[module] = False
    return report


def seed_samples(pipeline: Any, settings: Any, force_pdf: bool = True) -> int:
    """首次启动时灌入示例语料，避免用户面对空知识库无从下手。"""
    samples_dir = settings.samples_dir
    if not samples_dir.is_dir():
        return 0

    existing = pipeline.store.list_documents(limit=500)
    existing_titles = {item["title"] for item in existing["items"]}

    count = 0
    md_files = sorted(samples_dir.glob("*.md"))
    for md_file in md_files:
        title = md_file.stem
        if any(title[:12] in existing_title for existing_title in existing_titles):
            continue
        data = md_file.read_bytes()
        doc = pipeline.register_document(
            title=title, source=f"内置示例 · {md_file.name}",
            tags=["示例", "材料科学"], file_name=md_file.name, file_ext=".md",
            file_size=len(data), file_path=str(md_file),
        )
        pipeline.ingest_sync(doc["id"], data, md_file.name, ".md")
        count += 1
        print(f"        · 已索引 {title}")

    # 额外造一份 PDF，用来演示"PDF → 解析 → 分块 → 嵌入"的完整链路
    if force_pdf:
        try:
            from tools.make_sample_pdf import convert
            pdf_dir = samples_dir / "pdf"
            pdf_dir.mkdir(parents=True, exist_ok=True)
            target = pdf_dir / "06_高熵合金_期刊版式.pdf"
            source = samples_dir / "01_高熵合金.md"
            if source.is_file() and not target.exists():
                convert(source, target)
            if target.is_file() and not any("期刊版式" in t for t in existing_titles):
                data = target.read_bytes()
                doc = pipeline.register_document(
                    title="高熵合金：设计理念与强化机制（期刊版式 PDF）",
                    source="内置示例 · 自动生成的 PDF", tags=["示例", "PDF", "材料科学"],
                    file_name=target.name, file_ext=".pdf", file_size=len(data),
                    file_path=str(target),
                )
                pipeline.ingest_sync(doc["id"], data, target.name, ".pdf")
                count += 1
                print(f"        · 已索引 {target.name} （PDF 解析链路演示）")
        except Exception as exc:
            print(f"        · PDF 样例生成失败（不影响启动）: {exc}")
    return count


def smoke_test(base_url: str) -> bool:
    """启动后自检：确认整条链路真的能跑通，而不是"端口起来了"就算成功。"""

    def get_json(path: str) -> Optional[Dict[str, Any]]:
        try:
            request = urllib.request.Request(base_url + path)
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            print(f"        ✗ GET {path} 失败: {exc}")
            return None

    def post_json(path: str, payload: Dict[str, Any], timeout: float = 120) -> Optional[Dict[str, Any]]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            base_url + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:300]
            print(f"        ✗ POST {path} 失败 {exc.code}: {body}")
            return None
        except Exception as exc:
            print(f"        ✗ POST {path} 失败: {exc}")
            return None

    ok = True

    health = get_json("/health")
    ok &= bool(health and health.get("data", {}).get("status") == "ok")
    print(f"        {'✓' if ok else '✗'} 健康检查")

    meta = get_json("/api/meta")
    if meta and meta.get("success"):
        caps = meta["data"]["capabilities"]
        print(f"        ✓ 能力：LLM={'已接入 ' + caps['llm']['model'] if caps['llm']['enabled'] else '未接入（抽取式作答）'}"
              f" · 嵌入={caps['embedding']['provider']}(dim={caps['embedding']['dim']})")
        print(f"        ✓ 知识库：{meta['data']['stats']['documents']} 篇文献 / "
              f"{meta['data']['stats']['chunks']} 个段落 / {meta['data']['stats']['vectors']} 条向量")
    else:
        ok = False

    search = post_json("/api/search", {"query": "高熵合金的强化机制", "top_k": 3})
    if search and search.get("success") and search["data"]["returned"] > 0:
        top = search["data"]["chunks"][0]
        print(f"        ✓ 检索：命中 {search['data']['returned']} 条，"
              f"首条相关度 {top['score']:.3f}（{top['document_title'][:24]}）")
    else:
        ok = False
        print("        ✗ 检索未命中")

    ask = post_json("/api/ask", {"question": "高熵合金有哪些主要强化机制？", "top_k": 5})
    if ask and ask.get("success"):
        answer = ask["data"]["answer"] or ""
        mode = ask["data"]["generation_mode"]
        print(f"        ✓ 问答：{mode} 模式，生成 {len(answer)} 字，"
              f"引用 {len(ask['data']['citations'])} 条，耗时 {ask['data']['latency_ms']} ms")
        preview = answer.replace("\n", " ")[:110]
        print(f"          摘要：{preview}...")
    else:
        ok = False
        print("        ✗ 问答失败")

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="材料科学 RAG 知识库启动器")
    parser.add_argument("--host", default=None, help="监听地址")
    parser.add_argument("--port", type=int, default=None, help="监听端口")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument("--no-smoke", action="store_true", help="跳过启动自检")
    parser.add_argument("--no-seed", action="store_true", help="不灌入示例语料")
    parser.add_argument("--no-wait", action="store_true", help="启动后立即返回")
    parser.add_argument("--reset", action="store_true", help="清空知识库后重建")
    args = parser.parse_args()

    _banner("材料科学 RAG 知识库 · 启动器")
    print(f"  项目目录: {ROOT}")

    # ---------- 1. 环境体检 ----------
    env = check_environment()
    print(f"  Python {env['python']}")
    missing = [name for name in ("numpy", "pypdf") if not env.get(name)]
    if missing:
        print(f"  可选依赖未安装: {', '.join(missing)}（不影响运行，仅影响速度/兼容性）")

    # ---------- 2. 载入配置 ----------
    os.environ.setdefault("MSRAG_HOST", args.host or "127.0.0.1")
    if args.port:
        os.environ["MSRAG_PORT"] = str(args.port)

    from core.config import get_settings
    from core.logging import configure, info

    settings = get_settings()
    if args.host:
        settings.host = args.host
    if args.port:
        settings.port = args.port
    settings.ensure_dirs()
    configure(settings.log_dir)

    total_steps = 5
    print()
    _step(1, total_steps, "配置加载完成")

    # ---------- 3. 重置 ----------
    if args.reset:
        for target in (settings.database_path, settings.vector_index_path):
            for suffix in ("", "-wal", "-shm"):
                path = Path(str(target) + suffix)
                if path.exists():
                    try:
                        path.unlink()
                    except OSError as exc:
                        print(f"        ! 无法删除 {path.name}: {exc}")
        print("        知识库已清空")

    # ---------- 4. 初始化流水线 ----------
    from rag.pipeline import RagPipeline
    pipeline = RagPipeline(settings)
    info("流水线初始化完成")
    _step(2, total_steps, "RAG 流水线初始化完成")

    # ---------- 5. 灌样例 ----------
    if settings.auto_seed_samples and not args.no_seed:
        print("        正在灌入示例语料…")
        added = seed_samples(pipeline, settings)
        if added:
            print(f"        新增 {added} 篇文献")
        else:
            print("        示例语料已存在，跳过")
    _step(3, total_steps, "语料准备完成")

    # ---------- 6. 起服务 ----------
    from server.http_api import create_server
    try:
        server = create_server(settings, pipeline)
    except OSError as exc:
        print(f"\n  ✗ 端口 {settings.port} 无法占用: {exc}")
        print("    换一个端口试试：python start.py --port 9000")
        return 1

    thread = threading.Thread(target=server.serve_forever, daemon=True,
                              name="rag-http")
    thread.start()
    time.sleep(0.6)
    base_url = settings.base_url
    _step(4, total_steps, f"服务已启动: {base_url}")

    # ---------- 7. 自检 ----------
    if settings.run_smoke_test and not args.no_smoke:
        print("        正在自检…")
        smoke_test(base_url)
    _step(5, total_steps, "自检完成")

    # ---------- 8. 打开浏览器 ----------
    if settings.open_browser and not args.no_browser:
        try:
            webbrowser.open(base_url + "/")
        except Exception:
            pass

    _banner("已就绪", "═")
    print(f"  访问地址  : {base_url}")
    print(f"  数据目录  : {settings.data_dir}")
    print(f"  日志文件  : {settings.log_dir / 'msrag.log'}")
    print(f"  插件接口  : POST {base_url}/api/search   POST {base_url}/api/ask")
    print()
    print("  提示：把 .env.example 复制为 .env 并填入 MSRAG_LLM_API_KEY，")
    print("        即可从「抽取式作答」升级为「大模型生成式作答」。")
    print()
    print("  按 Ctrl+C 停止服务")
    print("═" * 62)

    if args.no_wait:
        return 0

    try:
        while thread.is_alive():
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n  正在关闭服务…")
        server.shutdown()
        server.server_close()
        pipeline.store.close()
        print("  已停止。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
