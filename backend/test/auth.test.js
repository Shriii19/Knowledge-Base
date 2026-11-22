import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createApp } from '../src/app.js';
import { authentication, requireRoles } from '../src/middleware/auth.js';

const secret = 'test-secret-with-at-least-32-bytes-long';
const origin = 'http://localhost:5173';
const password = 'correct-horse-battery-staple';

function fakeDatabase(users) {
  const sessions = new Map();
  const publicUser = ({ password_hash, ...user }) => user;
  const result = (rows) => ({ rows, rowCount: rows.length });
  async function query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock)/.test(sql)) return result([]);
    if (sql.includes('FROM users u LEFT JOIN auth_sessions')) {
      const session = sessions.get(values[1]);
      const user = users.find((item) => item.id === values[0]);
      return result(user ? [{ ...publicUser(user), session_id: session?.userId === user.id && session.expires > Date.now() ? values[1] : null }] : []);
    }
    if (sql.startsWith('SELECT * FROM users WHERE lower(email)')) return result(users.filter((user) => user.email === values[0]));
    if (sql.includes('INSERT INTO auth_sessions')) {
      const user = users.find((item) => item.id === values[0] && item.is_active);
      if (!user) return result([]);
      user.last_login_at = new Date().toISOString();
      sessions.set(values[1], { userId: user.id, expires: Date.now() + 28800000 });
      return result([{ id: values[1] }]);
    }
    if (sql.startsWith('DELETE FROM auth_sessions WHERE id')) { sessions.delete(values[0]); return result([]); }
    if (sql.startsWith('DELETE FROM auth_sessions WHERE user_id')) {
      for (const [id, session] of sessions) if (session.userId === values[0]) sessions.delete(id);
      return result([]);
    }
    if (sql.startsWith('SELECT 1 FROM users WHERE id')) return result(users.filter((user) => user.id === values[0] && user.role === 'ADMIN' && user.is_active).map(() => ({ '?column?': 1 })));
    if (sql.startsWith('SELECT id, role, is_active FROM users')) return result(users.filter((user) => user.id === values[0]));
    if (sql.startsWith('SELECT count(*)')) return result([{ count: users.filter((user) => user.role === 'ADMIN' && user.is_active).length }]);
    if (sql.startsWith('UPDATE users SET role')) {
      const user = users.find((item) => item.id === values[0]);
      user.role = values[1]; user.is_active = values[2]; user.updated_at = new Date().toISOString();
      return result([publicUser(user)]);
    }
    if (sql.startsWith('INSERT INTO users')) {
      if (users.some((user) => user.email === values[1])) { const error = new Error('duplicate'); error.code = '23505'; throw error; }
      const user = { id: randomUUID(), full_name: values[0], email: values[1], password_hash: values[2], role: values[3], is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login_at: null };
      users.push(user);
      return result([publicUser(user)]);
    }
    if (sql.startsWith('SELECT id, full_name, email, role, is_active')) return result(users.filter((user) => (!values[0] || `${user.full_name} ${user.email}`.toLowerCase().includes(values[0].toLowerCase())) && (!values[1] || user.role === values[1])).map(publicUser));
    throw new Error(`Unexpected test query: ${sql}`);
  }
  return { query, connect: async () => ({ query, release() {} }), sessions };
}

async function serve(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('authentication, live role enforcement, user administration and session security', async () => {
  const hash = await bcrypt.hash(password, 10);
  const users = ['ADMIN', 'EDITOR', 'TECHNICIAN'].map((role) => ({
    id: randomUUID(), full_name: role, email: `${role.toLowerCase()}@example.test`, password_hash: hash,
    role, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login_at: null
  }));
  const disabled = { ...users[2], id: randomUUID(), email: 'disabled@example.test', is_active: false };
  users.push(disabled);
  const database = fakeDatabase(users);
  const app = createApp({ database, corsOrigin: origin, jwtSecret: secret });
  await serve(app, async (base) => {
    const request = (path, { method = 'GET', body, cookie, ...options } = {}) => fetch(base + path, {
      method, headers: { Origin: origin, 'X-Requested-With': 'KnowledgeBase', ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      ...(body && { body: JSON.stringify(body) }), ...options
    });
    const login = async (email, value = password) => request('/api/auth/login', { method: 'POST', body: { email, password: value } });

    assert.equal((await request('/api/users')).status, 401);
    assert.equal((await login('not-an-email')).status, 400);
    assert.equal((await login('missing@example.test')).status, 401);
    assert.equal((await login('admin@example.test', 'wrong-password')).status, 401);
    const inactive = await login('disabled@example.test');
    assert.equal(inactive.status, 403);
    assert.equal((await inactive.json()).code, 'ACCOUNT_DISABLED');

    const cookies = {};
    for (const role of ['ADMIN', 'EDITOR', 'TECHNICIAN']) {
      const response = await login(`${role.toLowerCase()}@example.test`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
      assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
      cookies[role] = response.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/auth/me', { cookie: cookies[role] })).status, 200);
    }
    assert.equal((await request('/api/users', { cookie: cookies.ADMIN })).status, 200);
    assert.equal((await request('/api/users', { cookie: cookies.EDITOR })).status, 403);
    assert.equal((await request('/api/users', { cookie: cookies.TECHNICIAN })).status, 403);
    assert.equal((await request(`/api/users/${users[2].id}`, { method: 'PATCH', cookie: cookies.EDITOR, body: { role: 'ADMIN' } })).status, 403);
    assert.equal((await request(`/api/users/${users[0].id}`, { method: 'PATCH', cookie: cookies.ADMIN, body: { isActive: false } })).status, 409);
    assert.equal((await request(`/api/users/${users[0].id}`, { method: 'PATCH', cookie: cookies.ADMIN, body: { role: 'EDITOR' } })).status, 409);
    assert.equal((await request(`/api/users/${users[1].id}`, { method: 'PATCH', cookie: cookies.ADMIN, body: { role: 'TECHNICIAN' } })).status, 200);
    assert.equal((await (await request('/api/auth/me', { cookie: cookies.EDITOR })).json()).user.role, 'TECHNICIAN');
    assert.equal((await request(`/api/users/${users[2].id}`, { method: 'PATCH', cookie: cookies.ADMIN, body: { isActive: false } })).status, 200);
    const disabledSession = await request('/api/auth/me', { cookie: cookies.TECHNICIAN });
    assert.equal(disabledSession.status, 403);
    assert.equal((await disabledSession.json()).code, 'ACCOUNT_DISABLED');
    assert.equal((await request(`/api/users/${users[2].id}`, { method: 'PATCH', cookie: cookies.ADMIN, body: { isActive: true } })).status, 200);
    assert.equal((await request('/api/auth/me', { cookie: cookies.TECHNICIAN })).status, 401);
    const created = await request('/api/users', { method: 'POST', cookie: cookies.ADMIN, body: { fullName: 'New User', email: 'NEW@example.test', password, role: 'EDITOR' } });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.email, 'new@example.test');
    assert.equal((await request('/api/users', { method: 'POST', cookie: cookies.ADMIN, body: { fullName: 'New User', email: 'new@example.test', password, role: 'EDITOR' } })).status, 409);
    assert.notEqual(users.at(-1).password_hash, password);
    assert.equal((await request('/api/users?role=EDITOR', { cookie: cookies.ADMIN })).status, 200);
    assert.equal((await request('/api/users', { method: 'POST', cookie: cookies.ADMIN, body: { fullName: 'Bad', email: 'x@example.test', password, role: 'ADMIN', isActive: true } })).status, 400);
    const csrf = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://attacker.example', 'X-Requested-With': 'KnowledgeBase', Cookie: cookies.ADMIN } });
    assert.equal(csrf.status, 403);
    const expired = jwt.sign({}, secret, { algorithm: 'HS256', subject: users[0].id, jwtid: randomUUID(), expiresIn: -1, issuer: 'kb-api', audience: 'kb-web' });
    assert.equal((await request('/api/auth/me', { cookie: `kb_session=${expired}` })).status, 401);
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: cookies.ADMIN })).status, 200);
    assert.equal((await request('/api/auth/me', { cookie: cookies.ADMIN })).status, 401);
  });
});

test('role middleware rejects technician from a representative editor-only route', async () => {
  const user = { id: randomUUID(), full_name: 'Technician', email: 'tech@example.test', role: 'TECHNICIAN', is_active: true };
  const database = fakeDatabase([user]);
  const sessionId = randomUUID();
  database.sessions.set(sessionId, { userId: user.id, expires: Date.now() + 10000 });
  const token = jwt.sign({}, secret, { algorithm: 'HS256', subject: user.id, jwtid: sessionId, expiresIn: 60, issuer: 'kb-api', audience: 'kb-web' });
  const app = express();
  app.use(cookieParser());
  app.patch('/editor-only', authentication(database, secret), requireRoles('ADMIN', 'EDITOR'), (_req, res) => res.sendStatus(204));
  await serve(app, async (base) => {
    const response = await fetch(`${base}/editor-only`, { method: 'PATCH', headers: { Cookie: `kb_session=${token}` } });
    assert.equal(response.status, 403);
  });
});

test('production sessions use secure cross-site cookies', async () => {
  const hash = await bcrypt.hash(password, 10);
  const user = { id: randomUUID(), full_name: 'Admin', email: 'admin@example.test', password_hash: hash, role: 'ADMIN', is_active: true };
  await serve(createApp({ database: fakeDatabase([user]), corsOrigin: origin, jwtSecret: secret, production: true }), async (base) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'X-Requested-With': 'KnowledgeBase', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /;\s*Secure/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=None/i);
  });
});

test('login attempts are limited', async () => {
  const database = fakeDatabase([]);
  await serve(createApp({ database, corsOrigin: origin, jwtSecret: secret }), async (base) => {
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'X-Requested-With': 'KnowledgeBase', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'missing@example.test', password: 'bad-password' }) });
      assert.equal(response.status, 401);
    }
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'X-Requested-With': 'KnowledgeBase', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'missing@example.test', password: 'bad-password' }) });
    assert.equal(response.status, 429);
  });
});
