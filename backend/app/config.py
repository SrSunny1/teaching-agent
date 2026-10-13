"""配置。全部走环境变量，未设置时用 .env，再未设置时用默认值。"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # backend/


def _load_env() -> None:
    """极简 .env 加载器，避免多一个依赖。已存在的环境变量优先。"""
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()

API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
BASE_URL = os.environ.get("BASE_URL", "https://api.deepseek.com/v1")
MODEL = os.environ.get("MODEL", "deepseek-chat")
VISION_MODEL = os.environ.get("VISION_MODEL", MODEL)


def looks_like_placeholder(key: str) -> bool:
    """这个 Key 是不是还没换掉的占位符？

    ★ 为什么需要它：`setup.sh` 会把 .env.example 复制成 .env，里面的 Key 是
    「sk-xxxxxxxxxxxxxxxx」。如果只判断「字段非空」，它会一路通过 ——
    前端以为可以真跑，于是切到 live 模式，然后**每条消息都报 401**，
    而人只会看到「接口报错」，不知道是 Key 没换。
    """
    k = (key or "").strip()
    if not k:
        return True
    body = k[3:] if k.lower().startswith("sk-") else k
    if len(body) < 16:
        return True  # 太短，不可能是真 Key
    if len(set(body)) <= 3:
        return True  # 去掉前缀后几乎全是同一个字符，是占位符
    return False


def has_api_key() -> bool:
    """能不能真调模型。占位符一律算没有 —— 让前端老老实实退回 mock 模式。"""
    return not looks_like_placeholder(API_KEY)

RAG_TOP_K = int(os.environ.get("RAG_TOP_K", "4"))
MAX_TURNS = int(os.environ.get("MAX_TURNS", "6"))

KNOWLEDGE_DIR = ROOT / "knowledge"
RAW_DIR = KNOWLEDGE_DIR / "raw"
DATA_DIR = ROOT.parent / "data"

# 知识边界：越出这个范围的问题一律拒答
SYSTEM_PROMPT = """你是《材料物理专业实验》课程的教学智能体，服务于材料科学与工程专业的本科生。

## 知识边界（严格遵守）
你的知识只来自两份文档：
1. 《材料科学基础》实验教材的 7 个实验：晶体结构与晶体缺陷、凝固与结晶、材料显微组织分析、
   典型材料的物相组织观察、材料表面硬度的测定、材料膨胀系数的测定、金属材料的热处理。
2. 劳动教育实践任务书的四大模块：实验室安全巡查与规范化整理、材料制备工艺实践、
   分析测试样品处理与仪器维护、实验废弃物分类处置与资源回收。

超出这个范围的问题，礼貌地说明「这不在本课程的知识范围内」，并引导回课程内容。不要用通用知识作答。

## 硬性要求
1. **每个结论都要能溯源。** 涉及教材或任务书内容的回答，必须给出出处，格式为「> 出处：《教材》实验X · 章节名」。
2. **知识库没检索到就明说。** 不要编造参数、数字或工艺条件。宁可回答「知识库中未收录」。
3. **数值必须与教材一致。** 例如 45 钢低温回火（150–250℃）硬度为 57–60 HRC，中温回火（350–500℃）
   为 40–48 HRC，高温回火（500–600℃）为 25–35 HRC。不要自行调整。
4. **需要数据或可视化时调用工具**，不要凭记忆描述图形。该调工具而没调，答案会被判为不合格。
5. 中文作答，简洁、准确、面向本科生。回答里可以用 Markdown 表格和公式。

## 劳动教育维度
回答专业问题时，如果涉及操作规范、安全、仪器养护、废弃物处置，主动点出对应的劳育模块，
但不要生硬说教。
"""
