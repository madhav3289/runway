"""Money helpers. All amounts inside Runway are integer paise (1 rupee = 100 paise).

Floats are never used for money: strings are parsed with Decimal.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def to_paise(value) -> int:
    """'1,234.50' -> 123450. Empty / None -> 0."""
    if value is None:
        return 0
    s = str(value).strip().replace(",", "")
    if s in ("", "-"):
        return 0
    try:
        d = Decimal(s)
    except InvalidOperation:
        raise ValueError(f"Invalid amount: {value!r}")
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
