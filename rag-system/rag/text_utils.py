"""文本处理工具：Token 估算、CJK 友好的分词。

原项目直接用正则估算 token 数（不引 tokenizer 依赖），这里保留同样思路，
并补齐 BM25 所需的中文分词（中文用字符二元组，效果接近且零依赖）。
"""

from __future__ import annotations

import re
from typing import List

# 同原项目：中日韩字符单独计数，英文按词计数。
_TOKEN_PATTERN = re.compile(
    r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]"
    r"|[A-Za-z0-9]+(?:[-_/'’\.][A-Za-z0-9]+)*"
    r"|[^\s]"
)

_CJK_RANGE = (
    "\u4e00-\u9fff"      # CJK 统一汉字
    "\u3400-\u4dbf"      # 扩展 A
    "\u3040-\u30ff"      # 日文假名
    "\uac00-\ud7af"      # 韩文
)

_CJK_CHAR = re.compile(f"[{_CJK_RANGE}]")
_NON_WORD = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)

# 材料科学常见符号/单位，避免被当成噪声切碎
_UNIT_KEEP = re.compile(
    r"MPa|GPa|kPa|wt\.?%|at\.?%|vol\.?%|mol\.?%|[°℃℉]|[αβγδθλμνσφω]",
)


def estimate_token_count(text: str) -> int:
    """估算 token 数（中文 1 字 ≈ 1 token，英文约 1 词 ≈ 1.3 token 折算）。"""
    if not text:
        return 0
    return len(_TOKEN_PATTERN.findall(text))


def contains_cjk(text: str) -> bool:
    return bool(_CJK_CHAR.search(text))


def tokenize_for_bm25(text: str) -> List[str]:
    """BM25 分词：CJK 用字符二元组 + 单字，ASCII 用词。

    例："高熵合金" -> ["高熵", "熵合", "合金", "高", "熵", "合", "金"]
    这样既能匹配"合金"，也能匹配"高熵"。
    """
    if not text:
        return []
    tokens: List[str] = []

    # 单位/希腊字母保留为整体 token
    for match in _UNIT_KEEP.finditer(text):
        tokens.append(match.group(0))

    buffer: List[str] = []
    for char in text.lower():
        if _CJK_CHAR.match(char):
            buffer.append(char)
        else:
            if buffer:
                tokens.extend(_cjk_tokens("".join(buffer)))
                buffer = []
            if char.isalnum():
                buffer.append(char)
            elif buffer:
                tokens.append("".join(buffer))
                buffer = []
    if buffer:
        joined = "".join(buffer)
        tokens.extend(_cjk_tokens(joined) if _CJK_CHAR.match(joined[0]) else [joined])
    return [t for t in tokens if t]


def _cjk_tokens(segment: str) -> List[str]:
    out: List[str] = []
    if len(segment) == 1:
        return [segment]
    for i in range(len(segment) - 1):
        out.append(segment[i:i + 2])
    out.extend(list(segment))
    return out


def truncate(text: str, limit: int, suffix: str = "...") -> str:
    if limit <= 0 or len(text) <= limit:
        return text
    return text[:limit].rstrip() + suffix


def collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def preview(text: str, limit: int = 180) -> str:
    return truncate(collapse_whitespace(text), limit)
