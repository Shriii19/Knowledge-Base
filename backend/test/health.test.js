import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/config/database.js';

async function withServer(database, run) {
  const server = createApp({ database }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health endpoint responds independently of database availability', async () => {
  await withServer(createDatabase(), async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('database readiness reports a successful check', async () => {
  await withServer({ checkConnection: async () => {} }, async (base) => {
    const response = await fetch(`${base}/api/health/database`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'connected' });
  });
});

test('database readiness reports unavailable without leaking errors', async () => {
  await withServer(createDatabase(), async (base) => {
    const response = await fetch(`${base}/api/health/database`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
  });
});

test('unknown endpoints return 404', async () => {
  await withServer(createDatabase(), async (base) => {
    const response = await fetch(`${base}/api/unknown`);
    assert.equal(response.status, 404);
  });
});
