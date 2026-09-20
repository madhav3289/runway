from datetime import date

import numpy as np
import pytest

from errors import SimulationError
from history import build_history
from simulate import expand_scheduled, occurrences, run_simulation, simulate_paths


def txns_constant(amount, days=30, start=date(2026, 8, 1), category="food_delivery"):
    return [{"date": date.fromordinal(start.toordinal() + i).isoformat(), "category": category,
             "amount_paise": -amount, "is_transfer": False, "is_outlier": False} for i in range(days)]


def payload(**over):
    p = {"as_of": "2026-08-30", "end_date": "2026-09-29", "starting_balance_paise": 1_000_000,
         "transactions": txns_constant(10_000), "scheduled": [], "n_runs": 500, "seed": 1}
    p.update(over)
    return p


def test_zero_variance_matches_plain_arithmetic():
    # every past day is exactly Rs 100, so every simulated future must be plain subtraction
    r = run_simulation(payload())
    expected = [1_000_000 - 10_000 * (i + 1) for i in range(30)]
    assert r["bands"]["p10"] == r["bands"]["p50"] == r["bands"]["p90"] == expected
    assert r["prob_zero"] == 0.0


def test_zero_variance_hits_zero_on_the_exact_day():
    r = run_simulation(payload(starting_balance_paise=95_000))  # 9.5 days of spend
    # balance < 0 first happens on the 10th forecast day: 2026-08-31 is day 1 -> 2026-09-09
    assert r["prob_zero"] == 1.0 and r["median_zero_date"] == "2026-09-09"


def test_same_seed_same_output_different_seed_differs():
    t = [{**x, "amount_paise": -(1000 + 500 * (i % 7))} for i, x in enumerate(txns_constant(1))]
    a, b = run_simulation(payload(transactions=t)), run_simulation(payload(transactions=t))
    c = run_simulation(payload(transactions=t, seed=2))
    assert a == b and a["bands"]["p50"] != c["bands"]["p50"]


def test_higher_starting_balance_never_increases_risk():
    t = [{**x, "amount_paise": -(500 + 900 * (i % 5))} for i, x in enumerate(txns_constant(1, days=40))]
    probs = [run_simulation(payload(transactions=t, starting_balance_paise=b, as_of="2026-09-09",
                                    end_date="2026-10-20"))["prob_zero"]
             for b in (0, 20_000, 60_000, 200_000, 2_000_000)]
    assert probs == sorted(probs, reverse=True)


def test_multiplier_zero_removes_variable_spend():
    r = run_simulation(payload(multipliers={"food_delivery": 0}))
    assert set(r["bands"]["p50"]) == {1_000_000}


def test_multiplier_half_halves_spend():
    r = run_simulation(payload(multipliers={"food_delivery": 0.5}))
    assert r["bands"]["p50"][0] == 1_000_000 - 5_000


def test_scheduled_income_and_bills_are_applied_on_their_dates():
    r = run_simulation(payload(scheduled=[
        {"amount_paise": 500_000, "date": "2026-09-01", "recurrence": "once"},
        {"amount_paise": -200_000, "date": "2026-09-05", "recurrence": "once"}]))
    p50, dates = r["bands"]["p50"], r["bands"]["dates"]
    i1, i5 = dates.index("2026-09-01"), dates.index("2026-09-05")
    assert p50[i1] - p50[i1 - 1] == 500_000 - 10_000
    assert p50[i5] - p50[i5 - 1] == -200_000 - 10_000


def test_monthly_recurrence_clamps_to_month_end():
    days = [d.isoformat() for d in occurrences(date(2026, 1, 31), "monthly", date(2026, 2, 1), date(2026, 4, 30))]
    assert days == ["2026-02-28", "2026-03-31", "2026-04-30"]


def test_weekly_recurrence_from_the_past():
    days = list(occurrences(date(2026, 8, 1), "weekly", date(2026, 8, 20), date(2026, 9, 5)))
    assert days == [date(2026, 8, 22), date(2026, 8, 29), date(2026, 9, 5)]


def test_expand_scheduled_ignores_events_outside_the_window():
    out = expand_scheduled([{"amount_paise": 5, "date": "2025-01-01", "recurrence": "once"}],
                           date(2026, 9, 1), date(2026, 9, 3))
    assert out.tolist() == [0, 0, 0]


def test_history_never_reaches_back_before_the_first_transaction():
    # 40 real days of data but history_days=90 must not pad 50 phantom zero-spend days
    r = run_simulation(payload(transactions=txns_constant(10_000, days=40, start=date(2026, 7, 21)),
                               as_of="2026-08-29", end_date="2026-09-10", history_days=90))
    assert r["history"]["days_used"] == 40


def test_excluded_rows_do_not_enter_history():
    t = txns_constant(10_000, days=20)
    t[3] = {**t[3], "is_outlier": True, "amount_paise": -9_000_000}
    t[4] = {**t[4], "is_transfer": True, "amount_paise": -9_000_000}
    t[5] = {**t[5], "category": "rent", "amount_paise": -9_000_000}
    _, matrix = build_history(t, date(2026, 8, 1), date(2026, 8, 20))
    assert matrix.max() == 10_000


def test_low_confidence_warning_when_history_is_short():
    r = run_simulation(payload(transactions=txns_constant(10_000, days=10), as_of="2026-08-10",
                               end_date="2026-08-20"))
    assert r["low_confidence"] and r["warnings"]


@pytest.mark.parametrize("over", [
    {"end_date": "2026-08-30"},                      # not after as_of
    {"end_date": "2027-08-30"},                      # beyond horizon cap
    {"transactions": []},                            # nothing to learn from
    {"transactions": txns_constant(1, days=3), "as_of": "2026-08-03", "end_date": "2026-08-20"},  # < 7 days
    {"multipliers": {"food_delivery": -1}},
    {"multipliers": {"food_delivery": 99}},
    {"scheduled": [{"amount_paise": 1, "date": "2026-09-01", "recurrence": "yearly"}]},
])
def test_invalid_requests_raise_simulation_error(over):
    with pytest.raises(SimulationError):
        run_simulation(payload(**over))


def test_missing_fields_raise_simulation_error():
    with pytest.raises(SimulationError):
        run_simulation({})


def test_simulate_paths_shape_and_dtype():
    hist = np.array([[100], [200]], dtype=np.int64)
    out = simulate_paths(hist, np.zeros(5, dtype=np.int64), 10_000, 50, 0)
    assert out.shape == (50, 5) and out.dtype == np.int64
