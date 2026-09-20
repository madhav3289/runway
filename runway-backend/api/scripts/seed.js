/**
 * Creates the read-only demo user and loads ~4 months of synthetic bank data.
 * The sim service must be running (it parses the CSV):  npm run dev  ->  npm run db:seed
 * Safe to re-run: it wipes and regenerates the demo user's data so dates stay fresh.
 */
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { pool, query } = require('../src/db');
const { importStatement } = require('../src/services/importService');
const { generate, DEMO } = require('./generateSynthetic');
const { addDays } = require('../src/dates');

// First occurrence of a given day-of-month strictly after `dateStr`
function nextDayOfMonth(dateStr, dom) {
  let d = new Date(`${addDays(dateStr, 1)}T00:00:00Z`);
  while (d.getUTCDate() !== dom) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  try {
    const hash = await bcrypt.hash(config.demoPassword, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, is_demo) VALUES ($1, $2, true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_demo = true
       RETURNING id`,
      [config.demoEmail, hash],
    );
    const userId = rows[0].id;
    await query('DELETE FROM imports WHERE user_id = $1', [userId]); // cascades to transactions
    await query('DELETE FROM scheduled_items WHERE user_id = $1', [userId]);
    await query('DELETE FROM scenarios WHERE user_id = $1', [userId]);

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { csv, meta } = generate({ endDate: yesterday, days: 120 });
    const result = await importStatement(userId, 'demo_statement.csv', Buffer.from(csv));

    const asOf = meta.to;
    await query(
      `INSERT INTO scheduled_items (user_id, label, kind, amount_paise, next_date, recurrence) VALUES
         ($1, 'Monthly allowance', 'income', $2, $3, 'monthly'),
         ($1, 'Rent',              'bill',   $4, $5, 'monthly')`,
      [userId, DEMO.allowancePaise, nextDayOfMonth(asOf, DEMO.allowanceDay), DEMO.rentPaise, nextDayOfMonth(asOf, DEMO.rentDay)],
    );
    console.log(`Seeded ${config.demoEmail}: ${result.inserted} transactions, ${meta.from} -> ${meta.to}, balance Rs ${(result.closing_balance_paise / 100).toFixed(2)}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
