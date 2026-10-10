"""
知识库入库脚本。

    cd backend && python knowledge/ingest.py

把 knowledge/raw/ 下的教材与任务书切成块，写到 data/chunks.jsonl。
切块粒度是「实验 → 章节」两级，metadata 格式见 README.md 的「三、契约」。

支持三种输入：
  .docx  用 python-docx 读
  .doc   老式 OLE 二进制，用 UTF-16LE 抽取兜底（能用，但建议先转成 .docx）
  .md/.txt  直接读
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # backend/
RAW = ROOT / "knowledge" / "raw"
OUT = ROOT.parent / "data" / "chunks.jsonl"

# 章节名的封闭集合。README.md 的「三、契约」 里承诺过，不要随意扩。
SECTION_MAP = {
    "实验目的": "实验目的",
    "实验原理": "实验原理",
    "实验内容": "实验内容",
    "实验内容及步骤": "实验内容",
    "实验步骤": "实验内容",
    "试验方法与仪器装置": "实验内容",
    "实验材料及设备": "实验材料及设备",
    "实验材料与设备": "实验材料及设备",
    "实验仪器设备": "实验仪器设备",
    "实验设备及材料": "实验材料及设备",
    "实验设备": "实验材料及设备",
    "注意事项": "注意事项",
    "实验报告及要求": "实验报告及要求",
    "实验报告要求": "实验报告及要求",
    "思考题": "实验报告及要求",
}

RE_EXPERIMENT = re.compile(r"^实验\s*([一二三四五六七八九十百]+)\s*[、.．]\s*(.+)$")
RE_SECTION = re.compile(r"^[一二三四五六七八九十]+\s*[．.、]\s*(.+)$")
# 任务书里的「模块一：实验室安全巡查与规范化整理（基础劳动模块）」
RE_MODULE = re.compile(r"^模块\s*([一二三四五六七八九十]+)\s*[：:]\s*(.+)$")

# 任务书的章节名 → 封闭集合里的章节。任务书没有「实验原理」这种结构，
# 按语义就近映射，保证前端溯源展示不会崩。
TASK_SECTION_MAP = {
    "建设目标": "实验目的",
    "项目建设目标和主要内容": "实验内容",
    "劳育实践模块内容": "实验内容",
    "项目分阶段实施计划": "实验内容",
    "项目预期成效、标志性成果和绩效评价指标": "实验报告及要求",
    "项目支出预算明细表": "实验材料及设备",
    "项目审查意见": "实验报告及要求",
}

# 单个块的字数上限。超过就按段落边界切开，避免出现几千字的巨块导致检索失效。
MAX_CHUNK_CHARS = 1200


# ── 读取 ──────────────────────────────────────────────

def read_docx(path: Path) -> list[str]:
    from docx import Document

    doc = Document(str(path))
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


def read_doc(path: Path) -> list[str]:
    """老式 .doc 兜底抽取。基于 UTF-16LE 字符流扫描，对中文文档实测可用。

    ⚠️ 这是权宜之计。正式入库前建议用 Word / LibreOffice 转成 .docx 再跑。
    """
    data = path.read_bytes()
    runs: list[str] = []
    cur: list[str] = []
    i = 0
    while i + 1 < len(data):
        cp = data[i] | (data[i + 1] << 8)
        keep = (
            0x4E00 <= cp <= 0x9FFF
            or 0x3000 <= cp <= 0x303F
            or 0xFF00 <= cp <= 0xFFEF
            or 32 <= cp < 127
            or cp in (0x0D, 0x0A, 0x09)
        )
        if keep:
            cur.append(chr(cp))
            i += 2
        else:
            if len(cur) >= 8:
                runs.append("".join(cur))
            cur = []
            i += 1
    if len(cur) >= 8:
        runs.append("".join(cur))

    # ★ 关键：抽出来的片段里 \r 是 Word 的段落分隔符，必须按它切开，
    #   否则「模块一：…」这类标题会被黏在正文里，切块时识别不到。
    out: list[str] = []
    for text in runs:
        for piece in re.split(r"[\r\n\x0b]+", text):
            piece = piece.strip()
            if piece:
                out.append(piece)
    return out


def read_text(path: Path) -> list[str]:
    return [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


def load_paragraphs(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return read_docx(path)
    if suffix == ".doc":
        return read_doc(path)
    return read_text(path)


# ── 切块 ──────────────────────────────────────────────

def chunk(paragraphs: list[str], source: str) -> list[dict]:
    chunks: list[dict] = []
    experiment = "未归类"
    # 任务书没有「实验原理」这种结构，默认章节取「实验内容」更贴近实际
    section = "实验原理" if source == "教材" else "实验内容"
    buf: list[str] = []
    counter = 0

    def emit(body: str, part: int) -> None:
        nonlocal counter
        body = body.strip()
        if len(body) < 20:
            return
        counter += 1
        label = experiment if part == 0 else f"{experiment}（续{part}）"
        chunks.append(
            {
                "text": body,
                "metadata": {
                    "source": source,
                    "experiment": label,
                    "section": section,
                    "module": experiment if experiment.startswith("劳育模块") else None,
                },
            }
        )

    def flush() -> None:
        """按段落边界把 buf 切成不超过 MAX_CHUNK_CHARS 的若干块再输出。"""
        if not buf:
            return
        part = 0
        cur: list[str] = []
        size = 0
        for para in buf:
            if cur and size + len(para) > MAX_CHUNK_CHARS:
                emit("\n".join(cur), part)
                part += 1
                cur, size = [], 0
            cur.append(para)
            size += len(para)
        emit("\n".join(cur), part)

    for para in paragraphs:
        m_exp = RE_EXPERIMENT.match(para)
        if m_exp and len(para) < 40:
            flush()
            buf = []
            experiment = f"实验{m_exp.group(1)} {m_exp.group(2).strip()}"
            continue

        # 任务书的劳育模块：每个模块独立成块，module 字段回填，供劳育挂接使用
        m_mod = RE_MODULE.match(para)
        if m_mod and len(para) < 60:
            flush()
            buf = []
            experiment = f"劳育模块{m_mod.group(1)} {m_mod.group(2).strip()}"
            section = "实验内容"
            continue

        m_sec = RE_SECTION.match(para)
        if m_sec and len(para) < 24:
            name = m_sec.group(1).strip().rstrip("：:")
            mapped = SECTION_MAP.get(name) or TASK_SECTION_MAP.get(name)
            if mapped:
                flush()
                buf = []
                section = mapped
                continue

        buf.append(para)

    flush()
    return chunks


def main() -> int:
    if not RAW.exists():
        print(f"目录不存在：{RAW}")
        return 1

    files = [p for p in sorted(RAW.iterdir()) if p.suffix.lower() in (".docx", ".doc", ".md", ".txt")]
    if not files:
        print(f"{RAW} 下没有可入库的文件。把教材和任务书放进去再跑。")
        return 1

    all_chunks: list[dict] = []
    for path in files:
        source = "教材" if "教材" in path.name else "任务书"
        paras = load_paragraphs(path)
        got = chunk(paras, source)
        print(f"  {path.name:<44} {len(paras):>6} 段 → {len(got):>4} 块   [{source}]")
        all_chunks.extend(got)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as fh:
        for c in all_chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"\n共 {len(all_chunks)} 块 → {OUT}")
    by_exp: dict[str, int] = {}
    for c in all_chunks:
        by_exp[c["metadata"]["experiment"]] = by_exp.get(c["metadata"]["experiment"], 0) + 1
    for name, n in by_exp.items():
        print(f"  {name:<30} {n:>4} 块")
    return 0


if __name__ == "__main__":
    sys.exit(main())
