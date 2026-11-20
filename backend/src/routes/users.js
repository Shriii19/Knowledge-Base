import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { requireRoles } from '../middleware/auth.js';
import { createUserSchema, listUsersSchema, updateUserSchema } from '../validators/user.js';

const fields = 'id, full_name, email, role, is_active, created_at, updated_at, last_login_at';

export function userRoutes({ database, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRoles('ADMIN'));

  router.get('/', async (req, res) => {
    const input = listUsersSchema.safeParse(req.query);
    if (!input.success) return res.status(400).json({ error: 'Invalid search or role filter.' });
    const search = (input.data.search || '').replace(/[\\%_]/g, '\\$&');
    const result = await database.query(
      `SELECT ${fields} FROM users WHERE ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%') AND ($2 = '' OR role = $2) ORDER BY created_at DESC LIMIT 200`,
      [search, input.data.role || '']
    );
    res.json({ users: result.rows });
  });

  router.post('/', async (req, res) => {
    const input = createUserSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Provide a name, valid email, role, and password of at least 12 characters (maximum 72 UTF-8 bytes).' });
    const { fullName, email, password, role } = input.data;
    const hash = await bcrypt.hash(password, 12);
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(68022102)');
      const actor = await client.query("SELECT 1 FROM users WHERE id = $1 AND role = 'ADMIN' AND is_active = true", [req.user.id]);
      if (!actor.rowCount) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied' });
      }
      const result = await client.query(`INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${fields}`, [fullName, email, hash, role]);
      await client.query('COMMIT');
      return res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'Email is already in use.' });
      throw error;
    } finally {
      client.release();
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    const input = updateUserSchema.safeParse(req.body);
    if (!id.success || !input.success) return res.status(400).json({ error: 'Invalid user update.' });
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(68022102)');
      const actor = await client.query("SELECT 1 FROM users WHERE id = $1 AND role = 'ADMIN' AND is_active = true", [req.user.id]);
      if (!actor.rowCount) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied' });
      }
      const current = await client.query('SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE', [id.data]);
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found.' });
      }
      const target = current.rows[0];
      const newRole = input.data.role ?? target.role;
      const active = input.data.isActive ?? target.is_active;
      if (target.role === 'ADMIN' && target.is_active && (newRole !== 'ADMIN' || !active)) {
        const admins = await client.query("SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = true");
        if (admins.rows[0].count <= 1) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'At least one active administrator must remain.' });
        }
      }
      const updated = await client.query(`UPDATE users SET role = $2, is_active = $3, updated_at = now() WHERE id = $1 RETURNING ${fields}`, [id.data, newRole, active]);
      if (!active) await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [id.data]);
      await client.query('COMMIT');
      return res.json({ user: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  return router;
}
