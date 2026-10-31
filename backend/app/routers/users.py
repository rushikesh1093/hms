"""User management (admin only) plus a staff-visible list of doctors."""

import math
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func, or_, select, update

from app.core.dependencies import AdminUser, DbSession, StaffUser, client_ip
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.models import RefreshToken, User
from app.models.enums import Role
from app.schemas.auth import PasswordReset, UserCreate, UserOut, UserUpdate
from app.schemas.common import Message, Page, UserRef
from app.services import audit_service
from app.services.patient_service import escape_like

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/doctors", response_model=list[UserRef])
def list_doctors(_: StaffUser, db: DbSession, include_inactive: bool = False):
    stmt = select(User).where(User.role == Role.DOCTOR)
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    return db.scalars(stmt.order_by(User.name)).all()


@router.get("", response_model=Page[UserOut])
def list_users(
    _: AdminUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: str | None = None,
    role: Role | None = None,
    is_active: bool | None = None,
):
    filters = []
    if q:
        like = f"%{escape_like(q.strip())}%"
        filters.append(or_(User.name.ilike(like, escape="\\"), User.username.ilike(like, escape="\\"), User.email.ilike(like, escape="\\")))
    if role:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))
    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    items = db.scalars(select(User).where(*filters).order_by(User.name).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=math.ceil(total / page_size) if total else 0)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, request: Request, admin: AdminUser, db: DbSession):
    email = data.email.lower()
    if db.scalar(select(User).where(or_(User.username == data.username, User.email == email))):
        raise ConflictError("A user with this username or email already exists")
    user = User(
        username=data.username,
        name=data.name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        designation=data.designation,
        registration_number=data.registration_number,
    )
    db.add(user)
    db.flush()
    audit_service.record(db, user_id=admin.id, action="create", entity_type="user", entity_id=user.id, new_values=audit_service.snapshot(user), ip_address=client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, _: AdminUser, db: DbSession):
    user = db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, request: Request, admin: AdminUser, db: DbSession):
    user = db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    changes = data.model_dump(exclude_unset=True)
    if user.id == admin.id and (changes.get("is_active") is False or changes.get("role") not in (None, Role.ADMIN)):
        raise ValidationError("You cannot deactivate or demote your own account")
    if changes.get("email"):
        changes["email"] = changes["email"].lower()
        if db.scalar(select(User).where(User.email == changes["email"], User.id != user.id)):
            raise ConflictError("Email is already used by another account")
    before = audit_service.snapshot(user)
    for k, v in changes.items():
        if v is None and k in {"name", "email", "role", "is_active"}:
            continue
        setattr(user, k, v)
    if changes.get("is_active") is False:
        db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
    db.flush()
    old, new = audit_service.diff(before, audit_service.snapshot(user))
    if new:
        audit_service.record(db, user_id=admin.id, action="update", entity_type="user", entity_id=user.id, old_values=old, new_values=new, ip_address=client_ip(request))
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=Message)
def reset_password(user_id: int, data: PasswordReset, request: Request, admin: AdminUser, db: DbSession):
    user = db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    user.password_hash = hash_password(data.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
    audit_service.record(db, user_id=admin.id, action="reset_password", entity_type="user", entity_id=user.id, ip_address=client_ip(request))
    db.commit()
    return Message(message="Password reset")
