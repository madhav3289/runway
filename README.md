# Runway: will you make it to your next paycheck?

Budgeting apps tell you where your money went. **Runway tells you whether you'll make it to
the next allowance, and how sure it is.** Upload a bank statement and get a probability
("34% chance you run out before 3 Nov, most likely around 28 Oct"), a confidence band for
your balance, and what-if sliders ("what if I cut food delivery by 20%?").

**Live app:** 
<br>
**API:** https://api-gamma-rosy-43.vercel.app
<br>
**Demo login:** click **Try the demo** on the landing page — a seeded, read-only account, no sign-up needed.

![CI](https://github.com/madhav3289/runway/actions/workflows/ci.yml/badge.svg)

## Repo layout

- **[`runway-backend/`](runway-backend/)** — Express API + Flask simulation service
  (Node.js, PostgreSQL, Python, NumPy). Hand-written, 109+ tests (Jest + pytest), CI on
  every push. This is the engineering core of the project: the bootstrapped Monte Carlo
  forecast and its validation backtest.
- **[`runway-frontend/`](runway-frontend/)** — React (TanStack Start) UI. See the
  [Frontend](#frontend) section below.

## How the forecast works

1. **Learn from real spending.** Statements are parsed into integer paise, categorised
   (UPI-aware rules for Swiggy, Zomato, Uber and so on), and self-transfers and one-off
   purchases are flagged so they don't distort "normal" spending.
2. **Bootstrap, don't assume a distribution.** Each of 2,000 simulated futures draws
   *real past days* at random with replacement. Student spending is lumpy and skewed
   (quiet days, then a ₹1,300 night out), and a normal distribution around the average
   hides exactly the tail risk we want to surface. Whole days are drawn, so correlated
   spending (a night out plus the ride home) stays together.
3. **Add what is known.** Allowance, rent, and other scheduled income and bills land on
   their actual dates.
4. **Read off the risk.** `P(balance < 0)`, the distribution of the first day it happens,
   and p10/p50/p90 balance per day.

### Does it work? (backtest)
`POST /api/backtest` replays history: at rolling past cutoffs it forecasts the next 30
days using only earlier data and checks how often the real balance stayed inside the
p10–p90 band (nominal 80%).

| Dataset | Windows | Day coverage (ordinary spending) | Including one-off purchases |
|---|---|---|---|
| Synthetic demo data | _run it and fill in_ | _%_ | _%_ |
| My own statements (private) | _fill in_ | _%_ | _%_ |

Report whatever you measure and explain the gap. Known reasons for under-coverage: short
history early on, weekday patterns the model ignores, and unmodelled one-off purchases
(which is why both numbers are reported).

## Architecture

```
Frontend (React / TanStack Start, Vercel)
        |
        v
Express API (Vercel serverless)  -->  PostgreSQL (Neon)
        |
        v
Flask simulation service (Vercel serverless, stateless, NumPy/pandas)
```
- **Express** owns everything stateful: users, JWT auth, transactions, scheduled items,
  saved scenarios.
- **Flask** is stateless: it parses statements and runs simulations. It's CPU-bound, so
  it scales independently of the API, and requires a shared secret header
  (`SIM_API_KEY`) so only the API can call it.
- Money is `BIGINT` paise everywhere. Postgres `DATE` values are returned as strings to
  avoid timezone off-by-one bugs.
- Re-uploading a statement is idempotent (`UNIQUE (user_id, row_hash)`), and every query
  is scoped by `user_id`.
- Full API contract: [`runway-backend/docs/API.md`](runway-backend/docs/API.md).
- Design decisions and interview notes: [`runway-backend/docs/design.md`](runway-backend/docs/design.md).

## Frontend

Built with **React 19, TanStack Start, and Vite**, styled with Tailwind and shadcn/ui,
charts via Recharts. All API calls live in `runway-frontend/src/lib/api.js` so the data
flow is easy to trace. Every screen calls the real backend against the documented API
contract (no mock data, no Supabase).

Screens: landing/auth, dashboard with the risk forecast and shaded confidence band, a
what-if panel (spending sliders + one-off events), a data screen (CSV upload, transaction
editing, category breakdown), income & bills, a model-accuracy screen that runs and
visualises the backtest, and saved scenarios.

### Run the frontend locally
```bash
cd runway-frontend
npm install
echo "VITE_API_URL=https://api-gamma-rosy-43.vercel.app" > .env
npm run dev
# -> http://localhost:8080
```

## Run the backend locally

Prerequisites: Node 18+, Python 3.11+, PostgreSQL (local, or a free Neon database).

```bash
cd runway-backend
cp .env.example .env            # then set DATABASE_URL, JWT_SECRET, SIM_API_KEY
npm install                     # root: installs `concurrently`
npm run install:all             # installs API dependencies
python -m venv sim/.venv && source sim/.venv/bin/activate   # Windows: sim\.venv\Scripts\activate
pip install -r sim/requirements.txt

npm run db:setup                # creates tables (safe to re-run; uses IF NOT EXISTS)
npm run dev                     # API on :4000, simulation service on :5001
npm run db:seed                 # (second terminal) creates the read-only demo user + synthetic data
```
Try it: `curl -X POST localhost:4000/api/auth/demo`, then use the token on
`POST /api/simulate`.

**Tests:** `npm test` (Jest + Supertest against a real Postgres; pytest for the
simulation). For the API tests, create a database (e.g. `runway_test`), set
`TEST_DATABASE_URL` in `.env`, and run `NODE_ENV=test npm --prefix api run db:setup` once.
A clean checkout with no `.env` passes all 111 tests, matching CI.

## Deploy

Both backend services and the API currently run on **Vercel** as serverless functions,
with **Neon** for Postgres.

| Piece | Where | Notes |
|---|---|---|
| Database | Neon (pooled connection string) | Run `npm run db:setup` once against it |
| Simulation | Vercel, root dir `runway-backend/sim` | Python 3.12 (`.python-version`), `requirements.txt` installed automatically; env `SIM_API_KEY` |
| API | Vercel, root dir `runway-backend/api` | Entry point exports the Express app from `src/app.js` for the serverless runtime; env `DATABASE_URL` (pooled), `JWT_SECRET` (32+ chars), `SIM_URL`, `SIM_API_KEY` (same as sim), `DB_POOL_MAX=2`, `CORS_ORIGIN`, `DEMO_EMAIL`, `DEMO_PASSWORD` |
| Frontend | Vercel | Env `VITE_API_URL` = the deployed API's base URL |
| Seed demo | your machine | Point `.env` at the deployed `DATABASE_URL`/`SIM_URL`/`SIM_API_KEY`, run `npm run db:seed` |

`CORS_ORIGIN` must include every frontend origin that will call the API (comma-separated,
supports `https://*.example.com` wildcards). A missing origin here is the most common
"it works in curl but not in the browser" bug.

Free-tier serverless functions cold-start. The frontend calls `GET /api/health?deep=true`
on load to warm both services, and the API returns `503 SIM_UNAVAILABLE` (not a crash) if
the simulation service is still starting, so the UI can retry instead of failing.

## Security notes
bcrypt password hashing, JWT auth, per-user data isolation, request validation with Zod,
rate limiting on auth and simulation routes, upload size and type limits, a CORS
allow-list, Helmet headers, no request bodies in logs, and a read-only demo account.
Statements are never stored as files; only parsed rows are kept.

## Limitations (and what I'd do next)
- Parses HDFC-style CSVs and a generic `Date, Description, Amount` format. Other banks
  need a column mapping.
- Daily spend is treated as independent draws: no weekday or pay-cycle effects yet.
- Categorisation is rule-based; unmatched merchants become `uncategorised` and can be
  edited by the user.
- At scale: cache simulation results keyed by a hash of the inputs, move heavy runs to a
  job queue, and add pagination or aggregation for very large histories. I'd add these
  after profiling shows the need, not before.
- Not financial advice. It's a statistical estimate from past behaviour.

## Design notes
The design tradeoffs behind the simulation engine and API are documented in
[`runway-backend/docs/design.md`](runway-backend/docs/design.md), and the full API
contract in [`runway-backend/docs/API.md`](runway-backend/docs/API.md).