import 'dotenv/config';
import { createApp } from './app.js';
import { createDatabase } from './config/database.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const database = createDatabase(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not configured; database readiness will fail.');
}

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes');
}
if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN is required');
const origin = new URL(process.env.CORS_ORIGIN);
if (origin.origin !== process.env.CORS_ORIGIN || !['http:', 'https:'].includes(origin.protocol) ||
  (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
  throw new Error('CORS_ORIGIN must be an exact HTTP(S) origin (HTTPS in production)');
}
const app = createApp({
  database,
  corsOrigin: process.env.CORS_ORIGIN,
  jwtSecret: process.env.JWT_SECRET,
  production: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1'
});
const server = app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    try {
      await database.close();
      process.exitCode = 0;
    } catch (error) {
      console.error('Database shutdown failed:', error.code || error.name);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
