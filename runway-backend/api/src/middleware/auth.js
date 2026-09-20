const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('./errors');

const signToken = (user) =>
  jwt.sign({ sub: String(user.id), email: user.email, demo: !!user.is_demo }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Missing bearer token', 'UNAUTHENTICATED'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(payload.sub), email: payload.email, isDemo: !!payload.demo };
    return next();
  } catch {
    return next(new HttpError(401, 'Invalid or expired token', 'UNAUTHENTICATED'));
  }
};

// The shared demo account is read-only so one visitor cannot change what the next one sees.
const denyDemoWrites = (req, res, next) =>
  req.user && req.user.isDemo
    ? next(new HttpError(403, 'The demo account is read-only. Create an account to save changes.', 'DEMO_READ_ONLY'))
    : next();

module.exports = { signToken, requireAuth, denyDemoWrites };
