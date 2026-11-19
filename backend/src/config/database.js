import pg from 'pg';

const { Pool } = pg;

export function createDatabase(connectionString) {
  const pool = connectionString
    ? new Pool({ connectionString, connectionTimeoutMillis: 5000 })
    : null;

  if (pool) {
    pool.on('error', (error) => {
      console.error('Unexpected database pool error:', error.code || error.name);
    });
  }

  return {
    async checkConnection() {
      if (!pool) {
        throw new Error('DATABASE_URL is not configured');
      }
      await pool.query('SELECT 1');
    },
    async close() {
      if (pool) {
        await pool.end();
      }
    }
  };
}
