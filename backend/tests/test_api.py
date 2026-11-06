import random

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def client():
    settings = Settings(
        database_url="sqlite://",
        jwt_secret="test-secret-at-least-32-bytes-long!!",
        jwt_ttl_minutes=5,
        cors_origins=[],
    )
    with TestClient(create_app(settings)) as c:
        yield c


def auth(client, email="analyst@example.com"):
    r = client.post("/api/auth/register", json={"email": email, "password": "correct-horse"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def amounts(seed=1, n=400):
    rng = random.Random(seed)
    return [round(10 ** rng.uniform(1, 6), 2) for _ in range(n)]


def test_auth_flow_and_protection(client):
    assert client.get("/api/analyses").status_code == 401
    headers = auth(client)
    assert client.get("/api/auth/me", headers=headers).json()["email"] == "analyst@example.com"
    assert client.post("/api/auth/register", json={"email": "ANALYST@example.com", "password": "x" * 8}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "analyst@example.com", "password": "wrong-pass"}).status_code == 401
    assert client.get("/api/analyses", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_validation_errors(client):
    h = auth(client)
    both = {"title": "x", "params": {"kind": "benford", "values": [1.0], "text": "1"}}
    assert client.post("/api/analyses", json=both, headers=h).status_code == 422
    too_few = {"title": "x", "params": {"kind": "benford", "values": [1.0, 2.0]}}
    r = client.post("/api/analyses", json=too_few, headers=h)
    assert r.status_code == 422 and "At least 50" in r.json()["detail"]


def test_versioning_is_append_only_and_idempotent(client):
    h = auth(client)
    body = {"title": "FY24 ledger", "params": {"kind": "benford", "values": amounts(1)}}
    created = client.post("/api/analyses", json=body, headers=h)
    assert created.status_code == 201
    aid = created.json()["id"]
    assert created.json()["latest"]["version"] == 1

    again = client.post(f"/api/analyses/{aid}/versions", json={"params": body["params"]}, headers=h)
    assert again.status_code == 200 and again.json()["version"] == 1  # identical input, no new row

    new = client.post(f"/api/analyses/{aid}/versions", json={"params": {"kind": "benford", "values": amounts(2)}}, headers=h)
    assert new.status_code == 201 and new.json()["version"] == 2

    wrong_kind = {"params": {"kind": "mdna_diff", "before": "a", "after": "b"}}
    assert client.post(f"/api/analyses/{aid}/versions", json=wrong_kind, headers=h).status_code == 422

    detail = client.get(f"/api/analyses/{aid}", headers=h).json()
    assert [v["version"] for v in detail["versions"]] == [1, 2]
    v1 = client.get(f"/api/analyses/{aid}/versions/1", headers=h).json()
    assert v1["result"]["n"] == 400 and v1["method_version"].startswith("benford")


def test_history_is_scoped_per_user_and_exportable(client):
    alice, bob = auth(client, "alice@example.com"), auth(client, "bob@example.com")
    mdna = {"title": "10-K MD&A", "params": {"kind": "mdna_diff", "before": "A.\n\nB.", "after": "A.\n\nC."}}
    aid = client.post("/api/analyses", json=mdna, headers=alice).json()["id"]
    client.post("/api/analyses", json={"title": "Ledger", "params": {"kind": "anomalies", "values": amounts(3)}}, headers=alice)

    assert client.get(f"/api/analyses/{aid}", headers=bob).status_code == 404
    assert client.get("/api/analyses", headers=bob).json()["total"] == 0

    page = client.get("/api/analyses?kind=mdna_diff", headers=alice).json()
    assert page["total"] == 1 and page["items"][0]["title"] == "10-K MD&A"
    assert client.get("/api/analyses?q=ledg", headers=alice).json()["total"] == 1

    export = client.get("/api/analyses/export", headers=alice).json()
    assert len(export["analyses"]) == 2

    assert client.delete(f"/api/analyses/{aid}", headers=bob).status_code == 404
    assert client.delete(f"/api/analyses/{aid}", headers=alice).status_code == 204
    assert client.get("/api/analyses", headers=alice).json()["total"] == 1
