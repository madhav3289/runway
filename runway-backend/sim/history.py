"""Turn raw transactions into the daily variable-spend matrix used by the simulation."""
from collections import defaultdict
from datetime import date, datetime

import numpy as np

from categorize import FIXED_CATEGORIES


def parse_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date: {v!r} (expected YYYY-MM-DD)")


def is_variable(t) -> bool:
    """A debit that is not a self-transfer, not a flagged outlier, not a fixed flow."""
    return (
        int(t["amount_paise"]) < 0
        and not t.get("is_transfer")
        and not t.get("is_outlier")
        and t.get("category") not in FIXED_CATEGORIES
    )


def build_history(txns, start: date, end: date):
    """Daily spend per category for every day in [start, end] (zero-spend days included).

    Returns (categories, matrix) where matrix has shape (days, categories), int64 paise,
    spend as positive numbers. Whole days are kept together so that correlations between
    categories (a big night out is also a big Uber bill) survive bootstrapping.
    """
    n = (end - start).days + 1
    if n <= 0:
        raise ValueError("History window is empty")
    spend = defaultdict(lambda: np.zeros(n, dtype=np.int64))
    for t in txns:
        if not is_variable(t):
            continue
        d = parse_date(t["date"])
        if d < start or d > end:
            continue
        spend[t.get("category") or "uncategorised"][(d - start).days] += -int(t["amount_paise"])
    if not spend:
        return ["uncategorised"], np.zeros((n, 1), dtype=np.int64)
    cats = sorted(spend)
    return cats, np.stack([spend[c] for c in cats], axis=1)
