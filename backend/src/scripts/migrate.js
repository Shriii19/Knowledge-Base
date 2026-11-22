import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { createDatabase } from '../config/database.js';

const database = createDatabase(process.env.DATABASE_URL);
let client;
try {
  client = await database.connect();
  await client.query('SELECT pg_advisory_lock(68022101)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(new URL(file, directory), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.query('SELECT pg_advisory_unlock(68022101)');
    client.release();
  }
  await database.close();
}
