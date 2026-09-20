"""Monte Carlo cash-flow simulation.

Model
-----
1. History: one row per past day, one column per spending category (integer paise).
   Transfers, flagged outliers and fixed flows (rent, allowance, EMI) are excluded.
2. Each simulated future draws N real past days *with replacement* (bootstrap). Whole days
   are drawn, so correlations between categories are preserved, and no distribution is assumed.
   Spending is lumpy and skewed, which a normal distribution models badly.
3. Known scheduled items (allowance, rent, one-off events) are added on their dates.
4. balance[t] = starting_balance + cumsum(scheduled - spend). "Running out" means balance < 0.
5. Aggregate across runs: P(ever < 0), distribution of the first day below zero, and
   10th/50th/90th percentile balance per day.
"""
import calendar
from datetime import date, timedelta

import numpy as np

from errors import SimulationError
from history import build_history, parse_date

MAX_HORIZON_DAYS = 180
MIN_HISTORY_DAYS = 7
LOW_CONFIDENCE_DAYS = 30
MIN_RUNS, MAX_RUNS = 100, 10_000
MAX_MULTIPLIER = 5.0


def occurrences(first: date, recurrence: str, start: date, end: date):
    """Yield every date in [start, end] on which a scheduled item fires."""
    if recurrence == "once":
        if start <= first <= end:
            yield first
    elif recurrence == "weekly":
        d = first
        if first < start:
            d = first + timedelta(days=7 * -(-(start - first).days // 7))
        while d <= end:
            yield d
            d += timedelta(days=7)
    elif recurrence == "monthly":
        y, m = first.year, first.month
        while True:
            # A bill on the 31st fires on the last day of shorter months
            d = date(y, m, min(first.day, calendar.monthrange(y, m)[1]))
            if d > end:
                break
            if d >= start:
                yield d
            m += 1
            if m > 12:
                y, m = y + 1, 1
    else:
        raise SimulationError(f"Unknown recurrence: {recurrence!r}")


def expand_scheduled(items, start: date, end: date) -> np.ndarray:
    """Signed paise per day for [start, end]. Income is positive, bills negative."""
    out = np.zeros((end - start).days + 1, dtype=np.int64)
    for it in items:
        amount = int(it["amount_paise"])
        for d in occurrences(parse_date(it["date"]), it.get("recurrence", "once"), start, end):
            out[(d - start).days] += amount
    return out


def simulate_paths(history: np.ndarray, scheduled: np.ndarray, starting_balance: int,
                   n_runs: int, seed: int, multipliers=None) -> np.ndarray:
    """Return balance paths, shape (n_runs, n_days), int64 paise.

    `multipliers` (one per category column) implements the what-if sliders. Scaling the
    history before bootstrapping is identical to scaling each drawn day, but far cheaper.
    """
    if len(history) == 0:
        raise SimulationError("No spending history to learn from")
    rng = np.random.default_rng(seed)
    scaled = history if multipliers is None else np.rint(history * multipliers).astype(np.int64)
    day_totals = scaled.sum(axis=1)  # (H,)
    idx = rng.integers(0, len(day_totals), size=(n_runs, len(scheduled)))
    spend = day_totals[idx]  # (runs, days)
    return starting_balance + np.cumsum(scheduled[None, :] - spend, axis=1)


def _dates(start: date, offsets):
    return [(start + timedelta(days=int(i))).isoformat() for i in offsets]


def summarize(balance: np.ndarray, start: date) -> dict:
    n_runs, n_days = balance.shape
    broke = balance < 0
    ever = broke.any(axis=1)
    first_day = broke.argmax(axis=1)  # index of first True per run (only meaningful where ever)
    p10, p50, p90 = np.rint(np.percentile(balance, [10, 50, 90], axis=0)).astype(np.int64)
    cumulative = np.logical_or.accumulate(broke, axis=1).mean(axis=0)

    first_zero = {"p10": None, "p50": None, "p90": None}
    if ever.any():
        q = np.percentile(first_day[ever], [10, 50, 90])
        first_zero = dict(zip(("p10", "p50", "p90"), _dates(start, q)))

    return {
        "prob_zero": float(ever.mean()),
        "median_zero_date": first_zero["p50"],
        "first_zero_date": first_zero,  # conditional on running out: 10% of those runs hit zero by p10
        "cumulative_prob_zero": [round(float(x), 4) for x in cumulative],
        "bands": {
            "dates": _dates(start, range(n_days)),
            "p10": p10.tolist(), "p50": p50.tolist(), "p90": p90.tolist(),
        },
        "end_balance_paise": {"p10": int(p10[-1]), "p50": int(p50[-1]), "p90": int(p90[-1])},
    }


def parse_multipliers(raw, categories):
    raw = raw or {}
    if not isinstance(raw, dict):
        raise SimulationError("multipliers must be an object of {category: factor}")
    vec = []
    for c in categories:
        f = float(raw.get(c, 1.0))
        if not (0 <= f <= MAX_MULTIPLIER) or f != f:
            raise SimulationError(f"multiplier for {c!r} must be between 0 and {MAX_MULTIPLIER}")
        vec.append(f)
    return np.array(vec, dtype=np.float64)


def run_simulation(p: dict) -> dict:
    try:
        as_of, end = parse_date(p["as_of"]), parse_date(p["end_date"])
        starting = int(p["starting_balance_paise"])
    except KeyError as e:
        raise SimulationError(f"Missing field: {e.args[0]}")
    except (TypeError, ValueError) as e:
        raise SimulationError(str(e))

    start = as_of + timedelta(days=1)  # first forecast day; starting balance is the close of as_of
    if end < start:
        raise SimulationError("end_date must be after the statement's last date")
    if (end - as_of).days > MAX_HORIZON_DAYS:
        raise SimulationError(f"Forecast horizon is limited to {MAX_HORIZON_DAYS} days")

    n_runs = max(MIN_RUNS, min(MAX_RUNS, int(p.get("n_runs", 2000))))
    seed = int(p.get("seed", 42))
    history_days = max(MIN_HISTORY_DAYS, min(365, int(p.get("history_days", 90))))

    txns = p.get("transactions") or []
    known = [parse_date(t["date"]) for t in txns if parse_date(t["date"]) <= as_of]
    if not known:
        raise SimulationError("No transactions on or before the statement date to learn from")
    # Never look back before the first real transaction: empty days before that are not 'zero spend'
    hist_start = max(as_of - timedelta(days=history_days - 1), min(known))
    categories, history = build_history(txns, hist_start, as_of)
    if len(history) < MIN_HISTORY_DAYS:
        raise SimulationError(f"Need at least {MIN_HISTORY_DAYS} days of history; found {len(history)}")

    multipliers = parse_multipliers(p.get("multipliers"), categories)
    scheduled = expand_scheduled(p.get("scheduled") or [], start, end)
    balance = simulate_paths(history, scheduled, starting, n_runs, seed, multipliers)

    warnings = []
    if len(history) < LOW_CONFIDENCE_DAYS:
        warnings.append(f"Only {len(history)} days of history: treat this forecast as low confidence.")

    result = summarize(balance, start)
    result.update({
        "as_of": as_of.isoformat(), "start_date": start.isoformat(), "end_date": end.isoformat(),
        "n_runs": n_runs, "seed": seed, "starting_balance_paise": starting,
        "history": {
            "days_used": len(history),
            "start": hist_start.isoformat(), "end": as_of.isoformat(),
            "categories": categories,
            "avg_daily_spend_paise": {c: int(round(v)) for c, v in zip(categories, history.mean(axis=0))},
        },
        "low_confidence": len(history) < LOW_CONFIDENCE_DAYS,
        "warnings": warnings,
    })
    return result
