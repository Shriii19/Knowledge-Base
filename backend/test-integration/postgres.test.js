import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { createDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';

test('migrations, setup, and authentication against PostgreSQL', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `kb_test_${randomBytes(12).toString('hex')}`;
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  let database;
  let server;
  let schemaCreated = false;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const env = {
      ...process.env, DATABASE_URL: url.toString(),
      ADMIN_NAME: 'Test Admin', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-password-not-a-credential'
    };
    const run = (script) => spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    const migration = run('src/scripts/migrate.js');
    assert.equal(migration.status, 0, `Migration failed: ${migration.stderr}`);
    assert.equal(run('src/scripts/migrate.js').status, 0);
    assert.equal(run('src/scripts/setup-admin.js').status, 0);
    assert.notEqual(run('src/scripts/setup-admin.js').status, 0);

    database = createDatabase(url.toString());
    const app = createApp({ database, corsOrigin: 'http://localhost:5173', jwtSecret: 'integration-test-secret-at-least-32-bytes' });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, method, body, cookie) => fetch(base + path, {
      method,
      headers: { Origin: 'http://localhost:5173', 'X-Requested-With': 'KnowledgeBase', ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      ...(body && { body: JSON.stringify(body) })
    });
    const login = async (email) => request('/api/auth/login', 'POST', { email, password: env.ADMIN_PASSWORD });
    const loggedIn = await login(env.ADMIN_EMAIL);
    assert.equal(loggedIn.status, 200);
    const adminCookie = loggedIn.headers.get('set-cookie').split(';')[0];
    for (const role of ['EDITOR', 'TECHNICIAN']) {
      const email = `${role.toLowerCase()}@example.test`;
      const created = await request('/api/users', 'POST', { fullName: role, email, password: env.ADMIN_PASSWORD, role }, adminCookie);
      assert.equal(created.status, 201);
      const response = await login(email);
      assert.equal(response.status, 200);
      const cookie = response.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/users', 'GET', null, cookie)).status, 403);
    }
    const all = await request('/api/users', 'GET', null, adminCookie);
    const { users } = await all.json();
    assert.equal(users.length, 3);
    const user = users.find((item) => item.role === 'TECHNICIAN');
    assert.equal((await request(`/api/users/${user.id}`, 'PATCH', { role: 'EDITOR' }, adminCookie)).status, 200);
    const own = users.find((item) => item.role === 'ADMIN');
    assert.equal((await request(`/api/users/${own.id}`, 'PATCH', { isActive: false }, adminCookie)).status, 409);
    assert.equal((await request('/api/auth/logout', 'POST', null, adminCookie)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', null, adminCookie)).status, 401);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (database) await database.close();
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
