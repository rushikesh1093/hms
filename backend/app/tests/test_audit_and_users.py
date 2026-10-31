import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.tests.conftest import PASSWORD


def test_audit_logs_listing_and_filters(client, auth, patient):
    r = client.get("/api/audit-logs", params={"entity_type": "patient", "action": "create"}, headers=auth["admin"])
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1 and items[0]["entity_id"] == patient["patient_code"]
    assert items[0]["user"]["name"] == "Front Desk"
    facets = client.get("/api/audit-logs/facets", headers=auth["admin"]).json()
    assert "login" in facets["actions"]


def test_audit_log_is_append_only(db, client, auth, patient):
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE audit_logs SET action = 'tampered'"))
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM audit_logs"))
    db.rollback()


def test_audit_never_stores_password_hash(client, auth, db):
    client.post(
        "/api/users",
        json={"username": "nurse1", "name": "Nurse One", "email": "n1@x.com", "password": "Strong123", "role": "receptionist"},
        headers=auth["admin"],
    )
    row = db.execute(text("SELECT new_values::text FROM audit_logs WHERE entity_type='user' AND action='create'")).scalar_one()
    assert "password" not in row


def test_admin_user_management(client, auth):
    r = client.post(
        "/api/users",
        json={"username": "Dr.New", "name": "Dr New", "email": "New@X.com", "password": "Strong123", "role": "doctor"},
        headers=auth["admin"],
    )
    assert r.status_code == 201
    uid = r.json()["id"]
    assert r.json()["username"] == "dr.new" and r.json()["email"] == "new@x.com"
    dup = client.post(
        "/api/users",
        json={"username": "dr.new", "name": "Dup", "email": "o@x.com", "password": "Strong123", "role": "doctor"},
        headers=auth["admin"],
    )
    assert dup.status_code == 409
    assert client.post(f"/api/users/{uid}/reset-password", json={"new_password": "Another123"}, headers=auth["admin"]).status_code == 200
    assert client.post("/api/auth/login", json={"username": "dr.new", "password": "Another123"}).status_code == 200
    doctors = client.get("/api/users/doctors", headers=auth["reception"]).json()
    assert "Dr New" in [d["name"] for d in doctors]


def test_admin_cannot_deactivate_self(client, auth, users):
    r = client.put(f"/api/users/{users['admin'].id}", json={"is_active": False}, headers=auth["admin"])
    assert r.status_code == 422


def test_login_events_are_audited(client, users, db):
    client.post("/api/auth/login", json={"username": "doctor", "password": "wrong"})
    client.post("/api/auth/login", json={"username": "doctor", "password": PASSWORD})
    actions = [a for (a,) in db.execute(text("SELECT action FROM audit_logs ORDER BY id")).all()]
    assert actions == ["login_failed", "login"]


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "database": "ok"}


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"
