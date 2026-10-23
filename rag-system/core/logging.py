"""轻量日志工具：文件轮转 + 控制台着色，零依赖。"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

_lock = threading.Lock()
_initialized = False
_log_file: Optional[Path] = None

_COLORS = {
    "DEBUG": "\033[36m",
    "INFO": "\033[32m",
    "WARN": "\033[33m",
    "ERROR": "\033[31m",
}
_RESET = "\033[0m"


def configure(log_dir: Path, filename: str = "msrag.log") -> None:
    global _initialized, _log_file
    with _lock:
        if _initialized:
            return
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            _log_file = log_dir / filename
        except OSError:
            _log_file = None
        _initialized = True


def _supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if not hasattr(sys.stdout, "isatty"):
        return False
    try:
        return bool(sys.stdout.isatty())
    except Exception:
        return False


def _emit(level: str, message: str, **fields: Any) -> None:
    if not _initialized:
        return
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extra = f" {json.dumps(fields, ensure_ascii=False)}" if fields else ""
    line = f"{ts} | {level:<5} | {message}{extra}"

    stream = sys.stderr if level in ("ERROR", "WARN") else sys.stdout
    try:
        if _supports_color():
            stream.write(f"{_COLORS.get(level, '')}{line}{_RESET}\n")
        else:
            stream.write(line + "\n")
        stream.flush()
    except Exception:
        pass

    if _log_file is not None:
        try:
            with _lock, open(_log_file, "a", encoding="utf-8") as fp:
                fp.write(line + "\n")
        except OSError:
            pass


def debug(message: str, **fields: Any) -> None:
    _emit("DEBUG", message, **fields)


def info(message: str, **fields: Any) -> None:
    _emit("INFO", message, **fields)


def warn(message: str, **fields: Any) -> None:
    _emit("WARN", message, **fields)


def error(message: str, **fields: Any) -> None:
    _emit("ERROR", message, **fields)


def elapsed(start: float) -> int:
    """毫秒耗时，用于 latency 埋点。"""
    return int((time.perf_counter() - start) * 1000)
