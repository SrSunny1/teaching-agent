"""纯 Python PDF 文本提取器。

为什么不用现成库？
    原项目依赖 PaddleOCR / pdfplumber / pypdf，这些都是"装得上才跑得动"的重依赖。
    本插件要能做到「拷走即用」，所以这里用标准库实现了一个够用的 PDF 解析器：
    PDF 内容即协处理器（obj / xref / ASCII85），我只要把 PDF 对象泡开即可。

支持范围：
    - 交叉引用表（xref）与交叉引用流（xref stream，PDF 1.5+）
    - 对象流（ObjStm，压缩过的对象容器）
    - FlateDecode / ASCIIHexDecode / ASCII85Decode 滤镜
    - 简单字体（Type1/TrueType，WinAnsi/MacRoman/Standard 编码）
    - 复合字体（Type0 + ToUnicode CMap，含 Identity-H 与 UCS2 预定义 CMap）

检测到扫描件（无文本层）时，会提示启用 PaddleOCR。
若环境中装有 pypdf，编排层会优先使用它以获得更好的兼容性。
"""

from __future__ import annotations

import re
import zlib
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------- 基础对象扫描

_OBJ_RE = re.compile(rb"(\d+)\s+(\d+)\s+obj\b")
_ENDOBJ_RE = re.compile(rb"endobj")
_TRAILER_RE = re.compile(rb"trailer")
_STARTXREF_RE = re.compile(rb"startxref\s+(\d+)")

_WHITESPACE = b"\x00\t\n\x0c\r "
_DELIMITERS = b"()<>[]{}/%"


class _Lexer:
    """PDF 内容流词法分析。"""

    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.n = len(data)

    def _skip_ws(self) -> None:
        data, n = self.data, self.n
        while self.pos < n:
            if data[self.pos] in _WHITESPACE:
                self.pos += 1
            elif data[self.pos: self.pos + 1] == b"%" :
                while self.pos < n and data[self.pos] not in b"\r\n":
                    self.pos += 1
            else:
                return

    def next_token(self) -> Tuple[str, Any]:
        self._skip_ws()
        if self.pos >= self.n:
            return ("eof", None)
        data = self.data
        ch = data[self.pos:self.pos + 1]

        if ch == b"(":
            return ("string", self._read_literal_string())
        if ch == b"<":
            if data[self.pos:self.pos + 2] == b"<<":
                return ("dict", self._read_balanced(b"<<", b">>"))
            return ("hexstring", self._read_hex_string())
        if ch == b"[":
            return ("array", self._read_balanced(b"[", b"]"))
        if data[self.pos:self.pos + 2] == b"]>":
            self.pos += 2
            return ("dict_end", None)
        if ch == b"/":
            self.pos += 1
            start = self.pos
            while self.pos < self.n and data[self.pos] not in _DELIMITERS and data[self.pos] not in _WHITESPACE:
                self.pos += 1
            return ("name", data[start:self.pos].decode("latin-1"))
        if ch in b"+-." or ch.isdigit():
            start = self.pos
            while self.pos < self.n and (self.data[self.pos:self.pos + 1].isdigit()
                                          or self.data[self.pos:self.pos + 1] in b"+-.eE"):
                self.pos += 1
            raw = data[start:self.pos]
            try:
                return ("number", float(raw) if b"." in raw or b"e" in raw.lower() else int(raw))
            except ValueError:
                return ("keyword", raw.decode("latin-1"))
        if data[self.pos:self.pos + 2] == b">>":
            self.pos += 2
            return ("dict_end", None)
        if ch in b")>]}":
            self.pos += 1
            return ("keyword", ch.decode("latin-1"))
        # 关键字
        start = self.pos
        while self.pos < self.n:
            byte = data[self.pos:self.pos + 1]
            if byte in _WHITESPACE or byte in _DELIMITERS:
                break
            self.pos += 1
        return ("keyword", data[start:self.pos].decode("latin-1"))

    def _read_literal_string(self) -> bytes:
        """读取 (...) 字面字符串，处理转义与嵌套括号。"""
        data, n = self.data, self.n
        self.pos += 1
        depth = 1
        out = bytearray()
        while self.pos < n:
            byte = data[self.pos:self.pos + 1]
            if byte == b"\\":
                self.pos += 1
                if self.pos >= n:
                    break
                esc = data[self.pos:self.pos + 1]
                mapping = {
                    b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b",
                    b"f": b"\x0c", b"(": b"(", b")": b")", b"\\": b"\\",
                }
                if esc in mapping:
                    out += mapping[esc]
                    self.pos += 1
                elif esc.isdigit():
                    oct_digits = esc
                    self.pos += 1
                    for _ in range(2):
                        if self.pos < n and data[self.pos:self.pos + 1].isdigit() and len(oct_digits) < 3:
                            oct_digits += data[self.pos:self.pos + 1]
                            self.pos += 1
                        else:
                            break
                    try:
                        out.append(int(oct_digits, 8) & 0xFF)
                    except ValueError:
                        pass
                elif esc == b"\n":
                    self.pos += 1
                else:
                    out += esc
                    self.pos += 1
                continue
            if byte == b"(":
                depth += 1
                out += b"("
                self.pos += 1
                continue
            if byte == b")":
                depth -= 1
                self.pos += 1
                if depth == 0:
                    break
                out += b")"
                continue
            out += byte
            self.pos += 1
        return bytes(out)

    def _read_hex_string(self) -> bytes:
        self.pos += 1
        end = self.data.find(b">", self.pos)
        if end == -1:
            end = self.n
        raw = re.sub(rb"[^0-9A-Fa-f]", b"", self.data[self.pos:end])
        self.pos = min(end + 1, self.n)
        if len(raw) % 2:
            raw += b"0"
        try:
            return bytes.fromhex(raw.decode("ascii"))
        except ValueError:
            return b""

    def _read_balanced(self, opener: bytes, closer: bytes) -> bytes:
        start = self.pos
        depth = 0
        data, n = self.data, self.n
        while self.pos < n:
            if data[self.pos:self.pos + len(opener)] == opener:
                depth += 1
                self.pos += len(opener)
                continue
            if data[self.pos:self.pos + len(closer)] == closer:
                depth -= 1
                self.pos += len(closer)
                if depth == 0:
                    break
                continue
            self.pos += 1
        return data[start:self.pos]


class _PdfObjects:
    """把 PDF 里的间接对象解析成 Python 结构。"""

    def __init__(self, data: bytes):
        self.data = data
        self.cache: Dict[int, Any] = {}
        self._raw: Dict[int, bytes] = {}
        self._scan()
        self._expand_object_streams()

    # ---- 扫描 obj ... endobj ----
    def _scan(self) -> None:
        for match in _OBJ_RE.finditer(self.data):
            obj_id = int(match.group(1))
            if obj_id in self._raw:
                continue
            start = match.end()
            end = _ENDOBJ_RE.search(self.data, start)
            stop = end.start() if end else self.data.find(b"endobj", start)
            if stop == -1:
                stop = len(self.data)
            self._raw[obj_id] = self.data[start:stop]

    # ---- 展开 ObjStm ----
    def _expand_object_streams(self) -> None:
        for obj_id in list(self._raw.keys()):
            body = self._raw[obj_id]
            head_end = body.find(b"stream")
            head = body[:head_end] if head_end != -1 else body
            if b"/ObjStm" not in head:
                continue
            stream = self._extract_body(body)
            if stream is None:
                continue
            header = self._parse_dict(head)
            try:
                count = int(header.get("N", 0))
                first = int(header.get("First", 0))
            except (TypeError, ValueError):
                continue
            lexer = _Lexer(stream[:first])
            numbers: List[int] = []
            while True:
                kind, value = lexer.next_token()
                if kind == "eof":
                    break
                if kind == "number":
                    numbers.append(int(value))
            for idx in range(0, min(len(numbers), count * 2) - 1, 2):
                obj_num, offset = numbers[idx], numbers[idx + 1]
                begin = first + offset
                nxt = first + numbers[idx + 3] if idx + 3 < len(numbers) else len(stream)
                self._raw.setdefault(obj_num, stream[begin:nxt])

    # ---- 字典 / 数组 / 引用 ----
    def _parse_dict(self, raw: bytes) -> Dict[str, Any]:
        """解析字典对象。

        注意：传入的 raw 可能仍带有外层 `<<...>>` 定界符（由词法层原样返回），
        必须先剥掉，否则首个字符又会被识别成 dict token，导致无限递归。
        """
        raw = raw.strip()
        if raw.startswith(b"<<") and raw.endswith(b">>"):
            raw = raw[2:-2]
        elif raw.startswith(b"<<"):
            raw = raw[2:]
        result: Dict[str, Any] = {}
        lexer = _Lexer(raw)
        key: Optional[str] = None
        while True:
            kind, value = lexer.next_token()
            if kind == "eof" or kind == "dict_end":
                break
            if kind == "name":
                if key is None:
                    key = value
                else:
                    result[key] = ("name", value)
                    key = None
                continue
            if kind == "number":
                # 可能是 "N 0 R" 形式的间接引用，需要向后看两个 token
                saved = lexer.pos
                k2, v2 = lexer.next_token()
                k3, v3 = lexer.next_token()
                if k2 == "number" and int(v2) == 0 and k3 == "keyword" and v3 == "R":
                    parsed = ("ref", int(value))
                else:
                    lexer.pos = saved
                    parsed = value
                if key is not None:
                    result[key] = parsed
                    key = None
                continue
            parsed = self._coerce(kind, value)
            if key is not None:
                result[key] = parsed
                key = None
        if key is not None:
            result[key] = None
        return result

    def _parse_array(self, raw: bytes) -> List[Any]:
        items: List[Any] = []
        lexer = _Lexer(raw[1:-1])
        while True:
            kind, value = lexer.next_token()
            if kind == "eof":
                break
            if kind == "keyword" and value == "]":
                break
            if kind == "number":
                # 可能是 "N 0 R" 引用
                saved = lexer.pos
                k2, v2 = lexer.next_token()
                k3, v3 = lexer.next_token()
                if k2 == "number" and int(v2) == 0 and k3 == "keyword" and v3 == "R":
                    items.append(("ref", int(value)))
                else:
                    items.append(int(value))
                    lexer.pos = saved
                continue
            items.append(self._coerce(kind, value))
        return items

    def _coerce(self, kind: str, value: Any) -> Any:
        if kind == "dict":
            return self._parse_dict(value)
        if kind == "array":
            return self._parse_array(value)
        if kind == "name":
            return ("name", value)
        return value

    def get(self, ref: Any, seen: Optional[set] = None) -> Any:
        """解析任意对象（支持引用递归，并防止环状引用导致栈溢出）。"""
        if isinstance(ref, tuple):
            if ref[0] == "ref":
                obj_id = ref[1]
                if obj_id in self.cache:
                    return self.cache[obj_id]
                raw = self._raw.get(obj_id)
                if raw is None:
                    return None
                busy = getattr(self, "_busy", None)
                if busy is None:
                    busy = self._busy = set()
                if obj_id in busy:          # 环状引用保护
                    return None
                busy.add(obj_id)
                try:
                    head_end = raw.find(b"stream")
                    head = raw[:head_end] if head_end != -1 else raw
                    parsed = self._parse_dict(head)
                    self.cache[obj_id] = parsed
                    return parsed
                finally:
                    busy.discard(obj_id)
            return ref[1]
        return ref

    # ---- 流解码 ----
    def _extract_body(self, raw: bytes) -> Optional[bytes]:
        idx = raw.find(b"stream")
        if idx == -1:
            return None
        pos = idx + len(b"stream")
        if raw[pos:pos + 2] == b"\r\n":
            pos += 2
        elif raw[pos:pos + 1] in (b"\n", b"\r"):
            pos += 1
        end = raw.find(b"endstream", pos)
        if end == -1:
            end = len(raw)
        payload = raw[pos:end]
        header = self._parse_dict(raw[:idx])
        filters = header.get("Filter")
        if isinstance(filters, dict) or not isinstance(filters, list):
            filters = [filters] if filters else []
        decode_parms = header.get("DecodeParms") or header.get("DP")
        if isinstance(decode_parms, dict) or not isinstance(decode_parms, list):
            decode_parms = [decode_parms] if decode_parms else []

        for i, filter_ref in enumerate(filters):
            name = None
            if isinstance(filter_ref, tuple) and filter_ref[0] == "name":
                name = filter_ref[1]
            if name is None:
                continue
            parm = decode_parms[i] if i < len(decode_parms) else None
            if isinstance(parm, tuple) and parm[0] == "ref":
                parm = self.get(parm)
            payload = _apply_filter(payload, name, parm or {})
        return payload

    def stream_of(self, ref: Any) -> Optional[bytes]:
        if not (isinstance(ref, tuple) and ref[0] == "ref"):
            return None
        raw = self._raw.get(ref[1])
        if raw is None:
            return None
        return self._extract_body(raw)


def _apply_filter(payload: bytes, name: str, parms: Dict[str, Any]) -> bytes:
    try:
        if name == "FlateDecode":
            try:
                return zlib.decompress(payload)
            except zlib.error:
                decoder = zlib.decompressobj()
                out = decoder.decompress(payload)
                return out if out else b""
        if name == "ASCIIHexDecode":
            cleaned = re.sub(rb"[^0-9A-Fa-f]", b"", payload.split(b">")[0])
            if len(cleaned) % 2:
                cleaned += b"0"
            return bytes.fromhex(cleaned.decode("ascii"))
        if name in ("ASCII85Decode", "A85"):
            return _ascii85_decode(payload)
        if name == "LZWDecode":
            return _lzw_decode(payload)
    except Exception:
        return b""
    return payload


def _ascii85_decode(payload: bytes) -> bytes:
    payload = payload.split(b"~>")[0]
    chunks = re.sub(rb"\s", b"", payload)
    out = bytearray()
    group = bytearray()
    for byte in chunks:
        if byte == 0x7A and not group:  # 'z' 快捷写法
            out += b"\x00\x00\x00\x00"
            continue
        group.append(byte)
        if len(group) == 5:
            value = 0
            for ch in group:
                if not (33 <= ch <= 117):
                    raise ValueError("bad ascii85 char")
                value = value * 85 + (ch - 33)
            out += value.to_bytes(4, "big")
            group = bytearray()
    if group:
        pad = 5 - len(group)
        group += b"u" * pad
        value = 0
        for ch in group:
            value = value * 85 + (ch - 33)
        out += value.to_bytes(4, "big")[: 4 - pad]
    return bytes(out)


def _lzw_decode(payload: bytes) -> bytes:
    """最小 LZW 解码实现（早期 PDF 偶有使用）。

    PDF 规范的 LZW 变体：码长 9 位起步，ClearTable=256、EOD=257，
    且采用"提前加一"（early change），即表项达到 511 时就升到 10 位。
    """
    def fresh_table() -> Dict[int, bytes]:
        table: Dict[int, bytes] = {i: bytes([i]) for i in range(256)}
        table[256] = b""
        table[257] = b""
        return table

    def read_code(bit_pos: int, size: int) -> Optional[int]:
        if bit_pos + size > total_bits:
            return None
        code = 0
        for i in range(size):
            byte = payload[(bit_pos + i) // 8]
            bit = (byte >> (7 - ((bit_pos + i) % 8))) & 1
            code = (code << 1) | bit
        return code

    table = fresh_table()
    next_code, bit_len, bit_pos = 258, 9, 0
    total_bits = len(payload) * 8
    prev: Optional[bytes] = None
    out = bytearray()

    while True:
        code = read_code(bit_pos, bit_len)
        if code is None:
            break
        bit_pos += bit_len

        if code == 256:
            table = fresh_table()
            next_code, bit_len, prev = 258, 9, None
            continue
        if code == 257:
            break

        if code in table:
            entry = table[code]
        elif prev is not None:
            entry = prev + prev[:1]
        else:
            break

        out += entry
        if prev is not None:
            table[next_code] = prev + entry[:1]
            next_code += 1
            # early change：阈值比标准 LZW 提前 1
            if next_code >= (1 << bit_len) and bit_len < 12:
                bit_len += 1
        prev = entry

    return bytes(out)


# ---------------------------------------------------------------- 字体解码

class _FontDecoder:
    """把 PDF 字符串字节解码为 Unicode。"""

    def __init__(self, objects: _PdfObjects, font_obj: Optional[Dict[str, Any]]):
        self.code_map: Dict[int, str] = {}
        self.two_byte = False
        self.ucs2 = False
        self.simple_encoding = "cp1252"
        self._setup(font_obj, objects)

    def _setup(self, font_obj: Optional[Dict[str, Any]], objects: _PdfObjects) -> None:
        if not font_obj:
            return
        subtype = _resolve_name(font_obj.get("Subtype"), objects)
        encoding = _resolve_name(font_obj.get("Encoding"), objects)

        # 复合字体（Type0 / Identity-*）按双字节码处理
        self.two_byte = subtype == "Type0" or encoding in ("Identity-H", "Identity-V")
        if encoding and ("UCS2" in encoding.upper() or "UTF16" in encoding.upper()):
            self.ucs2 = True

        # ToUnicode CMap 是解码的权威来源，优先级最高。
        # 注意：很多中文 TrueType 子集虽然是简单字体（非 Type0），
        # 但同样带 ToUnicode，不能只按子串类型判断。
        def find_cmap(obj: Dict[str, Any], depth: int = 0) -> Optional[bytes]:
            if depth > 2 or not isinstance(obj, dict):
                return None
            for key in ("ToUnicode",):
                stream = objects.stream_of(obj.get(key))
                if stream:
                    return stream
            for key in ("DescendantFonts", "FontDescriptor"):
                nested = _resolve(obj.get(key), objects)
                if isinstance(nested, list):
                    for item in nested:
                        found = find_cmap(objects.get(item) if isinstance(item, tuple) else item,
                                          depth + 1)
                        if found:
                            return found
                elif isinstance(nested, tuple):
                    found = find_cmap(objects.get(nested), depth + 1)
                    if found:
                        return found
                elif isinstance(nested, dict):
                    found = find_cmap(nested, depth + 1)
                    if found:
                        return found
            return None

        cmap = find_cmap(font_obj)
        if cmap:
            self.code_map = _parse_cmap(cmap)

        if self.two_byte or self.code_map:
            return

        # 走到这里说明是简单字体且没有 ToUnicode：按 /Encoding 猜测代码页
        base = "WinAnsi"
        if isinstance(encoding, str):
            base = encoding
        elif isinstance(encoding, dict):
            base = _resolve_name(encoding.get("BaseEncoding"), objects) or "WinAnsi"
        if "MacRoman" in base:
            self.simple_encoding = "mac_roman"
        elif "MacExpert" in base:
            self.simple_encoding = "latin-1"
        else:
            self.simple_encoding = "cp1252"

    def decode(self, raw: bytes) -> str:
        if self.ucs2:
            try:
                return raw.decode("utf-16-be", errors="ignore")
            except Exception:
                return ""
        step = 2 if self.two_byte else 1
        if self.code_map:
            codes = [int.from_bytes(raw[i:i + step], "big")
                     for i in range(0, len(raw) - step + 1, step)]
            return "".join(self.code_map.get(code, "") for code in codes)
        if self.two_byte:
            # 无 ToUnicode 的复合字体：只能按字形 ID 硬解（会乱码但不丢内容）
            codes = [int.from_bytes(raw[i:i + step], "big")
                     for i in range(0, len(raw) - step + 1, step)]
            return "".join(chr(code) if code else "" for code in codes)
        try:
            return raw.decode(self.simple_encoding, errors="replace")
        except LookupError:
            return raw.decode("latin-1", errors="replace")


def _resolve_name(value: Any, objects: _PdfObjects) -> Optional[str]:
    if isinstance(value, tuple) and value[0] == "name":
        return value[1]
    if isinstance(value, tuple) and value[0] == "ref":
        return _resolve_name(objects.get(value), objects)
    return None


def _resolve(value: Any, objects: _PdfObjects) -> Any:
    if isinstance(value, tuple) and value[0] == "ref":
        return objects.get(value)
    return value


def _parse_cmap(data: bytes) -> Dict[int, str]:
    """解析 ToUnicode CMap 里的 bfchar / bfrange 段。"""
    mapping: Dict[int, str] = {}
    text = data.decode("latin-1", errors="ignore")

    for block in re.finditer(r"beginbfchar(.*?)endbfchar", text, re.S):
        for src, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block.group(1)):
            mapping[int(src, 16)] = _hex_to_unicode(dst)

    for block in re.finditer(r"beginbfrange(.*?)endbfrange", text, re.S):
        for match in re.finditer(
            r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[(.*?)\])",
            block.group(1), re.S,
        ):
            start = int(match.group(1), 16)
            end = int(match.group(2), 16)
            if match.group(3):
                base = _hex_to_unicode(match.group(3))
                base_code = ord(base[0]) if base else 0
                for offset in range(max(0, end - start) + 1):
                    mapping[start + offset] = chr(base_code + offset)
            elif match.group(4):
                items = re.findall(r"<([0-9A-Fa-f]+)>", match.group(4))
                for offset, item in enumerate(items):
                    if start + offset > end:
                        break
                    mapping[start + offset] = _hex_to_unicode(item)
    return mapping


def _hex_to_unicode(hex_str: str) -> str:
    if len(hex_str) % 4 == 0 and len(hex_str) >= 4:
        try:
            raw = bytes.fromhex(hex_str)
            return raw.decode("utf-16-be", errors="ignore")
        except ValueError:
            pass
    try:
        return chr(int(hex_str, 16))
    except ValueError:
        return ""


# ---------------------------------------------------------------- 内容流 -> 文本

_POSITIONING_OPS = {"Td", "TD", "Tm", "T*", "ET", "BT"}
_SHOW_OPS = {"Tj", "TJ", "'", '"', "ID"}
_ALL_TEXT_OPS = _POSITIONING_OPS | _SHOW_OPS | {"Tf"}


def _content_to_text(content: bytes, resources: Dict[str, Any], objects: _PdfObjects) -> str:
    """把页面内容流翻译成可读文本。

    换行判定用文本坐标启发式（而非"每个 Td 都换行"）：
      - Y 坐标变化超过阈值  -> 换行
      - X 坐标向左回退      -> 换行
      - 否则视为同一行继续追加
    这样能同时兼容「整段一次 Tj」和「逐词/逐字 Td」两种排版方式。
    """
    fonts_raw = _resolve(resources.get("Font"), objects) if resources else None
    font_cache: Dict[str, _FontDecoder] = {}
    current_font: Optional[_FontDecoder] = None

    lines: List[str] = []
    current: List[str] = []

    # 文本坐标状态
    tx = ty = 0.0
    leading = 0.0
    last_ty: Optional[float] = None
    last_tx: Optional[float] = None

    def flush_line() -> None:
        if current:
            lines.append("".join(current).strip())
            current.clear()

    def maybe_break() -> None:
        nonlocal last_ty, last_tx
        if not current:
            return
        if last_ty is not None and abs(ty - last_ty) > 1.5:
            flush_line()
        elif last_tx is not None and tx < last_tx - 0.5:
            flush_line()

    def push(text: str) -> None:
        if not text:
            return
        if current:
            prev_tail = current[-1][-1:] if current[-1] else ""
            next_head = text[:1]
            # 相邻两个 ASCII 词之间补空格，避免 "MaterialsScience" 粘连；
            # CJK 不补空格，避免中文被拆散。
            if prev_tail.isascii() and prev_tail.isalnum() \
                    and next_head.isascii() and next_head.isalnum():
                current.append(" ")
        current.append(text)

    def decode_show(raw: bytes) -> str:
        if current_font is not None:
            return current_font.decode(raw)
        return raw.decode("latin-1", errors="replace")

    lexer = _Lexer(content)
    pending: List[Any] = []

    while True:
        kind, value = lexer.next_token()
        if kind == "eof":
            break

        if not (isinstance(value, str) and value in _ALL_TEXT_OPS):
            if kind in ("string", "hexstring"):
                pending.append(value)
            elif kind == "number":
                pending.append(value)
            elif kind == "name":
                pending.append(value)
            elif kind == "array":
                pending.extend(objects._parse_array(value))
            continue

        op = value

        # ---------- 坐标维护 ----------
        if op == "BT":
            # 注意：不在此处 flush_line。
            # 很多中文排版 PDF 会把每个字/词单独包一层 BT...ET，
            # 若每个 ET 都换行，结果会变成单字成行的碎片文本。
            tx = ty = 0.0
            pending = []
            continue
        if op == "ET":
            # 同样不 flush：换行交由坐标启发式判断，跨 BT 连续成行
            pending = []
            continue
        if op in ("Td", "TD"):
            if len(pending) >= 2:
                tx += float(pending[-2])
                ty += float(pending[-1])
                if op == "TD":
                    leading = -float(pending[-1])
            pending = []
            continue
        if op == "Tm":
            # Tm: a b c d e f，平移量为 e、f
            if len(pending) >= 6:
                tx = float(pending[-2])
                ty = float(pending[-1])
            pending = []
            continue
        if op == "T*":
            ty -= (leading or 12.0)
            pending = []
            continue

        # ---------- 字体切换 ----------
        if op == "Tf":
            if len(pending) >= 1:
                font_name = pending[-2] if len(pending) >= 2 else pending[-1]
                key = font_name.lstrip("/") if isinstance(font_name, str) else None
                if key:
                    if key not in font_cache:
                        font_obj = None
                        if isinstance(fonts_raw, dict):
                            ref = fonts_raw.get(key)
                            if isinstance(ref, tuple) and ref[0] == "ref":
                                font_obj = objects.get(ref)
                            elif isinstance(ref, dict):
                                font_obj = ref
                        font_cache[key] = _FontDecoder(objects, font_obj)
                    current_font = font_cache[key]
            pending = []
            continue

        # ---------- 文本展示 ----------
        if op == "'":
            ty -= (leading or 12.0)
            if pending and isinstance(pending[-1], bytes):
                maybe_break()
                push(decode_show(pending[-1]))
                last_ty, last_tx = ty, tx
            pending = []
            continue
        if op == '"':
            ty -= (leading or 12.0)
            if len(pending) >= 3 and isinstance(pending[-1], bytes):
                maybe_break()
                push(decode_show(pending[-1]))
                last_ty, last_tx = ty, tx
            pending = []
            continue
        if op == "Tj":
            if pending and isinstance(pending[-1], bytes):
                maybe_break()
                push(decode_show(pending[-1]))
                last_ty, last_tx = ty, tx
            pending = []
            continue
        if op == "TJ":
            for item in pending:
                if isinstance(item, bytes):
                    maybe_break()
                    push(decode_show(item))
                    last_ty, last_tx = ty, tx
                elif isinstance(item, (int, float)) and item < -120:
                    push(" ")
            pending = []
            continue

        # 内联图片 / 其它算子
        if op == "ID":
            tail = content[lexer.pos:]
            end = re.search(rb"\sEI\b", tail)
            lexer.pos += end.end() if end else len(tail)
            pending = []
            continue
        pending = []

    flush_line()

    text = "\n".join(line for line in lines if line)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------- 对外入口

def _collect_page_refs(objects: _PdfObjects) -> List[int]:
    """按文档结构顺序收集所有页对象编号。"""
    root: Optional[int] = None

    # 1) trailer -> Root
    trailer_obj = None
    for match in _TRAILER_RE.finditer(objects.data):
        trailer_obj = objects._parse_dict(objects.data[match.end():match.end() + 4096])
    startxref = _STARTXREF_RE.search(objects.data)
    if startxref and trailer_obj is None:
        trailer_obj = objects._parse_dict(objects.data[int(startxref.group(1)):])
    if trailer_obj:
        root_ref = trailer_obj.get("Root")
        if isinstance(root_ref, tuple) and root_ref[0] == "ref":
            root = root_ref[1]

    # 2) xref stream 本身往往带了 Root（/Type/XRef）
    if root is None:
        for obj_id, raw in objects._raw.items():
            if b"/XRef" in raw[:2000]:
                parsed = objects.get(("ref", obj_id))
                if isinstance(parsed, dict):
                    ref = parsed.get("Root")
                    if isinstance(ref, tuple) and ref[0] == "ref":
                        root = ref[1]
                        break

    pages: List[int] = []
    seen_nodes: set = set()

    def walk(node_id: int) -> None:
        if node_id in seen_nodes or len(pages) > 20000:
            return
        seen_nodes.add(node_id)
        node = objects.get(("ref", node_id))
        if not isinstance(node, dict):
            return
        node_type = _resolve_name(node.get("Type"), objects)
        if node_type == "Page":
            pages.append(node_id)
            return
        kids = _resolve(node.get("Kids"), objects)
        if isinstance(kids, list):
            for kid in kids:
                if isinstance(kid, tuple) and kid[0] == "ref":
                    walk(kid[1])

    root_node = objects.get(("ref", root)) if root else None
    if isinstance(root_node, dict):
        pages_ref = root_node.get("Pages")
        if isinstance(pages_ref, tuple) and pages_ref[0] == "ref":
            walk(pages_ref[1])

    if not pages:
        # 兜底：扫全量 /Type /Page 对象，按对象编号排序
        for obj_id in sorted(objects._raw):
            node = objects.get(("ref", obj_id))
            if isinstance(node, dict) and _resolve_name(node.get("Type"), objects) == "Page":
                pages.append(obj_id)
    return pages


def _resolve_value(obj: Any, objects: _PdfObjects) -> Any:
    """跟随间接引用取值（= _resolve，保留别名便于阅读）。"""
    return _resolve(obj, objects)


def extract_pdf_text(data: bytes) -> Tuple[List[str], Dict[str, Any]]:
    """提取 PDF 每一页的文本。返回 (页文本列表, 质量诊断信息)。"""
    objects = _PdfObjects(data)
    page_ids = _collect_page_refs(objects)

    page_texts: List[str] = []
    for page_id in page_ids:
        page = objects.get(("ref", page_id))
        if not isinstance(page, dict):
            page_texts.append("")
            continue
        resources = _resolve_value(page.get("Resources"), objects)
        if not isinstance(resources, dict):
            parent_ref = page.get("Parent")
            parent = objects.get(parent_ref) if isinstance(parent_ref, tuple) else None
            resources = _resolve_value(parent.get("Resources"), objects) if isinstance(parent, dict) else {}

        contents = page.get("Contents")
        streams: List[bytes] = []
        if isinstance(contents, tuple) and contents[0] == "ref":
            payload = objects.stream_of(contents)
            if payload:
                streams.append(payload)
        elif isinstance(contents, list):
            for item in contents:
                if isinstance(item, tuple) and item[0] == "ref":
                    payload = objects.stream_of(item)
                    if payload:
                        streams.append(payload)
        if not streams:
            page_texts.append("")
            continue
        page_texts.append(_content_to_text(b"\n".join(streams), resources or {}, objects))

    total_chars = sum(len(t) for t in page_texts)
    quality = {
        "status": "success" if total_chars > 0 else "empty",
        "page_count": len(page_texts),
        "char_count": total_chars,
        "extractor": "pure-python",
    }
    return page_texts, quality
