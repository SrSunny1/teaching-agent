"""ppsV3（PP-StructureV3）解析适配器 —— 可选增强层。

为什么必须走子进程
------------------
PP-StructureV3 依赖 paddlepaddle，官方只支持 Python 3.9~3.11；而本插件定位是
"任意 Python 3.9+ 都能直接跑"，通常跑在更新的解释器上（例如 3.13）。两者不在
同一个解释器里，因此**无法 import 调用**。

解决办法是把它当成一个外部命令行工具：插件用配置好的解释器启动
``ppsv3/rag.py``，该脚本把结果 JSON 打印到 stdout，插件读回来。这样：

    - 跨 Python 版本 / 跨虚拟环境都能工作
    - Paddle 崩了只影响子进程，不会拖垮插件进程
    - 环境缺失或超时就干净降级到内置解析器

解析链路中的位置：
    ppsv3（可选，开启且环境可用） -> pypdf -> 内置纯标准库解析器
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# 插件内置的 ppsV3 解析脚本（源自用户 ppsV3/rag.py）
_BUNDLED_SCRIPT = Path(__file__).resolve().parent.parent.parent / "ppsv3" / "rag.py"

# 探测结果缓存：避免每次上传都花十几秒去 import paddle
_probe_cache: Dict[str, bool] = {}
_resolved_python: Optional[str] = None

# 全量探测很贵（要逐个 spawn 解释器去 import paddle），
# 所以把结论落到磁盘，并给"没找到"的结果加冷却，避免每次请求都重扫一遍。
_ROOT_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_CACHE_FILE = _ROOT_DIR / "data" / "ppsv3_env.json"
_ENV_CACHE_COOLDOWN = 300  # 秒


class PpsV3Unavailable(RuntimeError):
    """ppsV3 不可用（未配置 / 环境缺失 / 脚本不存在）。"""


# ------------------------------------------------------------------ 解释器探测
def _candidate_interpreters(explicit: str = "") -> List[str]:
    """生成待探测的解释器候选列表，显式配置排在最前。"""
    candidates: List[str] = []

    def add(path: str) -> None:
        path = (path or "").strip().strip('"')
        if not path:
            return
        # 去重且保序
        if path not in candidates:
            candidates.append(path)

    add(explicit)

    # 项目自带的 .venv（README 推荐的做法）
    for base in (_BUNDLED_SCRIPT.parent, Path(_BUNDLED_SCRIPT.parent).parent):
        add(str(base / ".venv" / "Scripts" / "python.exe"))
        add(str(base / ".venv" / "bin" / "python"))

    # 常见版本化命令
    for name in ("python3.11", "python3.10", "python3.9", "python3", "python", "py"):
        found = shutil.which(name)
        if found:
            add(found)

    # Windows：py -3.x 启动器
    if os.name == "nt":
        launcher = shutil.which("py")
        if launcher:
            for ver in ("-3.11", "-3.10", "-3.9"):
                add(f"{launcher} {ver}")

    return candidates


def _run_probe(python: str, timeout: int = 90) -> bool:
    """探测某个解释器里 paddleocr 是否真的能 import。"""
    if python in _probe_cache:
        return _probe_cache[python]

    ok = False
    try:
        # 用 -c 而不是 import paddleocr 的返回值判断：cv2/依赖损坏时会在 import 期炸掉
        code = (
            "import importlib,sys;"
            "m=importlib.import_module('paddleocr');"
            "print('PPSV3_PROBE_OK', getattr(m,'__version__','?'))"
        )
        args = _split_cmd(python) + ["-c", code]
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        ok = proc.returncode == 0 and "PPSV3_PROBE_OK" in (proc.stdout or "")
        if not ok:
            logger.debug("ppsV3 探测失败 [%s]: rc=%s %s",
                         python, proc.returncode, (proc.stderr or "")[-300:])
    except (subprocess.SubprocessError, OSError) as exc:
        logger.debug("ppsV3 探测异常 [%s]: %s", python, exc)
        ok = False

    _probe_cache[python] = ok
    return ok


def _split_cmd(python: str) -> List[str]:
    """支持 'py -3.9' 这类带参数的解释器写法。"""
    return python.split() if " " in python.strip() else [python]


def _probe_gpu(python: str, timeout: int = 120) -> Dict[str, Any]:
    """探测该解释器里的 CUDA 可用性。

    只在设备被配成 GPU 时才需要问这一句：用户填了 gpu:0 却装的是 CPU 版
    paddlepaddle，应当立刻被告知，而不是等他解析几分钟后才发现悄悄回退了。
    """
    code = (
        "import paddle;"
        "print('PADDLE_CUDA', paddle.device.is_compiled_with_cuda(),"
        " paddle.device.cuda.device_count(), paddle.__version__)"
    )
    try:
        proc = subprocess.run(
            _split_cmd(python) + ["-c", code],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout, text=True, encoding="utf-8", errors="replace",
        )
    except (subprocess.SubprocessError, OSError) as exc:
        logger.debug("ppsV3 GPU 探测异常: %s", exc)
        return {"available": False, "reason": f"探测失败：{exc}"}

    line = ""
    for candidate in reversed((proc.stdout or "").splitlines()):
        if "PADDLE_CUDA" in candidate:
            line = candidate
            break
    parts = line.split()
    if len(parts) >= 3 and parts[1] == "True":
        return {
            "available": True,
            "device_count": int(parts[2]) if parts[2].isdigit() else 0,
            "paddle_version": parts[3] if len(parts) > 3 else "unknown",
        }
    return {"available": False,
            "reason": "该环境的 paddlepaddle 未编译 CUDA 支持（装的是 CPU 版？）"}


def _load_env_cache() -> Dict[str, Any]:
    try:
        return json.loads(_ENV_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_env_cache(python: Optional[str]) -> None:
    try:
        _ENV_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _ENV_CACHE_FILE.write_text(
            json.dumps({"python": python or "", "checked_at": time.time()},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.debug("写入 ppsV3 环境缓存失败: %s", exc)


def resolve_interpreter(explicit: str = "", timeout: int = 40) -> Optional[str]:
    """找出第一个真正装了 paddleocr 的解释器；找不到返回 None。

    两段式：先验证磁盘缓存里上次成功的解释器（一次快速探测），
    只有它失效时才做全量扫描——全量扫描 spawn 多个解释器，可能耗时几十秒。
    """
    global _resolved_python
    if explicit:
        if _resolved_python == explicit:
            return _resolved_python
        if _run_probe(explicit, timeout=timeout):
            _resolved_python = explicit
            _save_env_cache(explicit)
            return explicit
        return None

    if _resolved_python:
        return _resolved_python

    cache = _load_env_cache()
    cached = (cache.get("python") or "").strip()
    checked_at = float(cache.get("checked_at") or 0)

    # 1) 复用上次成功的结果
    if cached and _run_probe(cached, timeout=timeout):
        _resolved_python = cached
        return cached

    # 2) 上次全量扫描也没找到，且还在冷却期 -> 直接放弃，别让请求卡住
    if not cached and checked_at and (time.time() - checked_at) < _ENV_CACHE_COOLDOWN:
        logger.debug("ppsV3 环境探测处于冷却期，跳过全量扫描")
        return None

    # 3) 全量扫描
    for python in _candidate_interpreters():
        if _run_probe(python, timeout=timeout):
            _resolved_python = python
            _save_env_cache(python)
            logger.info("ppsV3 解析环境就绪: %s", python)
            return python

    _save_env_cache(None)
    logger.info("未找到可用的 ppsV3 环境（需 Python 3.9~3.11 + paddleocr），将使用内置解析器")
    return None


def invalidate_cache() -> None:
    """用户在设置页改了解释器路径后调用，强制重新探测。"""
    _probe_cache.clear()
    global _resolved_python
    _resolved_python = None
    try:
        if _ENV_CACHE_FILE.is_file():
            _ENV_CACHE_FILE.unlink()
    except OSError:
        pass


# ------------------------------------------------------------------ JSON 提取
def _extract_tail_json(text: str) -> Optional[Dict[str, Any]]:
    """从 stdout 末尾提取最后一个完整 JSON 对象。

    Paddle 会往 stdout 灌大量日志，所以不能用 json.loads(stdout)。
    这里从最后一个 '}' 往回做括号配平，取出完整对象。
    """
    if not text:
        return None
    end = text.rfind("}")
    while end != -1:
        depth = 0
        in_str = False
        escape = False
        for i in range(end, -1, -1):
            ch = text[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "}":
                depth += 1
            elif ch == "{":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[i:end + 1])
                    except json.JSONDecodeError:
                        break
        end = text.rfind("}", 0, end)
    return None


# ------------------------------------------------------------------ 解析器
class PpsV3Parser:
    """调用 ppsV3 做版面级 PDF 解析，产出 Markdown 文本 + 质量指标。"""

    def __init__(
        self,
        python: str = "",
        script: str = "",
        device: str = "cpu",
        accurate: bool = False,
        timeout: int = 900,
    ):
        self.python = (python or "").strip()
        self.script = Path((script or "").strip()) if (script or "").strip() else _BUNDLED_SCRIPT
        self.device = device or "cpu"
        self.accurate = accurate
        self.timeout = max(30, int(timeout or 900))

    # ---------------- 可用性
    def is_available(self) -> bool:
        if not self.script.is_file():
            logger.debug("ppsV3 脚本不存在: %s", self.script)
            return False
        return resolve_interpreter(self.python) is not None

    def describe(self) -> Dict[str, Any]:
        """给设置页用的状态描述（不含任何密钥）。"""
        python = resolve_interpreter(self.python)
        info: Dict[str, Any] = {
            "installed": python is not None,
            "script": str(self.script),
            "script_exists": self.script.is_file(),
            "python": python or "",
            "device": self.device,
            "accurate": self.accurate,
            "timeout": self.timeout,
            "pipeline": "PP-StructureV3",
        }
        if python:
            info["version"] = _probe_version(python)
        return info

    # ---------------- 解析
    def parse(self, pdf_path: Path, output_dir: Path) -> Optional[Dict[str, Any]]:
        """解析单个 PDF。

        返回 ``{"markdown_text": str, "quality": dict}``；任何环节失败返回 None，
        由上层继续走降级链。
        """
        # 子进程以脚本所在目录为 cwd，相对路径会被解析到那里去，必须先转成绝对路径
        pdf_path = Path(pdf_path).resolve()
        output_dir = Path(output_dir).resolve()

        python = resolve_interpreter(self.python)
        if not python:
            return None
        if not self.script.is_file():
            logger.warning("ppsV3 脚本缺失，跳过: %s", self.script)
            return None

        output_dir.mkdir(parents=True, exist_ok=True)
        args = _split_cmd(python) + [
            str(self.script),
            str(pdf_path),
            "--output-dir", str(output_dir),
            "--device", self.device,
        ]
        # 默认走 fast 模式（RAG 正文抽取足够，且省显存/时间）
        if not self.accurate:
            args += [
                "--disable-chart-recognition",
                "--disable-formula-recognition",
                "--disable-table-recognition",
            ]

        try:
            proc = subprocess.run(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=str(self.script.parent),
            )
        except subprocess.TimeoutExpired:
            logger.warning("ppsV3 解析超时（%ss）: %s", self.timeout, pdf_path.name)
            return None
        except OSError as exc:
            logger.warning("ppsV3 无法启动子进程: %s", exc)
            return None

        payload = _extract_tail_json(proc.stdout or "")
        if payload is None:
            logger.warning(
                "ppsV3 未返回结果 JSON（rc=%s）: %s",
                proc.returncode, (proc.stderr or "")[-300:],
            )
            return None
        if payload.get("status") != "success":
            logger.warning("ppsV3 解析失败: %s", str(payload.get("error"))[:300])
            return None

        # 优先读脚本写出的 Markdown 文件；没有就退回 stdout 里报的路径
        md_path = Path(payload.get("markdown") or "")
        if not md_path.is_file():
            md_path = output_dir / (pdf_path.stem + ".md")
        if not md_path.is_file():
            logger.warning("ppsV3 未产出 Markdown: %s", md_path)
            return None

        try:
            markdown_text = md_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("ppsV3 Markdown 读取失败: %s", exc)
            return None
        if not markdown_text.strip():
            return None

        quality = _build_quality(payload, markdown_text, self.device)
        logger.info(
            "ppsV3 解析完成: %s | %s 字符 / %s 块 / %.1fs",
            pdf_path.name, len(markdown_text),
            quality.get("block_count", 0), quality.get("elapsed_seconds", 0),
        )
        return {"markdown_text": markdown_text, "quality": quality}


def cached_status() -> Dict[str, Any]:
    """只读缓存的轻量状态，**绝不触发探测**（探测可能耗时几十秒）。

    给设置页首屏用；要真正检测请调用 :func:`detect`。
    """
    cache = _load_env_cache()
    return {
        "python": (cache.get("python") or "").strip(),
        "checked_at": cache.get("checked_at"),
        "script": str(_BUNDLED_SCRIPT),
        "script_exists": _BUNDLED_SCRIPT.is_file(),
        "resolved": _resolved_python or "",
    }


def detect(python: str = "", timeout: int = 40, device: str = "cpu",
           accurate: bool = False) -> Dict[str, Any]:
    """强制重新检测环境。设置页「检测」按钮调用。

    ``device`` / ``accurate`` 跟着配置一起传，否则面板显示的设备会和实际
    解析用的不一致。
    """
    invalidate_cache()
    parser = PpsV3Parser(python=python, device=device, accurate=accurate)
    info = parser.describe()
    resolved = resolve_interpreter(python, timeout=timeout)
    if resolved and str(device).lower().startswith("gpu"):
        info["gpu"] = _probe_gpu(resolved)
    info["cached"] = cached_status()
    return info


def is_available(python: str = "") -> bool:
    """模块级探测入口（与 paddle_adapter 的接口形状保持一致）。"""
    return resolve_interpreter(python) is not None


def describe(**kwargs: Any) -> Dict[str, Any]:
    """模块级状态描述，供设置页/能力探测使用。"""
    return PpsV3Parser(**kwargs).describe()


def _probe_version(python: str) -> str:
    """读取 paddleocr 版本（失败返回 unknown，不影响主流程）。"""
    try:
        proc = subprocess.run(
            _split_cmd(python) + ["-c", "import paddleocr;print(getattr(paddleocr,'__version__','unknown'))"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=90, text=True, encoding="utf-8", errors="replace",
        )
        return (proc.stdout or "").strip().splitlines()[-1] if proc.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _build_quality(payload: Dict[str, Any], markdown_text: str, device: str) -> Dict[str, Any]:
    """把 ppsV3 的质量摘要整理成插件统一的 quality 结构。"""
    return {
        "status": "success",
        "page_count": payload.get("page_count") or _count_pages(payload),
        "page_mode": "ppsv3",
        "block_count": payload.get("block_count", 0),
        "extractor": "ppsv3-ppstructure",
        "char_count": len(markdown_text),
        "device": device,
        "elapsed_seconds": payload.get("elapsed_seconds"),
        "type_counts": payload.get("type_counts") or {},
        "visual_block_count": payload.get("visual_block_count", 0),
        "table_block_count": payload.get("table_block_count", 0),
        "title_binding_rate": payload.get("title_binding_rate"),
        "table_text_rate": payload.get("table_text_rate"),
    }


def _count_pages(payload: Dict[str, Any]) -> int:
    """ppsV3 的摘要里没有显式页码数，用块里的 page 字段兜底统计。"""
    pages = set()
    for key in ("pages", "page_numbers"):
        value = payload.get(key)
        if isinstance(value, list):
            pages.update(p for p in value if isinstance(p, int))
    if pages:
        return max(pages)
    return 0
