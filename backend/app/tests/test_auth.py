from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import update

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import RefreshToken
from app.tests.conftest import PASSWORD, login


def test_login_success_returns_token_and_sets_refresh_cookie(client, users):
    r = client.post("/api/auth/login", json={"username": "doctor", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "doctor"
    assert "password_hash" not in body["user"]
    assert settings.REFRESH_COOKIE_NAME in r.cookies


def test_login_is_case_insensitive_on_username(client, users):
    r = client.post("/api/auth/login", json={"username": "DOCTOR", "password": PASSWORD})
    assert r.status_code == 200


def test_login_wrong_password(client, users):
    r = client.post("/api/auth/login", json={"username": "doctor", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_login_unknown_user_same_message(client, users):
    r = client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid username or password"


def test_account_locks_after_repeated_failures(client, users):
    for _ in range(settings.MAX_FAILED_LOGINS):
        client.post("/api/auth/login", json={"username": "reception", "password": "bad"})
    r = client.post("/api/auth/login", json={"username": "reception", "password": PASSWORD})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "account_locked"


def test_inactive_user_cannot_login(client, users, auth):
    r = client.put(f"/api/users/{users['reception'].id}", json={"is_active": False}, headers=auth["admin"])
    assert r.status_code == 200
    r = client.post("/api/auth/login", json={"username": "reception", "password": PASSWORD})
    assert r.status_code == 401


def test_me_requires_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_returns_profile(client, auth):
    r = client.get("/api/auth/me", headers=auth["admin"])
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_expired_access_token_rejected(client, users):
    token = jwt.encode(
        {"sub": str(users["admin"].id), "role": "admin", "type": "access", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "token_invalid"


def test_token_signed_with_other_key_rejected(client, users):
    token = jwt.encode(
        {"sub": str(users["admin"].id), "role": "admin", "type": "access", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        "x" * 64,
        algorithm="HS256",
    )
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_refresh_rotates_token_and_detects_reuse(client, users):
    r = client.post("/api/auth/login", json={"username": "doctor", "password": PASSWORD})
    old_cookie = r.cookies[settings.REFRESH_COOKIE_NAME]

    r2 = client.post("/api/auth/refresh")
    assert r2.status_code == 200
    assert r2.json()["access_token"]
    new_cookie = r2.cookies[settings.REFRESH_COOKIE_NAME]
    assert new_cookie != old_cookie

    # Replay within the grace window (concurrent tabs) is rejected without revoking sessions.
    client.cookies.set(settings.REFRESH_COOKIE_NAME, old_cookie, path="/api/auth")
    r3 = client.post("/api/auth/refresh")
    assert r3.status_code == 401 and r3.json()["error"]["code"] == "refresh_race"

    # Replay after the grace window is treated as theft: all sessions are revoked.
    with SessionLocal() as s:
        s.execute(update(RefreshToken).where(RefreshToken.revoked_at.is_not(None)).values(revoked_at=datetime.now(UTC) - timedelta(minutes=5)))
        s.commit()
    r3 = client.post("/api/auth/refresh")
    assert r3.status_code == 401 and r3.json()["error"]["code"] == "refresh_invalid"
    client.cookies.set(settings.REFRESH_COOKIE_NAME, new_cookie, path="/api/auth")
    r4 = client.post("/api/auth/refresh")
    assert r4.status_code == 401


def test_refresh_without_cookie(client):
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401


def test_logout_revokes_refresh_token(client, users):
    client.post("/api/auth/login", json={"username": "doctor", "password": PASSWORD})
    cookie = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.set(settings.REFRESH_COOKIE_NAME, cookie, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401


def test_change_password(client, users):
    headers = login(client, "doctor")
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "NewPass123"},
        headers=headers,
    )
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"username": "doctor", "password": "NewPass123"}).status_code == 200


def test_weak_password_rejected_on_user_create(client, auth):
    r = client.post(
        "/api/users",
        json={"username": "newdoc", "name": "New Doc", "email": "n@x.com", "password": "short", "role": "doctor"},
        headers=auth["admin"],
    )
    assert r.status_code == 422
