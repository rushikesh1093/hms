"""Shared FastAPI dependencies: database session, current user and role checks."""

from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import ACCESS, decode_token
from app.models import User
from app.models.enums import Role

bearer_scheme = HTTPBearer(auto_error=False, description="Access token from POST /api/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError("Authentication required")
    try:
        payload = decode_token(credentials.credentials, ACCESS)
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise AuthenticationError("Invalid or expired access token", code="token_invalid") from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User account is inactive or no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[..., User]:
    allowed = {r.value for r in roles}

    def checker(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise PermissionDeniedError("You do not have permission to perform this action")
        return user

    return checker


AdminUser = Annotated[User, Depends(require_roles(Role.ADMIN))]
ClinicalUser = Annotated[User, Depends(require_roles(Role.ADMIN, Role.DOCTOR))]
RegistrationUser = Annotated[User, Depends(require_roles(Role.ADMIN, Role.RECEPTIONIST))]
StaffUser = Annotated[User, Depends(require_roles(Role.ADMIN, Role.DOCTOR, Role.RECEPTIONIST))]


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None
