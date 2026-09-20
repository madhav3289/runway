# Runway API contract

Base URL: `https://<your-api-host>` (locally `http://localhost:4000`). All routes are under `/api`.

**Conventions**
- Money is **integer paise** (1 rupee = 100 paise). Divide by 100 only when displaying. Negative = money out.
- Dates are plain `YYYY-MM-DD` strings.
- Auth: `Authorization: Bearer <token>` on everything except `/api/auth/*` and `/api/health`.
- Errors always look like `{ "error": "human readable", "code": "MACHINE_CODE", "details"?: [...] }`.
  Useful codes: `VALIDATION` (400, `details` lists fields), `UNAUTHENTICATED` (401), `DEMO_READ_ONLY` (403),
  `NOT_FOUND` (404), `NO_DATA` (422, no statement uploaded yet), `SIM_UNAVAILABLE` (503, service waking up: retry in a few seconds),
  `RATE_LIMITED` (429).

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{email, password}` (password 8-72 chars) | `201 {token, user}` |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| POST | `/api/auth/demo` | none | `{token, user}` for the read-only demo account |
| GET | `/api/auth/me` | | `{user: {id, email, is_demo}}` |

## Health (use as a warm-up call on page load)
`GET /api/health` -> `{status: "ok"}`. `GET /api/health?deep=true` also pings the database and the simulation service
(this wakes a sleeping free-tier service) -> `{status, db, sim}`; HTTP 503 if degraded.

## Statements
- `POST /api/imports` : `multipart/form-data`, field `file` (a `.csv`, max 2 MB). Returns `201`
  `{import_id, parsed_rows, inserted, duplicates_skipped, skipped_rows, date_from, date_to, closing_balance_paise, closing_balance_date, warnings[]}`.
  Re-uploading the same file inserts 0 rows (`duplicates_skipped` = all of them).
- `GET /api/imports` -> `{items: [{id, filename, row_count, inserted_count, closing_balance_paise, closing_balance_date, created_at}]}`
- `DELETE /api/imports/:id` -> `204` (also deletes the transactions it created)

## Transactions
- `GET /api/transactions?from&to&category&is_transfer&is_outlier&q&page=1&limit=50` (limit max 200)
  -> `{items: [{id, txn_date, description, amount_paise, balance_paise, category, is_transfer, is_outlier, import_id}], page, limit, total}`
  Newest first. `q` is a case-insensitive text search on the description.
- `GET /api/transactions/categories` -> `{categories: string[]}` (for dropdowns)
- `PATCH /api/transactions/:id` with any of `{category, is_transfer, is_outlier}` -> updated transaction.
  Amounts and dates cannot be edited. Flagging `is_outlier` or `is_transfer` removes a row from what the forecast learns from.

`is_transfer` = money moved between your own accounts (auto-detected). `is_outlier` = a one-off purchase far above normal
(auto-detected, e.g. a phone). Both are excluded from the "typical daily spending" the forecast learns from.
Categories `income`, `rent`, `emi` are **fixed** flows: they are modelled with scheduled items, not learned as random spend.

## Summary
`GET /api/summary?days=90` -> `{has_data: false}` or
```json
{
  "has_data": true, "date_from": "2026-05-23", "as_of": "2026-09-19", "days_covered": 90, "transaction_count": 171,
  "balance": {"paise": 834700, "date": "2026-09-19"},
  "by_category": [{"category": "food_delivery", "total_paise": 861000, "txn_count": 36, "outlier_paise": 0, "fixed": false, "avg_daily_paise": 9567}],
  "monthly": [{"month": "2026-08", "spend_paise": 1120000, "income_paise": 1300000}]
}
```

## Scheduled items (known future income and bills)
Fields: `{id, label, kind: "income"|"bill", amount_paise (positive), next_date, recurrence: "once"|"weekly"|"monthly"}`.
`next_date` is the first occurrence; `monthly` repeats on that day of the month (clamped to month end).
- `GET /api/scheduled-items` -> `{items}`
- `POST /api/scheduled-items` (all fields except `id`) -> `201` item
- `PATCH /api/scheduled-items/:id` (any subset) -> item
- `DELETE /api/scheduled-items/:id` -> `204`

## Forecast
`POST /api/simulate` (all fields optional)
```json
{
  "horizon_days": 45,                 // or "end_date": "2026-11-03" (max 180 days after the statement date)
  "starting_balance_paise": 834700,   // default: closing balance of the latest statement
  "multipliers": {"food_delivery": 0.8},  // what-if sliders, 0-5 per category (1 = unchanged)
  "extra_events": [{"label": "shift", "date": "2026-10-10", "amount_paise": 300000}], // what-if one-offs; negative = spend
  "history_days": 90, "n_runs": 2000, "seed": 42,
  "save_as": "Cut delivery by 20%"    // optional; also returns scenario_id (not allowed for the demo account)
}
```
Response (all money in paise):
```json
{
  "prob_zero": 0.2115,                       // P(balance goes below 0 at any point before end_date)
  "median_zero_date": "2026-10-28",          // null if it never happens; median day of first going below 0, among runs that do
  "first_zero_date": {"p10": "...", "p50": "...", "p90": "..."},  // spread of that date (null values if never)
  "cumulative_prob_zero": [0, 0, 0.001, ...],   // per forecast day: P(already gone below 0 by this day)
  "bands": {"dates": ["2026-09-20", ...], "p10": [...], "p50": [...], "p90": [...]},  // balance per day; draw p10-p90 as a shaded area, p50 as a line
  "end_balance_paise": {"p10": 1034620, "p50": 1410000, "p90": 1743310},
  "as_of": "2026-09-19", "start_date": "2026-09-20", "end_date": "2026-11-03",
  "starting_balance_paise": 834700, "n_runs": 2000, "seed": 42,
  "history": {"days_used": 90, "start": "...", "end": "...", "categories": ["food_delivery", ...],
              "avg_daily_spend_paise": {"food_delivery": 9567}},
  "low_confidence": false,                   // true when < 30 days of history: show a warning banner
  "warnings": [],
  "scenario_id": 12                          // only when save_as was sent
}
```
Uses the same `seed` by default, so dragging a slider gives smooth, comparable results (same random draws, different inputs).

`POST /api/backtest` (optional `{horizon_days: 30, step_days: 7, min_history_days: 21, history_days: 90, n_runs: 1000, seed: 42}`)
-> `{nominal_coverage: 0.8, day_coverage, day_coverage_with_outliers, path_coverage, end_of_horizon_coverage, n_windows, horizon_days, step_days, note, windows: [{cutoff, day_coverage, path_inside, actual_change_paise[], p10_change_paise[], p90_change_paise[]}]}`
Answers "when the model predicted an 80% band in the past, how often was reality inside it?" 422 if under ~51 days of data.

## Saved scenarios
- `GET /api/scenarios` -> `{items: [{id, name, created_at, prob_zero, median_zero_date, end_date}]}`
- `GET /api/scenarios/:id` -> `{id, name, params, result, created_at}` (`result` has the same shape as `/api/simulate`)
- `DELETE /api/scenarios/:id` -> `204`

## Demo account
`POST /api/auth/demo` logs into a seeded, **read-only** account. Reads and `/api/simulate` (without `save_as`) work;
uploads, edits, deletes and saving return `403 DEMO_READ_ONLY`. Show a "Sign up to save your own data" prompt on that code.
