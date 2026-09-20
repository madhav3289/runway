import pytest

from categorize import categorize
from money import to_paise


@pytest.mark.parametrize("raw,expected", [
    ("1,234.50", 123450), ("0.10", 10), ("100", 10000), ("", 0), (None, 0), ("  ", 0),
    ("0.005", 1),  # half-up rounding, no float error
    ("19.99", 1999),  # float(19.99)*100 would give 1998.9999...
])
def test_to_paise(raw, expected):
    assert to_paise(raw) == expected


def test_to_paise_rejects_garbage():
    with pytest.raises(ValueError):
        to_paise("abc")


@pytest.mark.parametrize("desc,cat", [
    ("UPI-SWIGGY-swiggy@ybl-YESB0YBLUPI-123-UPI", "food_delivery"),
    ("UPI-ZOMATO-zomato@ybl-1", "food_delivery"),
    ("UPI-UBER INDIA-uber@paytm-1", "transport"),
    ("POS 4375XXXX SPOTIFY INDIA MUMBAI", "subscriptions"),
    ("POS AMAZON PRIME VIDEO", "subscriptions"),   # must beat the generic AMAZON rule
    ("POS AMAZON SELLER SERVICES", "shopping"),
    ("NEFT CR-SBIN000-RAMESH GUPTA-POCKET MONEY", "income"),
    ("UPI-LANDLORD SHARMA-9876@ybl-RENT", "rent"),      # must beat the catch-all UPI rule
    ("ATM WDL-ATM S1 MATHURA", "cash"),
    ("REFUND AMAZON PAY INDIA", "refund"),
    ("UPI-CHAI POINT-shop@okicici-1", "upi_other"),
    ("SOMETHING RANDOM", "uncategorised"),
    ("", "uncategorised"),
])
def test_categorize(desc, cat):
    assert categorize(desc) == cat
