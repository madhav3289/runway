import pytest

from errors import StatementError
from parsing import parse_statement

HEADER = "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"


def csv(*lines):
    return (HEADER + "\n".join(lines) + "\n").encode()


def test_hdfc_basic_rows_and_signs():
    r = parse_statement(csv(
        '01/09/26,UPI-SWIGGY-swiggy@ybl-1,111,01/09/26,"1,234.50",,"8,765.50"',
        '02/09/26,NEFT CR-POCKET MONEY,222,02/09/26,,"13,000.00","21,765.50"',
    ))
    a, b = r["rows"]
    assert a["amount_paise"] == -123450 and a["category"] == "food_delivery"
    assert b["amount_paise"] == 1300000 and b["category"] == "income"
    assert a["txn_date"] == "2026-09-01"
    assert r["closing_balance_paise"] == 2176550
    assert r["closing_balance_date"] == "2026-09-02"


def test_identical_rows_get_distinct_hashes_but_reupload_is_stable():
    lines = ["01/09/26,UPI-CHAI POINT-a@b-1,1,01/09/26,50.00,,950.00",
             "01/09/26,UPI-CHAI POINT-a@b-1,2,01/09/26,50.00,,900.00"]
    h1 = [x["row_hash"] for x in parse_statement(csv(*lines))["rows"]]
    h2 = [x["row_hash"] for x in parse_statement(csv(*lines))["rows"]]
    assert len(set(h1)) == 2  # two real Rs 50 payments are not duplicates of each other
    assert h1 == h2           # re-uploading the same file yields identical hashes


def test_newest_first_statement_closing_balance():
    r = parse_statement(csv(
        "03/09/26,UPI-A-a@b-1,1,03/09/26,10.00,,700.00",
        "02/09/26,UPI-B-a@b-1,1,02/09/26,10.00,,710.00",
        "01/09/26,UPI-C-a@b-1,1,01/09/26,10.00,,720.00",
    ))
    assert r["closing_balance_paise"] == 70000 and r["closing_balance_date"] == "2026-09-03"


def test_self_transfer_pair_is_flagged_but_fixed_flows_are_not_paired():
    r = parse_statement(csv(
        "01/09/26,UPI-ME-me@b-SELF,1,01/09/26,\"3,000.00\",,\"7,000.00\"",
        "02/09/26,UPI-ME-me@b-SELF,2,02/09/26,,\"3,000.00\",\"10,000.00\"",
        "03/09/26,UPI-LANDLORD-x@b-RENT,3,03/09/26,\"3,000.00\",,\"7,000.00\"",
    ))
    flags = [x["is_transfer"] for x in r["rows"]]
    assert flags == [True, True, False]


def test_outlier_flags_only_the_one_off_purchase():
    normal = [f"{d:02d}/09/26,UPI-CHAI-a@b-1,1,{d:02d}/09/26,{50 + d}.00,," for d in range(1, 21)]
    big = ["21/09/26,POS FLIPKART LAPTOP,9,21/09/26,\"60,000.00\",,"]
    r = parse_statement(csv(*normal, *big))
    flagged = [x["description"] for x in r["rows"] if x["is_outlier"]]
    assert flagged == ["POS FLIPKART LAPTOP"]


def test_footer_and_blank_rows_are_skipped_not_fatal():
    r = parse_statement(csv(
        "01/09/26,UPI-A-a@b-1,1,01/09/26,10.00,,990.00",
        ",,,,,,",
        "*** END OF STATEMENT ***,,,,,,",
    ))
    assert r["row_count"] == 1 and r["skipped_rows"] == 2 and r["warnings"]


def test_generic_signed_amount_format():
    raw = b"Date,Description,Amount\n2026-09-01,UPI-SWIGGY-x@y-1,-250.00\n2026-09-02,Salary,15000\n"
    r = parse_statement(raw)
    assert [x["amount_paise"] for x in r["rows"]] == [-25000, 1500000]
    assert r["closing_balance_paise"] is None and r["warnings"]


@pytest.mark.parametrize("raw", [b"", b"   \n", b"foo,bar\n1,2\n", HEADER.encode()])
def test_bad_files_raise_readable_errors(raw):
    with pytest.raises(StatementError):
        parse_statement(raw)
