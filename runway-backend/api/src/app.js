const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./db');
const sim = require('./services/simClient');
const { requireAuth } = require('./middleware/auth');
const { notFound, errorHandler, wrap } = require('./middleware/errors');

// Allow exact origins or wildcard subdomains, e.g. https://*.lovable.app
const originAllowed = (origin) =>
  config.corsOrigins.some((allowed) => {
    if (allowed === origin) return true;
    const m = allowed.match(/^(https?:\/\/)\*\.(.+)$/);
    return !!m && origin.startsWith(m[1]) && origin.endsWith(`.${m[2]}`);
  });

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway's proxy: needed for correct client IPs in rate limiting
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => (!origin || originAllowed(origin) ? cb(null, true) : cb(new Error('CORS_NOT_ALLOWED'))),
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  const limiter = (windowMs, max) =>
    config.isTest ? (req, res, next) => next()
      : rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.', code: 'RATE_LIMITED' } });

  app.get('/api/health', wrap(async (req, res) => {
    const out = { status: 'ok' };
    if (req.query.deep) {
      // Doubles as a warm-up call: the frontend can hit this on page load to wake sleeping free-tier services.
      out.db = await db.query('SELECT 1').then(() => 'ok').catch(() => 'down');
      out.sim = await sim.ping().then(() => 'ok').catch(() => 'down');
      if (out.db !== 'ok' || out.sim !== 'ok') out.status = 'degraded';
    }
    res.status(out.status === 'ok' ? 200 : 503).json(out);
  }));

  app.use('/api/auth', limiter(15 * 60 * 1000, 30), require('./routes/auth'));
  app.use('/api/imports', limiter(60 * 60 * 1000, 30), requireAuth, require('./routes/imports'));
  app.use('/api/transactions', requireAuth, require('./routes/transactions'));
  app.use('/api/scheduled-items', requireAuth, require('./routes/scheduledItems'));
  app.use('/api/summary', requireAuth, require('./routes/summary'));
  app.use('/api/scenarios', requireAuth, require('./routes/scenarios'));
  app.use('/api', limiter(60 * 1000, 60), requireAuth, require('./routes/simulate'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
