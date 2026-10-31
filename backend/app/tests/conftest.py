"""Test fixtures. Tests run ONLY against the isolated database in TEST_DATABASE_URL, whose
name must contain "test". The schema is built with the real Alembic migrations and every
table is truncated between tests."""

import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[2]
_env = {**dotenv_values(BACKEND_DIR / ".env"), **os.environ}
TEST_DB_URL = _env.get("TEST_DATABASE_URL")
if not TEST_DB_URL:
    raise RuntimeError("TEST_DATABASE_URL must be set to run the test suite")
if "test" not in TEST_DB_URL.rsplit("/", 1)[-1]:
    raise RuntimeError("Refusing to run tests: TEST_DATABASE_URL database name must contain 'test'")

# Point the application at the test database BEFORE it is imported.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["ENVIRONMENT"] = "test"
os.environ["TIMEZONE"] = _env.get("TIMEZONE") or "Asia/Kolkata"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "Test@12345"
TABLES = "audit_logs, followups, eye_checkups, patients, refresh_tokens, users"


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["sqlalchemy_url"] = TEST_DB_URL
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_db():
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
        conn.execute(text("ALTER SEQUENCE patient_code_seq RESTART WITH 1"))
        conn.execute(text("ALTER SEQUENCE checkup_code_seq RESTART WITH 1"))
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _make_user(username: str, role: str, name: str, **extra) -> User:
    with SessionLocal() as s:
        user = User(
            username=username,
            name=name,
            email=f"{username}@test.local",
            role=role,
            password_hash=hash_password(PASSWORD),
            **extra,
        )
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


@pytest.fixture
def users():
    return {
        "admin": _make_user("admin", "admin", "Admin User"),
        "doctor": _make_user("doctor", "doctor", "Dr. Test Doctor", designation="Ophthalmologist", registration_number="REG-1"),
        "doctor2": _make_user("doctor2", "doctor", "Dr. Second Doctor"),
        "reception": _make_user("reception", "receptionist", "Front Desk"),
    }


def login(client: TestClient, username: str, password: str = PASSWORD) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client, users):
    """auth['doctor'] -> Authorization headers for that role."""
    class _Auth(dict):
        def __missing__(self, key):
            self[key] = login(client, key)
            return self[key]

    return _Auth()


def patient_payload(**overrides) -> dict:
    data = {
        "full_name": "Ramesh Kumar",
        "date_of_birth": "1980-05-15",
        "gender": "male",
        "mobile_number": "9876543210",
        "address": "House 12, Main Road",
        "village": "Shivaji Nagar",
        "district": "Pune",
        "state": "Maharashtra",
        "allergies": "Penicillin",
    }
    data.update(overrides)
    return data


def checkup_payload(patient_id: int, **overrides) -> dict:
    data = {
        "patient_id": patient_id,
        "chief_complaints": "Blurred distance vision",
        "symptom_duration": "2 months",
        "right_eye_unaided_va": "6/18",
        "right_eye_corrected_va": "6/6",
        "right_eye_sphere": -1.25,
        "right_eye_cylinder": -0.5,
        "right_eye_axis": 90,
        "right_eye_iop": 15,
        "left_eye_unaided_va": "6/12",
        "left_eye_corrected_va": "6/6",
        "left_eye_sphere": -1.0,
        "diagnosis": "Myopia with astigmatism",
        "prescription": "Spectacles as per refraction",
    }
    data.update(overrides)
    return data


@pytest.fixture
def patient(client, auth):
    """A patient registered 90 days ago (so back-dated examinations are valid)."""
    reg = (date.today() - timedelta(days=90)).isoformat()
    r = client.post("/api/patients", json=patient_payload(registration_date=reg), headers=auth["reception"])
    assert r.status_code == 201, r.text
    return r.json()
