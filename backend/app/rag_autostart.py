"""知识库 RAG 服务的自动拉起。

评委演示时不能要求手动双击「启动.bat」：教学 Agent 后端启动时探测
`http://127.0.0.1:8765/api/meta`，没有响应就在后台线程里用 start.py
拉起它（**已在运行则跳过，绝不重复启动**）。原 RAG 系统代码一行不改。

环境变量：
    MSRAG_AUTOSTART=0   关闭自动拉起
    MSRAG_DIR=<路径>    原 RAG 系统目录（默认 ../RAG/材料智能体/材料科学RAG系统）
    MSRAG_PORT=<端口>   端口（默认沿用原系统 8765）
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path

from .tools.materials_rag import _base_url

log = logging.getLogger("uvicorn.error")

# 目录解析顺序：MSRAG_DIR 环境变量 → 项目内置 rag-system/ → 同级外置的
# RAG/材料智能体/材料科学RAG系统。内置那份随仓库分发，别人拿到项目即可用。
_BUNDLED_DIR = Path(__file__).resolve().parents[2] / "rag-system"
_SIBLING_DIR = Path(__file__).resolve().parents[2].parent / "RAG" / "材料智能体" / "材料科学RAG系统"


def _rag_dir() -> Path | None:
    env = os.environ.get("MSRAG_DIR", "").strip()
    if env:
        return Path(env)
    for candidate in (_BUNDLED_DIR, _SIBLING_DIR):
        if (candidate / "start.py").exists():
            return candidate
    return None


def _reachable(timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(f"{_base_url()}/api/meta", timeout=timeout):
            return True
    except Exception:
        return False


def _spawn(rag_dir: Path) -> None:
    cmd = [sys.executable, str(rag_dir / "start.py"), "--no-browser", "--no-smoke"]
    port = os.environ.get("MSRAG_PORT", "").strip()
    if port:
        cmd += ["--port", port]
    # 输出写临时文件，不占终端、也不污染原系统目录
    out = open(Path(tempfile.gettempdir()) / "msrag-autostart.log", "ab")
    kwargs: dict = {"cwd": str(rag_dir), "stdout": out, "stderr": out, "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        # 脱离本进程：后端重启/退出不带走知识库服务
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(cmd, **kwargs)
    log.info("[rag-autostart] 已拉起知识库服务：%s", " ".join(cmd))


def _ensure() -> None:
    if os.environ.get("MSRAG_AUTOSTART", "1").strip() == "0":
        return
    if _reachable():
        log.info("[rag-autostart] 知识库服务已在运行（%s），跳过", _base_url())
        return
    rag_dir = _rag_dir()
    if rag_dir is None or not (rag_dir / "start.py").exists():
        log.warning(
            "[rag-autostart] 找不到原 RAG 系统目录（项目内置 rag-system/ 也不存在），"
            "知识库模块将不可用；可用 MSRAG_DIR 指定"
        )
        return
    try:
        _spawn(rag_dir)
    except Exception as exc:  # 拉起失败不影响教学 Agent 本身启动
        log.warning("[rag-autostart] 拉起失败：%s", exc)


def ensure_started() -> None:
    """非阻塞：后台线程探测 + 拉起，不拖慢后端启动。"""
    threading.Thread(target=_ensure, name="rag-autostart", daemon=True).start()
