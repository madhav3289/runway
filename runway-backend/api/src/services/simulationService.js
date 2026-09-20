const { query } = require('../db');
const sim = require('./simClient');
const config = require('../config');
const { HttpError } = require('../middleware/errors');
const { addDays, diffDays } = require('../dates');

const toSimTxn = (r) => ({
  date: r.txn_date,
  category: r.category,
  amount_paise: r.amount_paise,
  is_transfer: r.is_transfer,
  is_outlier: r.is_outlier,
});

/** The most recent statement gives us the "as of" date and the balance on it. */
async function getAnchor(userId) {
  const { rows } = await query(
    `SELECT closing_balance_paise, closing_balance_date
       FROM imports
      WHERE user_id = $1 AND closing_balance_date IS NOT NULL
      ORDER BY closing_balance_date DESC, id DESC LIMIT 1`,
    [userId],
  );
  if (rows[0]) return { asOf: rows[0].closing_balance_date, balance: rows[0].closing_balance_paise };
  const last = await query('SELECT MAX(txn_date) AS d FROM transactions WHERE user_id = $1', [userId]);
  return { asOf: last.rows[0].d, balance: null };
}

async function runSimulation(userId, body) {
  const anchor = await getAnchor(userId);
  if (!anchor.asOf) throw new HttpError(422, 'Upload a bank statement first.', 'NO_DATA');

  const startingBalance = body.starting_balance_paise ?? anchor.balance;
  if (startingBalance === null || startingBalance === undefined) {
    throw new HttpError(422, 'Your statement had no balance column. Provide starting_balance_paise.', 'NO_BALANCE');
  }

  const endDate = body.end_date ?? addDays(anchor.asOf, body.horizon_days);
  if (diffDays(endDate, anchor.asOf) < 1) {
    throw new HttpError(422, `end_date must be after your latest statement date (${anchor.asOf}).`, 'BAD_HORIZON');
  }
  if (diffDays(endDate, anchor.asOf) > config.maxHorizonDays) {
    throw new HttpError(422, `Forecast horizon is limited to ${config.maxHorizonDays} days.`, 'BAD_HORIZON');
  }

  const [txns, items] = await Promise.all([
    query(
      `SELECT txn_date, category, amount_paise, is_transfer, is_outlier
         FROM transactions
        WHERE user_id = $1 AND txn_date <= $2::date AND txn_date > $2::date - $3::int`,
      [userId, anchor.asOf, body.history_days],
    ),
    query('SELECT label, kind, amount_paise, next_date, recurrence FROM scheduled_items WHERE user_id = $1', [userId]),
  ]);

  const scheduled = [
    ...items.rows.map((i) => ({
      label: i.label,
      amount_paise: i.kind === 'income' ? i.amount_paise : -i.amount_paise,
      date: i.next_date,
      recurrence: i.recurrence,
    })),
    // "what if I pick up a shift / get a refund" from the UI: one-off events, signed amounts
    ...body.extra_events.map((e) => ({ label: e.label || 'what-if', amount_paise: e.amount_paise, date: e.date, recurrence: 'once' })),
  ];

  return sim.simulate({
    as_of: anchor.asOf,
    end_date: endDate,
    starting_balance_paise: startingBalance,
    history_days: body.history_days,
    n_runs: body.n_runs,
    seed: body.seed,
    multipliers: body.multipliers,
    transactions: txns.rows.map(toSimTxn),
    scheduled,
  });
}

async function runBacktest(userId, body) {
  const { rows } = await query(
    'SELECT txn_date, category, amount_paise, is_transfer, is_outlier FROM transactions WHERE user_id = $1 ORDER BY txn_date',
    [userId],
  );
  if (rows.length === 0) throw new HttpError(422, 'Upload a bank statement first.', 'NO_DATA');
  return sim.backtest({ ...body, transactions: rows.map(toSimTxn) });
}

module.exports = { runSimulation, runBacktest };
