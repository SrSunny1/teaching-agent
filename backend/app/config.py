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


def _clean_api_key(raw: str) -> str:
    """清洗环境变量或 .env 里的 API Key。

    云平台（Render 等）网页端粘贴环境变量时，极易带入首尾空格、换行、引号，
    甚至整行 `DEEPSEEK_API_KEY=sk-...`。一旦含空白或换行，httpx 构造
    Authorization 请求头会直接抛 LocalProtocolError，被 OpenAI 包装成
    APIConnectionError: Connection error.
    """
    for line in (raw or "").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" in s:
            k, _, v = s.partition("=")
            if "KEY" in k.upper():
                s = v.strip()
            else:
                continue
        s = s.strip('"').strip("'").strip()
        if s.lower().startswith("bearer "):
            s = s[7:].strip()
        cleaned = "".join(ch for ch in s if ch.isascii() and not ch.isspace())
        if cleaned:
            return cleaned
    return ""


API_KEY = _clean_api_key(os.environ.get("DEEPSEEK_API_KEY", ""))
BASE_URL = os.environ.get("BASE_URL", "https://api.deepseek.com/v1").strip().strip('"').strip("'")
# ★ 兜底默认值必须跟 .env.example 一致。DeepSeek 现在只提供
#   deepseek-flash（支持图片）和 deepseek-v4-pro（纯文本），deepseek-chat 已经下线。
#   不改这里的话，队友跑 setup.sh（它会把 .env.example 复制成 .env）拿到旧名字就会 400。
MODEL = os.environ.get("MODEL", "deepseek-flash").strip().strip('"').strip("'")
VISION_MODEL = os.environ.get("VISION_MODEL", MODEL).strip().strip('"').strip("'")


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
你的知识只来自以下课程材料：
1. 《材料科学基础》实验教材的 7 个实验：晶体结构与晶体缺陷、凝固与结晶、材料显微组织分析、
   典型材料的物相组织观察、材料表面硬度的测定、材料膨胀系数的测定、金属材料的热处理。
2. 材料物理专业实验1/2 的教学大纲与配套课件：晶体结构与晶体缺陷、结晶与凝固、金相试样制备、
   表面硬度测定、膨胀系数测定、金属材料热处理综合实验等。教学大纲还列有磁性能、居里点、
   差示扫描量热、热失重、固相反应、导热系数、纳米陶瓷等实验；这些内容可以依据大纲回答，
   但知识库没有具体数据时必须明说「知识库未收录」，不得编造实验数据。
3. 劳动教育实践任务书的四大模块：实验室安全巡查与规范化整理、材料制备工艺实践、
   分析测试样品处理与仪器维护、实验废弃物分类处置与资源回收。
4. 已入库的“劳育公开补充”仅服务上述四大模块。区分公开制度摘编和待教师确认的课程应用建议，
   引用具体发布机构、文档名与链接；其他高校制度不是本校制度，不得据此认定本校学时、成绩或操作权限。
   未检索到依据时不得自行补充安全操作步骤；未知废物、故障设备交教师或管理人员处理。

超出这个范围的问题，礼貌地说明「这不在本课程的知识范围内」，并引导回课程内容。不要用通用知识作答。

## 硬性要求
1. **每个结论都要能溯源。** 涉及课程内容的回答，必须给出出处，格式按来源区分：
   - 教材：`> 出处：《教材》实验X · 章节名`
   - 课程讲义：`> 出处：《课程讲义·晶体结构与晶体缺陷》实验一 · 实验原理`
   - 教学大纲：`> 出处：《教学大纲·材料物理专业实验2》课程总览 · 实验内容`
   - 任务书：`> 出处：《任务书》劳育模块X · 章节名`
2. **知识库没检索到就明说。** 不要编造参数、数字或工艺条件。宁可回答「知识库中未收录」。
   原文附件版本2与版本6不代表新旧顺序，有冲突时分别引用并请教师确认。课件的图片、公式对象与曲线
   未完整文字化时，不推测其数值；仅有大纲标题不等于已具备该实验的详细操作资料。
3. **数值必须与教材一致。** 例如 45 钢低温回火（150–250℃）硬度为 57–60 HRC，中温回火（350–500℃）
   为 40–48 HRC，高温回火（500–600℃）为 25–35 HRC。不要自行调整。
   ★ 讲义/课件给出的通用碳钢区间（如低温回火 58–65 HRC、中温 35–50 HRC、高温 20–30 HRC）
   与教材 45 钢实测曲线不一致时，必须分别注明「通用碳钢口径」和「教材 45 钢口径」；
   本课程的热处理数值计算以教材 45 钢曲线为准，不要用一个口径覆盖另一个。
4. **需要数据或可视化时调用工具**，不要凭记忆描述图形。该调工具而没调，答案会被判为不合格。
5. 中文作答，简洁、准确、面向本科生。回答里可以用 Markdown 表格和公式。

## 教学维度
回答专业问题时，如果涉及操作规范、安全、仪器养护、废弃物处置，主动点出对应的劳育模块，
但不要生硬说教。大纲和讲义里的「学生容易犯的错误」可以用于提醒学生，但不要说成是对某个学生的评价。
"""
