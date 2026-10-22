"""把 samples 里的 Markdown 转成 PDF，用于演示/测试 PDF 解析链路。

为什么不直接塞几个 PDF 进仓库？
    1) 二进制文件不便 diff；
    2) 我们希望"任何一台机器都能现场造出可解析的 PDF"，
       这样冒烟测试才真正验证了**解析器**而不是验证了一个固定的二进制。

实现要点（纯标准库）：
    - 中文用 Type0 + 预定义 Adobe-GB1 CMap（UniGB-UCS2-H），
      字符串按 UTF-16BE 十六进制写入，无需嵌入字体；
    - 拉丁字符用 Type1 Helvetica（WinAnsiEncoding）；
    - 生成的对象既有普通间接对象，也有正确的 xref 表，结构与真实期刊 PDF 一致，
      因此这个生成器同时也是解析器的测试用例。
    - 注意：也可以装了 pypdf/reportlab 的环境里用它们生成，但这里刻意保持零依赖。
"""

from __future__ import annotations

import argparse
import re
import zlib
from pathlib import Path
from typing import List, Tuple

PAGE_WIDTH, PAGE_HEIGHT = 595.0, 842.0
MARGIN_X, TOP_Y, BOTTOM_Y = 56.0, 792.0, 62.0


# ---------------------------------------------------------------- 文本处理
def clean_markdown(text: str) -> List[Tuple[str, str]]:
    """返回 [(类型, 文本)]，类型 ∈ {h1,h2,h3,body,code}。"""
    lines: List[Tuple[str, str]] = []
    in_code = False
    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            lines.append(("code", "    " + stripped))
            continue
        if not stripped:
            lines.append(("body", ""))
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            level = min(len(heading.group(1)), 3)
            lines.append((f"h{level}", _plain(heading.group(2))))
            continue

        if stripped.startswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            lines.append(("body", "　".join(c for c in cells if c)))
            continue
        if stripped.startswith("- ") or re.match(r"^\d+[\.\)]\s", stripped):
            lines.append(("body", "・" + _plain(stripped.lstrip("0123456789. )"))))
            continue
        if stripped.startswith(">"):
            lines.append(("body", "　" + _plain(stripped.lstrip("> "))))
            continue
        lines.append(("body", _plain(stripped)))
    return lines


def _plain(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    return text.strip()


def wrap(text: str, max_width: float, font_size: float) -> List[str]:
    """按视觉宽度换行：CJK 逐字断行，ASCII 按词断行。"""
    if not text:
        return [""]

    def char_width(char: str) -> float:
        if ord(char) > 0x2E80:      # CJK 及全角符号
            return font_size * 1.0
        if char in "iljtfrI|":
            return font_size * 0.32
        if char.isupper():
            return font_size * 0.62
        return font_size * 0.5

    limit = max_width / (font_size * 0.55)
    lines: List[str] = []
    current = ""
    current_width = 0.0
    for char in text:
        if ord(char) > 0x2E80:
            if current_width + 1.0 > limit:
                lines.append(current)
                current, current_width = "", 0.0
            current += char
            current_width += 1.0
        else:
            if char == " ":
                current += char
                current_width += 0.28
                continue
            if current_width + 0.5 > limit:
                lines.append(current.rstrip())
                current, current_width = "", 0.0
            current += char
            current_width += 0.5
    if current:
        lines.append(current.rstrip())
    return lines or [""]


# ---------------------------------------------------------------- PDF 构建
def _escape_latin(text: str) -> bytes:
    out = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return out.encode("latin-1", errors="replace")


def _hex_ucs2(text: str) -> bytes:
    return text.encode("utf-16-be")


def build_pdf(title: str, blocks: List[Tuple[str, str]]) -> bytes:
    """按 A4 版式生成 PDF 字节流。"""
    styles = {
        "h1": (16.0, 22.0, True),
        "h2": (13.0, 19.0, True),
        "h3": (11.5, 17.0, True),
        "body": (10.0, 15.5, False),
        "code": (9.0, 13.5, False),
    }

    pages: List[List[bytes]] = []
    current_ops: List[bytes] = []
    y = TOP_Y

    def new_page() -> None:
        nonlocal current_ops, y
        pages.append(current_ops)
        current_ops = []
        y = TOP_Y

    def emit(text: str, kind: str) -> None:
        nonlocal y
        size, line_height, is_heading = styles[kind]
        font = "/F1" if _is_latin(text) else "/F2"
        width = PAGE_WIDTH - 2 * MARGIN_X
        for line in wrap(text, width - (0 if not is_heading else 20), size):
            if y < BOTTOM_Y:
                new_page()
            x = MARGIN_X
            payload = _escape_latin(line) if font == "/F1" else _hex_ucs2(line)
            if font == "/F1":
                string = b"(" + payload + b")"
            else:
                string = b"<" + _hexlify(payload) + b">"
            current_ops.append(
                f"BT {font} {size} Tf 1 0 0 1 {x:.1f} {y:.1f} Tm {string.decode('latin-1')} Tj ET"
                .encode("latin-1")
            )
            y -= line_height

    emit(title, "h1")
    y -= 6
    for kind, text in blocks:
        if not text:
            y -= 6
            continue
        emit(text, kind)
        if kind.startswith("h"):
            y -= 3
    pages.append(current_ops)

    objects: List[bytes] = []
    page_ids: List[int] = []

    # 1: Catalog  2: Pages  3: Type1 字体  4: Type0 字体  5: CIDFont
    font_type1_id, font_type0_id, cidfont_id = 3, 4, 5
    first_page_id = 6

    for index, ops in enumerate(pages):
        content = b"\n".join(ops)
        compressed = zlib.compress(content)
        content_id = first_page_id + index * 2
        page_id = content_id + 1
        page_ids.append(page_id)

        objects.append((content_id, b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(compressed)
                        + compressed + b"\nendstream"))
        objects.append((page_id,
                        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                         f"/Resources << /Font << /F1 {font_type1_id} 0 R /F2 {font_type0_id} 0 R >> >> "
                         f"/Contents {content_id} 0 R >>").encode("latin-1")))

    objects.sort(key=lambda item: item[0])

    catalog = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    pages_obj = (f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>").encode("latin-1")
    helvetica = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    type0 = (f"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
             f"/Encoding /UniGB-UCS2-H /DescendantFonts [{cidfont_id} 0 R] >>").encode("latin-1")
    cidfont = (b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
               b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> "
               b"/FontDescriptor 6 0 R >>")

    # 编号 6 与内容流冲突，因此把 FontDescriptor 放到最后
    descriptor_id = max(obj_id for obj_id, _ in objects) + 1
    descriptor = (f"<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 "
                  f"/FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 "
                  f"/CapHeight 700 /StemV 80 >>").encode("latin-1")
    cidfont = (f"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
               f"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> "
               f"/FontDescriptor {descriptor_id} 0 R >>").encode("latin-1")

    header: List[Tuple[int, bytes]] = [
        (1, catalog), (2, pages_obj), (font_type1_id, helvetica),
        (font_type0_id, type0), (cidfont_id, cidfont),
    ]
    header.extend(objects)
    header.append((descriptor_id, descriptor))
    header.sort(key=lambda item: item[0])

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: List[int] = [0]
    for obj_id, body in header:
        offsets.append(len(out))
        out += f"{obj_id} 0 obj\n".encode("latin-1")
        out += body + b"\nendobj\n"

    xref_offset = len(out)
    out += f"xref\n0 {len(header) + 1}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode("latin-1")
    out += (f"trailer\n<< /Size {len(header) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n").encode("latin-1")
    return bytes(out)


def _hexlify(raw: bytes) -> bytes:
    import binascii
    return binascii.hexlify(raw).upper()


def _is_latin(text: str) -> bool:
    return all(ord(char) < 0x2E80 for char in text)


def convert(md_path: Path, pdf_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")
    title = text.lstrip().split("\n", 1)[0].lstrip("# ").strip() or md_path.stem
    blocks = clean_markdown(text)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(build_pdf(title, blocks))
    return pdf_path


def main() -> None:
    parser = argparse.ArgumentParser(description="把 Markdown 样例转成可解析的中文 PDF")
    parser.add_argument("--input-dir", default="../samples", help="Markdown 目录")
    parser.add_argument("--output-dir", default="../samples/pdf", help="PDF 输出目录")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    input_dir = (root / args.input_dir).resolve()
    output_dir = (root / args.output_dir).resolve()

    created = []
    for md_file in sorted(input_dir.glob("*.md")):
        target = output_dir / (md_file.stem + ".pdf")
        convert(md_file, target)
        created.append(target)
        print(f"  生成 {target.name}  ({target.stat().st_size} bytes)")
    print(f"共 {len(created)} 个 PDF -> {output_dir}")


if __name__ == "__main__":
    main()
