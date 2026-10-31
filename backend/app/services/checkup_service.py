"""Eye check-up creation, editing, retrieval and follow-up synchronisation."""

import math
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.models import EyeCheckup, Followup, Patient, User, checkup_code_seq
from app.models.enums import FollowupStatus, Role
from app.schemas.eye_checkup import CheckupCreate, CheckupUpdate
from app.services import audit_service
from app.services.patient_service import escape_like, get_patient
from app.utils.dates import today


def next_checkup_code(db: Session, on: date) -> str:
    seq = db.execute(select(checkup_code_seq.next_value())).scalar_one()
    return f"EC{on.year}{seq:06d}"


def get_checkup(db: Session, checkup_id: int) -> EyeCheckup:
    checkup = db.get(EyeCheckup, checkup_id)
    if checkup is None:
        raise NotFoundError("Check-up not found")
    return checkup


def _resolve_doctor(db: Session, user: User, doctor_id: int | None) -> User:
    if user.role == Role.DOCTOR:
        if doctor_id not in (None, user.id):
            raise PermissionDeniedError("Doctors can only record examinations under their own name")
        return user
    # Admin recording on behalf of an examining doctor.
    if doctor_id is None:
        raise ValidationError(
            "Select the examining doctor",
            details=[{"field": "doctor_id", "message": "Examining doctor is required"}],
        )
    doctor = db.get(User, doctor_id)
    if doctor is None or doctor.role != Role.DOCTOR or not doctor.is_active:
        raise ValidationError(
            "Examining doctor must be an active doctor account",
            details=[{"field": "doctor_id", "message": "Invalid doctor"}],
        )
    return doctor


def create_checkup(db: Session, data: CheckupCreate, user: User, ip: str | None) -> tuple[EyeCheckup, bool]:
    """Returns (checkup, created). A repeated submission_id returns the original record."""
    submission_id = str(data.submission_id) if data.submission_id else None
    if submission_id:
        existing = db.scalar(select(EyeCheckup).where(EyeCheckup.submission_id == submission_id))
        if existing:
            return existing, False

    patient = get_patient(db, data.patient_id)
    doctor = _resolve_doctor(db, user, data.doctor_id)
    exam_date = data.examination_date or today()
    if exam_date < patient.registration_date:
        raise ValidationError("Examination date cannot be before the patient's registration date")

    values = data.model_dump(exclude={"patient_id", "doctor_id", "submission_id", "examination_date"})
    checkup = EyeCheckup(
        **values,
        examination_date=exam_date,
        patient_id=patient.id,
        doctor_id=doctor.id,
        checkup_code=next_checkup_code(db, exam_date),
        submission_id=submission_id,
        created_by=user.id,
    )
    db.add(checkup)
    try:
        db.flush()
    except IntegrityError:
        # A concurrent request with the same submission_id won the race.
        db.rollback()
        if submission_id:
            existing = db.scalar(select(EyeCheckup).where(EyeCheckup.submission_id == submission_id))
            if existing:
                return existing, False
        raise

    if checkup.followup_required and checkup.followup_date:
        db.add(
            Followup(
                patient_id=patient.id,
                checkup_id=checkup.id,
                scheduled_date=checkup.followup_date,
                status=FollowupStatus.PENDING,
                notes=checkup.followup_instructions,
                created_by=user.id,
            )
        )
    snap = audit_service.snapshot(checkup)
    snap.pop("submission_id", None)
    audit_service.record(
        db,
        user_id=user.id,
        action="create",
        entity_type="eye_checkup",
        entity_id=checkup.checkup_code,
        new_values=snap,
        ip_address=ip,
    )
    db.commit()
    db.refresh(checkup)
    return checkup, True


def _sync_followup(db: Session, checkup: EyeCheckup, user: User) -> None:
    """Keep the pending follow-up linked to this check-up in line with the edited recommendation.

    Completed / missed follow-ups are history and are never changed here.
    """
    pending = db.scalars(
        select(Followup).where(Followup.checkup_id == checkup.id, Followup.status == FollowupStatus.PENDING)
    ).all()
    if checkup.followup_required and checkup.followup_date:
        if pending:
            for f in pending:
                f.scheduled_date = checkup.followup_date
                f.notes = checkup.followup_instructions
                f.updated_by = user.id
        else:
            already_done = db.scalar(
                select(func.count()).select_from(Followup).where(
                    Followup.checkup_id == checkup.id, Followup.scheduled_date == checkup.followup_date
                )
            )
            if not already_done:
                db.add(
                    Followup(
                        patient_id=checkup.patient_id,
                        checkup_id=checkup.id,
                        scheduled_date=checkup.followup_date,
                        status=FollowupStatus.PENDING,
                        notes=checkup.followup_instructions,
                        created_by=user.id,
                    )
                )
    else:
        for f in pending:
            f.status = FollowupStatus.CANCELLED
            f.notes = ((f.notes or "") + "\nCancelled: follow-up no longer required on check-up.").strip()
            f.updated_by = user.id


def update_checkup(db: Session, checkup_id: int, data: CheckupUpdate, user: User, ip: str | None) -> EyeCheckup:
    checkup = get_checkup(db, checkup_id)
    if user.role == Role.DOCTOR and checkup.doctor_id != user.id:
        raise PermissionDeniedError("Only the examining doctor or an administrator can edit this check-up")

    values = data.model_dump(exclude={"doctor_id"})
    if values.get("examination_date") is None:
        values.pop("examination_date", None)
    exam_date = values.get("examination_date", checkup.examination_date)
    if exam_date < checkup.patient.registration_date:
        raise ValidationError("Examination date cannot be before the patient's registration date")
    if data.followup_required and data.followup_date and data.followup_date <= exam_date:
        raise ValidationError("Follow-up date must be after the examination date")

    before = audit_service.snapshot(checkup)
    if user.role == Role.ADMIN and data.doctor_id and data.doctor_id != checkup.doctor_id:
        checkup.doctor_id = _resolve_doctor(db, user, data.doctor_id).id

    for key, value in values.items():
        setattr(checkup, key, value)
    checkup.updated_by = user.id
    db.flush()
    _sync_followup(db, checkup, user)

    old, new = audit_service.diff(before, audit_service.snapshot(checkup))
    if new:
        audit_service.record(
            db,
            user_id=user.id,
            action="update",
            entity_type="eye_checkup",
            entity_id=checkup.checkup_code,
            old_values=old,
            new_values=new,
            ip_address=ip,
        )
    db.commit()
    db.refresh(checkup)
    return checkup


def list_checkups(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str | None = None,
    patient_id: int | None = None,
    doctor_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    checkup_type: str | None = None,
    followup_required: bool | None = None,
    sort_order: str = "desc",
) -> dict:
    filters = [Patient.is_active.is_(True)] if patient_id is None else [EyeCheckup.patient_id == patient_id]
    if q and q.strip():
        like = f"%{escape_like(q.strip())}%"
        filters.append(
            or_(
                EyeCheckup.checkup_code.ilike(like, escape="\\"),
                Patient.patient_code.ilike(like, escape="\\"),
                Patient.full_name.ilike(like, escape="\\"),
                Patient.mobile_number.like(like, escape="\\"),
                EyeCheckup.diagnosis.ilike(like, escape="\\"),
            )
        )
    if doctor_id:
        filters.append(EyeCheckup.doctor_id == doctor_id)
    if date_from:
        filters.append(EyeCheckup.examination_date >= date_from)
    if date_to:
        filters.append(EyeCheckup.examination_date <= date_to)
    if checkup_type:
        filters.append(EyeCheckup.checkup_type == checkup_type)
    if followup_required is not None:
        filters.append(EyeCheckup.followup_required.is_(followup_required))

    base = select(EyeCheckup.id).join(Patient, Patient.id == EyeCheckup.patient_id).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    order = (
        (EyeCheckup.examination_date.desc(), EyeCheckup.id.desc())
        if sort_order == "desc"
        else (EyeCheckup.examination_date.asc(), EyeCheckup.id.asc())
    )
    stmt = (
        select(EyeCheckup)
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .where(*filters)
        .order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(db.scalars(stmt).unique())
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


def patient_history(db: Session, patient_id: int) -> list[EyeCheckup]:
    get_patient(db, patient_id, include_inactive=True)
    return list(
        db.scalars(
            select(EyeCheckup)
            .where(EyeCheckup.patient_id == patient_id)
            .order_by(EyeCheckup.examination_date.desc(), EyeCheckup.id.desc())
        ).unique()
    )
