import 'dotenv/config';
import { createApp } from './app.js';
import { createFirebase } from './config/firebase.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN is required');
const origin = new URL(process.env.CORS_ORIGIN);
if (origin.origin !== process.env.CORS_ORIGIN || !['http:', 'https:'].includes(origin.protocol) ||
  (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
  throw new Error('CORS_ORIGIN must be an exact HTTP(S) origin (HTTPS in production)');
}
const { identity, store } = createFirebase();
const app = createApp({ identity, store, corsOrigin: process.env.CORS_ORIGIN, trustProxy: process.env.TRUST_PROXY === '1' });
const server = app.listen(port, () => console.log(`API listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => console.log(`Received ${signal}; server stopped.`)));
}
