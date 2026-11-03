"""Password hashing and JWT helpers."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

ACCESS = "access"
REFRESH = "refresh"
PATIENT_ACCESS = "patient_access"  # never accepted by staff endpoints


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; the schema limits passwords to 72 chars.
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# A constant hash used to keep login timing similar when the username does not exist.
DUMMY_HASH = hash_password(uuid.uuid4().hex)


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, role: str) -> tuple[str, int]:
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    now = datetime.now(UTC)
    token = _encode(
        {
            "sub": str(user_id),
            "role": role,
            "type": ACCESS,
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
        }
    )
    return token, expires_in


def create_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    now = datetime.now(UTC)
    jti = uuid.uuid4().hex
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    token = _encode({"sub": str(user_id), "type": REFRESH, "jti": jti, "iat": now, "exp": expires_at})
    return token, jti, expires_at


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises jwt.InvalidTokenError on any problem."""
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["exp", "sub", "type"]},
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload


def create_patient_token(account_id: int, patient_id: int) -> tuple[str, int]:
    """Access token for the patient portal. Its distinct `type` means staff endpoints
    (which require type "access") reject it."""
    expires_in = settings.PATIENT_TOKEN_EXPIRE_MINUTES * 60
    now = datetime.now(UTC)
    token = _encode(
        {
            "sub": str(account_id),
            "pid": patient_id,
            "type": PATIENT_ACCESS,
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
        }
    )
    return token, expires_in
