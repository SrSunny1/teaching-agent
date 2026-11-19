import os
import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from app import auth
from app.main import app


class AccountsTest(unittest.TestCase):
    def test_account_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = auth.DB
            auth.DB = Path(directory) / 'test.sqlite3'
            try:
                client = TestClient(app)
                self.assertEqual(client.get('/auth/records').status_code, 401)
                self.assertEqual(client.post('/chat', json={'messages': []}).status_code, 401)
                tokens = []
                for name in ['20260001', '20260002']:
                    payload = dict(studentId=name, password='a-long-password')
                    self.assertEqual(client.post('/auth/register', json={**payload, 'password': 'short'}).status_code, 422)
                    self.assertEqual(client.post('/auth/register', json=payload).status_code, 200)
                    self.assertEqual(client.post('/auth/register', json=payload).status_code, 400)
                    result = client.post('/auth/login', json=payload)
                    self.assertEqual(result.status_code, 200)
                    tokens.append({'Authorization': 'Bearer ' + result.json()['token']})
                self.assertEqual(client.put('/auth/records', headers=tokens[0], json={'data': {'history': 'private'}, 'revision': 0}).status_code, 200)
                self.assertEqual(client.get('/auth/records', headers=tokens[1]).json()['data'], {})
                self.assertEqual(client.put('/auth/records', headers=tokens[0], json={'data': {}, 'revision': 0}).status_code, 409)
                self.assertEqual(client.post('/auth/password', headers=tokens[0], json={'oldPassword': 'a-long-password', 'newPassword': 'another-long-password'}).status_code, 200)
                self.assertEqual(client.get('/auth/records', headers=tokens[0]).status_code, 401)
                self.assertEqual(client.post('/auth/logout', headers=tokens[1]).status_code, 200)
                self.assertEqual(client.get('/auth/records', headers=tokens[1]).status_code, 401)
                with auth.connect() as db:
                    row = db.execute('SELECT password FROM users LIMIT 1').fetchone()
                    self.assertNotIn(row['password'], ['a-long-password', 'another-long-password'])
            finally:
                auth.DB = previous

    def test_admin_stats(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = auth.DB
            auth.DB = Path(directory) / 'test.sqlite3'
            os.environ['ADMIN_TOKEN'] = 'test-admin-token'
            try:
                client = TestClient(app)
                self.assertEqual(client.get('/auth/admin/stats').status_code, 403)
                self.assertEqual(client.get('/auth/admin/stats', headers={'X-Admin-Token': 'wrong'}).status_code, 403)
                payload = dict(studentId='20260001', password='a-long-password')
                self.assertEqual(client.post('/auth/register', json=payload).status_code, 200)
                self.assertEqual(client.post('/auth/login', json=payload).status_code, 200)
                token = client.post('/auth/login', json=payload).json()['token']
                client.post('/auth/feedback', headers={'Authorization': 'Bearer ' + token},
                            json={'content': '希望能加实验视频'})
                result = client.get('/auth/admin/stats', headers={'X-Admin-Token': 'test-admin-token'})
                self.assertEqual(result.status_code, 200)
                data = result.json()
                self.assertEqual(data['userCount'], 1)
                self.assertEqual(data['users'], ['20260001'])
                self.assertEqual(data['activeSessions'], 2)
                self.assertEqual(data['feedbackCount'], 1)
                self.assertEqual(data['feedback'][0]['studentId'], '20260001')
                self.assertEqual(client.get('/auth/admin/stats?token=test-admin-token').status_code, 200)
            finally:
                auth.DB = previous
                del os.environ['ADMIN_TOKEN']

    def test_admin_stats_disabled_without_token(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = auth.DB
            auth.DB = Path(directory) / 'test.sqlite3'
            os.environ.pop('ADMIN_TOKEN', None)
            try:
                client = TestClient(app)
                self.assertEqual(client.get('/auth/admin/stats?token=anything').status_code, 403)
            finally:
                auth.DB = previous

    def test_turso_backend(self):
        """TURSO_DATABASE_URL 指向本地文件路径，离线走通 libsql 这条存储路径。"""
        with tempfile.TemporaryDirectory() as directory:
            os.environ['TURSO_DATABASE_URL'] = str(Path(directory) / 'turso-local.db')
            os.environ.pop('TURSO_AUTH_TOKEN', None)
            try:
                client = TestClient(app)
                payload = dict(studentId='20260003', password='a-long-password')
                self.assertEqual(client.post('/auth/register', json=payload).status_code, 200)
                result = client.post('/auth/login', json=payload)
                self.assertEqual(result.status_code, 200)
                headers = {'Authorization': 'Bearer ' + result.json()['token']}
                self.assertEqual(client.put('/auth/records', headers=headers,
                                            json={'data': {'history': 'x'}, 'revision': 0}).status_code, 200)
                self.assertEqual(client.get('/auth/records', headers=headers).json()['data'], {'history': 'x'})
            finally:
                os.environ.pop('TURSO_DATABASE_URL', None)

    def test_postgres_backend(self):
        """DATABASE_URL 指向真实 Postgres，走通方言翻译的全链路：
        BEGIN 事务、INSERT...ON CONFLICT upsert、schema 建表。"""
        url = os.environ.get('TEST_DATABASE_URL', '')
        if not url:
            self.skipTest('TEST_DATABASE_URL 未设置，跳过 Postgres 实测')
        os.environ['DATABASE_URL'] = url
        os.environ['ADMIN_TOKEN'] = 'pg-admin'
        try:
            client = TestClient(app)
            name = 'pg' + str(int(time.time() * 1000) % 10**8)  # 库可复用，每次跑新账号
            payload = dict(studentId=name, password='a-long-password')
            self.assertEqual(client.post('/auth/register', json=payload).status_code, 200)
            self.assertEqual(client.post('/auth/register', json=payload).status_code, 400)
            tok = client.post('/auth/login', json=payload).json()['token']
            client.post('/auth/login', json=payload)  # attempts 走 ON CONFLICT DO UPDATE
            h = {'Authorization': 'Bearer ' + tok}
            self.assertEqual(client.put('/auth/records', headers=h,
                                        json={'data': {'a': '1'}, 'revision': 0}).status_code, 200)
            self.assertEqual(client.put('/auth/records', headers=h,
                                        json={'data': {'a': '2'}, 'revision': 1}).status_code, 200)
            self.assertEqual(client.get('/auth/records', headers=h).json()['data'], {'a': '2'})
            client.post('/auth/feedback', headers=h, json={'content': 'pg 反馈', 'context': 'test'})
            stats = client.get('/auth/admin/stats?token=pg-admin').json()
            self.assertIn(name, stats['users'])
            self.assertEqual(stats['feedback'][0]['content'], 'pg 反馈')
        finally:
            os.environ.pop('DATABASE_URL', None)
            os.environ.pop('ADMIN_TOKEN', None)


if __name__ == '__main__':
    unittest.main()
