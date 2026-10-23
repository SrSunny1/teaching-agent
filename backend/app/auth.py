"""Student accounts and isolated learning records. No third-party auth dependencies."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
from contextlib import contextmanager

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

DB = Path(os.environ.get('STUDENT_DB', Path(__file__).resolve().parents[1] / 'private' / 'students.sqlite3'))
router = APIRouter(prefix='/auth')


@contextmanager
def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.executescript('''
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, student TEXT NOT NULL, expires REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS records (student TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (student TEXT PRIMARY KEY, count INTEGER NOT NULL, until REAL NOT NULL);
    ''')
    try:
        with db:
            yield db
    finally:
        db.close()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class Credentials(BaseModel):
    studentId: str = Field(pattern=r'^[A-Za-z0-9_-]{4,32}$')
    password: str = Field(min_length=10, max_length=128)


def student(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '):
        raise HTTPException(401, '请先登录')
    with connect() as db:
        row = db.execute('SELECT student FROM sessions WHERE digest=? AND expires>?',
                         (digest(authorization[7:]), time.time())).fetchone()
    if not row:
        raise HTTPException(401, '登录已过期，请重新登录')
    return row['student']


def throttle(db, name):
    now = time.time()
    row = db.execute('SELECT count, until FROM attempts WHERE student=?', (name,)).fetchone()
    if row and row['until'] > now and row['count'] >= 10:
        raise HTTPException(429, '尝试次数过多，请15分钟后重试')
    count = row['count'] + 1 if row and row['until'] > now else 1
    until = row['until'] if row and row['until'] > now else now + 900
    db.execute('INSERT OR REPLACE INTO attempts VALUES (?,?,?)', (name, count, until))
    db.commit()


@router.post('/register')
def register(req: Credentials):
    with connect() as db:
        throttle(db, req.studentId)
        db.execute('BEGIN IMMEDIATE')
        exists = db.execute('SELECT id FROM users WHERE id=?', (req.studentId,)).fetchone()
        if exists:
            raise HTTPException(400, '该学号已注册，请登录或联系教师重置密码')
        salt = secrets.token_hex(16)
        db.execute('INSERT INTO users VALUES (?,?,?)', (req.studentId, salt, password_hash(req.password, salt)))
        db.execute('DELETE FROM invites WHERE id=?', (req.studentId,))
        db.execute('DELETE FROM attempts WHERE student=?', (req.studentId,))
    return {'ok': True}


@router.post('/login')
def login(req: Credentials):
    with connect() as db:
        throttle(db, req.studentId)
        row = db.execute('SELECT * FROM users WHERE id=?', (req.studentId,)).fetchone()
        actual = password_hash(req.password, row['salt'] if row else '00' * 16)
        if not row or not hmac.compare_digest(actual, row['password']):
            raise HTTPException(401, '学号或密码错误')
        token = secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires<=?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (digest(token), req.studentId, time.time() + 8 * 3600))
        db.execute('DELETE FROM attempts WHERE student=?', (req.studentId,))
    return {'studentId': req.studentId, 'token': token}


@router.post('/logout')
def logout(who=Depends(student), authorization: str = Header(default='')):
    with connect() as db:
        db.execute('DELETE FROM sessions WHERE digest=?', (digest(authorization[7:]),))
    return {'ok': True}


class PasswordChange(BaseModel):
    oldPassword: str = Field(min_length=10, max_length=128)
    newPassword: str = Field(min_length=10, max_length=128)


@router.post('/password')
def change_password(req: PasswordChange, who=Depends(student)):
    with connect() as db:
        throttle(db, who)
        row = db.execute('SELECT * FROM users WHERE id=?', (who,)).fetchone()
        if not hmac.compare_digest(password_hash(req.oldPassword, row['salt']), row['password']):
            raise HTTPException(400, '原密码错误')
        salt = secrets.token_hex(16)
        db.execute('UPDATE users SET salt=?,password=? WHERE id=?', (salt, password_hash(req.newPassword, salt), who))
        db.execute('DELETE FROM sessions WHERE student=?', (who,))
    return {'ok': True}


@router.get('/records')
def records(who=Depends(student)):
    with connect() as db:
        row = db.execute('SELECT body,revision FROM records WHERE student=?', (who,)).fetchone()
    return {'data': json.loads(row['body']) if row else {}, 'revision': row['revision'] if row else 0}


class RecordUpdate(BaseModel):
    data: dict[str, str]
    revision: int = Field(ge=0)


@router.put('/records')
def save_records(req: RecordUpdate, who=Depends(student)):
    body = json.dumps(req.data, ensure_ascii=False)
    if len(body.encode()) > 10_000_000:
        raise HTTPException(413, '学习记录超过10MB，请先导出并清理过大的图片会话')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT revision FROM records WHERE student=?', (who,)).fetchone()
        if (row['revision'] if row else 0) != req.revision:
            raise HTTPException(409, '其他窗口已更新记录，请导出当前记录备份后重新登录，避免覆盖')
        db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (who, body, req.revision + 1))
    return {'revision': req.revision + 1}
