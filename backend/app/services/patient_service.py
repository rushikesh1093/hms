"""Patient registration, retrieval, search, duplicate detection and soft deletion."""

import math
from datetime import date

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models import EyeCheckup, Patient, User, patient_code_seq
from app.schemas.patient import (
    DuplicateCandidate,
    PatientCreate,
    PatientListItem,
    PatientUpdate,
)
from app.services import audit_service
from app.utils.dates import now, today
from app.utils.validators import calculate_age, normalize_phone

SORT_FIELDS = {
    "patient_code": Patient.id,  # codes are sequential, so id order == code order
    "full_name": func.lower(Patient.full_name),
    "age": Patient.date_of_birth,  # inverted below
    "gender": Patient.gender,
    "registration_date": Patient.registration_date,
    "created_at": Patient.created_at,
}


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def next_patient_code(db: Session, on: date) -> str:
    seq = db.execute(select(patient_code_seq.next_value())).scalar_one()
    return f"PT{on.year}{seq:06d}"


def get_patient(db: Session, patient_id: int, include_inactive: bool = False) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None or (not patient.is_active and not include_inactive):
        raise NotFoundError("Patient not found")
    return patient


def get_patient_by_code(db: Session, code: str) -> Patient | None:
    return db.scalar(select(Patient).where(func.upper(Patient.patient_code) == code.strip().upper()))


def find_duplicates(
    db: Session,
    full_name: str,
    date_of_birth: date | None,
    mobile_number: str | None,
    exclude_id: int | None = None,
    limit: int = 10,
) -> list[DuplicateCandidate]:
    """Possible existing registrations of the same person.

    Matches on: same mobile number, or same name (case-insensitive / trigram-similar) and
    same date of birth. Results are suggestions for staff to review, never auto-merged.
    """
    name = " ".join(full_name.split()).lower()
    mobile = normalize_phone(mobile_number)
    similar_name = func.similarity(func.lower(Patient.full_name), name) > 0.45

    conditions = []
    if mobile:
        conditions.append(or_(Patient.mobile_number == mobile, Patient.alternate_phone == mobile))
    if date_of_birth:
        conditions.append(and_(Patient.date_of_birth == date_of_birth, similar_name))
    conditions.append(func.lower(Patient.full_name) == name)

    stmt = select(Patient).where(Patient.is_active.is_(True), or_(*conditions))
    if exclude_id:
        stmt = stmt.where(Patient.id != exclude_id)
    stmt = stmt.order_by(Patient.id.desc()).limit(limit)

    results = []
    on = today()
    for p in db.scalars(stmt).unique():
        reasons = []
        if mobile and mobile in (p.mobile_number, p.alternate_phone):
            reasons.append("Same mobile number")
        if p.full_name.lower() == name:
            reasons.append("Same name")
        elif date_of_birth and p.date_of_birth == date_of_birth:
            reasons.append("Similar name")
        if date_of_birth and p.date_of_birth == date_of_birth:
            reasons.append("Same date of birth")
        results.append(
            DuplicateCandidate(
                id=p.id,
                patient_code=p.patient_code,
                full_name=p.full_name,
                date_of_birth=p.date_of_birth,
                age=calculate_age(p.date_of_birth, on),
                gender=p.gender,
                mobile_number=p.mobile_number,
                village=p.village,
                registration_date=p.registration_date,
                match_reasons=reasons,
            )
        )
    return results


def _is_strong_duplicate(c: DuplicateCandidate) -> bool:
    """Same name + same DOB, or same name + same mobile: almost certainly the same person."""
    r = set(c.match_reasons)
    return ("Same name" in r or "Similar name" in r) and (
        "Same date of birth" in r or "Same mobile number" in r
    )


def create_patient(db: Session, data: PatientCreate, user: User, ip: str | None) -> Patient:
    dupes = find_duplicates(db, data.full_name, data.date_of_birth, data.mobile_number)
    if dupes and not data.confirm_not_duplicate:
        raise ConflictError(
            "Possible duplicate registration found. Review the existing patients and confirm "
            "if this is a different person.",
            details=[d.model_dump(mode="json") for d in dupes],
            code="possible_duplicate",
        )
    if data.confirm_not_duplicate and any(_is_strong_duplicate(d) for d in dupes):
        # Same name with same DOB/mobile cannot be overridden; use the existing record.
        raise ConflictError(
            "A patient with the same name and date of birth or mobile number already exists.",
            details=[d.model_dump(mode="json") for d in dupes if _is_strong_duplicate(d)],
            code="duplicate_patient",
        )

    reg_date = data.registration_date or today()
    values = data.model_dump(exclude={"confirm_not_duplicate", "registration_date"})
    patient = Patient(
        **values,
        registration_date=reg_date,
        patient_code=next_patient_code(db, reg_date),
        created_by=user.id,
    )
    db.add(patient)
    db.flush()
    audit_service.record(
        db,
        user_id=user.id,
        action="create",
        entity_type="patient",
        entity_id=patient.patient_code,
        new_values=audit_service.snapshot(patient),
        ip_address=ip,
    )
    db.commit()
    db.refresh(patient)
    return patient


def update_patient(db: Session, patient_id: int, data: PatientUpdate, user: User, ip: str | None) -> Patient:
    patient = get_patient(db, patient_id)
    before = audit_service.snapshot(patient)
    values = data.model_dump()
    if values.get("registration_date") is None:
        values.pop("registration_date", None)

    # Block edits that would turn this record into a duplicate of another patient.
    dupes = find_duplicates(db, data.full_name, data.date_of_birth, data.mobile_number, exclude_id=patient.id)
    strong = [d for d in dupes if _is_strong_duplicate(d)]
    if strong:
        raise ConflictError(
            "These details match another registered patient.",
            details=[d.model_dump(mode="json") for d in strong],
            code="duplicate_patient",
        )

    for key, value in values.items():
        setattr(patient, key, value)
    patient.updated_by = user.id
    db.flush()
    old, new = audit_service.diff(before, audit_service.snapshot(patient))
    if new:
        audit_service.record(
            db,
            user_id=user.id,
            action="update",
            entity_type="patient",
            entity_id=patient.patient_code,
            old_values=old,
            new_values=new,
            ip_address=ip,
        )
    db.commit()
    db.refresh(patient)
    return patient


def deactivate_patient(db: Session, patient_id: int, user: User, ip: str | None) -> None:
    patient = get_patient(db, patient_id)
    patient.is_active = False
    patient.deleted_at = now()
    patient.deleted_by = user.id
    patient.updated_by = user.id
    audit_service.record(
        db,
        user_id=user.id,
        action="deactivate",
        entity_type="patient",
        entity_id=patient.patient_code,
        old_values={"is_active": True},
        new_values={"is_active": False},
        ip_address=ip,
    )
    db.commit()


def restore_patient(db: Session, patient_id: int, user: User, ip: str | None) -> Patient:
    patient = get_patient(db, patient_id, include_inactive=True)
    if patient.is_active:
        return patient
    patient.is_active = True
    patient.deleted_at = None
    patient.deleted_by = None
    patient.updated_by = user.id
    audit_service.record(
        db,
        user_id=user.id,
        action="restore",
        entity_type="patient",
        entity_id=patient.patient_code,
        old_values={"is_active": False},
        new_values={"is_active": True},
        ip_address=ip,
    )
    db.commit()
    db.refresh(patient)
    return patient


def _checkup_stats_subquery():
    return (
        select(
            EyeCheckup.patient_id.label("patient_id"),
            func.count(EyeCheckup.id).label("total_checkups"),
            func.max(EyeCheckup.examination_date).label("last_checkup_date"),
        )
        .group_by(EyeCheckup.patient_id)
        .subquery()
    )


def _search_condition(term: str):
    term = term.strip()
    like = f"%{escape_like(term)}%"
    digits = normalize_phone(term) or ""
    conds = [
        Patient.patient_code.ilike(like, escape="\\"),
        Patient.full_name.ilike(like, escape="\\"),
    ]
    if digits.isdigit() and len(digits) >= 3:
        conds.append(Patient.mobile_number.like(f"%{digits}%"))
        conds.append(Patient.alternate_phone.like(f"%{digits}%"))
    return or_(*conds)


def list_patients(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str | None = None,
    gender: str | None = None,
    registered_from: date | None = None,
    registered_to: date | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    sort_by: str = "registration_date",
    sort_order: str = "desc",
    include_inactive: bool = False,
) -> dict:
    stats = _checkup_stats_subquery()
    total_checkups = func.coalesce(stats.c.total_checkups, 0)
    stmt: Select = select(Patient, total_checkups.label("total_checkups"), stats.c.last_checkup_date).outerjoin(
        stats, stats.c.patient_id == Patient.id
    )
    filters = []
    if not include_inactive:
        filters.append(Patient.is_active.is_(True))
    if q and q.strip():
        filters.append(_search_condition(q))
    if gender:
        filters.append(Patient.gender == gender)
    if registered_from:
        filters.append(Patient.registration_date >= registered_from)
    if registered_to:
        filters.append(Patient.registration_date <= registered_to)

    on = today()
    # age >= min_age  <=>  dob <= today - min_age years
    if min_age is not None:
        filters.append(Patient.date_of_birth <= _years_before(on, min_age))
    # age <= max_age  <=>  dob > today - (max_age + 1) years
    if max_age is not None:
        filters.append(Patient.date_of_birth > _years_before(on, max_age + 1))
    stmt = stmt.where(*filters)

    count_stmt = select(func.count()).select_from(Patient).where(*filters)
    total = db.scalar(count_stmt) or 0

    sort_cols = {
        **SORT_FIELDS,
        "total_checkups": total_checkups,
        "last_checkup_date": stats.c.last_checkup_date,
    }
    col = sort_cols.get(sort_by, Patient.registration_date)
    descending = sort_order == "desc"
    if sort_by == "age":
        descending = not descending
    order = col.desc().nulls_last() if descending else col.asc().nulls_first()
    stmt = stmt.order_by(order, Patient.id.desc()).offset((page - 1) * page_size).limit(page_size)

    items = [_list_item(p, count, last, on) for p, count, last in db.execute(stmt).unique().all()]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


def _list_item(p: Patient, count: int, last: date | None, on: date) -> PatientListItem:
    return PatientListItem(
        id=p.id,
        patient_code=p.patient_code,
        full_name=p.full_name,
        date_of_birth=p.date_of_birth,
        age=calculate_age(p.date_of_birth, on),
        gender=p.gender,
        mobile_number=p.mobile_number,
        village=p.village,
        district=p.district,
        registration_date=p.registration_date,
        last_checkup_date=last,
        total_checkups=count,
        is_active=p.is_active,
    )


def _years_before(on: date, years: int) -> date:
    try:
        return on.replace(year=on.year - years)
    except ValueError:  # 29 February
        return on.replace(year=on.year - years, day=28)


def search(db: Session, q: str, include_clinical: bool, limit: int = 20) -> dict:
    """Unified search over patient code, name, mobile number and check-up code."""
    term = q.strip()
    patient_ids: list[int] = []
    matched_checkups: list[EyeCheckup] = []

    checkup_stmt = (
        select(EyeCheckup)
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .where(Patient.is_active.is_(True), EyeCheckup.checkup_code.ilike(f"%{escape_like(term)}%", escape="\\"))
        .order_by(EyeCheckup.examination_date.desc())
        .limit(limit)
    )
    matched_checkups = list(db.scalars(checkup_stmt).unique())
    patient_ids.extend(c.patient_id for c in matched_checkups)

    page = list_patients(db, page=1, page_size=limit, q=term, sort_by="full_name", sort_order="asc")
    patients = page["items"]
    known = {p.id for p in patients}
    extra = [pid for pid in dict.fromkeys(patient_ids) if pid not in known]
    if extra:
        # Patients that matched only through a check-up code.
        stats = _checkup_stats_subquery()
        rows = db.execute(
            select(Patient, func.coalesce(stats.c.total_checkups, 0), stats.c.last_checkup_date)
            .outerjoin(stats, stats.c.patient_id == Patient.id)
            .where(Patient.id.in_(extra))
        ).unique().all()
        on = today()
        patients.extend(_list_item(p, count, last, on) for p, count, last in rows)

    recent_checkups: list[EyeCheckup] = []
    if include_clinical and patients:
        ids = [p.id for p in patients]
        recent_checkups = list(
            db.scalars(
                select(EyeCheckup)
                .where(EyeCheckup.patient_id.in_(ids))
                .order_by(EyeCheckup.examination_date.desc(), EyeCheckup.id.desc())
                .limit(100)
            ).unique()
        )
        seen = {c.id for c in recent_checkups}
        recent_checkups.extend(c for c in matched_checkups if c.id not in seen)

    return {
        "query": term,
        "patients": patients,
        "checkups": recent_checkups if include_clinical else [],
        "matched_checkup_codes": [c.checkup_code for c in matched_checkups],
    }
