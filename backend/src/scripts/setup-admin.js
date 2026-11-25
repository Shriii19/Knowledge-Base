import 'dotenv/config';
import { createFirebase } from '../config/firebase.js';
import { createUserSchema } from '../validators/user.js';

const parsed = createUserSchema.safeParse({
  fullName: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD, role: 'ADMIN'
});
if (!parsed.success) throw new Error('Set ADMIN_NAME, a valid ADMIN_EMAIL, and ADMIN_PASSWORD (12 or more characters, at most 72 UTF-8 bytes).');
const { identity, store } = createFirebase();
const { fullName, email, password } = parsed.data;
const account = await identity.createUser({ email, password, displayName: fullName });
const now = new Date().toISOString();
try {
  await store.bootstrap({ id: account.uid, full_name: fullName, email, role: 'ADMIN', is_active: true, created_at: now, updated_at: now });
  console.log('Initial administrator created.');
} catch (error) {
  try {
    await identity.deleteUser(account.uid);
  } catch (cleanupError) {
    console.error('Failed to remove orphaned Firebase account:', account.uid, cleanupError.code || cleanupError.name);
  }
  throw error;
}
