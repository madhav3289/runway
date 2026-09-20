// Tests must not depend on a developer's local .env: pin what they assert on before config loads.
process.env.CORS_ORIGIN = 'http://localhost:5173,https://*.lovable.app';

const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { signToken } = require('../src/middleware/auth');

const app = createApp();
const api = () => request(app);

const resetDb = () => pool.query('TRUNCATE users RESTART IDENTITY CASCADE');

let counter = 0;
async function registerUser(email = `user${++counter}@example.com`) {
  const res = await api().post('/api/auth/register').send({ email, password: 'correct-horse-battery' });
  return { token: res.body.token, id: res.body.user.id, email };
}

async function makeDemoUser() {
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash, is_demo) VALUES ('demo@runway.app', 'x', true) RETURNING id, email, is_demo",
  );
  return { token: signToken(rows[0]), id: rows[0].id };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// --- fake simulation service -------------------------------------------------------------
const parsedFixture = () => ({
  rows: [
    { txn_date: '2026-09-01', description: 'UPI-SWIGGY-x@ybl', amount_paise: -25000, balance_paise: 975000, category: 'food_delivery', is_transfer: false, is_outlier: false, row_hash: 'h1' },
    { txn_date: '2026-09-02', description: 'UPI-UBER-x@ybl', amount_paise: -12000, balance_paise: 963000, category: 'transport', is_transfer: false, is_outlier: false, row_hash: 'h2' },
    { txn_date: '2026-09-03', description: 'NEFT CR POCKET MONEY', amount_paise: 500000, balance_paise: 1463000, category: 'income', is_transfer: false, is_outlier: false, row_hash: 'h3' },
  ],
  skipped_rows: 0, date_from: '2026-09-01', date_to: '2026-09-03',
  closing_balance_paise: 1463000, closing_balance_date: '2026-09-03', warnings: [],
});

function mockSim({ down = false } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    if (down) throw new Error('ECONNREFUSED');
    const path = new URL(url).pathname;
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : undefined;
    calls.push({ path, body, headers: opts.headers });
    const ok = (data) => ({ status: 200, json: async () => data });
    if (path === '/parse') return ok(parsedFixture());
    if (path === '/simulate') return ok({ prob_zero: 0.34, median_zero_date: '2026-10-24', end_date: body.end_date, bands: { dates: [], p10: [], p50: [], p90: [] } });
    if (path === '/backtest') return ok({ day_coverage: 0.8, n_windows: 3 });
    if (path === '/health') return ok({ status: 'ok' });
    return { status: 404, json: async () => ({}) };
  });
  return calls;
}

module.exports = { api, app, auth, resetDb, registerUser, makeDemoUser, mockSim, pool };
