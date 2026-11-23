import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserStore } from '../src/config/user-store.js';

function fakeFirestore() {
  const docs = new Map();
  let pending = Promise.resolve();
  const snapshot = (key) => ({ exists: docs.has(key), data: () => docs.get(key) });
  return {
    collection(name) {
      return {
        doc(id) { return { key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }; },
        limit() { return { collection: name }; },
        orderBy() {
          return { get: async () => ({ docs: [...docs.entries()].filter(([key]) => key.startsWith(`${name}/`)).map(([, data]) => ({ data: () => data })) }) };
        }
      };
    },
    runTransaction(callback) {
      const run = pending.then(async () => {
        const writes = [];
        const tx = {
          async get(ref) {
            if (ref.collection) return { empty: ![...docs.keys()].some((key) => key.startsWith(`${ref.collection}/`)) };
            return snapshot(ref.key);
          },
          create(ref, value) { writes.push(() => { if (docs.has(ref.key)) throw new Error('Already exists'); docs.set(ref.key, value); }); },
          update(ref, value) { writes.push(() => docs.set(ref.key, { ...docs.get(ref.key), ...value })); }
        };
        const result = await callback(tx);
        writes.forEach((write) => write());
        return result;
      });
      pending = run.catch(() => {});
      return run;
    }
  };
}

function user(id, role) {
  return { id, full_name: id, email: `${id}@example.test`, role, is_active: true, created_at: '2026-01-01T00:00:00.000Z' };
}

test('bootstrap, concurrent last-admin changes, actor recheck and session invalidation', async () => {
  const store = createUserStore(fakeFirestore());
  const [first, second] = await Promise.allSettled([store.bootstrap(user('admin1', 'ADMIN')), store.bootstrap(user('admin2', 'ADMIN'))]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason.code, 'SETUP_COMPLETE');
  await store.createUser('admin1', user('admin2', 'ADMIN'));
  await store.createUser('admin1', user('editor', 'EDITOR'));
  const [a, b] = await Promise.allSettled([
    store.updateUser('admin1', 'admin1', { role: 'EDITOR' }),
    store.updateUser('admin2', 'admin2', { isActive: false })
  ]);
  assert.equal(a.status, 'fulfilled');
  assert.equal(b.status, 'rejected');
  assert.equal(b.reason.code, 'LAST_ADMIN');
  await assert.rejects(store.createUser('admin1', user('intruder', 'ADMIN')), { code: 'FORBIDDEN' });
  await assert.rejects(store.updateUser('admin1', 'editor', { role: 'ADMIN' }), { code: 'FORBIDDEN' });
  const disabled = await store.updateUser('admin2', 'editor', { isActive: false });
  assert.equal(disabled.is_active, false);
  assert.ok(disabled.sessions_valid_after > 0);
  const enabled = await store.updateUser('admin2', 'editor', { isActive: true });
  assert.equal(enabled.sessions_valid_after, disabled.sessions_valid_after);
  assert.deepEqual((await store.listUsers({ search: 'EXAMPLE.TEST', role: 'EDITOR' })).map((entry) => entry.id).sort(), ['admin1', 'editor']);
});
