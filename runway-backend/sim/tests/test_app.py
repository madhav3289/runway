import io

import pytest

from app import create_app

HDFC = (b"Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
        b"01/09/26,UPI-SWIGGY-a@b-1,1,01/09/26,100.00,,900.00\n")


@pytest.fixture
def client():
    return create_app().test_client()


def test_health(client):
    assert client.get("/health").get_json() == {"status": "ok"}


def test_parse_endpoint(client):
    r = client.post("/parse", data={"file": (io.BytesIO(HDFC), "s.csv")}, content_type="multipart/form-data")
    assert r.status_code == 200 and r.get_json()["rows"][0]["category"] == "food_delivery"


def test_parse_without_file_is_400(client):
    assert client.post("/parse").status_code == 400


def test_bad_csv_is_422_with_message(client):
    r = client.post("/parse", data={"file": (io.BytesIO(b"a,b\n1,2\n"), "s.csv")}, content_type="multipart/form-data")
    assert r.status_code == 422 and "Unrecognised" in r.get_json()["error"]


def test_simulate_bad_payload_is_422(client):
    assert client.post("/simulate", json={}).status_code == 422


def test_api_key_enforced_when_configured(monkeypatch, client):
    monkeypatch.setenv("SIM_API_KEY", "s3cret")
    assert client.get("/health").status_code == 200  # health stays open for uptime checks
    assert client.post("/simulate", json={}).status_code == 401
    assert client.post("/simulate", json={}, headers={"X-Sim-Key": "wrong"}).status_code == 401
    assert client.post("/simulate", json={}, headers={"X-Sim-Key": "s3cret"}).status_code == 422
