import jwt from 'jsonwebtoken';
import { z } from 'zod';

export function authentication(database, secret) {
  return async (req, res, next) => {
    const token = req.cookies.kb_session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'kb-api', audience: 'kb-web' });
      if (typeof payload !== 'object' || !z.uuid().safeParse(payload.sub).success || !z.uuid().safeParse(payload.jti).success) throw new Error('Invalid token');
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }
    const result = await database.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.last_login_at, s.id AS session_id
       FROM users u LEFT JOIN auth_sessions s ON s.user_id = u.id AND s.id = $2 AND s.expires_at > now()
       WHERE u.id = $1`,
      [payload.sub, payload.jti]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired or invalid' });
    if (!result.rows[0].is_active) return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    if (!result.rows[0].session_id) return res.status(401).json({ error: 'Session expired or invalid' });
    const { session_id, ...user } = result.rows[0];
    req.user = user;
    req.sessionId = payload.jti;
    next();
  };
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    next();
  };
}
