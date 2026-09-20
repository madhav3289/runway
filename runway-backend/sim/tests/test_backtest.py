from datetime import date, timedelta

import pytest

from backtest import run_backtest
from errors import SimulationError


def txns(days, amount_fn, start=date(2026, 5, 1)):
    return [{"date": (start + timedelta(days=i)).isoformat(), "category": "food_delivery",
             "amount_paise": -amount_fn(i), "is_transfer": False, "is_outlier": False} for i in range(days)]


def test_deterministic_spending_is_perfectly_covered():
    r = run_backtest({"transactions": txns(100, lambda i: 10_000)})
    assert r["day_coverage"] == 1.0 and r["path_coverage"] == 1.0 and r["n_windows"] > 5


def test_a_regime_change_is_detected_as_poor_coverage():
    # spending triples after day 60: the model, trained on the past, must NOT look well calibrated
    r = run_backtest({"transactions": txns(100, lambda i: 10_000 if i < 60 else 30_000)})
    assert r["day_coverage"] < 1.0


def test_outlier_only_hurts_the_with_outliers_number():
    t = txns(100, lambda i: 10_000)
    # a one-off purchase ON TOP of that day's normal spend
    t.append({**t[60], "amount_paise": -5_000_000, "is_outlier": True})
    r = run_backtest({"transactions": t})
    assert r["day_coverage"] == 1.0 and r["day_coverage_with_outliers"] < 1.0


def test_too_little_data_is_a_readable_error():
    with pytest.raises(SimulationError, match="at least"):
        run_backtest({"transactions": txns(30, lambda i: 100)})
