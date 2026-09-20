# Runway: will you make it to your next paycheck?

Budgeting apps tell you where your money went. **Runway tells you whether you'll make it to the next allowance,
and how sure it is.** Upload a bank statement and get a probability ("34% chance you run out before 3 Nov, most likely
around 28 Oct"), a confidence band for your balance, and what-if sliders ("what if I cut food delivery by 20%?").

> Live demo: _add link_ · Demo login: click **Try the demo** (read-only) · Frontend: _add link_

## How the forecast works

1. **Learn from real spending.** Statements are parsed into integer paise, categorised (UPI-aware rules for Swiggy,
   Zomato, Uber and so on), and self-transfers and one-off purchases are flagged so they don't distort "normal" spending.
2. **Bootstrap, don't assume a distribution.** Each of 2,000 simulated futures draws *real past days* at random with
   replacement. Student spending is lumpy and skewed (quiet days, then a ₹1,300 night out), and a normal distribution
   around the average hides exactly the tail risk we want to surface. Whole days are drawn, so correlated spending
   (a night out plus the ride home) stays together.
3. **Add what is known.** Allowance, rent, and other scheduled income and bills land on their actual dates.
4. **Read off the risk.** `P(balance < 0)`, the distribution of the first day it happens, and p10/p50/p90 balance per day.

### Does it work? (backtest)
`POST /api/backtest` replays history: at rolling past cutoffs it forecasts the next 30 days using only earlier data and
checks how often the real balance stayed inside the p10-p90 band (nominal 80%).

| Dataset | Windows | Day coverage (ordinary spending) | Including one-off purchases |
|---|---|---|---|
| Synthetic demo data | _run it and fill in_ | _%_ | _%_ |
| My own statements (private) | _fill in_ | _%_ | _%_ |

Report whatever you measure and explain the gap. Known reasons for under-coverage: short history early on, weekday
patterns the model ignores, and unmodelled one-off purchases (which is why both numbers are reported).

## Architecture

```
Frontend (React)  -->  Express API  -->  PostgreSQL
                                   |
                                   +--> Flask simulation service (stateless, NumPy/pandas)
```
- **Express** owns everything stateful: users, JWT auth, transactions, scheduled items, saved scenarios.
- **Flask** is stateless: it parses statements and runs simulations. It is CPU-bound, so it can scale separately from
  the API. It requires a shared secret header, so only the API can call it.
- Money is `BIGINT` paise everywhere. Postgres `DATE` values are returned as strings to avoid timezone off-by-one bugs.
- Re-uploading a statement is idempotent (`UNIQUE (user_id, row_hash)`), and every query is scoped by `user_id`.

## Run it locally

Prerequisites: Node 18+, Python 3.11+, PostgreSQL (local, or a free Neon database).

```bash
cp .env.example .env            # then set DATABASE_URL and JWT_SECRET
npm install                     # root: installs `concurrently`
npm run install:all             # installs API dependencies
python -m venv sim/.venv && source sim/.venv/bin/activate   # Windows: sim\.venv\Scripts\activate
pip install -r sim/requirements.txt

npm run db:setup                # creates tables
npm run dev                     # API on :4000, simulation service on :5001
npm run db:seed                 # (in a second terminal) creates the read-only demo user + 4 months of synthetic data
```
Try it: `curl -X POST localhost:4000/api/auth/demo`, then use the token on `POST /api/simulate`. Full contract in `docs/API.md`.

Tests: `npm test` (Jest + Supertest against a real Postgres; pytest for the simulation).
For the API tests, create a database (e.g. `runway_test`), set `TEST_DATABASE_URL` in `.env`, and run
`NODE_ENV=test npm --prefix api run db:setup` once.

## Deploy

| Piece | Where | Settings |
|---|---|---|
| Database | Neon or Supabase (Postgres) | Run `npm run db:setup` once with `DATABASE_URL` pointing at it |
| Simulation | Render / Railway, Python service, root dir `sim` | Build `pip install -r requirements.txt`, start `gunicorn app:app`, env `SIM_API_KEY`, `PYTHON_VERSION=3.12` |
| API | Render / Railway, Node service, root dir `api` | Build `npm install`, start `node server.js`, env `DATABASE_URL`, `JWT_SECRET`, `SIM_URL`, `SIM_API_KEY` (same value as above), `CORS_ORIGIN`, `NODE_ENV=production`, `DEMO_EMAIL`, `DEMO_PASSWORD` |
| Seed demo | your machine | Run `npm run db:seed` with `.env` pointing at the deployed database and sim URL |

Free tiers sleep. The first request after idle time can take 30 seconds or more while both services wake up, so the
frontend calls `GET /api/health?deep=true` on load, and the API answers `503 SIM_UNAVAILABLE` (not a crash) if the
simulation service is still starting. Check current free-tier limits before choosing a host.

## Security notes
bcrypt password hashing, JWT auth, per-user data isolation, request validation with Zod, rate limiting on auth and
simulation routes, upload size and type limits, CORS allow-list, Helmet headers, no request bodies in logs, and a
read-only demo account. Statements are never stored as files; only parsed rows are kept.

## Limitations (and what I'd do next)
- Parses HDFC-style CSVs and a generic `Date, Description, Amount` format. Other banks need a column mapping.
- Daily spend is treated as independent draws: no weekday or pay-cycle effects yet.
- Categorisation is rule-based; unmatched merchants become `uncategorised` and can be edited by the user.
- At scale: cache simulation results keyed by a hash of the inputs, move heavy runs to a job queue, and add pagination
  or aggregation for very large histories. I would add these after profiling shows the need, not before.
- Not financial advice. It is a statistical estimate from past behaviour.
