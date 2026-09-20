const { api, auth, resetDb, registerUser, makeDemoUser, pool } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const rent = { label: 'Rent', kind: 'bill', amount_paise: 550000, next_date: '2026-10-05', recurrence: 'monthly' };

describe('scheduled items', () => {
  test('create, list, update, delete', async () => {
    const { token } = await registerUser();
    const created = await api().post('/api/scheduled-items').set(auth(token)).send(rent);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...rent, id: expect.any(Number) });

    const patched = await api().patch(`/api/scheduled-items/${created.body.id}`).set(auth(token)).send({ amount_paise: 600000 });
    expect(patched.body.amount_paise).toBe(600000);
    expect(patched.body.label).toBe('Rent'); // untouched fields survive a partial update

    const list = await api().get('/api/scheduled-items').set(auth(token));
    expect(list.body.items).toHaveLength(1);
    expect((await api().delete(`/api/scheduled-items/${created.body.id}`).set(auth(token))).status).toBe(204);
    expect((await api().get('/api/scheduled-items').set(auth(token))).body.items).toHaveLength(0);
  });

  test('dates come back as plain YYYY-MM-DD strings (no timezone shift)', async () => {
    const { token } = await registerUser();
    const res = await api().post('/api/scheduled-items').set(auth(token)).send({ ...rent, next_date: '2026-03-01' });
    expect(res.body.next_date).toBe('2026-03-01');
  });

  test('users cannot see or modify each other\'s items', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const item = (await api().post('/api/scheduled-items').set(auth(a.token)).send(rent)).body;

    expect((await api().get('/api/scheduled-items').set(auth(b.token))).body.items).toHaveLength(0);
    expect((await api().patch(`/api/scheduled-items/${item.id}`).set(auth(b.token)).send({ label: 'hacked' })).status).toBe(404);
    expect((await api().delete(`/api/scheduled-items/${item.id}`).set(auth(b.token))).status).toBe(404);
    const still = await api().get('/api/scheduled-items').set(auth(a.token));
    expect(still.body.items[0].label).toBe('Rent');
  });

  test.each([
    ['impossible date', { next_date: '2026-02-30' }],
    ['negative amount', { amount_paise: -5 }],
    ['zero amount', { amount_paise: 0 }],
    ['float amount', { amount_paise: 10.5 }],
    ['bad kind', { kind: 'gift' }],
    ['bad recurrence', { recurrence: 'yearly' }],
    ['empty label', { label: '  ' }],
  ])('rejects %s', async (_name, bad) => {
    const { token } = await registerUser();
    const res = await api().post('/api/scheduled-items').set(auth(token)).send({ ...rent, ...bad });
    expect(res.status).toBe(400);
  });

  test('the demo account cannot write', async () => {
    const demo = await makeDemoUser();
    const res = await api().post('/api/scheduled-items').set(auth(demo.token)).send(rent);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_READ_ONLY');
    expect((await api().get('/api/scheduled-items').set(auth(demo.token))).status).toBe(200); // reads are fine
  });
});
