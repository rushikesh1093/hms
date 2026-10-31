"""Follow-up scheduling and status management.

Statuses only change through an explicit action by an authorised user. "Overdue" is a
derived view (pending and scheduled before today), never written automatically.
"""

import math
from datetime import date
from enum import StrEnum

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.models import EyeCheckup, Followup, Patient, User
from app.models.enums import FollowupStatus, Role
from app.schemas.followup import FollowupCreate, FollowupOut, FollowupUpdate
from app.services import audit_service
from app.services.patient_service import escape_like, get_patient
from app.utils.dates import now, today


class FollowupView(StrEnum):
    ALL = "all"
    PENDING = "pending"
    UPCOMING = "upcoming"
    OVERDUE = "overdue"
    DUE_TODAY = "due_today"
    COMPLETED = "completed"
    MISSED = "missed"
    CANCELLED = "cancelled"


def to_out(f: Followup, include_clinical: bool) -> FollowupOut:
    out = FollowupOut.model_validate(f)
    on = today()
    out.days_until = (f.scheduled_date - on).days
    out.is_overdue = f.status == FollowupStatus.PENDING and f.scheduled_date < on
    if not include_clinical:
        # Reception staff see appointment details only, not clinical findings.
        out.checkup = None
        out.notes = None
        out.patient.allergies = None
        out.patient.medical_history = None
    return out


def get_followup(db: Session, followup_id: int) -> Followup:
    f = db.get(Followup, followup_id)
    if f is None:
        raise NotFoundError("Follow-up not found")
    return f


def create_followup(db: Session, data: FollowupCreate, user: User, ip: str | None) -> Followup:
    patient = get_patient(db, data.patient_id)
    if data.checkup_id is not None:
        checkup = db.get(EyeCheckup, data.checkup_id)
        if checkup is None or checkup.patient_id != patient.id:
            raise ValidationError("The selected check-up does not belong to this patient")
        if data.scheduled_date < checkup.examination_date:
            raise ValidationError("Follow-up date cannot be before the related examination")
    if data.scheduled_date < today():
        raise ValidationError("Follow-up date cannot be in the past")
    f = Followup(
        patient_id=patient.id,
        checkup_id=data.checkup_id,
        scheduled_date=data.scheduled_date,
        notes=data.notes,
        status=FollowupStatus.PENDING,
        created_by=user.id,
    )
    db.add(f)
    db.flush()
    audit_service.record(
        db,
        user_id=user.id,
        action="create",
        entity_type="followup",
        entity_id=f.id,
        new_values=audit_service.snapshot(f),
        ip_address=ip,
    )
    db.commit()
    db.refresh(f)
    return f


def update_followup(db: Session, followup_id: int, data: FollowupUpdate, user: User, ip: str | None) -> Followup:
    f = get_followup(db, followup_id)
    changes = data.model_dump(exclude_unset=True)
    if user.role == Role.RECEPTIONIST:
        # Reception may reschedule appointments but not record clinical outcomes.
        if set(changes) - {"scheduled_date"}:
            raise PermissionDeniedError("Reception staff can only reschedule follow-ups")
    if not changes:
        raise ValidationError("No changes supplied")

    before = audit_service.snapshot(f)
    new_status = changes.get("status")
    if new_status and new_status != f.status:
        if new_status == FollowupStatus.COMPLETED:
            f.completed_at = now()
            f.completed_by = user.id
        else:
            f.completed_at = None
            f.completed_by = None
        f.status = new_status
    if "scheduled_date" in changes and changes["scheduled_date"] != f.scheduled_date:
        if f.status != FollowupStatus.PENDING:
            raise ValidationError("Only pending follow-ups can be rescheduled")
        if changes["scheduled_date"] < today():
            raise ValidationError("Follow-up date cannot be in the past")
        f.scheduled_date = changes["scheduled_date"]
    if "notes" in changes:
        f.notes = changes["notes"]
    f.updated_by = user.id
    db.flush()
    old, new = audit_service.diff(before, audit_service.snapshot(f))
    if new:
        audit_service.record(
            db,
            user_id=user.id,
            action="update",
            entity_type="followup",
            entity_id=f.id,
            old_values=old,
            new_values=new,
            ip_address=ip,
        )
    db.commit()
    db.refresh(f)
    return f


def list_followups(
    db: Session,
    *,
    page: int,
    page_size: int,
    view: FollowupView = FollowupView.ALL,
    q: str | None = None,
    patient_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    doctor_id: int | None = None,
) -> dict:
    on = today()
    filters = [Patient.is_active.is_(True)]
    match view:
        case FollowupView.PENDING:
            filters.append(Followup.status == FollowupStatus.PENDING)
        case FollowupView.UPCOMING:
            filters += [Followup.status == FollowupStatus.PENDING, Followup.scheduled_date >= on]
        case FollowupView.OVERDUE:
            filters += [Followup.status == FollowupStatus.PENDING, Followup.scheduled_date < on]
        case FollowupView.DUE_TODAY:
            filters += [Followup.status == FollowupStatus.PENDING, Followup.scheduled_date == on]
        case FollowupView.COMPLETED:
            filters.append(Followup.status == FollowupStatus.COMPLETED)
        case FollowupView.MISSED:
            filters.append(Followup.status == FollowupStatus.MISSED)
        case FollowupView.CANCELLED:
            filters.append(Followup.status == FollowupStatus.CANCELLED)
    if patient_id:
        filters.append(Followup.patient_id == patient_id)
    if q and q.strip():
        like = f"%{escape_like(q.strip())}%"
        filters.append(
            or_(
                Patient.patient_code.ilike(like, escape="\\"),
                Patient.full_name.ilike(like, escape="\\"),
                Patient.mobile_number.like(like, escape="\\"),
            )
        )
    if date_from:
        filters.append(Followup.scheduled_date >= date_from)
    if date_to:
        filters.append(Followup.scheduled_date <= date_to)

    base = select(Followup).join(Patient, Patient.id == Followup.patient_id)
    if doctor_id:
        base = base.join(EyeCheckup, EyeCheckup.id == Followup.checkup_id)
        filters.append(EyeCheckup.doctor_id == doctor_id)
    base = base.where(*filters)

    total = db.scalar(select(func.count()).select_from(base.with_only_columns(Followup.id).subquery())) or 0
    if view in (FollowupView.COMPLETED,):
        order = (Followup.completed_at.desc(),)
    elif view in (FollowupView.ALL, FollowupView.MISSED, FollowupView.CANCELLED):
        order = (Followup.scheduled_date.desc(),)
    else:
        order = (Followup.scheduled_date.asc(),)
    stmt = base.order_by(*order, Followup.id.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).unique())
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


def counts(db: Session) -> dict[str, int]:
    on = today()
    active = select(Followup.id).join(Patient, Patient.id == Followup.patient_id).where(Patient.is_active.is_(True))

    def c(*conds) -> int:
        return db.scalar(select(func.count()).select_from(active.where(*conds).subquery())) or 0

    pending = Followup.status == FollowupStatus.PENDING
    return {
        "pending": c(pending),
        "upcoming": c(pending, Followup.scheduled_date >= on),
        "overdue": c(pending, Followup.scheduled_date < on),
        "due_today": c(pending, Followup.scheduled_date == on),
        "completed": c(Followup.status == FollowupStatus.COMPLETED),
        "missed": c(Followup.status == FollowupStatus.MISSED),
        "cancelled": c(Followup.status == FollowupStatus.CANCELLED),
    }
