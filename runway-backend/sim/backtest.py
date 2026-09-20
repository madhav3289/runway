"""Rolling-origin backtest: how often does reality land inside the forecast band?

For each cutoff date T (moving forward by `step_days`):
  * learn spending behaviour only from days <= T,
  * forecast the next `horizon_days` days as a p10-p90 band of *balance change*,
  * compare with what actually happened.

Known scheduled flows are handed to the model as an oracle (the actual fixed-category
transactions in the holdout window), so the test isolates the part that is genuinely
uncertain: variable spending. Refunds and friends paying you back are in the 'actual' path but not in the model.

Two coverage numbers are reported. `day_coverage` compares against ordinary spending (flagged
one-off outliers removed from the actual path), which is what the model claims to predict.
`day_coverage_with_outliers` counts one-offs too, showing what an unexpected big purchase does.

Coverage is computed on balance *change* from T. The starting balance shifts the actual
path and the band by the same amount, so it cancels out.
"""
from datetime import timedelta

import numpy as np

from categorize import FIXED_CATEGORIES
from errors import SimulationError
from history import build_history, parse_date
from simulate import simulate_paths

LOW_PCT, HIGH_PCT = 10, 90


def run_backtest(p: dict) -> dict:
    horizon = int(p.get("horizon_days", 30))
    step = int(p.get("step_days", 7))
    min_history = int(p.get("min_history_days", 21))
    history_days = int(p.get("history_days", 90))
    n_runs = max(100, min(5000, int(p.get("n_runs", 1000))))
    seed = int(p.get("seed", 42))
    if not (7 <= horizon <= 90 and 1 <= step <= 60 and 7 <= min_history <= 180):
        raise SimulationError("horizon_days must be 7-90, step_days 1-60, min_history_days 7-180")

    txns = [t for t in (p.get("transactions") or []) if not t.get("is_transfer")]
    if not txns:
        raise SimulationError("No transactions to backtest on")
    dated = [(parse_date(t["date"]), t) for t in txns]
    first = min(d for d, _ in dated)
    last = max(d for d, _ in dated)
    if (last - first).days + 1 < min_history + horizon:
        raise SimulationError(
            f"Need at least {min_history + horizon} days of data for a {horizon}-day backtest; "
            f"found {(last - first).days + 1}. Upload a longer statement."
        )

    windows = []
    cutoff = first + timedelta(days=min_history - 1)
    while cutoff + timedelta(days=horizon) <= last:
        hist_start = max(first, cutoff - timedelta(days=history_days - 1))
        _, history = build_history(txns, hist_start, cutoff)

        actual = np.zeros(horizon, dtype=np.int64)  # everything that really happened
        actual_ordinary = np.zeros(horizon, dtype=np.int64)  # same, minus user-flagged one-off outliers
        known = np.zeros(horizon, dtype=np.int64)  # fixed flows we treat as known in advance
        for d, t in dated:
            off = (d - cutoff).days - 1
            if 0 <= off < horizon:
                amt = int(t["amount_paise"])
                actual[off] += amt
                if not t.get("is_outlier"):
                    actual_ordinary[off] += amt
                if t.get("category") in FIXED_CATEGORIES:
                    known[off] += amt
        actual_path = np.cumsum(actual)
        ordinary_path = np.cumsum(actual_ordinary)

        paths = simulate_paths(history, known, 0, n_runs, seed)
        lo, hi = np.percentile(paths, [LOW_PCT, HIGH_PCT], axis=0)
        inside = (ordinary_path >= lo) & (ordinary_path <= hi)
        inside_all = (actual_path >= lo) & (actual_path <= hi)
        windows.append({
            "cutoff": cutoff.isoformat(),
            "history_days": len(history),
            "day_coverage": round(float(inside.mean()), 4),
            "day_coverage_with_outliers": round(float(inside_all.mean()), 4),
            "path_inside": bool(inside.all()),
            "end_inside": bool(inside[-1]),
            "actual_change_paise": ordinary_path.tolist(),
            "actual_change_with_outliers_paise": actual_path.tolist(),
            "p10_change_paise": np.rint(lo).astype(np.int64).tolist(),
            "p90_change_paise": np.rint(hi).astype(np.int64).tolist(),
        })
        cutoff += timedelta(days=step)

    day_cov = float(np.mean([w["day_coverage"] for w in windows]))
    return {
        "nominal_coverage": (HIGH_PCT - LOW_PCT) / 100,
        "day_coverage": round(day_cov, 4),
        "day_coverage_with_outliers": round(float(np.mean([w["day_coverage_with_outliers"] for w in windows])), 4),
        "path_coverage": round(float(np.mean([w["path_inside"] for w in windows])), 4),
        "end_of_horizon_coverage": round(float(np.mean([w["end_inside"] for w in windows])), 4),
        "n_windows": len(windows),
        "horizon_days": horizon,
        "step_days": step,
        "note": ("Windows overlap, so they are not independent: treat coverage as a calibration "
                 "check, not a confidence interval."),
        "windows": windows,
    }
