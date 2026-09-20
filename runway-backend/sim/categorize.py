"""Rule-based categorisation. First matching rule wins, so order matters.

FIXED_CATEGORIES are money flows that happen on known dates (rent, allowance, EMIs).
They are NOT part of the bootstrapped 'variable spend' history; the user models them
as scheduled items instead.
"""
import re

FIXED_CATEGORIES = frozenset({"income", "rent", "emi"})

RULES = [
    (r"SALARY|STIPEND|POCKET ?MONEY|ALLOWANCE|SCHOLARSHIP", "income"),
    (r"\bRENT\b|LANDLORD|\bPG\b|HOSTEL", "rent"),
    (r"\bEMI\b|LOAN", "emi"),
    (r"REFUND|REVERSAL|CASHBACK", "refund"),
    (r"SWIGGY|ZOMATO|DOMINO|EATSURE|MCDONALD|KFC", "food_delivery"),
    (r"BLINKIT|ZEPTO|BIGBASKET|INSTAMART|DMART", "groceries"),
    (r"UBER|\bOLA\b|RAPIDO|IRCTC|REDBUS|FASTAG|METRO", "transport"),
    (r"NETFLIX|SPOTIFY|HOTSTAR|AMAZON ?PRIME|YOUTUBE ?PREMIUM|GOOGLE ?ONE|OPENAI|CHATGPT", "subscriptions"),
    (r"AMAZON|FLIPKART|MYNTRA|AJIO|MEESHO|NYKAA", "shopping"),
    (r"BOOKMYSHOW|\bPVR\b|\bINOX\b|STEAM", "entertainment"),
    (r"JIO|AIRTEL|VODAFONE|\bVI\b|RECHARGE|ELECTRICITY|BROADBAND", "bills"),
    (r"\bATM\b|NWD|CASH ?WDL", "cash"),
    (r"^UPI-", "upi_other"),
]
_COMPILED = [(re.compile(p), c) for p, c in RULES]

STANDARD_CATEGORIES = sorted({c for _, c in RULES} | {"uncategorised"})


def categorize(description: str) -> str:
    text = (description or "").upper()
    for pattern, category in _COMPILED:
        if pattern.search(text):
            return category
    return "uncategorised"
