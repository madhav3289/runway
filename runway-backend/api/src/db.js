const { Pool, types } = require('pg');
const config = require('./config');

// DATE columns come back as 'YYYY-MM-DD' strings. The default JS Date parsing shifts dates
// by the server's timezone offset, a classic off-by-one bug for anything date-driven.
types.setTypeParser(1082, (v) => v);
// BIGINT (paise) comes back as a string by default. Paise stay far below 2^53, so Number is safe.
types.setTypeParser(20, (v) => parseInt(v, 10));

// Serverless platforms start many short-lived instances, each with its own pool, so keep
// the per-instance pool tiny there (set DB_POOL_MAX=1..3) and use Neon's pooled connection string.
const pool = new Pool({ connectionString: config.databaseUrl, max: Number(process.env.DB_POOL_MAX) || 10 });
pool.on('error', (err) => console.error('Unexpected Postgres error:', err.message));

const query = (text, params) => pool.query(text, params);

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
