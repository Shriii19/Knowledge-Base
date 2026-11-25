import { role } from '../validators/user.js';

export function authentication(identity, store) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error: 'Authentication required' });
    let token;
    try {
      token = await identity.verifyIdToken(match[1], true);
    } catch (error) {
      if (['auth/argument-error', 'auth/id-token-expired', 'auth/id-token-revoked',
        'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code)) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }
      return next(error);
    }
    const user = await store.getUser(token.uid);
    if (!user || !role.safeParse(user.role).success) return res.status(403).json({ error: 'Access denied' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    if (user.sessions_valid_after && token.auth_time <= user.sessions_valid_after) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }
    req.user = { ...user, last_login_at: new Date(token.auth_time * 1000).toISOString() };
    next();
  };
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    next();
  };
}
