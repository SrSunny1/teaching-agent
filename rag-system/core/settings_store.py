"""UI 可修改配置的持久化层。

设计取舍
--------
配置本来只有一个来源：环境变量（含 `.env`）。要支持"在页面里填 Key 并立即生效"，
就必须让 UI 也能写配置。为了避免出现两套互相打架的配置源，这里的做法是：

    UI 保存 = 写回 `.env` 文件 + 同步 `os.environ`

这样 `.env` 始终是唯一落盘来源，重启后依然生效，命令行/环境变量覆盖的语义也不变。

安全
----
只允许修改白名单内的键（防止 UI 变成"任意环境变量写入器"）；
密钥类字段对外只返回掩码，绝不回显明文。
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT_DIR / ".env"

# ------------------------------------------------------------------ 白名单
# 分组：settings 页面按组渲染
GROUPS: List[Dict[str, Any]] = [
    {
        "key": "llm",
        "title": "大模型（回答生成）",
        "description": "用于生成式回答。留空则自动降级为抽取式作答（摘录原文证据）。",
        "fields": [
            {"key": "MSRAG_LLM_BASE_URL", "label": "接口地址", "type": "text",
             "placeholder": "https://api.deepseek.com", "secret": False},
            {"key": "MSRAG_LLM_MODEL", "label": "模型", "type": "text",
             "placeholder": "deepseek-chat", "secret": False},
            {"key": "MSRAG_LLM_API_KEY", "label": "API Key", "type": "password",
             "placeholder": "sk-...", "secret": True},
        ],
    },
    {
        "key": "embedding",
        "title": "嵌入模型（语义检索）",
        "description": "用于向量检索。留空则自动降级为本地哈希向量，仍能检索，只是语义泛化能力弱一些。",
        "fields": [
            {"key": "MSRAG_EMBEDDING_BASE_URL", "label": "接口地址", "type": "text",
             "placeholder": "https://api.siliconflow.cn/v1", "secret": False},
            {"key": "MSRAG_EMBEDDING_MODEL", "label": "模型", "type": "text",
             "placeholder": "BAAI/bge-m3", "secret": False},
            {"key": "MSRAG_EMBEDDING_API_KEY", "label": "API Key", "type": "password",
             "placeholder": "留空则复用大模型的 Key", "secret": True},
        ],
    },
    {
        "key": "ppsv3",
        "title": "ppsV3 版面解析（PP-StructureV3）",
        "description": "调用 PP-StructureV3 做版面级解析，能识别表格/公式/图题，但单篇 PDF 常需数十秒到几分钟。环境缺失会自动降级。",
        "fields": [
            {"key": "MSRAG_PPSV3_ENABLED", "label": "启用", "type": "bool", "secret": False},
            {"key": "MSRAG_PPSV3_PYTHON", "label": "解释器路径", "type": "text",
             "placeholder": "留空自动探测", "secret": False},
            {"key": "MSRAG_PPSV3_DEVICE", "label": "推理设备", "type": "text",
             "placeholder": "cpu 或 gpu:0", "secret": False},
            {"key": "MSRAG_PPSV3_ACCURATE", "label": "高精度解析", "type": "bool", "secret": False},
            {"key": "MSRAG_PPSV3_TIMEOUT", "label": "单篇超时（秒）", "type": "number", "secret": False},
        ],
    },
]

# 白名单：只有这些键允许从 UI 写入
ALLOWED_KEYS = {
    field["key"]
    for group in GROUPS
    for field in group["fields"]
}
SECRET_KEYS = {
    field["key"]
    for group in GROUPS
    for field in group["fields"]
    if field.get("secret")
}
BOOL_KEYS = {
    field["key"]
    for group in GROUPS
    for field in group["fields"]
    if field.get("type") == "bool"
}
NUMBER_KEYS = {
    field["key"]
    for group in GROUPS
    for field in group["fields"]
    if field.get("type") == "number"
}

_DEFAULTS = {
    "MSRAG_LLM_BASE_URL": "https://api.deepseek.com",
    "MSRAG_LLM_MODEL": "deepseek-chat",
    "MSRAG_EMBEDDING_BASE_URL": "https://api.siliconflow.cn/v1",
    "MSRAG_EMBEDDING_MODEL": "BAAI/bge-m3",
    "MSRAG_PPSV3_DEVICE": "cpu",
    "MSRAG_PPSV3_TIMEOUT": "900",
}


# ------------------------------------------------------------------ 掩码
def mask_secret(value: str) -> str:
    """把密钥变成 `sk-ab********yz` 形式，仅用于展示。"""
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:6]}{'*' * 8}{value[-4:]}"


def is_effectively_set(value: str) -> bool:
    """判断一个 Key 是否算"已配置"（排除占位符）。"""
    v = (value or "").strip()
    return bool(v) and v.lower() not in {"replace_me", "none", "sk-xxx", "your_key_here", "changeme"}


# ------------------------------------------------------------------ 读取
def _current_value(key: str) -> str:
    return os.environ.get(key, "").strip()


def read_settings(mask: bool = True) -> Dict[str, Any]:
    """返回按分组组织的当前配置。密钥默认只给掩码。"""
    groups = []
    for group in GROUPS:
        fields = []
        for field in group["fields"]:
            key = field["key"]
            raw = _current_value(key) or _DEFAULTS.get(key, "")
            secret = key in SECRET_KEYS
            fields.append({
                "key": key,
                "label": field["label"],
                "type": field["type"],
                "placeholder": field.get("placeholder", ""),
                "secret": secret,
                "value": mask_secret(raw) if (secret and mask) else raw,
                "configured": is_effectively_set(raw),
                "from_default": not _current_value(key) and bool(_DEFAULTS.get(key)),
            })
        groups.append({
            "key": group["key"],
            "title": group["title"],
            "description": group["description"],
            "fields": fields,
        })
    return {"groups": groups, "env_file": str(ENV_FILE), "env_file_exists": ENV_FILE.is_file()}


# ------------------------------------------------------------------ 校验
def validate(updates: Dict[str, Any]) -> Tuple[Dict[str, str], List[str]]:
    """校验并归一化 UI 提交的更新。返回 (归一化后的键值, 忽略/警告列表)。"""
    clean: Dict[str, str] = {}
    warnings: List[str] = []

    for key, value in (updates or {}).items():
        key = (key or "").strip()
        if key not in ALLOWED_KEYS:
            warnings.append(f"忽略不允许修改的配置项：{key}")
            continue

        if key in BOOL_KEYS:
            clean[key] = "true" if _as_bool(value) else "false"
            continue

        if key in NUMBER_KEYS:
            try:
                num = int(str(value).strip())
            except (TypeError, ValueError):
                warnings.append(f"{key} 不是合法数字，已忽略")
                continue
            if key == "MSRAG_PPSV3_TIMEOUT":
                num = max(30, min(num, 7200))
            clean[key] = str(num)
            continue

        text = "" if value is None else str(value).strip()
        if "\n" in text or "\r" in text:
            warnings.append(f"{key} 含换行符，已忽略")
            continue
        if len(text) > 2000:
            warnings.append(f"{key} 过长，已忽略")
            continue
        clean[key] = text

    return clean, warnings


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


# ------------------------------------------------------------------ 写入
def strip_unchanged_secrets(updates: Dict[str, Any]) -> Dict[str, Any]:
    """前端把掩码原样回传时视为"未修改"，避免用 `sk-ab****yz` 覆盖真实 Key。"""
    kept: Dict[str, Any] = {}
    for key, value in (updates or {}).items():
        if key in SECRET_KEYS and isinstance(value, str) and "*" in value:
            current = _current_value(key)
            # 只有与当前值的掩码完全一致才认为是"没改"；
            # 用户手写的含 * 的 Key 极罕见，且真实 Key 不会长这样。
            if current and mask_secret(current) == value:
                continue
            if not current:
                continue
        kept[key] = value
    return kept


def write_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """把更新写回 `.env` 并同步到进程环境变量。

    返回 ``{"updated": [...], "warnings": [...]}``。
    """
    clean, warnings = validate(strip_unchanged_secrets(updates))
    if not clean:
        return {"updated": [], "warnings": warnings or ["没有需要保存的变更"]}

    _upsert_env_file(clean)

    # 同步进程内环境，使 get_settings(reload=True) 能读到新值
    for key, value in clean.items():
        os.environ[key] = value

    return {"updated": sorted(clean.keys()), "warnings": warnings}


def _upsert_env_file(updates: Dict[str, str]) -> None:
    """原地更新 .env：保留注释与无关配置项，只替换目标键。"""
    lines: List[str] = []
    if ENV_FILE.is_file():
        try:
            lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
        except OSError:
            lines = []

    remaining = dict(updates)
    new_lines: List[str] = []
    for line in lines:
        stripped = line.strip()
        bare = stripped[len("export "):] if stripped.startswith("export ") else stripped
        if not bare or bare.startswith("#") or "=" not in bare:
            new_lines.append(line)
            continue
        key, _, _value = bare.partition("=")
        key = key.strip()
        if key in remaining:
            new_lines.append(f"{key}={remaining.pop(key)}")
        else:
            new_lines.append(line)

    if remaining:
        if new_lines and new_lines[-1].strip():
            new_lines.append("")
        new_lines.append("# 由「设置」页面写入")
        for key in sorted(remaining):
            new_lines.append(f"{key}={remaining[key]}")

    _atomic_write(ENV_FILE, "\n".join(new_lines).rstrip() + "\n")


def _atomic_write(path: Path, content: str) -> None:
    """临时文件 + os.replace，避免写一半崩溃导致 .env 损坏。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".env-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(tmp_name, path)
    except Exception:
        try:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        except OSError:
            pass
        raise


# ------------------------------------------------------------------ 测试连接
def probe_endpoint(base_url: str, api_key: str, model: str,
                   endpoint: str = "/chat/completions", timeout: int = 25) -> Dict[str, Any]:
    """用给定的（或当前的）配置发一个最小请求，验证 Key 是否可用。

    只做连通性验证，不暴露任何密钥内容。
    """
    import json as _json
    import urllib.error
    import urllib.request

    url = (base_url or "").rstrip("/") + (endpoint or "/chat/completions")
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "接口地址必须以 http:// 或 https:// 开头"}

    payload = {
        "model": model or "deepseek-chat",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": False,
    }
    data = _json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    proxy_handler = urllib.request.ProxyHandler({})  # 绕过系统代理，避免本地调试被劫持
    opener = urllib.request.build_opener(proxy_handler)

    import time as _time
    started = _time.time()
    try:
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with opener.open(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
        elapsed = int((_time.time() - started) * 1000)
        # 能拿到 200 就说明 Key 通过鉴权
        snippet = ""
        try:
            parsed = _json.loads(body)
            choices = parsed.get("choices") or []
            if choices:
                snippet = (choices[0].get("message") or {}).get("content", "")[:40]
        except Exception:
            snippet = ""
        return {"ok": True, "latency_ms": elapsed, "model": model,
                "message": "连接成功，Key 有效", "sample": snippet}
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        code = exc.code
        if code in (401, 403):
            return {"ok": False, "error": f"鉴权失败（HTTP {code}）：Key 无效或已过期"}
        if code == 402:
            return {"ok": False, "error": "账户余额不足（HTTP 402）"}
        if code == 404:
            return {"ok": False, "error": f"接口不存在（HTTP 404）：请检查接口地址与模型名"}
        if code == 429:
            return {"ok": False, "error": "请求过于频繁（HTTP 429），请稍后再试"}
        return {"ok": False, "error": f"服务端返回 HTTP {code}", "detail": detail}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": f"无法连接：{exc.reason}。请检查网络或接口地址"}
    except Exception as exc:  # 超时等
        return {"ok": False, "error": f"连接失败：{type(exc).__name__}: {exc}"}
