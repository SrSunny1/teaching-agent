"""文档解析编排：按扩展名分发到不同解析器，统一产出 ParsedDocument。

优先级（PDF）：
    1. PaddleOCR（可选，装了且没禁用 -> 版面 best-effort）
    2. pypdf（环境中存在 -> 兼容性最好）
    3. 内置纯 Python 提取器（零依赖兜底，保证"拷走即用"）
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..exceptions import EmptyDocumentError, ParseError
from ..text_utils import estimate_token_count
from ..types import ParsedBlock, ParsedDocument, ParsedPage

logger = logging.getLogger(__name__)

# 文本类文件的合成分页阈值（token/页）
_SYNTHETIC_PAGE_TOKENS = 900

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_NUM_HEADING_RE = re.compile(r"^\s*(\d+(?:[\.\-]\d+)*)[\.、]?\s+(.{2,60})$")
# 标题行不会以这些标点收尾；以逗号/句号结尾的通常是"被折行的正文句子"
_TERMINAL_PUNCT = "，,。；;：:！!？?、）)】」』"


def is_numbered_heading(line: str) -> bool:
    """判断一行是否是『编号标题』。

    只看"开头是数字"会误伤折行的正文（例如 "800 ℃ 保温 2 h 真空退火可使…"），
    所以额外要求：整行较短、且不以句读标点结尾。
    """
    stripped = line.strip()
    if not stripped or len(stripped) > 40:
        return False
    match = _NUM_HEADING_RE.match(stripped)
    if not match:
        return False
    if stripped[-1:] in _TERMINAL_PUNCT:
        return False
    return True
_TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
_LIST_RE = re.compile(r"^\s*(?:[-*+•]|\d+[\.\)])\s+\S+")


class DocumentParser:
    """把任意支持的文件变成 ParsedDocument。"""

    def __init__(self, mode: str = "auto"):
        # auto | paddle | text
        self.mode = (mode or "auto").lower()

    # ---------------------------------------------------------------- 入口
    def parse_path(self, path: Path, filename: str = "") -> ParsedDocument:
        path = Path(path)
        suffix = (path.suffix or (Path(filename).suffix if filename else "")).lower()
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise ParseError(f"读取文件失败: {exc}") from exc
        return self.parse_bytes(data, suffix, filename=filename or path.name)

    def parse_bytes(self, data: bytes, suffix: str, filename: str = "",
                    document_id: str = "") -> ParsedDocument:
        """解析字节内容。

        ``document_id`` 仅用于给版面解析产出的截图一个稳定的归档位置
        （``data/assets/<document_id>/``）。留空时图片会被丢弃，只保留文本。
        """
        suffix = suffix.lower()
        if suffix == ".pdf":
            doc = self._parse_pdf(data, filename, document_id=document_id)
        elif suffix in (".md", ".markdown"):
            text = _decode_bytes(data)
            doc = parse_markdown(text)
            doc.parser = "markdown"
        elif suffix in (".txt", ".text"):
            text = _decode_bytes(data)
            doc = parse_plain_text(text)
            doc.parser = "plain_text"
        else:
            raise ParseError(f"不支持的文件类型: {suffix or '(无扩展名)'}")

        _finalize(doc, data)
        if not doc.full_text.strip():
            raise EmptyDocumentError(
                "未能提取到文本内容，该文件可能是扫描件（图片型 PDF）。"
                "可安装 paddleocr 后启用 OCR 版面解析。"
            )
        if estimate_token_count(doc.full_text) < 5:
            raise EmptyDocumentError("文档文本过少，无法构建知识索引。")
        return doc

    def parse_text_content(self, text: str, ext: str = ".md", filename: str = "") -> ParsedDocument:
        ext = ext.lower()
        if ext in (".md", ".markdown"):
            doc = parse_markdown(text)
            doc.parser = "markdown"
        else:
            doc = parse_plain_text(text)
            doc.parser = "plain_text"
        _finalize(doc, text.encode("utf-8"))
        if not doc.full_text.strip():
            raise EmptyDocumentError("内容为空。")
        return doc

    # ---------------------------------------------------------------- PDF
    def _parse_pdf(self, data: bytes, filename: str, document_id: str = "") -> ParsedDocument:
        attempts: List[Tuple[str, Any]] = []

        # 0. ppsV3（PP-StructureV3 版面解析）：可选且较慢，需显式开启 + 环境可用
        if self.mode != "text":
            try:
                from core.config import get_settings
                _cfg = get_settings()
                if _cfg.ppsv3_enabled:
                    from .ppsv3_adapter import PpsV3Parser
                    _ppsv3 = PpsV3Parser(
                        python=_cfg.ppsv3_python,
                        script=_cfg.ppsv3_script,
                        device=_cfg.ppsv3_device,
                        accurate=_cfg.ppsv3_accurate,
                        timeout=_cfg.ppsv3_timeout,
                    )
                    if _ppsv3.is_available():
                        attempts.append(("ppsv3", _ppsv3))
                    else:
                        logger.info("ppsV3 已开启但环境不可用，本次走标准解析链")
            except Exception as exc:  # 探测失败一律降级，不阻断入库
                logger.debug("ppsV3 不可用: %s", exc)

        use_paddle = self.mode in ("auto", "paddle")
        if use_paddle:
            try:
                from .paddle_adapter import PaddleLayoutParser, is_available
                if is_available():
                    attempts.append(("paddle", PaddleLayoutParser()))
            except Exception:
                pass

        if self.mode != "paddle":
            attempts.append(("pypdf", _pypdf_extract))
            attempts.append(("native", _native_extract))

        if not attempts:
            attempts.append(("native", _native_extract))

        best: Optional[ParsedDocument] = None
        # 已经成功产出文本的候选，最后统一择优
        candidates: List[ParsedDocument] = []
        from core.config import get_settings
        tmp_root = get_settings().data_dir / "tmp"

        for name, extractor in attempts:
            tmp_file: Optional[Path] = None
            tmp_out: Optional[Path] = None
            try:
                # 需要落盘的解析器（外部进程要拿到真实文件路径）才写临时文件
                if name in ("ppsv3", "paddle"):
                    tmp_root.mkdir(parents=True, exist_ok=True)
                    tmp_file = tmp_root / (hashlib.sha256(data).hexdigest()[:16] + ".pdf")
                    tmp_file.write_bytes(data)

                if name == "ppsv3":
                    tmp_out = tmp_root / (tmp_file.stem + "_ppsv3")
                    result = extractor.parse(tmp_file, tmp_out)
                    if not result:
                        continue
                    # 截图先归档 —— tmp_out 在 finally 里会被整个删掉
                    archived = _archive_images(tmp_out, document_id, result["markdown_text"])
                    # 版面标签会污染 BM25 与 LLM 上下文，先收敛成干净 Markdown。
                    # 不走 parse_markdown——它按 token 预算"合成分页"，页数（27 页这种）
                    # 与 PDF 毫无关系，段落页码也全被抹成 1。这里按 ppsV3 的真实页码分。
                    tidied = _tidy_ppsv3_markdown(archived["markdown"])
                    blocks = _assign_ppsv3_pages(_markdown_blocks(tidied))
                    doc = _assemble_by_page(blocks, page_mode="ppsv3")
                    doc.parser = "ppsv3-ppstructure"
                    doc.quality = result["quality"]
                    # 没有正文块的页（整页大图）不会出现在 doc.pages 里，
                    # 所以总页数要用 ppsV3 自己统计的真值。
                    doc.page_count = int(result["quality"].get("page_count") or 0)
                    if archived["items"]:
                        doc.artifacts["images"] = archived["items"]
                        doc.quality["image_count"] = len(archived["items"])
                elif name == "paddle":
                    pages = extractor.parse(tmp_file)
                    if not pages:
                        continue
                    doc = ParsedDocument(parser="paddle-ppstructure")
                    for item in pages:
                        blocks = _blocks_from_page_text(item["text"], item["page_number"])
                        doc.pages.append(ParsedPage(
                            page_number=item["page_number"],
                            text=item["text"],
                            blocks=blocks,
                        ))
                        doc.blocks.extend(blocks)
                else:
                    page_texts, quality = extractor(data)
                    if not any(p.strip() for p in page_texts):
                        continue
                    doc = ParsedDocument(parser=name)
                    doc.quality = quality
                    for index, text in enumerate(page_texts, start=1):
                        blocks = _blocks_from_page_text(text, index)
                        doc.pages.append(ParsedPage(page_number=index, text=text, blocks=blocks))
                        doc.blocks.extend(blocks)
            except Exception as exc:
                logger.debug("解析器 %s 失败: %s", name, exc)
                continue
            finally:
                # 文本已经读进内存，临时 PDF 与解析中间产物没有保留价值。
                # 放在 finally 里，保证 continue / 异常路径也不会留下垃圾。
                _cleanup_temp(tmp_file, tmp_out)

            # 解析器已经给出真实页数时（ppsV3 / paddle 的按页结果）不要覆盖。
            if not doc.page_count:
                doc.page_count = len(doc.pages)
            candidates.append(doc)
            if self.mode != "auto" and not (self.mode == "paddle" and name != "paddle"):
                break
            if doc.parser in ("pypdf", "paddle", "ppsv3-ppstructure") and len(doc.full_text) > 200:
                break

        if not candidates:
            raise ParseError(
                "未能从该 PDF 提取到任何文本。"
                "内置解析器无法解码它的字体编码——安装 pypdf（pip install pypdf）通常即可解决；"
                "若确为扫描件（图片型 PDF），则需要在设置中启用 ppsV3 版面解析走 OCR。"
            )
        return _pick_best_pdf(candidates)


def _cleanup_temp(*paths: Optional[Path]) -> None:
    """尽力清理解析中间产物；失败只记日志，绝不影响入库结果。"""
    import shutil

    for path in paths:
        if path is None:
            continue
        try:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.exists():
                path.unlink()
        except OSError as exc:
            logger.debug("清理临时文件失败 %s: %s", path, exc)


_IMAGE_REF_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")

# 版面解析产出的截图扩展名
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

# ppsV3 的截图文件名自带页码：image_003_0015.png 是第 3 页的第 15 号块。
# 形如 img_in_formula_box_104_1112_577.png 是块内嵌套小图，没有页码。
_PPSV3_IMAGE_PAGE_RE = re.compile(r"^(?:image|table|chart)_(\d{3})_\d{4}\.\w+$")


def image_page(filename: str) -> Optional[int]:
    """从截图文件名里解析页码；嵌套小图返回 None。"""
    match = _PPSV3_IMAGE_PAGE_RE.match(filename)
    return int(match.group(1)) if match else None


def _archive_images(tmp_out: Path, document_id: str, markdown: str) -> Dict[str, Any]:
    """把 ppsV3 产出的版面截图归档，并把 Markdown 里的引用改成可访问的 URL。

    ppsV3 把截图写在 ``<output_dir>/archives/page_XXX/*.png``，Markdown 里存的是
    相对路径。而 ``tmp_out`` 随后会被 ``_cleanup_temp`` 整个删掉——如果不在这一步
    把文件搬走，文献里就会留下一堆永远打不开的死链。

    归档到 ``data/assets/<document_id>/``，URL 形如 ``/api/assets/<document_id>/x.png``。
    ``document_id`` 为空（例如单独调用解析器）时只剥离引用、不保留图片。
    """
    result: Dict[str, Any] = {"markdown": markdown, "items": []}
    if not markdown:
        return result

    items: List[Dict[str, Any]] = []
    url_map: Dict[str, str] = {}

    if document_id and tmp_out.is_dir():
        import shutil

        from core.config import get_settings

        target_dir = get_settings().data_dir / "assets" / document_id
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            logger.warning("图片归档目录创建失败，本次不保留图片: %s", exc)
            target_dir = None  # type: ignore[assignment]

        if target_dir is not None:
            # ppsV3 的文件名已带页码与块号（如 image_003_0002.png），扁平化不会撞名
            for src in sorted(tmp_out.rglob("*")):
                if not src.is_file() or src.suffix.lower() not in _IMAGE_SUFFIXES:
                    continue
                dst = target_dir / src.name
                try:
                    shutil.copy2(src, dst)
                except OSError as exc:
                    logger.debug("复制版面截图失败 %s: %s", src.name, exc)
                    continue
                # Markdown 里的相对路径用 POSIX 分隔符书写
                rel_key = src.relative_to(tmp_out).as_posix()
                url_map[rel_key] = f"/api/assets/{document_id}/{src.name}"
                items.append({
                    "url": url_map[rel_key],
                    "file": src.name,
                    "page": image_page(src.name),
                })

    def _replace(match: "re.Match[str]") -> str:
        alt, ref = match.group(1), match.group(2).strip()
        # 引用可能带 URL 编码（paddlex 偶尔会写 %20），统一还原后再查表
        from urllib.parse import unquote

        url = url_map.get(ref) or url_map.get(unquote(ref))
        if not url:
            # 归档失败或引用了不存在的图：留下 alt 文字，至少语义还在
            return alt or ""
        return f"![{alt}]({url})"

    result["markdown"] = _IMAGE_REF_RE.sub(_replace, markdown)
    result["items"] = items
    return result


# ppsV3 输出的是"带版面标签的 Markdown"，正文被形如
#   <TEXT_BLOCK id="text_001_0003" page="1" bbox="…" confidence="0.93">
# 的标签包裹。这些标签承载坐标与置信度，对 BM25 检索和 LLM 生成都是噪音
# ——BM25 会认真去匹配 "TEXT_BLOCK"、"bbox" 这类词，LLM 也会被它们干扰。
# 完整元数据已经单独落在 _blocks.json 里，所以正文这里只保留层级与文字。
# 注意：行尾一律用 [ \t]* 而不是 \s*。\s 会匹配换行，配合 MULTILINE 的 $，
# 正则会贪婪吞掉标签后面所有的空行——块与块之间赖以保持独立段落的空行就没了，
# 结果相邻的正文被粘成一个段落（页码标记也会被并进上一段）。
_PPSV3_CONTAINER_RE = re.compile(
    r"^</?(?:TEXT_BLOCK|IMAGE_BLOCK|TABLE_BLOCK|CHART_BLOCK)\b[^>]*>[ \t]*$\n?", re.MULTILINE)
_PPSV3_CLOSE_RE = re.compile(r"^</[A-Z][A-Z_0-9]*>[ \t]*$\n?", re.MULTILINE)
_PPSV3_OPEN_LINE_RE = re.compile(r"^<[A-Z][A-Z_0-9]*>[ \t]*$\n?", re.MULTILINE)
_PPSV3_INLINE_RE = re.compile(r"^<([A-Z][A-Z_0-9]*)>(.*?)</\1>[ \t]*$", re.MULTILINE)
# 块开标签上带着 PDF 真实页码（page="5"）。直接整行删掉，等于把所有段落的
# 页码都抹平成 1，引用里就只会显示"第 1 页"。先转成一行注释带下去。
_PPSV3_PAGE_OPEN_RE = re.compile(
    r"^<(?:TEXT_BLOCK|IMAGE_BLOCK|TABLE_BLOCK|CHART_BLOCK)\b"
    r"[^>]*?\bpage=\"(\d+)\"[^>]*>[ \t]*$\n?", re.MULTILINE)
_PPSV3_PAGE_MARK_RE = re.compile(r"^<!--\s*ppsv3-page:(\d+)\s*-->$")
_PPSV3_HEADINGS = {
    "DOC_TITLE": 1,
    "PARAGRAPH_TITLE": 2,
    "ABSTRACT_TITLE": 2,
    "CONTENT_TITLE": 2,
    "REFERENCE_TITLE": 2,
}


def _tidy_ppsv3_markdown(markdown: str) -> str:
    """把 ppsV3 的标签体收敛成干净的 Markdown（保留标题层级与配图引用）。"""
    if not markdown:
        return markdown
    text = markdown

    # 1) 标题类标签 -> Markdown 标题（多行、单行两种写法都覆盖）
    def _as_heading(match: "re.Match[str]", level: int) -> str:
        # to_markdown_text 把所有标题一律写成 "# …"，层级信息全丢了——
        # 先剥掉它加的 #，再按编号重建，否则章节树会塌成一层。
        body = match.group(1).strip().lstrip("#").strip()
        # ppsV3 只给得出 paragraph_title，真实层级藏在编号里：
        # "3" 是章、"3.1" 是节、"3.1.2" 再深一级
        numbered = re.match(r"^\s*\d+(?:[.\-]\d+)*", body)
        if numbered:
            level = min(level + numbered.group(0).count("."), 6)
        return "#" * level + " " + body

    for tag, level in _PPSV3_HEADINGS.items():
        text = re.sub(rf"^<{tag}>\s*\n(.+?)\s*\n</{tag}>\s*$",
                      lambda m, lv=level: _as_heading(m, lv), text, flags=re.MULTILINE)
        text = re.sub(rf"^<{tag}>(.+?)</{tag}>\s*$",
                      lambda m, lv=level: _as_heading(m, lv), text, flags=re.MULTILINE)

    # 2) 块开标签 -> 页码标记（前后各留一个空行，保证它自己成为一个独立段落，
    #    不会和正文粘在一起被合并掉）
    text = _PPSV3_PAGE_OPEN_RE.sub(
        lambda m: f"\n\n<!-- ppsv3-page:{m.group(1)} -->\n\n", text)

    # 3) 剩下的容器标签（闭标签、无页码属性的开标签），整行删除
    text = _PPSV3_CONTAINER_RE.sub("", text)

    # 4) 单行语义标签（图注、摘要等）：只留里面的文字
    text = _PPSV3_INLINE_RE.sub(lambda m: m.group(2).strip(), text)

    # 5) 剩下孤立的开/闭标签行
    text = _PPSV3_CLOSE_RE.sub("", text)
    text = _PPSV3_OPEN_LINE_RE.sub("", text)

    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _assign_ppsv3_pages(blocks: List[ParsedBlock]) -> List[ParsedBlock]:
    """消费掉页码标记块，把 PDF 真实页码贴到它后面的段落上。

    标记块在 Markdown 里是独立段落，所以 parse 出来一定是单独的 block，
    顺序与原文块一一对应——这样回填是精确对齐，不是靠相似度猜的。
    """
    kept: List[ParsedBlock] = []
    page = 1
    for block in blocks:
        mark = _PPSV3_PAGE_MARK_RE.match(block.text.strip())
        if mark:
            page = int(mark.group(1))
            continue
        block.page_number = page
        kept.append(block)
    return kept


def _assemble_by_page(blocks: List[ParsedBlock], page_mode: str) -> ParsedDocument:
    """按 block.page_number 分组成页——用于有真实页码的解析结果（ppsV3）。

    _assemble 是"按 token 预算合成分页"，页数与 PDF 无关；这里必须按真页码分。
    """
    for block in blocks:
        block.text = strip_inline_markdown(block.text)

    grouped: Dict[int, List[ParsedBlock]] = {}
    for block in blocks:
        grouped.setdefault(block.page_number, []).append(block)

    pages = [
        ParsedPage(
            page_number=number,
            text="\n\n".join(b.text for b in group),
            blocks=group,
        )
        for number, group in sorted(grouped.items())
    ]
    doc = ParsedDocument(page_count=len(pages), pages=pages, blocks=blocks)
    doc.quality = {
        "status": "success",
        "page_count": len(pages),
        "page_mode": page_mode,
        "block_count": len(blocks),
        "extractor": page_mode,
    }
    doc.artifacts["page_mode"] = page_mode
    return doc


# 解析器优先级：数字越小越可信。与 attempts 的构造顺序一致。
# pypdf 是成熟第三方实现，内置解析器只是"零依赖兜底"，因此 pypdf 排在前面。
_PARSER_RANK = {
    "ppsv3-ppstructure": 0,
    "paddle-ppstructure": 1,
    "pypdf": 2,
    "native": 3,
}

# 更可信的解析器，只要文本量不低于最优值的这个比例，就优先采用它。
_RANK_TOLERANCE = 0.67


def _pick_best_pdf(candidates: List[ParsedDocument]) -> ParsedDocument:
    """在都成功产出文本的候选里挑一个最好的。

    为什么不能只看"谁字多"
    ----------------------
    内置解析器会在字符之间插入伪空格（"STM3 2"、"htt p://"、"U nive rsit y"），
    这既让文本难以阅读，又**把字数撑大**。如果按 ``len(full_text)`` 择优，
    系统就会被这些垃圾空格误导，稳定地挑中最差的解析器。

    所以改成：先看解析器可信度，再看文本量。只有当一个可信度更高的解析器
    抽到的文本明显偏少（低于最优值的 _RANK_TOLERANCE）时，才退让给文本更多的那个。
    """
    best = max(candidates, key=lambda d: len(d.full_text))
    max_len = len(best.full_text)
    if max_len <= 0:
        return best

    floor = max_len * _RANK_TOLERANCE
    ranked = sorted(
        candidates,
        key=lambda d: (_PARSER_RANK.get(d.parser, 9), -len(d.full_text)),
    )
    for doc in ranked:
        if len(doc.full_text) >= floor:
            if doc is not best:
                logger.info(
                    "PDF 解析择优：采用 %s（%d 字）而非文本更多的 %s（%d 字）",
                    doc.parser, len(doc.full_text), best.parser, max_len,
                )
            return doc
    return best


# ---------------------------------------------------------------- 后端实现
def _pypdf_extract(data: bytes) -> Tuple[List[str], Dict[str, Any]]:
    import io
    try:
        import pypdf  # type: ignore
    except ImportError:
        try:
            import PyPDF2 as pypdf  # type: ignore
        except ImportError as exc:
            raise RuntimeError("pypdf 不可用") from exc

    reader = pypdf.PdfReader(io.BytesIO(data))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            pass
    texts = []
    for page in reader.pages:
        try:
            texts.append(page.extract_text() or "")
        except Exception:
            texts.append("")
    return texts, {"status": "success", "page_count": len(texts), "extractor": "pypdf"}


def _native_extract(data: bytes) -> Tuple[List[str], Dict[str, Any]]:
    from . import pdf_native
    return pdf_native.extract_pdf_text(data)


# ---------------------------------------------------------------- 结构化文本
def parse_markdown(text: str) -> ParsedDocument:
    """Markdown 解析：输出带 heading 层级、表格、列表的 blocks。"""
    return _assemble(_markdown_blocks(text), page_mode="synthetic")


def _markdown_blocks(text: str, page_number: int = 1) -> List[ParsedBlock]:
    """只把 Markdown 切成 blocks，不做分页。

    文本类文件没有真实页码，由 _assemble 按 token 预算合成分页；
    但 ppsV3 有 PDF 真实页码，必须按页码分页——所以两步要拆开。
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: List[ParsedBlock] = []
    heading_stack: List[str] = []

    buffer: List[str] = []
    buffer_kind = "paragraph"
    buffer_line_start = 1

    def flush() -> None:
        nonlocal buffer
        if not buffer:
            return
        content = "\n".join(buffer).strip()
        buffer = []
        if not content:
            return
        blocks.append(ParsedBlock(
            block_id=f"blk_{len(blocks):04d}",
            text=content,
            page_number=page_number,
            block_type=buffer_kind,
            section_title=heading_stack[-1] if heading_stack else "",
        ))

    for line in lines:
        stripped = line.strip()

        heading = _HEADING_RE.match(stripped)
        numbered = None if heading else (_NUM_HEADING_RE.match(stripped)
                                         if is_numbered_heading(stripped) else None)

        if heading:
            flush()
            level = len(heading.group(1))
            title = heading.group(2).strip()
            del heading_stack[level - 1:]
            while len(heading_stack) < level - 1:
                heading_stack.append("")
            heading_stack.append(title)
            blocks.append(ParsedBlock(
                block_id=f"blk_{len(blocks):04d}",
                text=title,
                page_number=page_number,
                block_type="title",
                label=f"h{level}",
                section_title=title,
                meta={"level": level},
            ))
            continue

        if numbered and len(numbered.group(1).split(".")) <= 3:
            flush()
            level = len(numbered.group(1).split("."))
            title = f"{numbered.group(1)} {numbered.group(2)}".strip()
            del heading_stack[level - 1:]
            while len(heading_stack) < level - 1:
                heading_stack.append("")
            heading_stack.append(title)
            blocks.append(ParsedBlock(
                block_id=f"blk_{len(blocks):04d}",
                text=title,
                page_number=page_number,
                block_type="title",
                label=f"h{level}",
                section_title=title,
                meta={"level": level},
            ))
            continue

        if _TABLE_ROW_RE.match(line):
            if buffer_kind != "table":
                flush()
                buffer_kind = "table"
            buffer.append(stripped)
            continue

        if _LIST_RE.match(line):
            if buffer_kind not in ("list",):
                if buffer_kind == "table":
                    flush()
                buffer_kind = "list"
            buffer.append(stripped)
            continue

        if not stripped:
            flush()
            buffer_kind = "paragraph"
            continue

        if buffer_kind in ("table",):
            flush()
        buffer_kind = "paragraph"
        buffer.append(stripped)

    flush()
    return blocks


def parse_plain_text(text: str) -> ParsedDocument:
    """纯文本：按空行切段，识别编号标题。"""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: List[ParsedBlock] = []
    heading_stack: List[str] = []
    buffer: List[str] = []

    def flush(kind: str = "paragraph") -> None:
        nonlocal buffer
        if not buffer:
            return
        content = "\n".join(buffer).strip()
        buffer = []
        if content:
            blocks.append(ParsedBlock(
                block_id=f"blk_{len(blocks):04d}",
                text=content,
                page_number=1,
                block_type=kind,
                section_title=heading_stack[-1] if heading_stack else "",
            ))

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush()
            continue
        numbered = _NUM_HEADING_RE.match(stripped) if is_numbered_heading(stripped) else None
        if numbered:
            flush()
            level = len(numbered.group(1).split("."))
            title = f"{numbered.group(1)} {numbered.group(2)}".strip()
            del heading_stack[level - 1:]
            while len(heading_stack) < level - 1:
                heading_stack.append("")
            heading_stack.append(title)
            blocks.append(ParsedBlock(
                block_id=f"blk_{len(blocks):04d}",
                text=title,
                page_number=1,
                block_type="title",
                label=f"h{level}",
                section_title=title,
                meta={"level": level},
            ))
            continue
        buffer.append(stripped)

    flush()
    return _assemble(blocks, page_mode="synthetic")


def _assemble(blocks: List[ParsedBlock], page_mode: str) -> ParsedDocument:
    """把 blocks 组织成 logical pages（文本类文件没有真实页码，做合成分页）。"""
    for block in blocks:
        block.text = strip_inline_markdown(block.text)

    pages: List[ParsedPage] = []
    current: List[ParsedBlock] = []
    tokens = 0

    def flush_page() -> None:
        nonlocal current, tokens
        if not current:
            return
        number = len(pages) + 1
        text = "\n\n".join(b.text for b in current)
        pages.append(ParsedPage(page_number=number, text=text, blocks=list(current)))
        current = []
        tokens = 0

    for block in blocks:
        cost = estimate_token_count(block.text)
        if tokens + cost > _SYNTHETIC_PAGE_TOKENS and current:
            flush_page()
        # 标题单独起新页时避免孤行
        if block.block_type == "title" and current and tokens > _SYNTHETIC_PAGE_TOKENS * 0.6:
            flush_page()
        current.append(block)
        tokens += cost

    flush_page()

    doc = ParsedDocument(page_count=len(pages), pages=pages, blocks=blocks)
    doc.quality = {
        "status": "success",
        "page_count": len(pages),
        "page_mode": page_mode,
        "block_count": len(blocks),
        "extractor": "text",
    }
    doc.artifacts["page_mode"] = page_mode
    return doc


def _blocks_from_page_text(text: str, page_number: int) -> List[ParsedBlock]:
    """从 PDF 页面文本反推出段落级 blocks。"""
    if not text.strip():
        return []
    blocks: List[ParsedBlock] = []
    paragraphs = re.split(r"\n\s*\n", text.strip())
    index = 0
    for para in paragraphs:
        para = re.sub(r"[ \t]+", " ", para).strip()
        if not para:
            continue
        block_type = "text"
        if is_numbered_heading(para):
            block_type = "title"
        if _TABLE_ROW_RE.match(para):
            block_type = "table"
        blocks.append(ParsedBlock(
            block_id=f"p{page_number:03d}_{index:03d}",
            text=para,
            page_number=page_number,
            block_type=block_type,
        ))
        index += 1
    return blocks


# ---------------------------------------------------------------- 工具
_MD_EMPHASIS = re.compile(r"\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_MD_CODE = re.compile(r"`([^`]+)`")


# 版面配图的引用必须原样留住：它们是图片在正文里的挂载点，
# 一旦被 strip 成纯文本，配图就再也找不回来了。
_KEEP_IMAGE_REF_RE = re.compile(r"!\[[^\]]*\]\(/api/assets/[^)\s]+\)")


def strip_inline_markdown(text: str) -> str:
    """去掉行内强调/链接/代码记号，只保留纯文本。

    检索与生成阶段拿到的是正文，带着 `**` 之类的记号会污染
    向量语义，也会让界面上的引文看起来很脏。

    例外：版面配图引用（``/api/assets/...``）原样保留——先藏进占位符，
    strip 完再放回去。
    """
    if not text:
        return text
    stashed: List[str] = []

    def _stash(match: "re.Match[str]") -> str:
        stashed.append(match.group(0))
        return f"\x00IMG{len(stashed) - 1}\x00"

    text = _KEEP_IMAGE_REF_RE.sub(_stash, text)

    text = _MD_LINK.sub(r"\1", text)
    text = _MD_CODE.sub(r"\1", text)
    text = _MD_EMPHASIS.sub(lambda m: next(g for g in m.groups() if g), text)

    if stashed:
        text = re.sub(r"\x00IMG(\d+)\x00",
                      lambda m: stashed[int(m.group(1))], text)
    return text


def _decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "gbk", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def sha256_of(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _finalize(doc: ParsedDocument, data: bytes) -> None:
    doc.quality.setdefault("char_count", len(doc.full_text))
    doc.quality["token_count"] = estimate_token_count(doc.full_text)
    doc.artifacts["sha256"] = sha256_of(data)
    doc.artifacts["bytes"] = len(data)
