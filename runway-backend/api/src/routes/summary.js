const express = require('express');
const { query } = require('../db');
const { z, validate } = require('../middleware/validate');
const { wrap } = require('../middleware/errors');

const FIXED_CATEGORIES = new Set(['income', 'rent', 'emi']); // mirrors sim/categorize.py
const router = express.Router();
const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

// Powers the "where does my money go" view and the data panel next to the forecast.
router.get('/', validate(q, 'query'), wrap(async (req, res) => {
  const uid = req.user.id;
  const last = await query('SELECT MIN(txn_date) AS first, MAX(txn_date) AS last, COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [uid]);
  const { first, last: asOf, n } = last.rows[0];
  if (!n) return res.json({ has_data: false });

  const [cats, months, anchor] = await Promise.all([
    query(
      `SELECT category, SUM(-amount_paise)::bigint AS total_paise, COUNT(*)::int AS txn_count,
              COALESCE(SUM(-amount_paise) FILTER (WHERE is_outlier), 0)::bigint AS outlier_paise
         FROM transactions
        WHERE user_id = $1 AND amount_paise < 0 AND NOT is_transfer
          AND txn_date <= $2::date AND txn_date > $2::date - $3::int
        GROUP BY category ORDER BY total_paise DESC`,
      [uid, asOf, req.query.days],
    ),
    query(
      `SELECT to_char(date_trunc('month', txn_date), 'YYYY-MM') AS month,
              COALESCE(SUM(-amount_paise) FILTER (WHERE amount_paise < 0), 0)::bigint AS spend_paise,
              COALESCE(SUM(amount_paise)  FILTER (WHERE amount_paise > 0), 0)::bigint AS income_paise
         FROM transactions WHERE user_id = $1 AND NOT is_transfer
        GROUP BY 1 ORDER BY 1`,
      [uid],
    ),
    query(
      `SELECT closing_balance_paise, closing_balance_date FROM imports
        WHERE user_id = $1 AND closing_balance_date IS NOT NULL ORDER BY closing_balance_date DESC, id DESC LIMIT 1`,
      [uid],
    ),
  ]);

  const spanDays = Math.min(req.query.days, Math.round((new Date(asOf) - new Date(first)) / 86400000) + 1);
  return res.json({
    has_data: true,
    date_from: first,
    as_of: asOf,
    days_covered: spanDays,
    transaction_count: n,
    balance: anchor.rows[0]
      ? { paise: anchor.rows[0].closing_balance_paise, date: anchor.rows[0].closing_balance_date }
      : null,
    // `fixed` categories are modelled as scheduled items, not as random daily spend.
    // avg_daily excludes flagged one-off outliers, matching what the simulation actually learns from.
    by_category: cats.rows.map((c) => ({
      ...c,
      fixed: FIXED_CATEGORIES.has(c.category),
      avg_daily_paise: Math.round((c.total_paise - c.outlier_paise) / spanDays),
    })),
    monthly: months.rows,
  });
}));

module.exports = router;
