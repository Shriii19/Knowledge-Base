import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authentication } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';

export function createApp({ identity, store, corsOrigin, trustProxy = false }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health/database', async (_req, res) => {
    try {
      await store.checkConnection();
      res.json({ status: 'connected' });
    } catch (error) {
      console.error('Firestore readiness check failed:', error.code || error.name);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const authenticate = authentication(identity, store);
  app.use('/api/auth', authRoutes({ authenticate }));
  app.use('/api/users', userRoutes({ identity, store, authenticate }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    console.error('Unexpected request error:', error.code || error.name);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
