"""Bank-statement parsing (HDFC-style CSV, plus a generic Date/Description/Amount fallback).

Pipeline: read as strings -> normalise columns -> parse each row into integer paise ->
categorise -> flag self-transfers -> flag outliers -> hash each row for de-duplication.
"""
import hashlib
import io
import re
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

from categorize import FIXED_CATEGORIES, categorize
from errors import StatementError
from money import to_paise

DATE_FORMATS = ("%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%d-%m-%y", "%Y-%m-%d", "%d-%b-%Y", "%d %b %Y")
TRANSFER_WINDOW_DAYS = 2
OUTLIER_MIN_PAISE = 300_000  # never flag a single spend below Rs 3,000 as an outlier
OUTLIER_IQR_MULT = 3.0  # Tukey's "far out" fence
MAX_ROWS = 20_000


def _norm(col: str) -> str:
    return re.sub(r"[^a-z]", "", str(col).lower())


def _find(cols: dict, *prefixes):
    for norm, original in cols.items():
        if any(norm.startswith(p) for p in prefixes):
            return original
    return None


def _parse_row_date(s: str):
    s = str(s).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise StatementError("Could not decode file; expected a CSV export")


def _row_hash(iso_date: str, desc: str, amount: int, seq: int) -> str:
    # `seq` distinguishes genuinely identical rows on the same day (two Rs 50 chai payments)
    return hashlib.sha256(f"{iso_date}|{desc}|{amount}|{seq}".encode()).hexdigest()


def flag_transfers(rows):
    """Mark a debit and a credit of the same amount within TRANSFER_WINDOW_DAYS as self-transfers.

    Fixed flows (income, rent, EMI) are never paired, so a Rs 8,000 rent payment can't be
    matched against an Rs 8,000 allowance.
    """
    credits_by_amount = defaultdict(list)
    for r in rows:
        if r["amount_paise"] > 0 and r["category"] not in FIXED_CATEGORIES:
            credits_by_amount[r["amount_paise"]].append(r)
    for d in sorted((r for r in rows if r["amount_paise"] < 0 and r["category"] not in FIXED_CATEGORIES),
                    key=lambda r: r["txn_date"]):
        for c in credits_by_amount.get(-d["amount_paise"], []):
            if c["is_transfer"]:
                continue
            if abs((c["txn_date"] - d["txn_date"]).days) <= TRANSFER_WINDOW_DAYS:
                d["is_transfer"] = c["is_transfer"] = True
                break


def flag_outliers(rows):
    """Flag single spends far above the user's normal range (Q3 + 3*IQR, and at least Rs 3,000).

    Deliberately works on individual transactions, not daily totals: a 'lumpy' day is exactly
    what the bootstrap should keep, whereas a one-off laptop purchase should not be resampled.
    """
    spends = [r for r in rows
              if r["amount_paise"] < 0 and not r["is_transfer"] and r["category"] not in FIXED_CATEGORIES]
    if len(spends) < 8:
        return
    amounts = np.array([-r["amount_paise"] for r in spends])
    q1, q3 = np.percentile(amounts, [25, 75])
    fence = max(q3 + OUTLIER_IQR_MULT * (q3 - q1), OUTLIER_MIN_PAISE)
    for r in spends:
        if -r["amount_paise"] > fence:
            r["is_outlier"] = True


def parse_statement(raw: bytes) -> dict:
    if not raw or not raw.strip():
        raise StatementError("The file is empty")
    try:
        df = pd.read_csv(io.StringIO(_decode(raw)), dtype=str, keep_default_na=False,
                         skipinitialspace=True, on_bad_lines="skip")
    except Exception:
        raise StatementError("Could not read the file as CSV")
    if len(df) > MAX_ROWS:
        raise StatementError(f"Too many rows (max {MAX_ROWS})")

    cols = {_norm(c): c for c in df.columns}
    date_col = _find(cols, "date")
    desc_col = _find(cols, "narration", "description", "details", "particulars", "remarks")
    wd_col = _find(cols, "withdrawal", "debit")
    dep_col = _find(cols, "deposit", "credit")
    amt_col = _find(cols, "amount")
    bal_col = _find(cols, "closingbalance", "balance")

    if not date_col or not desc_col or not ((wd_col and dep_col) or amt_col):
        raise StatementError(
            "Unrecognised CSV format. Expected HDFC columns (Date, Narration, Withdrawal Amt., Deposit Amt., "
            f"Closing Balance) or Date, Description, Amount. Found: {', '.join(map(str, df.columns))}"
        )

    rows, skipped, seen = [], 0, defaultdict(int)
    for rec in df.to_dict("records"):
        d = _parse_row_date(rec.get(date_col, ""))
        if d is None:
            skipped += 1  # footer lines, blank rows, "*** end of statement ***"
            continue
        try:
            if wd_col and dep_col:
                amount = to_paise(rec.get(dep_col)) - to_paise(rec.get(wd_col))
            else:
                amount = to_paise(rec.get(amt_col))
            balance = to_paise(rec.get(bal_col)) if bal_col and str(rec.get(bal_col, "")).strip() else None
        except ValueError:
            skipped += 1
            continue
        if amount == 0:
            skipped += 1
            continue
        desc = " ".join(str(rec.get(desc_col, "")).split())
        iso = d.isoformat()
        key = (iso, desc, amount)
        seen[key] += 1
        rows.append({
            "txn_date": d,
            "description": desc,
            "amount_paise": amount,
            "balance_paise": balance,
            "category": categorize(desc),
            "is_transfer": False,
            "is_outlier": False,
            "row_hash": _row_hash(iso, desc, amount, seen[key]),
        })

    if not rows:
        raise StatementError("No valid transactions found in the file")

    flag_transfers(rows)
    flag_outliers(rows)

    # Closing balance = balance after the chronologically last row (statements can be newest-first)
    ordered = rows if rows[0]["txn_date"] <= rows[-1]["txn_date"] else list(reversed(rows))
    closing = next((r for r in reversed(ordered) if r["balance_paise"] is not None), None)

    warnings = []
    if skipped:
        warnings.append(f"{skipped} row(s) were skipped (blank, zero-value, or unreadable).")
    if closing is None:
        warnings.append("No balance column found; you will need to enter your current balance manually.")

    out_rows = [{**r, "txn_date": r["txn_date"].isoformat()} for r in rows]
    return {
        "rows": out_rows,
        "row_count": len(out_rows),
        "skipped_rows": skipped,
        "date_from": min(r["txn_date"] for r in rows).isoformat(),
        "date_to": max(r["txn_date"] for r in rows).isoformat(),
        "closing_balance_paise": closing["balance_paise"] if closing else None,
        "closing_balance_date": closing["txn_date"].isoformat() if closing else None,
        "warnings": warnings,
    }
