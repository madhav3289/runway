const { api, auth, resetDb, registerUser, pool } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

describe('auth', () => {
  test('register returns a token and never the password hash', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'A@Example.com', password: 'longenough1' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(Number), email: 'a@example.com', is_demo: false });
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  test('passwords are stored hashed', async () => {
    await api().post('/api/auth/register').send({ email: 'a@example.com', password: 'longenough1' });
    const { rows } = await pool.query('SELECT password_hash FROM users');
    expect(rows[0].password_hash).not.toContain('longenough1');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  test('duplicate email (any casing) is a 409', async () => {
    await api().post('/api/auth/register').send({ email: 'a@example.com', password: 'longenough1' });
    const res = await api().post('/api/auth/register').send({ email: 'A@EXAMPLE.COM', password: 'longenough1' });
    expect(res.status).toBe(409);
  });

  test.each([
    [{ email: 'not-an-email', password: 'longenough1' }],
    [{ email: 'a@example.com', password: 'short' }],
    [{ email: 'a@example.com', password: 'x'.repeat(73) }],
    [{}],
  ])('invalid registration %j is a 400', async (body) => {
    const res = await api().post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  test('login succeeds; wrong password and unknown email give the same 401', async () => {
    await api().post('/api/auth/register').send({ email: 'a@example.com', password: 'longenough1' });
    expect((await api().post('/api/auth/login').send({ email: 'a@example.com', password: 'longenough1' })).status).toBe(200);
    const wrong = await api().post('/api/auth/login').send({ email: 'a@example.com', password: 'wrongpassword' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'longenough1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  test('protected routes need a valid token', async () => {
    expect((await api().get('/api/scheduled-items')).status).toBe(401);
    expect((await api().get('/api/scheduled-items').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const { token } = await registerUser();
    expect((await api().get('/api/scheduled-items').set(auth(token))).status).toBe(200);
    expect((await api().get('/api/auth/me').set(auth(token))).body.user.is_demo).toBe(false);
  });

  test('demo login is a 404 until the demo user is seeded', async () => {
    expect((await api().post('/api/auth/demo')).status).toBe(404);
  });
});

describe('cors', () => {
  test('allows configured origins and wildcard subdomains, blocks others', async () => {
    const ok = await api().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const wild = await api().get('/api/health').set('Origin', 'https://my-app.lovable.app');
    expect(wild.headers['access-control-allow-origin']).toBe('https://my-app.lovable.app');
    const evil = await api().get('/api/health').set('Origin', 'https://evil.example.com');
    expect(evil.status).toBe(403);
    const sneaky = await api().get('/api/health').set('Origin', 'https://lovable.app.evil.com');
    expect(sneaky.status).toBe(403);
  });
});
