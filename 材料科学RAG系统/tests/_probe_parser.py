"""PDF 解析器探针：用真实 PDF 验证提取效果（对比 pypdf）。"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from rag.parsers import pdf_native  # noqa: E402
from rag.parsers.service import DocumentParser, _pypdf_extract  # noqa: E402

SAMPLES = [
    Path(r"C:\Users\guang\Desktop\thermal-cycle-rag-agent\docs\CLEAN_TEST_PAPER_ORC.pdf"),
    Path(r"C:\Users\guang\Desktop\thermal-cycle-rag-agent\storage\uploads\usr_6307c9e032644eafa238153a532e5291\pap_078a9beb7c6e49f08ab1dacb9a2d0483\不同工质对有机朗肯循环热电联产系统热力性能影响的研究（中文，期刊）.pdf"),
    Path(r"C:\Users\guang\Desktop\thermal-cycle-rag-agent\storage\uploads\usr_6307c9e032644eafa238153a532e5291\pap_cfe6efed1207446da7c28d746a45ee42\有机朗肯循环系统工质设计与系统参数的同步优化（中文，期刊）.pdf"),
    Path(r"C:\Users\guang\Desktop\thermal-cycle-rag-agent\storage\uploads\usr_6307c9e032644eafa238153a532e5291\pap_3d5ac146076b48cfb8cf495c35962182\R1234ze及其混合工质的船舶余热TEG-ORC联合循环性能模拟与优化(中文，期刊).pdf"),
]


def main() -> None:
    for path in SAMPLES:
        if not path.exists():
            print(f"[SKIP] 不存在: {path.name}")
            continue
        data = path.read_bytes()
        print("=" * 78)
        print(f"文件: {path.name}  ({len(data)} bytes)")

        start = time.perf_counter()
        try:
            pages, quality = pdf_native.extract_pdf_text(data)
            native_ms = int((time.perf_counter() - start) * 1000)
            native_chars = sum(len(p) for p in pages)
            print(f"[native] 页数={len(pages)} 字符={native_chars} 耗时={native_ms}ms {quality}")
            if pages:
                print("  首段预览 >>>", repr(pages[0][:220]))
        except Exception as exc:
            print(f"[native] 失败: {type(exc).__name__}: {exc}")

        try:
            start = time.perf_counter()
            pypdf_pages, info = _pypdf_extract(data)
            pypdf_ms = int((time.perf_counter() - start) * 1000)
            pypdf_chars = sum(len(p) for p in pypdf_pages)
            print(f"[pypdf ] 页数={len(pypdf_pages)} 字符={pypdf_chars} 耗时={pypdf_ms}ms")
            if pypdf_pages:
                print("  首段预览 >>>", repr(pypdf_pages[0][:220]))
        except Exception as exc:
            print(f"[pypdf ] 失败: {type(exc).__name__}: {exc}")

        try:
            doc = DocumentParser(mode="text").parse_bytes(data, ".pdf", path.name)
            print(f"[service] parser={doc.parser} 页={doc.page_count} "
                  f"blocks={len(doc.blocks)} tokens={doc.quality.get('token_count')}")
        except Exception as exc:
            print(f"[service] 失败: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
