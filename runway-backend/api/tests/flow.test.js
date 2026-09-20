const { api, auth, resetDb, registerUser, makeDemoUser, mockSim, pool } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const csv = Buffer.from('Date,Narration\n');
const upload = (token, name = 'stmt.csv') => api().post('/api/imports').set(auth(token)).attach('file', csv, name);

describe('imports', () => {
  test('stores parsed rows and reports the closing balance', async () => {
    mockSim();
    const { token } = await registerUser();
    const res = await upload(token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ parsed_rows: 3, inserted: 3, duplicates_skipped: 0, closing_balance_paise: 1463000, closing_balance_date: '2026-09-03' });
    const tx = await api().get('/api/transactions').set(auth(token));
    expect(tx.body.total).toBe(3);
    expect(tx.body.items[0].txn_date).toBe('2026-09-03'); // newest first, date is a plain string
  });

  test('re-uploading the same statement is idempotent', async () => {
    mockSim();
    const { token } = await registerUser();
    await upload(token);
    const again = await upload(token);
    expect(again.body).toMatchObject({ inserted: 0, duplicates_skipped: 3 });
    expect((await api().get('/api/transactions').set(auth(token))).body.total).toBe(3);
  });

  test('two users can import the same statement independently', async () => {
    mockSim();
    const a = await registerUser();
    const b = await registerUser();
    await upload(a.token);
    expect((await upload(b.token)).body.inserted).toBe(3);
  });

  test('rejects missing file, non-csv, and demo uploads', async () => {
    mockSim();
    const { token } = await registerUser();
    expect((await api().post('/api/imports').set(auth(token))).status).toBe(400);
    expect((await upload(token, 'stmt.pdf')).status).toBe(400);
    const demo = await makeDemoUser();
    expect((await upload(demo.token)).status).toBe(403);
  });

  test('a sleeping/unreachable sim service becomes a friendly 503, not a 500', async () => {
    mockSim({ down: true });
    const { token } = await registerUser();
    const res = await upload(token);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SIM_UNAVAILABLE');
  });

  test('deleting an import removes its transactions', async () => {
    mockSim();
    const { token } = await registerUser();
    const { import_id } = (await upload(token)).body;
    expect((await api().delete(`/api/imports/${import_id}`).set(auth(token))).status).toBe(204);
    expect((await api().get('/api/transactions').set(auth(token))).body.total).toBe(0);
  });
});

describe('transactions', () => {
  test('filter, search and recategorise; other users get 404', async () => {
    mockSim();
    const a = await registerUser();
    const b = await registerUser();
    await upload(a.token);
    const list = (await api().get('/api/transactions?category=transport').set(auth(a.token))).body;
    expect(list.total).toBe(1);
    expect((await api().get('/api/transactions?q=swig').set(auth(a.token))).body.total).toBe(1);
    expect((await api().get('/api/transactions?q=%25').set(auth(a.token))).body.total).toBe(0); // % is literal, not a wildcard

    const id = list.items[0].id;
    const patched = await api().patch(`/api/transactions/${id}`).set(auth(a.token)).send({ category: 'Food_Delivery', is_outlier: true });
    expect(patched.body).toMatchObject({ category: 'food_delivery', is_outlier: true });
    expect((await api().patch(`/api/transactions/${id}`).set(auth(b.token)).send({ category: 'x' })).status).toBe(404);
    expect((await api().patch(`/api/transactions/${id}`).set(auth(a.token)).send({ amount_paise: 1 })).status).toBe(400); // amounts are immutable
    expect((await api().patch(`/api/transactions/${id}`).set(auth(a.token)).send({})).status).toBe(400);
  });

  test('summary separates fixed flows and reports the balance', async () => {
    mockSim();
    const { token } = await registerUser();
    expect((await api().get('/api/summary').set(auth(token))).body).toEqual({ has_data: false });
    await upload(token);
    const s = (await api().get('/api/summary').set(auth(token))).body;
    expect(s.balance).toEqual({ paise: 1463000, date: '2026-09-03' });
    expect(s.by_category.map((c) => c.category).sort()).toEqual(['food_delivery', 'transport']);
  });
});

describe('simulate', () => {
  const sched = { label: 'Rent', kind: 'bill', amount_paise: 550000, next_date: '2026-10-05', recurrence: 'monthly' };

  test('sends the sim service the balance, signed scheduled items, and what-if inputs', async () => {
    const calls = mockSim();
    const { token } = await registerUser();
    await upload(token);
    await api().post('/api/scheduled-items').set(auth(token)).send(sched);
    await api().post('/api/scheduled-items').set(auth(token)).send({ ...sched, label: 'Allowance', kind: 'income', amount_paise: 1300000, next_date: '2026-10-01' });

    const res = await api().post('/api/simulate').set(auth(token)).send({
      horizon_days: 30, multipliers: { food_delivery: 0.5 },
      extra_events: [{ label: 'shift', date: '2026-09-10', amount_paise: 200000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.prob_zero).toBe(0.34);

    const sent = calls.find((c) => c.path === '/simulate').body;
    expect(sent).toMatchObject({ as_of: '2026-09-03', end_date: '2026-10-03', starting_balance_paise: 1463000, seed: 42, multipliers: { food_delivery: 0.5 } });
    expect(sent.scheduled).toEqual(expect.arrayContaining([
      { label: 'Rent', amount_paise: -550000, date: '2026-10-05', recurrence: 'monthly' },   // bill => negative
      { label: 'Allowance', amount_paise: 1300000, date: '2026-10-01', recurrence: 'monthly' }, // income => positive
      { label: 'shift', amount_paise: 200000, date: '2026-09-10', recurrence: 'once' },
    ]));
    expect(sent.transactions).toHaveLength(3);
  });

  test('only ever sends the caller\'s own data to the sim service', async () => {
    const calls = mockSim();
    const a = await registerUser();
    const b = await registerUser();
    await upload(a.token);
    await upload(b.token);
    await api().post('/api/scheduled-items').set(auth(a.token)).send(sched);
    await api().post('/api/simulate').set(auth(b.token)).send({});
    const sent = calls.filter((c) => c.path === '/simulate').pop().body;
    expect(sent.scheduled).toHaveLength(0);
    expect(sent.transactions).toHaveLength(3);
  });

  test('forwards the shared secret to the sim service when configured', async () => {
    const config = require('../src/config');
    config.simApiKey = 's3cret';
    const calls = mockSim();
    const { token } = await registerUser();
    await upload(token);
    expect(calls[0].headers['X-Sim-Key']).toBe('s3cret');
    config.simApiKey = '';
  });

  test('no data yet -> 422 with a helpful message', async () => {
    mockSim();
    const { token } = await registerUser();
    const res = await api().post('/api/simulate').set(auth(token)).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_DATA');
  });

  test.each([
    ['end date before the statement', { end_date: '2026-09-01' }],
    ['horizon beyond 180 days', { end_date: '2027-06-01' }],
  ])('rejects %s', async (_n, body) => {
    mockSim();
    const { token } = await registerUser();
    await upload(token);
    expect((await api().post('/api/simulate').set(auth(token)).send(body)).status).toBe(422);
  });

  test.each([
    [{ n_runs: 5 }], [{ multipliers: { food_delivery: -1 } }], [{ multipliers: { food_delivery: 99 } }],
    [{ extra_events: [{ date: '2026-09-10', amount_paise: 0 }] }], [{ seed: 1.5 }], [{ horizon_days: 999 }],
  ])('validates %j', async (body) => {
    mockSim();
    const { token } = await registerUser();
    expect((await api().post('/api/simulate').set(auth(token)).send(body)).status).toBe(400);
  });

  test('scenarios can be saved, listed and fetched, but only by their owner', async () => {
    mockSim();
    const a = await registerUser();
    const b = await registerUser();
    await upload(a.token);
    const saved = await api().post('/api/simulate').set(auth(a.token)).send({ save_as: 'Cut Swiggy' });
    expect(saved.body.scenario_id).toEqual(expect.any(Number));
    const list = (await api().get('/api/scenarios').set(auth(a.token))).body.items;
    expect(list[0]).toMatchObject({ name: 'Cut Swiggy', prob_zero: 0.34, median_zero_date: '2026-10-24' });
    expect((await api().get(`/api/scenarios/${saved.body.scenario_id}`).set(auth(a.token))).body.params.horizon_days).toBe(45);
    expect((await api().get(`/api/scenarios/${saved.body.scenario_id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().delete(`/api/scenarios/${saved.body.scenario_id}`).set(auth(b.token))).status).toBe(404);
  });

  test('the demo account can simulate but not save', async () => {
    mockSim();
    const demo = await makeDemoUser();
    await pool.query(
      `INSERT INTO imports (user_id, filename, row_count, closing_balance_paise, closing_balance_date) VALUES ($1, 'd.csv', 1, 100000, '2026-09-03')`, [demo.id]);
    await pool.query(
      `INSERT INTO transactions (user_id, txn_date, description, amount_paise, category, row_hash) VALUES ($1, '2026-09-03', 'x', -100, 'upi_other', 'd1')`, [demo.id]);
    expect((await api().post('/api/simulate').set(auth(demo.token)).send({})).status).toBe(200);
    expect((await api().post('/api/simulate').set(auth(demo.token)).send({ save_as: 'x' })).status).toBe(403);
  });

  test('backtest proxies through with the user\'s transactions', async () => {
    const calls = mockSim();
    const { token } = await registerUser();
    await upload(token);
    const res = await api().post('/api/backtest').set(auth(token)).send({});
    expect(res.body.day_coverage).toBe(0.8);
    expect(calls.find((c) => c.path === '/backtest').body).toMatchObject({ horizon_days: 30, step_days: 7 });
  });
});

describe('health', () => {
  test('deep health reports db and sim status', async () => {
    mockSim();
    expect((await api().get('/api/health?deep=true')).body).toEqual({ status: 'ok', db: 'ok', sim: 'ok' });
    mockSim({ down: true });
    const res = await api().get('/api/health?deep=true');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', sim: 'down' });
  });
});
