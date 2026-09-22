# Runway

A cash-flow risk forecaster: tells you the probability you run out of money
before your next income, using a bootstrapped Monte Carlo simulation over
your real spending history.

- **`runway-backend/`** — Express API + Flask simulation service (Node.js, PostgreSQL,
  Python, NumPy). Hand-written, 109+ tests, CI on every push. See
  [runway-backend/README.md](runway-backend/README.md) for the full design writeup,
  architecture, and how the forecasting model works.
- **`runway-frontend/`** — React UI

**Live app:** https://risk-runway-app.lovable.app
**API:** https://api-gamma-rosy-43.vercel.app