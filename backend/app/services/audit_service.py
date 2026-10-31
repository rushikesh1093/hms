"""Audit trail helpers. Entries are added to the caller's transaction so the audit
record and the change it describes commit (or roll back) together."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models import AuditLog

# Never written to the audit log.
SENSITIVE_FIELDS = {"password_hash", "password", "failed_login_attempts", "locked_until"}


def _jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def snapshot(obj: Any) -> dict[str, Any]:
    """Column values of an ORM object, JSON-serialisable, without sensitive fields."""
    mapper = inspect(obj).mapper
    return {
        c.key: _jsonable(getattr(obj, c.key))
        for c in mapper.column_attrs
        if c.key not in SENSITIVE_FIELDS
    }


def diff(old: dict[str, Any], new: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    ignore = {"updated_at", "updated_by"}
    changed = [k for k in new if k not in ignore and old.get(k) != new.get(k)]
    return {k: old.get(k) for k in changed}, {k: new.get(k) for k in changed}


def record(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    ip_address: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
        )
    )
