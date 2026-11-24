import { Router } from 'express';
import { requireRoles } from '../middleware/auth.js';
import { createUserSchema, listUsersSchema, updateUserSchema } from '../validators/user.js';

export function userRoutes({ identity, store, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRoles('ADMIN'));

  router.get('/', async (req, res) => {
    const input = listUsersSchema.safeParse(req.query);
    if (!input.success) return res.status(400).json({ error: 'Invalid search or role filter.' });
    res.json({ users: await store.listUsers(input.data) });
  });

  router.post('/', async (req, res) => {
    const input = createUserSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Provide a name, valid email, role, and password of at least 12 characters (maximum 72 UTF-8 bytes).' });
    const { fullName, email, password, role } = input.data;
    let account;
    try {
      account = await identity.createUser({ email, password, displayName: fullName });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') return res.status(409).json({ error: 'Email is already in use.' });
      throw error;
    }
    const now = new Date().toISOString();
    const user = { id: account.uid, full_name: fullName, email, role, is_active: true, created_at: now, updated_at: now };
    try {
      await store.createUser(req.user.id, user);
    } catch (error) {
      try {
        await identity.deleteUser(account.uid);
      } catch (cleanupError) {
        console.error('Failed to remove orphaned Firebase account:', account.uid, cleanupError.code || cleanupError.name);
      }
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Access denied' });
      throw error;
    }
    return res.status(201).json({ user });
  });

  router.patch('/:id', async (req, res) => {
    const input = updateUserSchema.safeParse(req.body);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.id) || !input.success) return res.status(400).json({ error: 'Invalid user update.' });
    try {
      const user = await store.updateUser(req.user.id, req.params.id, input.data);
      return res.json({ user });
    } catch (error) {
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Access denied' });
      if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'User not found.' });
      if (error.code === 'LAST_ADMIN') return res.status(409).json({ error: 'At least one active administrator must remain.' });
      throw error;
    }
  });
  return router;
}
