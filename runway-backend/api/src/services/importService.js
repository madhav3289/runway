const { query, withTransaction } = require('../db');
const sim = require('./simClient');
const { HttpError } = require('../middleware/errors');

async function importStatement(userId, filename, buffer) {
  const parsed = await sim.parseStatement(buffer, filename);
  const rows = parsed.rows || [];
  if (rows.length === 0) throw new HttpError(422, 'No transactions found in the file', 'EMPTY_STATEMENT');

  return withTransaction(async (client) => {
    const imp = await client.query(
      `INSERT INTO imports (user_id, filename, row_count, closing_balance_paise, closing_balance_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, filename.slice(0, 200), rows.length, parsed.closing_balance_paise, parsed.closing_balance_date],
    );
    const importId = imp.rows[0].id;

    // One round trip for the whole file. ON CONFLICT makes re-uploads idempotent.
    const ins = await client.query(
      `INSERT INTO transactions
         (user_id, import_id, txn_date, description, amount_paise, balance_paise, category, is_transfer, is_outlier, row_hash)
       SELECT $1::bigint, $2::bigint, * FROM unnest(
         $3::date[], $4::text[], $5::bigint[], $6::bigint[], $7::text[], $8::boolean[], $9::boolean[], $10::text[])
       ON CONFLICT (user_id, row_hash) DO NOTHING
       RETURNING id`,
      [
        userId,
        importId,
        rows.map((r) => r.txn_date),
        rows.map((r) => r.description),
        rows.map((r) => r.amount_paise),
        rows.map((r) => r.balance_paise),
        rows.map((r) => r.category),
        rows.map((r) => r.is_transfer),
        rows.map((r) => r.is_outlier),
        rows.map((r) => r.row_hash),
      ],
    );
    await client.query('UPDATE imports SET inserted_count = $1 WHERE id = $2', [ins.rowCount, importId]);

    return {
      import_id: importId,
      parsed_rows: rows.length,
      inserted: ins.rowCount,
      duplicates_skipped: rows.length - ins.rowCount,
      skipped_rows: parsed.skipped_rows,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      closing_balance_paise: parsed.closing_balance_paise,
      closing_balance_date: parsed.closing_balance_date,
      warnings: parsed.warnings || [],
    };
  });
}

module.exports = { importStatement };
