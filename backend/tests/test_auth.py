import tempfile
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


if __name__ == '__main__':
    unittest.main()
