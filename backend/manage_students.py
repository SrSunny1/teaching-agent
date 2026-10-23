"""Local administrator utility. Run on the server, never expose as a web endpoint."""
import argparse
import getpass
import re
import secrets
from app.auth import connect, digest, password_hash

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['invite', 'reset-password'])
parser.add_argument('student_id')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]{4,32}', args.student_id):
    parser.error('Student ID must contain 4-32 letters, numbers, underscores or hyphens.')
with connect() as db:
    exists = db.execute('SELECT id FROM users WHERE id=?', (args.student_id,)).fetchone()
    if args.action == 'invite':
        if exists:
            parser.error('Account already exists.')
        code = secrets.token_urlsafe(18)
        db.execute('INSERT OR REPLACE INTO invites VALUES (?,?)', (args.student_id, digest(code)))
        print(f'Student: {args.student_id}\nOne-time invitation: {code}')
    else:
        if not exists:
            parser.error('Account does not exist.')
        password = getpass.getpass('New password (10-128 characters): ')
        if not 10 <= len(password) <= 128 or password != getpass.getpass('Confirm password: '):
            parser.error('Invalid password or confirmation mismatch.')
        salt = secrets.token_hex(16)
        db.execute('UPDATE users SET salt=?,password=? WHERE id=?', (salt, password_hash(password, salt), args.student_id))
        db.execute('DELETE FROM sessions WHERE student=?', (args.student_id,))
        db.execute('DELETE FROM attempts WHERE student=?', (args.student_id,))
        print('Password reset; existing sessions revoked.')
