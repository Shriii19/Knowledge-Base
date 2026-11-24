import { Router } from 'express';

export function authRoutes({ authenticate }) {
  const router = Router();
  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
  return router;
}
