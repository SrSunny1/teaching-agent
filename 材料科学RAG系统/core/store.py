"""SQLite 持久化层。

只依赖标准库 sqlite3。原项目用 PostgreSQL + SQLAlchemy 异步 ORM，
本插件版简化为单文件 SQLite，但**保留了"父子双层分块"的表结构**，
因为那是 RAG 检索质量的关键（父块提供章节上下文，子块作为检索单元）。

表结构：
    documents   -- 文献主表
    sections    -- 父块（章节级），提供溯源上下文
    chunks      -- 子块（真正进向量库的检索单元）
    conversations / messages / citations / jobs
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

SCHEMA_VERSION = 2

_DDL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    source        TEXT,
    abstract      TEXT,
    file_name     TEXT,
    file_path     TEXT,
    file_hash     TEXT,
    file_ext      TEXT,
    file_size     INTEGER DEFAULT 0,
    page_count    INTEGER DEFAULT 0,
    chunk_count   INTEGER DEFAULT 0,
    token_count   INTEGER DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'uploaded',
    stage         TEXT,
    error_message TEXT,
    parser        TEXT,
    embed_provider TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    meta          TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_created ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS sections (
    id            TEXT PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_key    TEXT NOT NULL UNIQUE,
    section_id    TEXT NOT NULL,
    section_title TEXT,
    section_path  TEXT NOT NULL DEFAULT '[]',
    level         INTEGER DEFAULT 1,
    preview       TEXT,
    page_start    INTEGER,
    page_end      INTEGER,
    child_count   INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sections_document ON sections(document_id);

CREATE TABLE IF NOT EXISTS chunks (
    id             TEXT PRIMARY KEY,
    document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id       TEXT NOT NULL UNIQUE,
    parent_key     TEXT REFERENCES sections(parent_key) ON DELETE SET NULL,
    section_title  TEXT,
    section_path   TEXT NOT NULL DEFAULT '[]',
    content        TEXT NOT NULL,
    page_start     INTEGER,
    page_end       INTEGER,
    chunk_index    INTEGER NOT NULL,
    index_in_parent INTEGER NOT NULL DEFAULT 0,
    token_count    INTEGER DEFAULT 0,
    embedding_status TEXT NOT NULL DEFAULT 'not_embedded',
    meta           TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_chunks_document ON chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS ix_chunks_parent ON chunks(parent_key);

CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    meta       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    model           TEXT,
    latency_ms      INTEGER,
    meta            TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS citations (
    id            TEXT PRIMARY KEY,
    message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    document_id   TEXT,
    document_title TEXT,
    chunk_id      TEXT NOT NULL,
    parent_key    TEXT,
    section_title TEXT,
    section_path  TEXT NOT NULL DEFAULT '[]',
    page_start    INTEGER,
    page_end      INTEGER,
    quote         TEXT,
    score         REAL,
    -- 引用对应的原文配图 URL 列表。以前没这一列，历史会话重新打开时
    -- 引用卡片上的配图会全部消失（即使当初回答里看得见）。
    images        TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_citations_message ON citations(message_id);

CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    document_id  TEXT,
    job_type     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    progress     INTEGER NOT NULL DEFAULT 0,
    stage        TEXT,
    message      TEXT,
    error        TEXT,
    started_at   TEXT,
    finished_at  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_jobs_created ON jobs(created_at DESC);
"""


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _migrate(conn: sqlite3.Connection) -> None:
    """给已存在的库补新列。

    ``CREATE TABLE IF NOT EXISTS`` 不会改动已有的表，所以新增字段必须显式 ALTER，
    否则老库升级后写入会直接报 "no such column"。
    """
    def columns(table: str) -> set:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}

    if "citations" in {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}:
        if "images" not in columns("citations"):
            conn.execute("ALTER TABLE citations ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")


def _json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return default
    return value


class Store:
    """线程安全的 SQLite 访问封装。"""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._lock = threading.Lock()
        self._bootstrap()

    # ---------------- 连接管理 ----------------
    @property
    def conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(str(self.db_path), timeout=30.0, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA synchronous = NORMAL")
            self._local.conn = conn
        return conn

    def _bootstrap(self) -> None:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path), timeout=30.0)
            try:
                conn.executescript(_DDL)
                _migrate(conn)
                conn.execute(
                    "INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)",
                    ("schema_version", str(SCHEMA_VERSION)),
                )
                conn.commit()
            finally:
                conn.close()

    def close(self) -> None:
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except sqlite3.Error:
                pass
            self._local.conn = None

    # ---------------- 通用执行 ----------------
    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self.conn.execute(sql, tuple(params))
            self.conn.commit()
            return cur

    def executemany(self, sql: str, seq: Iterable[Iterable[Any]]) -> None:
        with self._lock:
            self.conn.executemany(sql, seq)
            self.conn.commit()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """把多条写操作合并为一个事务，任一步失败整体回滚。

        典型场景：替换一篇文献的章节与段落——先 DELETE 再 INSERT，
        若 INSERT 失败，裸执行会留下"章节没了、段落还在"的半篇文献。

        注意：块内请直接用 ``conn.execute/executemany``，
        **不要**再调用 ``self.execute/executemany``（它们会各自提交）。
        """
        with self._lock:
            conn = self.conn
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def query(self, sql: str, params: Iterable[Any] = ()) -> List[sqlite3.Row]:
        with self._lock:
            return self.conn.execute(sql, tuple(params)).fetchall()

    def query_one(self, sql: str, params: Iterable[Any] = ()) -> Optional[sqlite3.Row]:
        with self._lock:
            return self.conn.execute(sql, tuple(params)).fetchone()

    def scalar(self, sql: str, params: Iterable[Any] = ()) -> Any:
        row = self.query_one(sql, params)
        return None if row is None else row[0]

    # ---------------- documents ----------------
    def create_document(self, doc: Dict[str, Any]) -> None:
        ts = now_iso()
        self.execute(
            """INSERT INTO documents
               (id, title, source, abstract, file_name, file_path, file_hash, file_ext,
                file_size, page_count, chunk_count, token_count, status, stage, parser,
                embed_provider, tags, meta, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                doc["id"], doc["title"], doc.get("source"), doc.get("abstract"),
                doc.get("file_name"), doc.get("file_path"), doc.get("file_hash"),
                doc.get("file_ext"), doc.get("file_size", 0), doc.get("page_count", 0),
                doc.get("chunk_count", 0), doc.get("token_count", 0),
                doc.get("status", "uploaded"), doc.get("stage"), doc.get("parser"),
                doc.get("embed_provider"), json.dumps(doc.get("tags", []), ensure_ascii=False),
                json.dumps(doc.get("meta", {}), ensure_ascii=False), ts, ts,
            ),
        )

    def update_document(self, doc_id: str, **fields: Any) -> None:
        if not fields:
            return
        for key in ("tags", "meta"):
            if key in fields and not isinstance(fields[key], str):
                fields[key] = json.dumps(fields[key], ensure_ascii=False)
        assignments = ", ".join(f"{key} = ?" for key in fields)
        params = list(fields.values()) + [now_iso(), doc_id]
        self.execute(f"UPDATE documents SET {assignments}, updated_at = ? WHERE id = ?", params)

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        row = self.query_one("SELECT * FROM documents WHERE id = ?", (doc_id,))
        return None if row is None else self._doc_to_dict(row)

    def find_by_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        row = self.query_one(
            "SELECT * FROM documents WHERE file_hash = ? ORDER BY created_at DESC LIMIT 1",
            (file_hash,),
        )
        return None if row is None else self._doc_to_dict(row)

    def list_documents(self, q: str = "", status: str = "", limit: int = 100,
                       offset: int = 0) -> Dict[str, Any]:
        where, params = [], []
        if q:
            where.append("(title LIKE ? OR source LIKE ? OR tags LIKE ?)")
            like = f"%{q}%"
            params += [like, like, like]
        if status:
            where.append("status = ?")
            params.append(status)
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        total = self.scalar("SELECT COUNT(*) FROM documents" + clause, params) or 0
        rows = self.query(
            "SELECT * FROM documents" + clause + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        )
        return {
            "items": [self._doc_to_dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def delete_document(self, doc_id: str) -> bool:
        cur = self.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        return cur.rowcount > 0

    @staticmethod
    def _doc_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "source": row["source"],
            "abstract": row["abstract"],
            "file_name": row["file_name"],
            "file_path": row["file_path"],
            "file_hash": row["file_hash"],
            "file_ext": row["file_ext"],
            "file_size": row["file_size"],
            "page_count": row["page_count"],
            "chunk_count": row["chunk_count"],
            "token_count": row["token_count"],
            "status": row["status"],
            "stage": row["stage"],
            "error_message": row["error_message"],
            "parser": row["parser"],
            "embed_provider": row["embed_provider"],
            "tags": _json(row["tags"], []),
            "meta": _json(row["meta"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # ---------------- sections / chunks ----------------
    def replace_sections(self, document_id: str, sections: List[Dict[str, Any]]) -> None:
        self.replace_structure(document_id, sections=sections)

    def replace_chunks(self, document_id: str, chunks: List[Dict[str, Any]]) -> None:
        self.replace_structure(document_id, chunks=chunks)

    def replace_structure(self, document_id: str,
                          sections: Optional[List[Dict[str, Any]]] = None,
                          chunks: Optional[List[Dict[str, Any]]] = None) -> None:
        """在一个事务里替换章节与段落。

        ``sections`` / ``chunks`` 传 None 表示"这部分保持不动"，传 [] 表示"清空"。
        入库时一次性替换两者，避免中途失败留下"有章节没段落"的半篇文献。
        """
        with self.transaction() as conn:
            if sections is not None:
                conn.execute("DELETE FROM sections WHERE document_id = ?", (document_id,))
                if sections:
                    ts = now_iso()
                    conn.executemany(
                        """INSERT INTO sections
                           (id, document_id, parent_key, section_id, section_title, section_path,
                            level, preview, page_start, page_end, child_count, created_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                        [
                            (
                                s["id"], document_id, s["parent_key"], s["section_id"],
                                s.get("section_title"),
                                json.dumps(s.get("section_path", []), ensure_ascii=False),
                                s.get("level", 1),
                                s.get("preview"), s.get("page_start"), s.get("page_end"),
                                s.get("child_count", 0), ts,
                            )
                            for s in sections
                        ],
                    )

            if chunks is not None:
                conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
                if chunks:
                    ts = now_iso()
                    conn.executemany(
                        """INSERT INTO chunks
                           (id, document_id, chunk_id, parent_key, section_title, section_path,
                            content, page_start, page_end, chunk_index, index_in_parent,
                            token_count, embedding_status, meta, created_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        [
                            (
                                c["id"], document_id, c["chunk_id"], c.get("parent_key"),
                                c.get("section_title"),
                                json.dumps(c.get("section_path", []), ensure_ascii=False),
                                c["content"],
                                c.get("page_start"), c.get("page_end"), c.get("chunk_index", 0),
                                c.get("index_in_parent", 0), c.get("token_count", 0),
                                c.get("embedding_status", "not_embedded"),
                                json.dumps(c.get("meta", {}), ensure_ascii=False), ts,
                            )
                            for c in chunks
                        ],
                    )

    def list_chunks(self, document_id: str, q: str = "", limit: int = 200) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM chunks WHERE document_id = ?"
        params: List[Any] = [document_id]
        if q:
            sql += " AND content LIKE ?"
            params.append(f"%{q}%")
        sql += " ORDER BY chunk_index LIMIT ?"
        params.append(limit)
        return [self._chunk_to_dict(r) for r in self.query(sql, params)]

    def get_chunk_by_key(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        row = self.query_one("SELECT * FROM chunks WHERE chunk_id = ?", (chunk_id,))
        return None if row is None else self._chunk_to_dict(row)

    def get_chunks_by_keys(self, chunk_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        keys = list(chunk_ids)
        if not keys:
            return {}
        placeholders = ",".join("?" * len(keys))
        sql = f"""SELECT c.*, d.title AS document_title
                  FROM chunks c JOIN documents d ON d.id = c.document_id
                  WHERE c.chunk_id IN ({placeholders})"""
        out: Dict[str, Dict[str, Any]] = {}
        for row in self.query(sql, keys):
            item = self._chunk_to_dict(row)
            item["document_title"] = row["document_title"]
            out[item["chunk_id"]] = item
        return out

    def count_chunks(self, document_id: str) -> int:
        return self.scalar("SELECT COUNT(*) FROM chunks WHERE document_id = ?", (document_id,)) or 0

    def mark_chunks_embedded(self, document_id: str) -> None:
        self.execute(
            "UPDATE chunks SET embedding_status = 'embedded' WHERE document_id = ?",
            (document_id,),
        )

    @staticmethod
    def _chunk_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        meta = _json(row["meta"], {})
        return {
            "id": row["id"],
            "document_id": row["document_id"],
            "chunk_id": row["chunk_id"],
            "parent_key": row["parent_key"],
            "section_title": row["section_title"],
            "section_path": _json(row["section_path"], []),
            "content": row["content"],
            "page_start": row["page_start"],
            "page_end": row["page_end"],
            "chunk_index": row["chunk_index"],
            "index_in_parent": row["index_in_parent"],
            "token_count": row["token_count"],
            "embedding_status": row["embedding_status"],
            "meta": meta,
            # 顺手提到顶层：检索结果要带上配图，调用方不必再拆 meta
            "images": meta.get("images") or [],
            "created_at": row["created_at"],
        }

    # ---------------- conversations / messages / citations ----------------
    def create_conversation(self, conv_id: str, title: str) -> Dict[str, Any]:
        ts = now_iso()
        self.execute(
            "INSERT INTO conversations(id, title, meta, created_at, updated_at) VALUES (?,?,'{}',?,?)",
            (conv_id, title, ts, ts),
        )
        return {"id": conv_id, "title": title, "created_at": ts, "updated_at": ts}

    def get_conversation(self, conv_id: str) -> Optional[Dict[str, Any]]:
        row = self.query_one("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        return None if row is None else dict(row)

    def list_conversations(self, limit: int = 50) -> List[Dict[str, Any]]:
        rows = self.query(
            """SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
               FROM conversations c ORDER BY c.updated_at DESC LIMIT ?""",
            (limit,),
        )
        return [dict(r) for r in rows]

    def touch_conversation(self, conv_id: str) -> None:
        self.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now_iso(), conv_id))

    def rename_conversation(self, conv_id: str, title: str) -> None:
        self.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (title, now_iso(), conv_id),
        )

    def delete_conversation(self, conv_id: str) -> bool:
        cur = self.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        return cur.rowcount > 0

    def add_message(self, msg: Dict[str, Any]) -> Dict[str, Any]:
        ts = now_iso()
        self.execute(
            """INSERT INTO messages(id, conversation_id, role, content, model, latency_ms, meta, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                msg["id"], msg["conversation_id"], msg["role"], msg["content"],
                msg.get("model"), msg.get("latency_ms"),
                json.dumps(msg.get("meta", {}), ensure_ascii=False), ts,
            ),
        )
        self.touch_conversation(msg["conversation_id"])
        return dict(msg, created_at=ts)

    def list_messages(self, conv_id: str) -> List[Dict[str, Any]]:
        rows = self.query(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid",
            (conv_id,),
        )
        items = []
        for row in rows:
            item = dict(row)
            item["meta"] = _json(row["meta"], {})
            cites = self.query(
                "SELECT * FROM citations WHERE message_id = ? ORDER BY score DESC", (row["id"],)
            )
            item["citations"] = [self._citation_to_dict(c) for c in cites]
            items.append(item)
        return items

    def add_citations(self, message_id: str, citations: List[Dict[str, Any]]) -> None:
        if not citations:
            return
        ts = now_iso()
        rows = [
            (
                c["id"], message_id, c.get("document_id"), c.get("document_title"),
                c["chunk_id"], c.get("parent_key"), c.get("section_title"),
                json.dumps(c.get("section_path", []), ensure_ascii=False),
                c.get("page_start"), c.get("page_end"), c.get("quote"), c.get("score"),
                json.dumps(c.get("images") or [], ensure_ascii=False), ts,
            )
            for c in citations
        ]
        self.executemany(
            """INSERT INTO citations
               (id, message_id, document_id, document_title, chunk_id, parent_key,
                section_title, section_path, page_start, page_end, quote, score,
                images, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            rows,
        )

    def get_citation(self, citation_id: str) -> Optional[Dict[str, Any]]:
        row = self.query_one("SELECT * FROM citations WHERE id = ?", (citation_id,))
        if row is None:
            return None
        item = self._citation_to_dict(row)
        chunk = self.get_chunk_by_key(item["chunk_id"])
        item["chunk"] = chunk
        return item

    @staticmethod
    def _citation_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "message_id": row["message_id"],
            "document_id": row["document_id"],
            "document_title": row["document_title"],
            "chunk_id": row["chunk_id"],
            "parent_key": row["parent_key"],
            "section_title": row["section_title"],
            "section_path": _json(row["section_path"], []),
            "page_start": row["page_start"],
            "page_end": row["page_end"],
            "quote": row["quote"],
            "score": row["score"],
            "images": _json(row["images"], []),
            "created_at": row["created_at"],
        }

    # ---------------- jobs ----------------
    def create_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        ts = now_iso()
        self.execute(
            """INSERT INTO jobs(id, document_id, job_type, status, progress, stage, message,
                                started_at, finished_at, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                job["id"], job.get("document_id"), job.get("job_type", "ingest"),
                job.get("status", "pending"), job.get("progress", 0), job.get("stage"),
                job.get("message"), ts, None, ts, ts,
            ),
        )
        return self.get_job(job["id"])  # type: ignore[return-value]

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        row = self.query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return None if row is None else dict(row)

    def update_job(self, job_id: str, **fields: Any) -> None:
        if not fields:
            return
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self.execute(
            f"UPDATE jobs SET {assignments}, updated_at = ? WHERE id = ?",
            list(fields.values()) + [now_iso(), job_id],
        )

    def list_jobs(self, limit: int = 20) -> List[Dict[str, Any]]:
        return [dict(r) for r in self.query(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))]

    # ---------------- stats ----------------
    def stats(self) -> Dict[str, Any]:
        documents = self.scalar("SELECT COUNT(*) FROM documents") or 0
        ready = self.scalar("SELECT COUNT(*) FROM documents WHERE status = 'ready'") or 0
        chunks = self.scalar("SELECT COUNT(*) FROM chunks") or 0
        embedded = self.scalar("SELECT COUNT(*) FROM chunks WHERE embedding_status = 'embedded'") or 0
        sections = self.scalar("SELECT COUNT(*) FROM sections") or 0
        conversations = self.scalar("SELECT COUNT(*) FROM conversations") or 0
        messages = self.scalar("SELECT COUNT(*) FROM messages") or 0
        tokens = self.scalar("SELECT COALESCE(SUM(token_count), 0) FROM chunks") or 0
        pages = self.scalar("SELECT COALESCE(SUM(page_count), 0) FROM documents") or 0
        return {
            "documents": documents,
            "documents_ready": ready,
            "chunks": chunks,
            "chunks_embedded": embedded,
            "sections": sections,
            "conversations": conversations,
            "messages": messages,
            "tokens": tokens,
            "pages": pages,
        }
