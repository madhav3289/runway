// Applies db/schema.sql (idempotent). Usage: npm run db:setup   (add --reset to drop everything first)
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

(async () => {
  try {
    if (process.argv.includes('--reset')) {
      await pool.query('DROP TABLE IF EXISTS scenarios, scheduled_items, transactions, imports, users CASCADE');
      console.log('Dropped existing tables');
    }
    await pool.query(fs.readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));
    console.log('Schema applied');
  } catch (err) {
    console.error('DB setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
