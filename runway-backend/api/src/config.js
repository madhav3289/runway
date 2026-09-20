const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET || (isTest ? 'test-secret' : '');
if (!jwtSecret || (isProd && jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be set (32+ characters in production)');
}

module.exports = {
  isTest,
  isProd,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: (isTest && process.env.TEST_DATABASE_URL) || process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  simUrl: (process.env.SIM_URL || 'http://localhost:5001').replace(/\/$/, ''),
  simApiKey: process.env.SIM_API_KEY || '',
  simTimeoutMs: Number(process.env.SIM_TIMEOUT_MS) || 45000,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  demoEmail: (process.env.DEMO_EMAIL || 'demo@runway.app').toLowerCase(),
  demoPassword: process.env.DEMO_PASSWORD || 'demo-password-change-me',
  maxUploadBytes: 2 * 1024 * 1024,
  maxHorizonDays: 180,
};
