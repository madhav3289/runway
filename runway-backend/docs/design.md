# Design note (fill this in in your own words: it is your interview prep)

## Problem
_Who is this for and what decision does it help with? One paragraph._

## Key decisions (and the alternative I rejected)
| Decision | Why | Alternative and why not |
|---|---|---|
| Bootstrap real days instead of a normal distribution | Spending is lumpy and skewed; averages hide tail risk; no distribution assumption | Normal/lognormal fit: needs assumptions, underestimates bad weeks |
| Draw whole days, not individual transactions | Keeps correlation between categories | Independent per-category draws: too optimistic |
| Fixed flows (rent, allowance) are scheduled items, not learned | They are known in advance and would add fake variance | Learn them as spend: rent would randomly appear on wrong days |
| Outliers flagged per transaction (Q3 + 3 IQR, min ₹3,000) | Lumpy days must stay; one-off purchases must go | Flag by daily total: would delete the very risk we model |
| Two services (Express + Flask) | Simulation is CPU-bound and stateless; can scale independently | One Node service: simpler, fine at small scale |
| Integer paise in BIGINT | No float rounding errors in money | NUMERIC(12,2): fine too, but integers are simpler in JS/NumPy |
| Demo account is read-only | Shared by every visitor | Per-visitor sandbox copies: more work than it is worth here |
| Backtest reports coverage with and without outliers | Honest about what the model can and cannot predict | Single flattering number |

## What breaks at 100k users, and what I'd add first
_Your answer. Hints: simulation CPU cost per request, caching by input hash, a job queue, read replicas for transactions._

## Failure modes handled
- Sim service asleep or down -> API returns 503 `SIM_UNAVAILABLE` with a retry message.
- Duplicate or overlapping statement uploads -> idempotent.
- Short history -> `low_confidence` warning; fewer than 7 days -> clear error.
- Malformed CSV -> readable 422 message listing the columns found.

## Backtest results and what they taught me
_Numbers, and why they are what they are._
