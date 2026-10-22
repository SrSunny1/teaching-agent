"""PaddleOCR 适配器（可选）。

原项目用 PP-StructureV3 做版面解析（OCR + 表格 + 公式），效果好但依赖极重
（paddlepaddle + 模型权重，GB 级）。因此本模块设计成**可选增强**：
    - 装了 paddleocr 且没禁用 -> 走 OCR 版面解析
    - 没装 / 调用失败       -> 自动降级到文本层提取，并在元数据里标注

这样插件在"干净的机器上能跑"，在"装过 OCR 的机器上更好"。
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# PaddleOCR 在 Windows CPU 上常见的坑（沿用原项目的调优项）
_PADDLE_ENV = {
    "FLAGS_use_onednn": "False",
    "FLAGS_use_mkldnn": "False",
    "FLAGS_enable_pir_api": "False",
    "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": "True",
}


def is_available() -> bool:
    """检测 PaddleOCR 是否可用（只探测，不真正加载模型）。"""
    try:
        import importlib.util
        return importlib.util.find_spec("paddleocr") is not None
    except Exception:
        return False


def describe() -> Dict[str, Any]:
    available = is_available()
    info: Dict[str, Any] = {"installed": available, "pipeline": "PPStructureV3"}
    if available:
        try:
            import paddleocr  # type: ignore
            info["version"] = getattr(paddleocr, "__version__", "unknown")
        except Exception as exc:
            info["version"] = f"import-error: {exc}"
            info["installed"] = False
    return info


class PaddleLayoutParser:
    """PP-StructureV3 版面解析封装。失败即降级，不抛给上层。"""

    def __init__(self, lang: str = "ch", device: str = "cpu", **kwargs: Any):
        self.lang = lang
        self.device = device
        self.options = kwargs
        self._pipeline = None
        self.enabled = False

    def load(self) -> bool:
        if self._pipeline is not None:
            return True
        try:
            for key, value in _PADDLE_ENV.items():
                os.environ.setdefault(key, value)
            from paddleocr import PPStructureV3  # type: ignore

            self._pipeline = PPStructureV3(
                lang=self.lang,
                device=self.device,
                use_doc_orientation_classify=self.options.get("use_doc_orientation_classify", True),
                use_doc_unwarping=self.options.get("use_doc_unwarping", True),
                use_textline_orientation=self.options.get("use_textline_orientation", True),
                use_table_recognition=self.options.get("use_table_recognition", True),
                use_formula_recognition=self.options.get("use_formula_recognition", False),
                use_chart_recognition=self.options.get("use_chart_recognition", False),
            )
            self.enabled = True
            logger.info("PaddleOCR PP-StructureV3 已加载")
            return True
        except Exception as exc:  # 加载失败不应阻断整个流水线
            logger.warning("PaddleOCR 加载失败，将降级到文本层提取: %s", exc)
            self._pipeline = None
            self.enabled = False
            return False

    def parse(self, pdf_path: Path) -> Optional[List[Dict[str, Any]]]:
        """返回每页结果；不可用时返回 None。"""
        if not self.load():
            return None
        try:
            results = list(self._pipeline.predict(str(pdf_path)))
        except Exception as exc:
            logger.warning("PaddleOCR 解析失败: %s", exc)
            return None

        pages: List[Dict[str, Any]] = []
        for index, item in enumerate(results, start=1):
            try:
                markdown_text = getattr(item, "markdown", None)
                if callable(markdown_text):
                    markdown_text = markdown_text()
                text = markdown_text or ""
            except Exception:
                text = ""
            pages.append({
                "page_number": index,
                "text": text,
                "blocks": getattr(item, "parsing_result_list", []) or [],
            })
        if not any(page["text"].strip() for page in pages):
            return None
        return pages
