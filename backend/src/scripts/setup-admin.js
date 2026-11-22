import 'dotenv/config';
import bcrypt from 'bcrypt';
import { createDatabase } from '../config/database.js';
import { createUserSchema } from '../validators/user.js';

const parsed = createUserSchema.safeParse({
  fullName: process.env.ADMIN_NAME,
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  role: 'ADMIN'
});
if (!parsed.success) {
  console.error('Set ADMIN_NAME, a valid ADMIN_EMAIL, and ADMIN_PASSWORD (12 or more characters, at most 72 UTF-8 bytes).');
  process.exit(1);
}
const database = createDatabase(process.env.DATABASE_URL);
let client;
try {
  const hash = await bcrypt.hash(parsed.data.password, 12);
  client = await database.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(68022102)');
  const existing = await client.query('SELECT 1 FROM users LIMIT 1');
  if (existing.rowCount) throw new Error('Setup is allowed only when the users table is empty.');
  await client.query('INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)', [parsed.data.fullName, parsed.data.email, hash, 'ADMIN']);
  await client.query('COMMIT');
  console.log('Initial administrator created.');
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error('Administrator setup failed:', error.message);
  process.exitCode = 1;
} finally {
  if (client) client.release();
  await database.close();
}
