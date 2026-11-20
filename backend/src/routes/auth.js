import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { loginSchema } from '../validators/user.js';

const dummyHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYyF0Cdfz9GZqj69P9ZUIUfe51vZqN6a';

export function authRoutes({ database, secret, authenticate, cookieOptions }) {
  const router = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });

  router.post('/login', loginLimiter, async (req, res) => {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const result = await database.query('SELECT * FROM users WHERE lower(email) = $1', [input.data.email]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(input.data.password, user?.password_hash || dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    const sessionId = randomUUID();
    const token = jwt.sign({}, secret, { algorithm: 'HS256', subject: user.id, jwtid: sessionId, expiresIn: '8h', issuer: 'kb-api', audience: 'kb-web' });
    const created = await database.query(
      `WITH updated AS (UPDATE users SET last_login_at = now() WHERE id = $1 AND is_active = true RETURNING id)
       INSERT INTO auth_sessions (id, user_id, expires_at) SELECT $2, id, now() + interval '8 hours' FROM updated RETURNING id`,
      [user.id, sessionId]
    );
    if (!created.rowCount) return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    res.cookie('kb_session', token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ message: 'Signed in' });
  });

  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
  router.post('/logout', authenticate, async (req, res) => {
    await database.query('DELETE FROM auth_sessions WHERE id = $1', [req.sessionId]);
    res.clearCookie('kb_session', cookieOptions);
    res.json({ message: 'Signed out' });
  });
  return router;
}
