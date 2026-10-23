import argparse
import json
import os
import re
import time
import traceback
from collections import Counter
from pathlib import Path

os.environ["FLAGS_use_onednn"] = "False"
os.environ["FLAGS_use_mkldnn"] = "False"
os.environ["FLAGS_enable_pir_api"] = "False"
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import numpy as np
from PIL import Image
from paddleocr import PPStructureV3

BASE_DIR = Path(__file__).resolve().parent

VISUAL_LABELS = {"image", "chart", "table"}
TITLE_TO_VISUAL = {
    "figure_title": "image",
    "chart_title": "chart",
    "table_title": "table",
}
VISUAL_TO_TITLE = {value: key for key, value in TITLE_TO_VISUAL.items()}
HEADER_FOOTER_LABELS = {"header", "footer", "number", "header_image", "footer_image"}
TEXTUAL_LABELS = {
    "doc_title",
    "paragraph_title",
    "abstract_title",
    "reference_title",
    "content_title",
    "abstract",
    "text",
    "reference",
    "vision_footnote",
    "content",
    "formula",
    "algorithm",
    "footnote",
    "aside_text",
}


def normalize_inline_text(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def normalize_paragraph_text(text):
    text = (text or "").replace("\r\n", "\n")
    return text.strip()


def normalize_title_label(label, content):
    text = normalize_inline_text(content)
    if re.match(r"^表\s*\d+", text):
        return "table_title"
    if re.match(r"^图\s*\d+", text):
        return "figure_title"
    return label


def should_skip_block(block):
    label = block.label
    content = normalize_inline_text(getattr(block, "content", ""))

    if getattr(block, "merged_into_prev", False):
        return True
    if label == "table" and not normalize_paragraph_text(getattr(block, "content", "")):
        return True
    if label in HEADER_FOOTER_LABELS:
        return True
    if not content and label not in VISUAL_LABELS:
        return True
    if re.fullmatch(r"\d+", content):
        return True
    if content.startswith("http://") or content.startswith("https://"):
        return True
    if "xjtu.edu.cn" in content.replace(" ", "").lower():
        return True
    if "西安交通大学学报" in content and len(content) <= 40:
        return True
    if "journal of" in content.lower() and len(content) <= 80:
        return True
    if re.search(r"第\d+卷第\d+期", content):
        return True
    return False


def to_markdown_text(block):
    label = normalize_title_label(block.label, getattr(block, "content", ""))
    content = normalize_paragraph_text(getattr(block, "content", ""))

    if not content:
        return ""

    if label == "doc_title":
        return f"# {normalize_inline_text(content)}"
    if label in {"paragraph_title", "abstract_title", "reference_title", "content_title"}:
        return f"## {normalize_inline_text(content)}"
    if label == "abstract":
        return content.replace("\n", "\n\n")
    if label in {"text", "reference", "vision_footnote"}:
        return content.replace("\n", "\n\n")
    if label == "content":
        return content.replace("\n", "  \n")
    if label == "formula":
        return f"$${content}$$"
    if label == "algorithm":
        return f"```text\n{content}\n```"
    if label in {"header", "footer", "number", "footnote", "aside_text"}:
        return content
    if label in TITLE_TO_VISUAL:
        tag = label.upper()
        return f"<{tag}>{normalize_inline_text(content)}</{tag}>"
    return content


def bbox_to_str(bbox):
    return ",".join(str(int(v)) for v in bbox)


# ---------------------------------------------------------------------------
# [问题1] Block 置信度：从 layout_det_res / overall_ocr_res 提取并绑定到 block
# ---------------------------------------------------------------------------

def bbox_overlap_ratio(box_a, box_b):
    """计算两个 bbox 的重叠比例（相对较小框）。"""
    ax1, ay1, ax2, ay2 = [float(v) for v in box_a[:4]]
    bx1, by1, bx2, by2 = [float(v) for v in box_b[:4]]
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = min(area_a, area_b)
    return inter / denom if denom > 0 else 0.0


def match_layout_detection_score(block, result):
    """匹配 layout 检测框，返回 PaddleOCR 原生 layout score。"""
    layout_det_res = result.get("layout_det_res")
    if not layout_det_res:
        return None
    boxes = layout_det_res.get("boxes", []) if hasattr(layout_det_res, "get") else []
    block_bbox = list(getattr(block, "bbox", []) or [])
    if len(block_bbox) < 4:
        return None

    best_score = None
    best_overlap = 0.0
    for box_info in boxes:
        coord = box_info.get("coordinate") or box_info.get("block_bbox")
        if not coord:
            continue
        overlap = bbox_overlap_ratio(block_bbox, coord)
        if overlap > best_overlap:
            best_overlap = overlap
            score = box_info.get("score")
            if score is not None:
                best_score = float(score)
    if best_overlap < 0.3 or best_score is None:
        return None
    return round(best_score, 4)


def match_ocr_recognition_scores(block, result):
    """匹配 block 内 OCR 文本行，返回 rec_scores 列表。"""
    overall_ocr_res = result.get("overall_ocr_res")
    if not overall_ocr_res:
        return []
    rec_boxes = overall_ocr_res.get("rec_boxes")
    rec_scores = overall_ocr_res.get("rec_scores")
    if rec_boxes is None or rec_scores is None:
        return []

    block_bbox = list(getattr(block, "bbox", []) or [])
    if len(block_bbox) < 4:
        return []

    matched_scores = []
    rec_boxes_list = list(rec_boxes)
    rec_scores_list = list(rec_scores)
    for idx, ocr_box in enumerate(rec_boxes_list):
        if bbox_overlap_ratio(block_bbox, ocr_box) >= 0.3:
            matched_scores.append(float(rec_scores_list[idx]))
    return matched_scores


def extract_block_confidence(block, result):
    """
    汇总 block 级置信度：
    - layout_score: 版面检测置信度
    - ocr_confidence: 块内 OCR 行 rec_score 均值
    - confidence: 综合置信度（layout 与 OCR 均值，供 RAG 过滤）
    """
    layout_score = match_layout_detection_score(block, result)
    ocr_scores = match_ocr_recognition_scores(block, result)
    ocr_confidence = round(float(np.mean(ocr_scores)), 4) if ocr_scores else None

    if layout_score is not None and ocr_confidence is not None:
        confidence = round((layout_score + ocr_confidence) / 2, 4)
    elif layout_score is not None:
        confidence = layout_score
    elif ocr_confidence is not None:
        confidence = ocr_confidence
    else:
        confidence = None

    payload = {}
    if layout_score is not None:
        payload["layout_score"] = layout_score
    if ocr_confidence is not None:
        payload["ocr_confidence"] = ocr_confidence
        payload["ocr_line_count"] = len(ocr_scores)
    if confidence is not None:
        payload["confidence"] = confidence
    return payload


def confidence_xml_attrs(confidence_info):
    if not confidence_info or confidence_info.get("confidence") is None:
        return ""
    return f' confidence="{confidence_info["confidence"]:.4f}"'


def apply_confidence_to_metadata(metadata, confidence_info):
    if confidence_info:
        metadata.update(confidence_info)
    return metadata


# ---------------------------------------------------------------------------
# [问题2] 跨页表格合并：HTML 合并、重复表头去重、断行修复
# （逻辑参考 PaddleX layout_parsing/merge_table.py，适配本工程 block 结构）
# ---------------------------------------------------------------------------

TABLE_MERGE_CONTINUE_KEYWORDS = ["continue", "continued", "cont'd", "续", "cont'd", "續"]
TABLE_MERGE_ALLOWED_FOLLOW_LABELS = {
    "footer",
    "vision_footnote",
    "number",
    "footnote",
    "footer_image",
    "seal",
}
TABLE_MERGE_ALLOWED_BEFORE_LABELS = {"header", "header_image", "number", "seal"}


def _table_full_to_half(text):
    result = []
    for char in text:
        code = ord(char)
        if 0xFF01 <= code <= 0xFF5E:
            result.append(chr(code - 0xFEE0))
        else:
            result.append(char)
    return "".join(result)


def _table_normalize_cell_text(cell):
    return "".join(_table_full_to_half(cell.get_text()).split())


def _table_calculate_total_columns(soup):
    rows = soup.find_all("tr")
    if not rows:
        return 0
    max_cols = 0
    occupied = {}
    for row_idx, row in enumerate(rows):
        col_idx = 0
        if row_idx not in occupied:
            occupied[row_idx] = {}
        for cell in row.find_all(["td", "th"]):
            while col_idx in occupied[row_idx]:
                col_idx += 1
            colspan = int(cell.get("colspan", 1))
            rowspan = int(cell.get("rowspan", 1))
            for r in range(row_idx, row_idx + rowspan):
                if r not in occupied:
                    occupied[r] = {}
                for c in range(col_idx, col_idx + colspan):
                    occupied[r][c] = True
            col_idx += colspan
            max_cols = max(max_cols, col_idx)
    return max_cols


def _table_calculate_row_columns(row):
    return sum(int(cell.get("colspan", 1)) for cell in row.find_all(["td", "th"]))


def _table_calculate_visual_columns(row):
    return len(row.find_all(["td", "th"]))


def detect_duplicate_table_headers(soup_prev, soup_curr, max_header_rows=5):
    """识别两页表格顶部重复表头行数。"""
    rows_prev = soup_prev.find_all("tr")
    rows_curr = soup_curr.find_all("tr")
    min_rows = min(len(rows_prev), len(rows_curr), max_header_rows)
    header_rows = 0
    headers_match = True
    for i in range(min_rows):
        cells_prev = rows_prev[i].find_all(["td", "th"])
        cells_curr = rows_curr[i].find_all(["td", "th"])
        if len(cells_prev) != len(cells_curr):
            headers_match = header_rows > 0
            break
        match = True
        for c_prev, c_curr in zip(cells_prev, cells_curr):
            text_prev = _table_normalize_cell_text(c_prev)
            text_curr = _table_normalize_cell_text(c_curr)
            if (
                text_prev != text_curr
                or int(c_prev.get("colspan", 1)) != int(c_curr.get("colspan", 1))
            ):
                match = False
                break
        if match:
            header_rows += 1
        else:
            headers_match = header_rows > 0
            break
    if header_rows == 0:
        headers_match = False
    return header_rows, headers_match


def _table_rows_structure_match(soup_prev, soup_curr):
    rows_prev = soup_prev.find_all("tr")
    rows_curr = soup_curr.find_all("tr")
    if not rows_prev or not rows_curr:
        return False
    header_count, _ = detect_duplicate_table_headers(soup_prev, soup_curr)
    first_data_row = rows_curr[header_count] if len(rows_curr) > header_count else None
    if first_data_row is None:
        return False
    last_row = rows_prev[-1]
    last_cols = _table_calculate_row_columns(last_row)
    first_cols = _table_calculate_row_columns(first_data_row)
    last_visual = _table_calculate_visual_columns(last_row)
    first_visual = _table_calculate_visual_columns(first_data_row)
    return last_cols == first_cols or last_visual == first_visual


def _table_block_is_skippable(block, allowed_labels):
    if block.label in allowed_labels:
        return True
    content = normalize_inline_text(getattr(block, "content", ""))
    if any(kw in content.lower() for kw in TABLE_MERGE_CONTINUE_KEYWORDS):
        return True
    return False


def can_merge_cross_page_tables(page_prev, prev_block, page_curr, curr_block):
    """判断相邻页首尾 table 是否可跨页合并。"""
    from bs4 import BeautifulSoup

    x0, _, x1, _ = prev_block.bbox
    x2, _, x3, _ = curr_block.bbox
    prev_width = x1 - x0
    curr_width = x3 - x2
    if curr_width <= 0 or prev_width <= 0:
        return False, None, None
    if abs(curr_width - prev_width) / min(curr_width, prev_width) >= 0.1:
        return False, None, None

    prev_index = page_prev.index(prev_block)
    if not all(
        b.label in TABLE_MERGE_ALLOWED_FOLLOW_LABELS for b in page_prev[prev_index + 1 :]
    ):
        return False, None, None

    curr_index = page_curr.index(curr_block)
    if not all(
        _table_block_is_skippable(b, TABLE_MERGE_ALLOWED_BEFORE_LABELS)
        for b in page_curr[:curr_index]
    ):
        return False, None, None

    html_prev = normalize_paragraph_text(getattr(prev_block, "content", ""))
    html_curr = normalize_paragraph_text(getattr(curr_block, "content", ""))
    if not html_prev or not html_curr:
        return False, None, None

    soup_prev = BeautifulSoup(html_prev, "html.parser")
    soup_curr = BeautifulSoup(html_curr, "html.parser")
    cols_prev = _table_calculate_total_columns(soup_prev)
    cols_curr = _table_calculate_total_columns(soup_curr)
    tables_match = cols_prev == cols_curr
    rows_match = _table_rows_structure_match(soup_prev, soup_curr)
    return (tables_match or rows_match), soup_prev, soup_curr


def _should_join_split_cell(text_prev, text_curr):
    if not text_curr:
        return False
    if not text_prev:
        return True
    if text_prev[-1] in ".。!！?？；;":
        return False
    if text_curr[0].isupper() and text_prev[-1] in ".。!?":
        return False
    return True


def _append_text_to_cell(cell, extra_text):
    existing = _table_normalize_cell_text(cell)
    merged = (existing + extra_text).strip() if existing else extra_text.strip()
    cell.clear()
    cell.append(merged)


def repair_split_table_row(row_prev, row_curr):
    """
    修复跨页造成的表格行/单元格割裂：将下一页首行续接到上一页末行。
    """
    cells_prev = row_prev.find_all(["td", "th"])
    cells_curr = row_curr.find_all(["td", "th"])
    if not cells_prev or not cells_curr:
        return False

    merged = False
    if len(cells_prev) == len(cells_curr):
        for cp, cc in zip(cells_prev, cells_curr):
            t_prev = _table_normalize_cell_text(cp)
            t_curr = _table_normalize_cell_text(cc)
            if t_curr and _should_join_split_cell(t_prev, t_curr):
                _append_text_to_cell(cp, t_curr)
                cc.clear()
                merged = True
            elif not t_prev and t_curr:
                _append_text_to_cell(cp, t_curr)
                cc.clear()
                merged = True
    elif len(cells_curr) <= len(cells_prev):
        offset = len(cells_prev) - len(cells_curr)
        for idx, cc in enumerate(cells_curr):
            cp = cells_prev[offset + idx]
            t_prev = _table_normalize_cell_text(cp)
            t_curr = _table_normalize_cell_text(cc)
            if t_curr and (not t_prev or _should_join_split_cell(t_prev, t_curr)):
                _append_text_to_cell(cp, t_curr)
                cc.clear()
                merged = True

    if merged and not any(_table_normalize_cell_text(c) for c in cells_curr):
        row_curr.decompose()
        return True
    return merged


def merge_cross_page_table_html(soup_prev, soup_curr):
    """合并跨页表格 HTML：去重表头 + 断行修复 + 追加数据行。"""
    header_count, _ = detect_duplicate_table_headers(soup_prev, soup_curr)
    rows_prev = soup_prev.find_all("tr")
    rows_curr = soup_curr.find_all("tr")

    if rows_prev and rows_curr:
        first_data_idx = header_count if len(rows_curr) > header_count else len(rows_curr)
        if first_data_idx < len(rows_curr):
            repair_split_table_row(rows_prev[-1], rows_curr[first_data_idx])

    for row in rows_curr[header_count:]:
        if row.parent is None:
            continue
        row.extract()
        rows_prev[-1].parent.append(row)
    return str(soup_prev)


def merge_tables_across_pages(page_results):
    """
    对多页 PP-Structure 结果执行跨页表格合并。
    合并后：前一页 table block 保留完整 HTML，后一页 table block 置空并标记 merged_into_prev。
    """
    if len(page_results) < 2:
        return 0

    merge_count = 0
    pages_blocks = [list(res["parsing_res_list"]) for res in page_results]
    page_numbers = [int(res["page_index"]) + 1 for res in page_results]

    for page_idx in range(len(pages_blocks) - 1, 0, -1):
        page_curr = pages_blocks[page_idx]
        page_prev = pages_blocks[page_idx - 1]

        curr_block = next((b for b in page_curr if b.label == "table"), None)
        prev_block = next((b for b in reversed(page_prev) if b.label == "table"), None)
        if not curr_block or not prev_block:
            continue

        can_merge, soup_prev, soup_curr = can_merge_cross_page_tables(
            page_prev, prev_block, page_curr, curr_block
        )
        if not can_merge:
            continue

        merged_html = merge_cross_page_table_html(soup_prev, soup_curr)
        prev_block.content = merged_html
        curr_block.content = ""
        curr_block.merged_into_prev = True
        curr_block.merge_target_block_index = getattr(prev_block, "index", None)

        if not hasattr(prev_block, "merged_page_numbers"):
            prev_block.merged_page_numbers = [page_numbers[page_idx - 1]]
        if page_numbers[page_idx] not in prev_block.merged_page_numbers:
            prev_block.merged_page_numbers.append(page_numbers[page_idx])
        prev_block.merged_page_end = max(prev_block.merged_page_numbers)
        merge_count += 1

    for res, blocks in zip(page_results, pages_blocks):
        res["parsing_res_list"] = blocks
    return merge_count


def gap_is_reasonable(block_a, block_b, max_gap=80):
    bbox_a = getattr(block_a, "bbox", None)
    bbox_b = getattr(block_b, "bbox", None)
    if not bbox_a or not bbox_b:
        return True
    vertical_gap = max(0, max(bbox_b[1] - bbox_a[3], bbox_a[1] - bbox_b[3]))
    return vertical_gap <= max_gap


def blocks_can_merge(first_block, second_block):
    if first_block.label in TITLE_TO_VISUAL and second_block.label in VISUAL_LABELS:
        return TITLE_TO_VISUAL[first_block.label] == second_block.label and gap_is_reasonable(
            first_block, second_block
        )
    if first_block.label in VISUAL_LABELS and second_block.label in TITLE_TO_VISUAL:
        return VISUAL_TO_TITLE[first_block.label] == second_block.label and gap_is_reasonable(
            first_block, second_block
        )
    return False


def get_page_image(result):
    page_image = result["doc_preprocessor_res"]["output_img"]
    if isinstance(page_image, Image.Image):
        return page_image
    if isinstance(page_image, np.ndarray):
        if page_image.ndim == 3 and page_image.shape[2] == 3:
            return Image.fromarray(page_image[:, :, ::-1])
        return Image.fromarray(page_image)
    raise TypeError("Unsupported page image type.")


def ensure_pil_image(image_obj):
    if isinstance(image_obj, Image.Image):
        return image_obj
    if isinstance(image_obj, np.ndarray):
        if image_obj.ndim == 3 and image_obj.shape[2] == 3:
            return Image.fromarray(image_obj[:, :, ::-1])
        return Image.fromarray(image_obj)
    raise TypeError("Unsupported block image type.")


def crop_block_image(result, block, padding=6):
    if getattr(block, "image", None) and block.image.get("img") is not None:
        return ensure_pil_image(block.image["img"])

    page_image = get_page_image(result)
    x1, y1, x2, y2 = [int(v) for v in block.bbox]
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(page_image.width, x2 + padding)
    y2 = min(page_image.height, y2 + padding)
    return page_image.crop((x1, y1, x2, y2))


def build_visual_block(result, visual_block, title_block=None):
    page_no = int(result["page_index"]) + 1
    page_end = int(getattr(visual_block, "merged_page_end", page_no) or page_no)
    block_id = int(getattr(visual_block, "index", 0) or 0)
    visual_kind = visual_block.label
    confidence_info = extract_block_confidence(visual_block, result)
    title_text = ""
    if title_block is not None:
        title_text = normalize_inline_text(getattr(title_block, "content", ""))
        title_label = normalize_title_label(title_block.label, title_text)
        title_confidence = extract_block_confidence(title_block, result)
        if title_confidence:
            for key in ("layout_score", "ocr_confidence", "confidence"):
                if key in title_confidence and key not in confidence_info:
                    confidence_info[key] = title_confidence[key]
    else:
        title_label = None

    screenshot_rel = (
        Path("archives")
        / f"page_{page_no:03d}"
        / f"{visual_kind}_{page_no:03d}_{block_id:04d}.png"
    )
    screenshot_rel_str = screenshot_rel.as_posix()
    screenshot_img = crop_block_image(result, visual_block)

    caption_label = title_label or VISUAL_TO_TITLE[visual_kind]
    caption_tag = caption_label.upper()
    block_tag = f"{visual_kind.upper()}_BLOCK"
    visual_bbox = bbox_to_str(visual_block.bbox)
    page_attr = f'page="{page_no}"' if page_end == page_no else f'page="{page_no}" page_end="{page_end}"'

    block_lines = [
        (
            f'<{block_tag} id="{visual_kind}_{page_no:03d}_{block_id:04d}" '
            f'{page_attr} bbox="{visual_bbox}" '
            f'screenshot="{screenshot_rel_str}"{confidence_xml_attrs(confidence_info)}>'
        ),
        f"![{visual_kind}_{page_no:03d}_{block_id:04d}]({screenshot_rel_str})",
    ]

    if title_text:
        block_lines.append(f"<{caption_tag}>{title_text}</{caption_tag}>")

    if visual_kind == "table":
        table_content = normalize_paragraph_text(getattr(visual_block, "content", ""))
        if table_content:
            table_text = extract_table_plain_text(table_content)
            block_lines.append("<TABLE_HTML>")
            block_lines.append(table_content)
            block_lines.append("</TABLE_HTML>")
            if table_text:
                block_lines.append("<TABLE_TEXT>")
                block_lines.append(table_text)
                block_lines.append("</TABLE_TEXT>")
    elif visual_kind == "chart":
        chart_content = normalize_paragraph_text(getattr(visual_block, "content", ""))
        if chart_content:
            block_lines.append(f"<CHART_CONTENT>\n{chart_content}\n</CHART_CONTENT>")

    block_lines.append(f"</{block_tag}>")

    metadata = {
        "id": f"{visual_kind}_{page_no:03d}_{block_id:04d}",
        "page": page_no,
        "type": visual_kind,
        "bbox": list(map(int, visual_block.bbox)),
        "screenshot": screenshot_rel_str,
        "title": title_text,
        "source_label": visual_block.label,
    }
    if page_end != page_no:
        metadata["page_end"] = page_end
        metadata["merged_page_numbers"] = list(
            getattr(visual_block, "merged_page_numbers", [page_no, page_end])
        )
    apply_confidence_to_metadata(metadata, confidence_info)
    if title_block is not None:
        metadata["title_bbox"] = list(map(int, title_block.bbox))
        metadata["title_label"] = caption_label
    if visual_kind == "table":
        metadata["table_text"] = extract_table_plain_text(
            normalize_paragraph_text(getattr(visual_block, "content", ""))
        )

    return "\n".join(block_lines), screenshot_rel_str, screenshot_img, metadata


def extract_table_plain_text(table_content):
    if not table_content:
        return ""
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table_content, flags=re.I | re.S)
    plain_rows = []
    for row in rows:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, flags=re.I | re.S)
        clean_cells = []
        for cell in cells:
            cell_text = re.sub(r"<[^>]+>", " ", cell)
            cell_text = normalize_inline_text(cell_text)
            if cell_text:
                clean_cells.append(cell_text)
        if clean_cells:
            plain_rows.append(" | ".join(clean_cells))
    return "\n".join(plain_rows)


def build_text_block(result, text_block):
    label = normalize_title_label(text_block.label, getattr(text_block, "content", ""))
    block_text = to_markdown_text(text_block)
    if not block_text:
        return "", None

    page_no = int(result["page_index"]) + 1
    block_id = int(getattr(text_block, "index", 0) or 0)
    bbox = bbox_to_str(text_block.bbox)
    block_name = f"text_{page_no:03d}_{block_id:04d}"
    text_kind = label.upper()
    confidence_info = extract_block_confidence(text_block, result)

    block_lines = [
        (
            f'<TEXT_BLOCK id="{block_name}" page="{page_no}" bbox="{bbox}" '
            f'label="{label}"{confidence_xml_attrs(confidence_info)}>'
        ),
        f"<{text_kind}>",
        block_text,
        f"</{text_kind}>",
        "</TEXT_BLOCK>",
    ]

    metadata = {
        "id": block_name,
        "page": page_no,
        "type": "text",
        "label": label,
        "bbox": list(map(int, text_block.bbox)),
        "text": normalize_paragraph_text(getattr(text_block, "content", "")),
        "markdown_text": block_text,
    }
    apply_confidence_to_metadata(metadata, confidence_info)

    return "\n".join(block_lines), metadata


def build_tagged_markdown_page(result):
    blocks = list(result["parsing_res_list"])
    page_segments = []
    extra_images = {}
    metadata_items = []
    index = 0

    while index < len(blocks):
        current = blocks[index]
        current.label = normalize_title_label(current.label, getattr(current, "content", ""))
        next_block = blocks[index + 1] if index + 1 < len(blocks) else None
        if next_block is not None:
            next_block.label = normalize_title_label(
                next_block.label, getattr(next_block, "content", "")
            )

        if should_skip_block(current):
            index += 1
            continue

        if (
            next_block is not None
            and current.label in TITLE_TO_VISUAL
            and next_block.label in VISUAL_LABELS
            and blocks_can_merge(current, next_block)
        ):
            merged_text, image_path, image_obj, meta = build_visual_block(
                result, next_block, current
            )
            page_segments.append(merged_text)
            extra_images[image_path] = image_obj
            metadata_items.append(meta)
            index += 2
            continue

        if current.label in VISUAL_LABELS:
            title_block = None
            if (
                next_block is not None
                and next_block.label in TITLE_TO_VISUAL
                and blocks_can_merge(current, next_block)
            ):
                title_block = next_block
            merged_text, image_path, image_obj, meta = build_visual_block(
                result, current, title_block
            )
            page_segments.append(merged_text)
            extra_images[image_path] = image_obj
            metadata_items.append(meta)
            index += 2 if title_block is not None else 1
            continue

        if current.label in TITLE_TO_VISUAL and next_block is None:
            index += 1
            continue

        if current.label in TEXTUAL_LABELS or current.label in TITLE_TO_VISUAL:
            tagged_text, meta = build_text_block(result, current)
            if tagged_text:
                page_segments.append(tagged_text)
            if meta is not None:
                metadata_items.append(meta)
            index += 1
            continue

        block_text = to_markdown_text(current)
        if block_text:
            page_segments.append(block_text)
        index += 1

    return "\n\n".join(page_segments).strip(), extra_images, metadata_items


def create_pipeline(
    device="cpu",
    use_chart_recognition=True,
    use_formula_recognition=True,
    use_table_recognition=True,
    enable_mkldnn=None,
):
    """构建 PP-StructureV3 流水线。

    ``enable_mkldnn`` 默认为 None，即**不传**该参数——与已验证跑通的配置保持
    完全一致。仅在显式指定时才透传：paddle 3.3+ 的 oneDNN 后端加载 PIR 格式
    模型会抛 ``ConvertPirAttribute2RuntimeAttribute not support``，CPU 推理时
    传 False 可绕过（代价是更慢）。GPU 设备下该参数本就不生效。
    """
    kwargs = dict(
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True,
        use_table_recognition=use_table_recognition,
        use_chart_recognition=use_chart_recognition,
        use_formula_recognition=use_formula_recognition,
        device=device,
    )
    if enable_mkldnn is not None:
        kwargs["enable_mkldnn"] = enable_mkldnn
    return PPStructureV3(**kwargs)


def collect_quality_summary(pdf_path, markdown_path, structured_blocks, elapsed_seconds, status):
    type_counts = Counter(item.get("type", "unknown") for item in structured_blocks)
    label_counts = Counter(item.get("label", item.get("type", "unknown")) for item in structured_blocks)
    text_chars = sum(len(item.get("text", "")) for item in structured_blocks if item.get("type") == "text")
    # 摘要里原本没有总页数，用块上记录的页码兜底统计
    page_numbers = [item["page"] for item in structured_blocks if isinstance(item.get("page"), int)]
    visual_blocks = [item for item in structured_blocks if item.get("type") in VISUAL_LABELS]
    table_blocks = [item for item in structured_blocks if item.get("type") == "table"]
    titled_visual_blocks = [item for item in visual_blocks if item.get("title")]
    table_text_blocks = [item for item in table_blocks if item.get("table_text")]
    confidence_values = [
        float(item["confidence"])
        for item in structured_blocks
        if item.get("confidence") is not None
    ]
    markdown_chars = markdown_path.stat().st_size if markdown_path.exists() else 0

    return {
        "status": status,
        "pdf": str(pdf_path),
        "markdown": str(markdown_path),
        "elapsed_seconds": round(elapsed_seconds, 3),
        "block_count": len(structured_blocks),
        "page_count": max(page_numbers) if page_numbers else 0,
        "text_chars": text_chars,
        "markdown_bytes": markdown_chars,
        "type_counts": dict(type_counts),
        "label_counts": dict(label_counts),
        "visual_block_count": len(visual_blocks),
        "titled_visual_block_count": len(titled_visual_blocks),
        "title_binding_rate": round(len(titled_visual_blocks) / len(visual_blocks), 4)
        if visual_blocks
        else None,
        "table_block_count": len(table_blocks),
        "table_text_block_count": len(table_text_blocks),
        "table_text_rate": round(len(table_text_blocks) / len(table_blocks), 4)
        if table_blocks
        else None,
        "confidence_block_count": len(confidence_values),
        "confidence_coverage_rate": round(len(confidence_values) / len(structured_blocks), 4)
        if structured_blocks
        else None,
        "confidence_avg": round(sum(confidence_values) / len(confidence_values), 4)
        if confidence_values
        else None,
        "confidence_min": round(min(confidence_values), 4) if confidence_values else None,
    }


def parse_pdf(
    input_pdf,
    output_dir,
    pipeline=None,
    device="cpu",
    use_chart_recognition=True,
    use_formula_recognition=True,
    use_table_recognition=True,
    enable_mkldnn=None,
):
    input_pdf = Path(input_pdf).resolve()
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    pipeline = pipeline or create_pipeline(
        device=device,
        use_chart_recognition=use_chart_recognition,
        use_formula_recognition=use_formula_recognition,
        use_table_recognition=use_table_recognition,
        enable_mkldnn=enable_mkldnn,
    )
    results = list(pipeline.predict(str(input_pdf)))
    if not results:
        raise RuntimeError(f"No parsing result was produced for PDF: {input_pdf}")

    # [问题2] 跨页表格合并：在逐页导出 block 之前统一处理
    merged_table_count = merge_tables_across_pages(results)

    markdown_pages = []
    image_dicts = []
    structured_blocks = []

    for res in results:
        md_info = dict(res.markdown)
        tagged_text, extra_images, metadata_items = build_tagged_markdown_page(res)
        md_info["markdown_texts"] = tagged_text
        md_info["markdown_images"] = dict(md_info.get("markdown_images", {}))
        md_info["markdown_images"].update(extra_images)

        markdown_pages.append(md_info)
        image_dicts.append(md_info["markdown_images"])
        structured_blocks.extend(metadata_items)

    markdown_path = output_dir / f"{input_pdf.stem}.md"
    final_markdown = pipeline.concatenate_markdown_pages(markdown_pages)
    markdown_text = getattr(final_markdown, "markdown_texts", None)
    if markdown_text is None:
        markdown_text = "\n\n".join(
            md_info.get("markdown_texts", "") for md_info in markdown_pages
        ).strip()
    markdown_path.write_text(str(markdown_text), encoding="utf-8")
    if markdown_path.stat().st_size == 0:
        raise RuntimeError(f"Markdown output is empty for PDF: {input_pdf}")

    # 落盘版面截图，并汇总清单供下游（RAG 插件）挂载图片
    images_manifest = []
    block_by_screenshot = {
        item.get("screenshot"): item
        for item in structured_blocks
        if item.get("screenshot")
    }
    for img_map in image_dicts:
        for rel_path, img in img_map.items():
            img_path = output_dir / rel_path
            img_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(img_path)
            entry = {"rel_path": str(rel_path), "path": str(img_path)}
            owner = block_by_screenshot.get(str(rel_path))
            if owner:
                entry.update(
                    {
                        "block_id": owner.get("id"),
                        "type": owner.get("type"),
                        "page": owner.get("page"),
                        "page_end": owner.get("page_end"),
                        "title": owner.get("title") or "",
                        "bbox": owner.get("bbox"),
                    }
                )
            images_manifest.append(entry)

    metadata_path = output_dir / f"{input_pdf.stem}_blocks.json"
    with metadata_path.open("w", encoding="utf-8") as f:
        json.dump(structured_blocks, f, ensure_ascii=False, indent=2)

    elapsed = time.perf_counter() - started
    quality_summary = collect_quality_summary(
        input_pdf, markdown_path, structured_blocks, elapsed, status="success"
    )
    quality_summary["cross_page_table_merges"] = merged_table_count
    quality_summary["image_count"] = len(images_manifest)
    quality_path = output_dir / f"{input_pdf.stem}_quality.json"
    with quality_path.open("w", encoding="utf-8") as f:
        json.dump(quality_summary, f, ensure_ascii=False, indent=2)

    return {
        **quality_summary,
        "output_dir": str(output_dir),
        "metadata": str(metadata_path),
        "quality_report": str(quality_path),
        "images": images_manifest,
    }


def parse_pdf_safely(
    input_pdf,
    output_dir,
    pipeline=None,
    device="cpu",
    use_chart_recognition=True,
    use_formula_recognition=True,
    use_table_recognition=True,
    enable_mkldnn=None,
):
    try:
        return parse_pdf(
            input_pdf,
            output_dir,
            pipeline=pipeline,
            device=device,
            use_chart_recognition=use_chart_recognition,
            use_formula_recognition=use_formula_recognition,
            use_table_recognition=use_table_recognition,
            enable_mkldnn=enable_mkldnn,
        )
    except Exception as exc:
        input_pdf = Path(input_pdf).resolve()
        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        error_report = {
            "status": "failed",
            "pdf": str(input_pdf),
            "output_dir": str(output_dir),
            "error": repr(exc),
            "traceback": traceback.format_exc(),
        }
        quality_path = output_dir / f"{input_pdf.stem}_quality.json"
        with quality_path.open("w", encoding="utf-8") as f:
            json.dump(error_report, f, ensure_ascii=False, indent=2)
        return {**error_report, "quality_report": str(quality_path)}


def run_cross_page_table_tests():
    """
    跨页表格合并单元测试（不依赖 PaddleOCR，可离线验证 HTML 合并逻辑）。
    覆盖：重复表头去重、跨页行追加、单元格断行修复。
    """
    from bs4 import BeautifulSoup

    html_prev = """
    <table>
    <tr><th>指标</th><th>2023</th><th>2024</th></tr>
    <tr><td>营收</td><td>100</td><td>120</td></tr>
    <tr><td>净利润</td><td>10</td><td>12</td></tr>
    </table>
    """
    html_curr = """
    <table>
    <tr><th>指标</th><th>2023</th><th>2024</th></tr>
    <tr><td>研发投入</td><td>5</td><td>6</td></tr>
    </table>
    """
    merged = merge_cross_page_table_html(
        BeautifulSoup(html_prev, "html.parser"),
        BeautifulSoup(html_curr, "html.parser"),
    )
    assert "研发投入" in merged
    assert merged.count("指标") == 1, "重复表头应被去重"

    split_prev = """
    <table><tr><th>名称</th><th>说明</th></tr>
    <tr><td>项目A</td><td>这是一个跨页</td></tr></table>
    """
    split_curr = """
    <table><tr><th>名称</th><th>说明</th></tr>
    <tr><td></td><td>被截断的说明</td></tr></table>
    """
    merged_split = merge_cross_page_table_html(
        BeautifulSoup(split_prev, "html.parser"),
        BeautifulSoup(split_curr, "html.parser"),
    )
    assert "跨页被截断" in merged_split.replace(" ", "")

    class _FakeBlock:
        def __init__(self, label, bbox, content):
            self.label = label
            self.bbox = bbox
            self.content = content
            self.index = 0

    page_prev = [_FakeBlock("text", [0, 0, 400, 40], "正文"), _FakeBlock("table", [50, 500, 550, 780], html_prev)]
    page_curr = [_FakeBlock("header", [0, 0, 400, 30], "页眉"), _FakeBlock("table", [50, 80, 550, 360], html_curr)]
    can_merge, _, _ = can_merge_cross_page_tables(page_prev, page_prev[-1], page_curr, page_curr[-1])
    assert can_merge, "同宽表格且中间仅页眉时应可合并"

    return {
        "status": "passed",
        "cases": 3,
        "message": "cross-page table merge tests passed",
    }


def build_arg_parser():
    parser = argparse.ArgumentParser(description="Parse one PDF with PP-StructureV3.")
    parser.add_argument(
        "pdf",
        nargs="?",
        default="",
        help="PDF file to parse.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BASE_DIR / "output"),
        help="Directory for markdown, block metadata, images, and quality report.",
    )
    parser.add_argument("--device", default="cpu", help="PaddleOCR device, for example cpu or gpu:0.")
    parser.add_argument(
        "--disable-chart-recognition",
        action="store_true",
        help="Disable PP-Chart2Table to reduce memory usage.",
    )
    parser.add_argument(
        "--disable-formula-recognition",
        action="store_true",
        help="Disable formula recognition to reduce runtime and memory usage.",
    )
    parser.add_argument(
        "--disable-table-recognition",
        action="store_true",
        help="Disable table recognition to reduce runtime and memory usage.",
    )
    parser.add_argument(
        "--test-table-merge",
        action="store_true",
        help="Run offline cross-page table merge unit tests and exit.",
    )
    parser.add_argument(
        "--enable-mkldnn",
        action="store_true",
        help="Force enable oneDNN. Default: leave unset (matches the verified-working setup).",
    )
    parser.add_argument(
        "--disable-mkldnn",
        action="store_true",
        help="Force disable oneDNN. Use on CPU when PIR model loading crashes.",
    )
    return parser


def main():
    args = build_arg_parser().parse_args()
    if args.test_table_merge:
        print(json.dumps(run_cross_page_table_tests(), ensure_ascii=False, indent=2))
        return
    if not args.pdf:
        parser = build_arg_parser()
        parser.error("请提供要解析的 PDF 路径")
    if args.enable_mkldnn and args.disable_mkldnn:
        parser = build_arg_parser()
        parser.error("--enable-mkldnn 与 --disable-mkldnn 不能同时使用")
    enable_mkldnn = True if args.enable_mkldnn else (False if args.disable_mkldnn else None)
    result = parse_pdf_safely(
        args.pdf,
        args.output_dir,
        device=args.device,
        use_chart_recognition=not args.disable_chart_recognition,
        use_formula_recognition=not args.disable_formula_recognition,
        use_table_recognition=not args.disable_table_recognition,
        enable_mkldnn=enable_mkldnn,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] != "success":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
