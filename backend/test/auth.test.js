import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApp } from '../src/app.js';
import { authentication, requireRoles } from '../src/middleware/auth.js';

const origin = 'http://localhost:5173';
const password = 'correct-horse-battery-staple';
const profile = (role) => ({
  id: role, full_name: role, email: `${role.toLowerCase()}@example.test`, role,
  is_active: true, created_at: new Date().toISOString()
});

function doubles() {
  const users = new Map(['ADMIN', 'EDITOR', 'TECHNICIAN'].map((role) => [role, profile(role)]));
  const tokens = new Map([...users.keys()].map((id) => [id, { uid: id, auth_time: 100 }]));
  const identity = {
    async verifyIdToken(token, checkRevoked) {
      assert.equal(checkRevoked, true);
      if (token === 'failure') throw Object.assign(new Error('service failure'), { code: 'auth/internal-error' });
      if (!tokens.has(token)) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-id-token' });
      return tokens.get(token);
    },
    async createUser({ email }) {
      if ([...users.values()].some((user) => user.email === email)) throw Object.assign(new Error('duplicate'), { code: 'auth/email-already-exists' });
      return { uid: 'new-user' };
    },
    async deleteUser(id) { this.deleted = id; }
  };
  const store = {
    async checkConnection() {},
    async getUser(id) { return users.get(id); },
    async listUsers({ role }) { return [...users.values()].filter((user) => !role || role === user.role); },
    async createUser(actor, user) {
      if (users.get(actor)?.role !== 'ADMIN') throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      users.set(user.id, user);
    },
    async updateUser(actor, id, changes) {
      if (users.get(actor)?.role !== 'ADMIN') throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      const user = users.get(id);
      if (!user) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
      if (user.role === 'ADMIN' && (changes.role && changes.role !== 'ADMIN' || changes.isActive === false))
        throw Object.assign(new Error('last admin'), { code: 'LAST_ADMIN' });
      Object.assign(user, changes.role && { role: changes.role }, changes.isActive !== undefined && { is_active: changes.isActive });
      return user;
    }
  };
  return { users, tokens, identity, store };
}

async function serve(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('verified tokens, live roles and administrator-only user management', async () => {
  const { identity, store, users, tokens } = doubles();
  await serve(createApp({ identity, store, corsOrigin: origin }), async (base) => {
    const request = (path, token, method = 'GET', body) => fetch(base + path, {
      method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) })
    });
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal((await request('/api/auth/me', 'invalid')).status, 401);
    assert.equal((await request('/api/auth/me', 'failure')).status, 500);
    tokens.set('no-profile', { uid: 'no-profile', role: 'ADMIN', auth_time: 100 });
    assert.equal((await request('/api/users', 'no-profile')).status, 403);
    for (const role of ['ADMIN', 'EDITOR', 'TECHNICIAN']) {
      const me = await request('/api/auth/me', role);
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.role, role);
      assert.equal((await request('/api/users', role)).status, role === 'ADMIN' ? 200 : 403);
    }
    tokens.get('TECHNICIAN').role = 'ADMIN';
    const create = { fullName: 'New User', email: 'NEW@example.test', password, role: 'EDITOR' };
    assert.equal((await request('/api/users', 'TECHNICIAN', 'POST', create)).status, 403);
    assert.equal((await request('/api/users/EDITOR', 'EDITOR', 'PATCH', { role: 'ADMIN' })).status, 403);
    assert.equal((await request('/api/users/ADMIN', 'ADMIN', 'PATCH', { role: 'EDITOR' })).status, 409);
    assert.equal((await request('/api/users/ADMIN', 'ADMIN', 'PATCH', { isActive: false })).status, 409);
    assert.equal((await request('/api/users', 'ADMIN', 'POST', { ...create, isActive: true })).status, 400);
    const created = await request('/api/users', 'ADMIN', 'POST', create);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.email, 'new@example.test');
    assert.equal((await request('/api/users', 'ADMIN', 'POST', create)).status, 409);
    assert.equal((await request('/api/users/EDITOR', 'ADMIN', 'PATCH', { role: 'TECHNICIAN' })).status, 200);
    assert.equal((await (await request('/api/auth/me', 'EDITOR')).json()).user.role, 'TECHNICIAN');
    users.get('TECHNICIAN').is_active = false;
    assert.equal((await (await request('/api/auth/me', 'TECHNICIAN')).json()).code, 'ACCOUNT_DISABLED');
    users.get('TECHNICIAN').is_active = true;
    users.get('TECHNICIAN').sessions_valid_after = 100;
    assert.equal((await request('/api/auth/me', 'TECHNICIAN')).status, 401);
    tokens.get('TECHNICIAN').auth_time = 101;
    assert.equal((await request('/api/auth/me', 'TECHNICIAN')).status, 200);
  });
});

test('editor role middleware denies technicians', async () => {
  const { identity, store } = doubles();
  const app = express();
  app.get('/editor', authentication(identity, store), requireRoles('ADMIN', 'EDITOR'), (_req, res) => res.sendStatus(204));
  await serve(app, async (base) => {
    for (const [role, status] of [['ADMIN', 204], ['EDITOR', 204], ['TECHNICIAN', 403]]) {
      assert.equal((await fetch(`${base}/editor`, { headers: { Authorization: `Bearer ${role}` } })).status, status);
    }
  });
});

test('failed profile creation cleans up the new Firebase account', async () => {
  const { identity, store } = doubles();
  store.createUser = async () => { throw Object.assign(new Error('actor no longer authorized'), { code: 'FORBIDDEN' }); };
  await serve(createApp({ identity, store, corsOrigin: origin }), async (base) => {
    const response = await fetch(`${base}/api/users`, {
      method: 'POST', headers: { Authorization: 'Bearer ADMIN', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'New User', email: 'new@example.test', password, role: 'ADMIN' })
    });
    assert.equal(response.status, 403);
    assert.equal(identity.deleted, 'new-user');
  });
});
