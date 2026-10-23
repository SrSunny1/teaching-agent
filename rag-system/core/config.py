"""材料科学 RAG 知识库 —— 全局配置。

零第三方依赖：只使用标准库加载环境变量，
因此本插件可以在任何 Python 3.9+ 环境直接启动。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

# 项目根目录 = 本文件的上上级（core/config.py -> 项目根）
ROOT_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(env_path: Optional[Path] = None) -> None:
    """手写一个极简 .env 解析器。

    约定：进程内已存在的环境变量优先级更高（方便 CI / 启动脚本覆盖）。
    """
    path = env_path or (ROOT_DIR / ".env")
    if not path.is_file():
        return
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return

    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # 去掉包裹引号
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        # 去掉行尾注释（仅当引号之外）
        if value[:1] not in ("'", '"'):
            for prefix in ("  #", "\t#"):
                idx = value.find(prefix)
                if idx != -1:
                    value = value[:idx].rstrip()
        os.environ.setdefault(key, value)


_load_dotenv()


def _env_str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_list(name: str, default: Optional[List[str]] = None) -> List[str]:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    """运行时配置快照。"""

    # ---------- 基础 ----------
    app_name: str = "材料科学 RAG 知识库"
    version: str = "1.0.0"
    env: str = "development"
    debug: bool = True

    host: str = "127.0.0.1"
    port: int = 8765
    # 跨域白名单。默认空 = 只允许同源：服务只监听本机，若默认放行 "*"，
    # 用户浏览器中的任意网页都能静默读取本机知识库。
    # 插件的正常接入方式是 SDK / 命令行（服务端调用，不受 CORS 约束）。
    cors_origins: List[str] = field(default_factory=list)

    # ---------- 路径 ----------
    root_dir: Path = ROOT_DIR
    data_dir: Path = ROOT_DIR / "data"
    upload_dir: Path = ROOT_DIR / "data" / "uploads"
    samples_dir: Path = ROOT_DIR / "samples"
    web_dir: Path = ROOT_DIR / "web"
    log_dir: Path = ROOT_DIR / "data" / "logs"

    database_path: Path = ROOT_DIR / "data" / "msrag.db"
    vector_index_path: Path = ROOT_DIR / "data" / "vectors.json"

    # ---------- 行为开关 ----------
    auto_seed_samples: bool = True      # 首次启动自动灌入示例语料
    open_browser: bool = True           # 启动后自动打开浏览器
    run_smoke_test: bool = True         # 启动后自动跑一遍全流程冒烟

    # ---------- 解析 ----------
    # auto: 有 PaddleOCR 就用，否则降级；paddle: 强制；text: 强制轻量文本抽取
    parser_mode: str = "auto"
    max_upload_mb: int = 50
    allowed_extensions: List[str] = field(
        default_factory=lambda: [".pdf", ".md", ".markdown", ".txt", ".text"]
    )

    # ---------- ppsV3 版面解析（可选、较慢） ----------
    # PP-StructureV3 需要 Python 3.9~3.11 + paddlepaddle，通过子进程调用。
    # 默认关闭：单篇 PDF 常需数十秒到数分钟，适合"少量重要文献"而非批量上传。
    ppsv3_enabled: bool = False
    ppsv3_python: str = ""      # 装了 paddleocr 的解释器；留空则自动探测
    ppsv3_script: str = ""      # 解析脚本；留空用插件内置 ppsv3/rag.py
    ppsv3_device: str = "cpu"   # cpu 或 gpu:0
    ppsv3_accurate: bool = False  # True=开启表格/公式/图表识别（更慢、更吃显存）
    ppsv3_timeout: int = 900    # 单篇解析超时（秒）

    # ---------- 分块（沿用原项目"父子双层"策略） ----------
    chunk_size: int = 700
    chunk_overlap: int = 120
    min_chunk_tokens: int = 30

    # ---------- 嵌入 ----------
    # auto: 依次尝试 remote api -> 本地 sentence-transformers/FlagEmbedding -> 哈希降级
    embedding_provider: str = "auto"
    embedding_base_url: str = "https://api.siliconflow.cn/v1"
    embedding_api_key: str = ""
    embedding_model: str = "BAAI/bge-m3"
    embedding_endpoint: str = "/embeddings"
    embedding_timeout: int = 30
    embedding_dim: int = 512          # 哈希降级模式下的向量维度

    # ---------- 检索 ----------
    top_k: int = 6
    max_top_k: int = 50
    enable_bm25: bool = True          # 稀疏关键词通道，与稠密向量混合
    bm25_weight: float = 0.35         # 混合检索里 BM25 的占比
    min_relevance: float = 0.0

    # ---------- 生成 ----------
    llm_provider: str = "openai-compatible"
    llm_base_url: str = "https://api.deepseek.com"
    llm_endpoint: str = "/chat/completions"
    llm_api_key: str = ""
    llm_model: str = "deepseek-chat"
    llm_temperature: float = 0.2
    llm_max_tokens: int = 2048
    llm_timeout: int = 120

    max_context_chars: int = 12000
    max_citations: int = 6
    quote_chars: int = 600

    # ---------- 主题 ----------
    domain_label: str = "材料科学"
    domain_keywords: List[str] = field(default_factory=lambda: [
        "材料", "合金", "晶体", "相图", "热处理", "XRD", "SEM", "TEM",
        "拉伸强度", "屈服强度", "硬度", "韧性", "疲劳", "腐蚀",
        "电池", "正极", "负极", "电解质", "钙钛矿", "半导体", "聚合物",
        "陶瓷", "复合材料", "薄膜", "催化", "纳米", "烧结", "晶界",
    ])

    @property
    def base_url(self) -> str:
        shown = "127.0.0.1" if self.host in ("0.0.0.0", "::") else self.host
        return f"http://{shown}:{self.port}"

    @property
    def has_llm(self) -> bool:
        key = self.llm_api_key.strip()
        return bool(key) and key.lower() not in {"replace_me", "none", "sk-xxx"}

    @property
    def upload_max_bytes(self) -> int:
        return max(1, self.max_upload_mb) * 1024 * 1024

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.upload_dir, self.log_dir):
            path.mkdir(parents=True, exist_ok=True)

    # ---------------- 加载 ----------------
    @classmethod
    def from_env(cls) -> "Settings":
        # DeepSeek 是默认 LLM，同时兼容原始项目的变量名
        llm_key = (
            _env_str("MSRAG_LLM_API_KEY")
            or _env_str("DEEPSEEK_API_KEY")
            or _env_str("LLM_API_KEY")
            or _env_str("OPENAI_API_KEY")
        )
        llm_base = (
            _env_str("MSRAG_LLM_BASE_URL")
            or _env_str("DEEPSEEK_BASE_URL")
            or _env_str("LLM_BASE_URL")
            or "https://api.deepseek.com"
        )
        llm_model = (
            _env_str("MSRAG_LLM_MODEL")
            or _env_str("DEEPSEEK_MODEL")
            or _env_str("LLM_MODEL")
            or "deepseek-chat"
        )
        llm_endpoint = _env_str("MSRAG_LLM_ENDPOINT") or _env_str("LLM_ENDPOINT") or "/chat/completions"

        embed_key = (
            _env_str("MSRAG_EMBEDDING_API_KEY")
            or _env_str("EMBEDDING_API_KEY")
            or llm_key  # OpenAI 兼容厂商通常一个 key 通吃
        )
        embed_url = _env_str("MSRAG_EMBEDDING_BASE_URL") or _env_str("EMBEDDING_BASE_URL") or llm_base
        embed_model = _env_str("MSRAG_EMBEDDING_MODEL") or _env_str("EMBEDDING_MODEL") or "BAAI/bge-m3"

        settings = cls(
            app_name=_env_str("MSRAG_APP_NAME") or "材料科学 RAG 知识库",
            version=_env_str("MSRAG_VERSION") or "1.0.0",
            env=_env_str("MSRAG_ENV") or "development",
            debug=_env_bool("MSRAG_DEBUG", True),

            host=_env_str("MSRAG_HOST") or _env_str("HOST") or "127.0.0.1",
            port=_env_int("MSRAG_PORT", _env_int("PORT", 8765)),
            cors_origins=_env_list("MSRAG_CORS_ORIGINS", []),

            auto_seed_samples=_env_bool("MSRAG_AUTO_SEED", True),
            open_browser=_env_bool("MSRAG_OPEN_BROWSER", True),
            run_smoke_test=_env_bool("MSRAG_SMOKE_TEST", True),

            parser_mode=(_env_str("MSRAG_PARSER_MODE") or "auto").lower(),
            max_upload_mb=_env_int("MSRAG_MAX_UPLOAD_MB", 50),

            ppsv3_enabled=_env_bool("MSRAG_PPSV3_ENABLED", False),
            ppsv3_python=_env_str("MSRAG_PPSV3_PYTHON"),
            ppsv3_script=_env_str("MSRAG_PPSV3_SCRIPT"),
            ppsv3_device=_env_str("MSRAG_PPSV3_DEVICE") or "cpu",
            ppsv3_accurate=_env_bool("MSRAG_PPSV3_ACCURATE", False),
            ppsv3_timeout=_env_int("MSRAG_PPSV3_TIMEOUT", 900),

            chunk_size=_env_int("MSRAG_CHUNK_SIZE", 700),
            chunk_overlap=_env_int("MSRAG_CHUNK_OVERLAP", 120),
            min_chunk_tokens=_env_int("MSRAG_MIN_CHUNK_TOKENS", 30),

            embedding_provider=(_env_str("MSRAG_EMBEDDING_PROVIDER") or "auto").lower(),
            embedding_base_url=embed_url,
            embedding_api_key=embed_key,
            embedding_model=embed_model,
            embedding_endpoint=_env_str("MSRAG_EMBEDDING_ENDPOINT") or "/embeddings",
            embedding_timeout=_env_int("MSRAG_EMBEDDING_TIMEOUT", 30),
            embedding_dim=_env_int("MSRAG_EMBEDDING_DIM", 512),

            top_k=_env_int("MSRAG_TOP_K", 6),
            max_top_k=_env_int("MSRAG_MAX_TOP_K", 50),
            enable_bm25=_env_bool("MSRAG_ENABLE_BM25", True),
            bm25_weight=_env_float("MSRAG_BM25_WEIGHT", 0.35),
            min_relevance=_env_float("MSRAG_MIN_RELEVANCE", 0.0),

            llm_base_url=llm_base,
            llm_endpoint=llm_endpoint,
            llm_api_key=llm_key,
            llm_model=llm_model,
            llm_temperature=_env_float("MSRAG_LLM_TEMPERATURE", 0.2),
            llm_max_tokens=_env_int("MSRAG_LLM_MAX_TOKENS", 2048),
            llm_timeout=_env_int("MSRAG_LLM_TIMEOUT", 120),

            max_context_chars=_env_int("MSRAG_MAX_CONTEXT_CHARS", 12000),
            max_citations=_env_int("MSRAG_MAX_CITATIONS", 6),
            quote_chars=_env_int("MSRAG_QUOTE_CHARS", 600),
        )
        return settings


_settings: Optional[Settings] = None


def get_settings(reload: bool = False) -> Settings:
    """获取全局配置（进程内缓存）。"""
    global _settings
    if _settings is None or reload:
        _settings = Settings.from_env()
        _settings.ensure_dirs()
    return _settings


def reload_settings() -> Settings:
    return get_settings(reload=True)
