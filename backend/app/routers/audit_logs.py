import math
from datetime import date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.config import settings
from app.core.dependencies import AdminUser, DbSession
from app.models import AuditLog
from app.schemas.common import ORMModel, Page, UserRef

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])


class AuditLogOut(ORMModel):
    id: int
    user_id: int | None
    action: str
    entity_type: str
    entity_id: str | None
    old_values: dict | None
    new_values: dict | None
    ip_address: str | None
    created_at: datetime
    user: UserRef | None


class AuditFacets(BaseModel):
    actions: list[str]
    entity_types: list[str]


@router.get("", response_model=Page[AuditLogOut])
def list_audit_logs(
    _: AdminUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    user_id: int | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: Annotated[str | None, Query(max_length=50)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = []
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_id:
        filters.append(AuditLog.entity_id == entity_id.strip())
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min, settings.tz))
    if date_to:
        filters.append(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, settings.tz))
    total = db.scalar(select(func.count(AuditLog.id)).where(*filters)) or 0
    items = db.scalars(
        select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    return Page(items=items, total=total, page=page, page_size=page_size, pages=math.ceil(total / page_size) if total else 0)


@router.get("/facets", response_model=AuditFacets)
def facets(_: AdminUser, db: DbSession):
    return AuditFacets(
        actions=list(db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action))),
        entity_types=list(db.scalars(select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type))),
    )
