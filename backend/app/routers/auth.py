"""Login, token refresh (rotating, httpOnly cookie), logout and profile endpoints.

The short-lived access token is returned in the response body and kept in memory by the
frontend. The refresh token is set as an httpOnly, SameSite=Strict cookie scoped to
/api/auth so JavaScript can never read it.
"""

from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select, update

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession, client_ip
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    DUMMY_HASH,
    REFRESH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import LoginRequest, PasswordChange, ProfileUpdate, TokenResponse, UserOut
from app.schemas.common import Message
from app.services import audit_service

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

COOKIE_PATH = "/api/auth"
REFRESH_GRACE_SECONDS = 10


def _set_refresh_cookie(response: Response, token: str, expires_at: datetime) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path=COOKIE_PATH,
        expires=expires_at,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=COOKIE_PATH, samesite="strict", httponly=True)


def _issue_tokens(db: DbSession, user: User, response: Response) -> TokenResponse:
    access, expires_in = create_access_token(user.id, user.role)
    refresh, jti, expires_at = create_refresh_token(user.id)
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at))
    db.commit()
    _set_refresh_cookie(response, refresh, expires_at)
    return TokenResponse(access_token=access, expires_in=expires_in, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db: DbSession):
    ip = client_ip(request)
    user = db.scalar(select(User).where(User.username == data.username.strip().lower()))
    now = datetime.now(UTC)

    if user is None:
        verify_password(data.password, DUMMY_HASH)  # equalise timing
        audit_service.record(db, user_id=None, action="login_failed", entity_type="auth", entity_id=data.username[:50], ip_address=ip)
        db.commit()
        raise AuthenticationError("Invalid username or password")

    if user.locked_until and user.locked_until > now:
        raise AuthenticationError("Account temporarily locked after repeated failed logins. Try again later.", code="account_locked")

    if not verify_password(data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_attempts = 0
        audit_service.record(db, user_id=user.id, action="login_failed", entity_type="auth", entity_id=user.id, ip_address=ip)
        db.commit()
        raise AuthenticationError("Invalid username or password")

    if not user.is_active:
        raise AuthenticationError("This account has been deactivated", code="account_inactive")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    audit_service.record(db, user_id=user.id, action="login", entity_type="auth", entity_id=user.id, ip_address=ip)
    return _issue_tokens(db, user, response)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: DbSession):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise AuthenticationError("No refresh token", code="refresh_missing")
    try:
        payload = decode_token(token, REFRESH)
        jti = payload["jti"]
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        _clear_refresh_cookie(response)
        raise AuthenticationError("Invalid refresh token", code="refresh_invalid") from None

    stored = db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    now = datetime.now(UTC)
    if stored is None or stored.user_id != user_id:
        raise AuthenticationError("Invalid refresh token", code="refresh_invalid")
    if stored.revoked_at is not None and (now - stored.revoked_at).total_seconds() < REFRESH_GRACE_SECONDS:
        # Two tabs refreshed at the same moment; the other one already rotated the cookie.
        raise AuthenticationError("Token already rotated; retry", code="refresh_race")
    if stored.revoked_at is not None:
        # Reuse of a rotated token: assume theft and revoke every session of this user.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit_service.record(db, user_id=user_id, action="refresh_token_reuse", entity_type="auth", entity_id=user_id, ip_address=client_ip(request))
        db.commit()
        raise AuthenticationError("Session expired. Please log in again.", code="refresh_invalid")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User account is inactive", code="account_inactive")

    stored.revoked_at = now  # rotate
    return _issue_tokens(db, user, response)


@router.post("/logout", response_model=Message)
def logout(request: Request, response: Response, db: DbSession):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if token:
        try:
            payload = decode_token(token, REFRESH)
            stored = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload.get("jti")))
            if stored and stored.revoked_at is None:
                stored.revoked_at = datetime.now(UTC)
                audit_service.record(db, user_id=stored.user_id, action="logout", entity_type="auth", entity_id=stored.user_id, ip_address=client_ip(request))
                db.commit()
        except jwt.InvalidTokenError:
            pass
    _clear_refresh_cookie(response)
    return Message(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.put("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, request: Request, user: CurrentUser, db: DbSession):
    changes = data.model_dump(exclude_unset=True)
    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
        clash = db.scalar(select(User).where(User.email == changes["email"], User.id != user.id))
        if clash:
            raise ConflictError("Email is already used by another account")
    before = audit_service.snapshot(user)
    for k, v in changes.items():
        if v is not None or k == "designation":
            setattr(user, k, v)
    db.flush()
    old, new = audit_service.diff(before, audit_service.snapshot(user))
    if new:
        audit_service.record(db, user_id=user.id, action="update_profile", entity_type="user", entity_id=user.id, old_values=old, new_values=new, ip_address=client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=Message, status_code=status.HTTP_200_OK)
def change_password(data: PasswordChange, request: Request, response: Response, user: CurrentUser, db: DbSession):
    if not verify_password(data.current_password, user.password_hash):
        raise AuthenticationError("Current password is incorrect", code="wrong_password")
    user.password_hash = hash_password(data.new_password)
    now = datetime.now(UTC)
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
    audit_service.record(db, user_id=user.id, action="change_password", entity_type="user", entity_id=user.id, ip_address=client_ip(request))
    db.commit()
    _clear_refresh_cookie(response)
    return Message(message="Password changed. Please log in again.")
