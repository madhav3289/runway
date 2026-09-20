const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const config = require('../config');
const { z, validate } = require('../middleware/validate');
const { wrap, HttpError } = require('../middleware/errors');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// A real hash to compare against when the email is unknown, so timing doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // bcrypt only uses the first 72 bytes, so cap it to avoid a false sense of security
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const publicUser = (u) => ({ id: u.id, email: u.email, is_demo: u.is_demo });

router.post('/register', validate(credentials), wrap(async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, is_demo',
      [email, hash],
    );
    return res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
}));

router.post('/login', validate(credentials), wrap(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT id, email, is_demo, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Same error and same work whether the email exists or not
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password', 'BAD_CREDENTIALS');
  return res.json({ token: signToken(user), user: publicUser(user) });
}));

// One click for recruiters: logs into the seeded, read-only demo user.
router.post('/demo', wrap(async (req, res) => {
  const { rows } = await query('SELECT id, email, is_demo FROM users WHERE email = $1 AND is_demo = true', [config.demoEmail]);
  if (!rows[0]) throw new HttpError(404, 'Demo data has not been seeded yet', 'NO_DEMO');
  return res.json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await query('SELECT id, email, is_demo FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'Account no longer exists', 'UNAUTHENTICATED');
  return res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
