"""Dashboard statistics and tabular reports. Every figure is an aggregate query over
PostgreSQL records; nothing here is hard-coded sample data."""

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import Date, case, cast, distinct, func, literal, select
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.models import EyeCheckup, Followup, Patient, User
from app.models.enums import FollowupStatus
from app.schemas.reports import (
    DashboardOut,
    DoctorCount,
    KPIs,
    ReportColumn,
    ReportOut,
    ReportType,
    SeriesPoint,
)
from app.services.patient_service import _years_before
from app.utils.dates import today
from app.utils.validators import calculate_age

MAX_REPORT_ROWS = 5000
MAX_RANGE_DAYS = 366 * 5

AGE_GROUPS = [("0-5", 0, 5), ("6-17", 6, 17), ("18-40", 18, 40), ("41-60", 41, 60), ("61+", 61, None)]

REPORT_TITLES = {
    ReportType.DAILY: "Daily Patient Report",
    ReportType.WEEKLY: "Weekly Patient Report",
    ReportType.MONTHLY: "Monthly Patient Report",
    ReportType.REGISTRATIONS: "Patient Registration Report",
    ReportType.EXAMINATIONS: "Eye Examination Report",
    ReportType.DOCTOR_WISE: "Doctor-wise Report",
    ReportType.FOLLOWUP_PENDING: "Follow-up Pending Report",
    ReportType.REPEAT_PATIENTS: "Repeat Patient Report",
}


@dataclass
class ReportFilters:
    start_date: date | None = None
    end_date: date | None = None
    doctor_id: int | None = None
    gender: str | None = None
    patient_code: str | None = None
    checkup_type: str | None = None
    labels: dict[str, str] = field(default_factory=dict)


def _validate_range(start: date, end: date, limit_span: bool = True) -> None:
    if start > end:
        raise ValidationError("Start date must be on or before the end date")
    if limit_span and (end - start).days > MAX_RANGE_DAYS:
        raise ValidationError("Date range cannot exceed 5 years")


def _age_group_case():
    on = today()
    whens = []
    for label, lo, hi in AGE_GROUPS:
        # age >= lo  <=> dob <= today - lo years; age <= hi <=> dob > today - (hi+1) years
        cond = Patient.date_of_birth <= _years_before(on, lo)
        if hi is not None:
            cond = cond & (Patient.date_of_birth > _years_before(on, hi + 1))
        whens.append((cond, literal(label)))
    return case(*whens, else_=literal("Unknown"))


def _fill_days(rows: dict[date, int], start: date, end: date) -> list[SeriesPoint]:
    out, d = [], start
    while d <= end:
        out.append(SeriesPoint(label=d.isoformat(), value=rows.get(d, 0)))
        d += timedelta(days=1)
    return out


def _month_start(d: date, months_back: int = 0) -> date:
    y, m = d.year, d.month - months_back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def dashboard(db: Session, start: date | None = None, end: date | None = None) -> DashboardOut:
    on = today()
    end = end or on
    start = start or end - timedelta(days=29)
    _validate_range(start, end)
    active = Patient.is_active.is_(True)
    month_start = _month_start(on)

    def scalar(stmt) -> int:
        return int(db.scalar(stmt) or 0)

    checkup_count = select(func.count(EyeCheckup.id)).join(Patient, Patient.id == EyeCheckup.patient_id).where(active)
    pending = select(func.count(Followup.id)).join(Patient, Patient.id == Followup.patient_id).where(
        active, Followup.status == FollowupStatus.PENDING
    )
    kpis = KPIs(
        total_patients=scalar(select(func.count(Patient.id)).where(active)),
        total_checkups=scalar(checkup_count),
        today_registrations=scalar(select(func.count(Patient.id)).where(active, Patient.registration_date == on)),
        today_checkups=scalar(checkup_count.where(EyeCheckup.examination_date == on)),
        month_registrations=scalar(
            select(func.count(Patient.id)).where(
                active, Patient.registration_date >= month_start, Patient.registration_date <= on
            )
        ),
        followups_pending=scalar(pending),
        followups_overdue=scalar(pending.where(Followup.scheduled_date < on)),
    )

    reg_rows = db.execute(
        select(Patient.registration_date, func.count(Patient.id))
        .where(active, Patient.registration_date.between(start, end))
        .group_by(Patient.registration_date)
    ).all()

    twelve_months_ago = _month_start(on, 11)
    month_col = cast(func.date_trunc("month", Patient.registration_date), Date)
    month_rows = dict(
        db.execute(
            select(month_col, func.count(Patient.id))
            .where(active, Patient.registration_date >= twelve_months_ago, Patient.registration_date <= on)
            .group_by(month_col)
        ).all()
    )
    monthly = []
    for i in range(11, -1, -1):
        m = _month_start(on, i)
        monthly.append(SeriesPoint(label=m.strftime("%Y-%m"), value=int(month_rows.get(m, 0))))

    chk_rows = db.execute(
        select(EyeCheckup.examination_date, func.count(EyeCheckup.id))
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .where(active, EyeCheckup.examination_date.between(start, end))
        .group_by(EyeCheckup.examination_date)
    ).all()

    age_case = _age_group_case()
    age_rows = dict(db.execute(select(age_case, func.count(Patient.id)).where(active).group_by(age_case)).all())
    age_groups = [SeriesPoint(label=label, value=int(age_rows.get(label, 0))) for label, _, _ in AGE_GROUPS]

    gender_rows = db.execute(
        select(Patient.gender, func.count(Patient.id)).where(active).group_by(Patient.gender).order_by(Patient.gender)
    ).all()

    condition = func.initcap(func.trim(EyeCheckup.diagnosis))
    cond_rows = db.execute(
        select(condition, func.count(EyeCheckup.id))
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .where(active, EyeCheckup.examination_date.between(start, end))
        .group_by(condition)
        .order_by(func.count(EyeCheckup.id).desc(), condition)
        .limit(10)
    ).all()

    doc_rows = db.execute(
        select(User.id, User.name, func.count(EyeCheckup.id))
        .join(EyeCheckup, EyeCheckup.doctor_id == User.id)
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .where(active, EyeCheckup.examination_date.between(start, end))
        .group_by(User.id, User.name)
        .order_by(func.count(EyeCheckup.id).desc())
    ).all()

    return DashboardOut(
        as_of=on,
        start_date=start,
        end_date=end,
        kpis=kpis,
        daily_registrations=_fill_days({d: int(c) for d, c in reg_rows}, start, end),
        monthly_registrations=monthly,
        daily_checkups=_fill_days({d: int(c) for d, c in chk_rows}, start, end),
        age_groups=age_groups,
        gender_distribution=[SeriesPoint(label=g.title(), value=int(c)) for g, c in gender_rows],
        common_conditions=[SeriesPoint(label=c, value=int(n)) for c, n in cond_rows],
        doctor_checkups=[DoctorCount(doctor_id=i, doctor_name=n, count=int(c)) for i, n, c in doc_rows],
    )


# ---------------------------------------------------------------------------
# Tabular reports
# ---------------------------------------------------------------------------

def _default_range(report_type: ReportType, f: ReportFilters) -> tuple[date, date]:
    on = today()
    end = f.end_date or (on + timedelta(days=30) if report_type == ReportType.FOLLOWUP_PENDING else on)
    if f.start_date:
        start = f.start_date
    elif report_type == ReportType.DAILY:
        start = end
    elif report_type == ReportType.WEEKLY:
        start = end - timedelta(days=6)
    elif report_type == ReportType.MONTHLY:
        start = end.replace(day=1)
    elif report_type == ReportType.FOLLOWUP_PENDING:
        start = date(2000, 1, 1)  # include everything overdue
    else:
        start = end - timedelta(days=29)
    return start, end


def _checkup_filters(f: ReportFilters, start: date, end: date) -> list:
    conds = [Patient.is_active.is_(True), EyeCheckup.examination_date.between(start, end)]
    if f.doctor_id:
        conds.append(EyeCheckup.doctor_id == f.doctor_id)
    if f.gender:
        conds.append(Patient.gender == f.gender)
    if f.patient_code:
        conds.append(func.upper(Patient.patient_code) == f.patient_code.strip().upper())
    if f.checkup_type:
        conds.append(EyeCheckup.checkup_type == f.checkup_type)
    return conds


def _patient_filters(f: ReportFilters) -> list:
    conds = [Patient.is_active.is_(True)]
    if f.gender:
        conds.append(Patient.gender == f.gender)
    if f.patient_code:
        conds.append(func.upper(Patient.patient_code) == f.patient_code.strip().upper())
    return conds


def _cols(*pairs: tuple[str, str]) -> list[ReportColumn]:
    return [ReportColumn(key=k, label=lbl) for k, lbl in pairs]


def _fmt_type(t: str | None) -> str:
    return (t or "").replace("_", " ").title()


def _examination_rows(db: Session, f: ReportFilters, start: date, end: date):
    on = today()
    stmt = (
        select(EyeCheckup, Patient, User.name)
        .join(Patient, Patient.id == EyeCheckup.patient_id)
        .join(User, User.id == EyeCheckup.doctor_id)
        .where(*_checkup_filters(f, start, end))
        .order_by(EyeCheckup.examination_date, EyeCheckup.id)
        .limit(MAX_REPORT_ROWS + 1)
    )
    rows = []
    for c, p, doctor in db.execute(stmt).unique().all():
        rows.append(
            {
                "checkup_code": c.checkup_code,
                "examination_date": c.examination_date,
                "patient_code": p.patient_code,
                "patient_name": p.full_name,
                "age": calculate_age(p.date_of_birth, on),
                "gender": p.gender.title(),
                "doctor": doctor,
                "checkup_type": _fmt_type(c.checkup_type),
                "chief_complaints": c.chief_complaints,
                "diagnosis": c.diagnosis,
                "followup_date": c.followup_date,
            }
        )
    return rows


EXAM_COLUMNS = _cols(
    ("checkup_code", "Check-up ID"),
    ("examination_date", "Exam Date"),
    ("patient_code", "Patient ID"),
    ("patient_name", "Patient Name"),
    ("age", "Age"),
    ("gender", "Gender"),
    ("doctor", "Doctor"),
    ("checkup_type", "Type"),
    ("chief_complaints", "Chief Complaints"),
    ("diagnosis", "Diagnosis"),
    ("followup_date", "Follow-up"),
)


def _period_rows(db: Session, f: ReportFilters, start: date, end: date):
    """One row per day: registrations, check-ups, unique patients, new vs repeat visits."""
    reg = dict(
        db.execute(
            select(Patient.registration_date, func.count(Patient.id))
            .where(*_patient_filters(f), Patient.registration_date.between(start, end))
            .group_by(Patient.registration_date)
        ).all()
    )
    chk_conds = _checkup_filters(f, start, end)
    # A visit is a "first visit" when it falls on the patient's earliest examination date.
    first_visit = (
        select(EyeCheckup.patient_id, func.min(EyeCheckup.examination_date).label("first_date"))
        .group_by(EyeCheckup.patient_id)
        .subquery()
    )
    chk = {
        d: (int(total), int(unique), int(new), int(fu))
        for d, total, unique, new, fu in db.execute(
            select(
                EyeCheckup.examination_date,
                func.count(EyeCheckup.id),
                func.count(distinct(EyeCheckup.patient_id)),
                func.count(distinct(case((first_visit.c.first_date == EyeCheckup.examination_date, EyeCheckup.patient_id)))),
                func.count(case((EyeCheckup.followup_required.is_(True), 1))),
            )
            .join(Patient, Patient.id == EyeCheckup.patient_id)
            .join(first_visit, first_visit.c.patient_id == EyeCheckup.patient_id)
            .where(*chk_conds)
            .group_by(EyeCheckup.examination_date)
        ).all()
    }
    rows, d = [], start
    while d <= end:
        total, unique, new, fu = chk.get(d, (0, 0, 0, 0))
        rows.append(
            {
                "date": d,
                "registrations": int(reg.get(d, 0)),
                "checkups": total,
                "unique_patients": unique,
                "new_patients_examined": new,
                "repeat_patients_examined": unique - new,
                "followups_recommended": fu,
            }
        )
        d += timedelta(days=1)
    return rows


PERIOD_COLUMNS = _cols(
    ("date", "Date"),
    ("registrations", "Registrations"),
    ("checkups", "Check-ups"),
    ("unique_patients", "Patients Examined"),
    ("new_patients_examined", "First Visits"),
    ("repeat_patients_examined", "Repeat Visits"),
    ("followups_recommended", "Follow-ups Advised"),
)


def _summary_from(rows: list[dict], keys: list[tuple[str, str]]) -> list[SeriesPoint]:
    return [SeriesPoint(label=label, value=sum(int(r.get(k) or 0) for r in rows)) for k, label in keys]


def build_report(db: Session, report_type: ReportType, f: ReportFilters) -> ReportOut:
    start, end = _default_range(report_type, f)
    # The pending follow-up report deliberately reaches back to include every overdue item.
    _validate_range(start, end, limit_span=report_type != ReportType.FOLLOWUP_PENDING)
    on = today()
    summary: list[SeriesPoint] = []

    if report_type == ReportType.DAILY:
        columns = EXAM_COLUMNS
        rows = _examination_rows(db, f, start, end)
        regs = db.scalar(
            select(func.count(Patient.id)).where(*_patient_filters(f), Patient.registration_date.between(start, end))
        )
        summary = [
            SeriesPoint(label="New registrations", value=int(regs or 0)),
            SeriesPoint(label="Check-ups", value=len(rows)),
            SeriesPoint(label="Patients examined", value=len({r["patient_code"] for r in rows})),
            SeriesPoint(label="Follow-ups advised", value=sum(1 for r in rows if r["followup_date"])),
        ]

    elif report_type in (ReportType.WEEKLY, ReportType.MONTHLY):
        columns = PERIOD_COLUMNS
        rows = _period_rows(db, f, start, end)
        summary = _summary_from(
            rows,
            [
                ("registrations", "Registrations"),
                ("checkups", "Check-ups"),
                ("new_patients_examined", "First visits"),
                ("repeat_patients_examined", "Repeat visits"),
                ("followups_recommended", "Follow-ups advised"),
            ],
        )

    elif report_type == ReportType.REGISTRATIONS:
        columns = _cols(
            ("patient_code", "Patient ID"),
            ("registration_date", "Registered"),
            ("full_name", "Patient Name"),
            ("age", "Age"),
            ("gender", "Gender"),
            ("mobile_number", "Mobile"),
            ("village", "Village/City"),
            ("district", "District"),
            ("state", "State"),
            ("registered_by", "Registered By"),
        )
        stmt = (
            select(Patient, User.name)
            .join(User, User.id == Patient.created_by)
            .where(*_patient_filters(f), Patient.registration_date.between(start, end))
            .order_by(Patient.registration_date, Patient.id)
            .limit(MAX_REPORT_ROWS + 1)
        )
        rows = [
            {
                "patient_code": p.patient_code,
                "registration_date": p.registration_date,
                "full_name": p.full_name,
                "age": calculate_age(p.date_of_birth, on),
                "gender": p.gender.title(),
                "mobile_number": p.mobile_number,
                "village": p.village,
                "district": p.district,
                "state": p.state,
                "registered_by": by,
            }
            for p, by in db.execute(stmt).unique().all()
        ]
        genders: dict[str, int] = {}
        for r in rows:
            genders[r["gender"]] = genders.get(r["gender"], 0) + 1
        summary = [SeriesPoint(label="Total registrations", value=len(rows))] + [
            SeriesPoint(label=g, value=n) for g, n in sorted(genders.items())
        ]

    elif report_type == ReportType.EXAMINATIONS:
        columns = EXAM_COLUMNS
        rows = _examination_rows(db, f, start, end)
        summary = [
            SeriesPoint(label="Check-ups", value=len(rows)),
            SeriesPoint(label="Unique patients", value=len({r["patient_code"] for r in rows})),
            SeriesPoint(label="Follow-ups advised", value=sum(1 for r in rows if r["followup_date"])),
        ]

    elif report_type == ReportType.DOCTOR_WISE:
        columns = _cols(
            ("doctor", "Doctor"),
            ("designation", "Designation"),
            ("checkups", "Check-ups"),
            ("unique_patients", "Unique Patients"),
            ("new_visits", "New"),
            ("followup_visits", "Follow-up Visits"),
            ("followups_advised", "Follow-ups Advised"),
            ("referrals", "Referrals"),
        )
        stmt = (
            select(
                User.name,
                User.designation,
                func.count(EyeCheckup.id),
                func.count(distinct(EyeCheckup.patient_id)),
                func.count(case((EyeCheckup.checkup_type == "new", 1))),
                func.count(case((EyeCheckup.checkup_type == "follow_up", 1))),
                func.count(case((EyeCheckup.followup_required.is_(True), 1))),
                func.count(case((func.coalesce(func.trim(EyeCheckup.referral_recommendation), "") != "", 1))),
            )
            .join(EyeCheckup, EyeCheckup.doctor_id == User.id)
            .join(Patient, Patient.id == EyeCheckup.patient_id)
            .where(*_checkup_filters(f, start, end))
            .group_by(User.id, User.name, User.designation)
            .order_by(func.count(EyeCheckup.id).desc(), User.name)
        )
        rows = [
            {
                "doctor": n,
                "designation": d or "",
                "checkups": int(c),
                "unique_patients": int(u),
                "new_visits": int(nv),
                "followup_visits": int(fv),
                "followups_advised": int(fa),
                "referrals": int(rf),
            }
            for n, d, c, u, nv, fv, fa, rf in db.execute(stmt).all()
        ]
        summary = _summary_from(rows, [("checkups", "Total check-ups"), ("followups_advised", "Follow-ups advised")])
        summary.insert(0, SeriesPoint(label="Doctors", value=len(rows)))

    elif report_type == ReportType.FOLLOWUP_PENDING:
        columns = _cols(
            ("scheduled_date", "Scheduled"),
            ("status", "Status"),
            ("days_overdue", "Days Overdue"),
            ("patient_code", "Patient ID"),
            ("patient_name", "Patient Name"),
            ("mobile_number", "Mobile"),
            ("checkup_code", "Check-up ID"),
            ("doctor", "Doctor"),
            ("diagnosis", "Diagnosis"),
            ("instructions", "Instructions"),
        )
        conds = [
            *_patient_filters(f),
            Followup.status == FollowupStatus.PENDING,
            Followup.scheduled_date.between(start, end),
        ]
        stmt = (
            select(Followup, Patient, EyeCheckup, User.name)
            .join(Patient, Patient.id == Followup.patient_id)
            .outerjoin(EyeCheckup, EyeCheckup.id == Followup.checkup_id)
            .outerjoin(User, User.id == EyeCheckup.doctor_id)
            .where(*conds)
            .order_by(Followup.scheduled_date, Followup.id)
            .limit(MAX_REPORT_ROWS + 1)
        )
        if f.doctor_id:
            stmt = stmt.where(EyeCheckup.doctor_id == f.doctor_id)
        rows = []
        for fu, p, c, doctor in db.execute(stmt).unique().all():
            overdue = (on - fu.scheduled_date).days
            rows.append(
                {
                    "scheduled_date": fu.scheduled_date,
                    "status": "Overdue" if overdue > 0 else ("Due today" if overdue == 0 else "Upcoming"),
                    "days_overdue": max(overdue, 0),
                    "patient_code": p.patient_code,
                    "patient_name": p.full_name,
                    "mobile_number": p.mobile_number,
                    "checkup_code": c.checkup_code if c else "",
                    "doctor": doctor or "",
                    "diagnosis": c.diagnosis if c else "",
                    "instructions": fu.notes or "",
                }
            )
        summary = [
            SeriesPoint(label="Pending follow-ups", value=len(rows)),
            SeriesPoint(label="Overdue", value=sum(1 for r in rows if r["status"] == "Overdue")),
            SeriesPoint(label="Due today", value=sum(1 for r in rows if r["status"] == "Due today")),
            SeriesPoint(label="Upcoming", value=sum(1 for r in rows if r["status"] == "Upcoming")),
        ]

    elif report_type == ReportType.REPEAT_PATIENTS:
        columns = _cols(
            ("patient_code", "Patient ID"),
            ("patient_name", "Patient Name"),
            ("age", "Age"),
            ("gender", "Gender"),
            ("mobile_number", "Mobile"),
            ("visits", "Visits in Period"),
            ("first_visit", "First Visit"),
            ("last_visit", "Last Visit"),
            ("lifetime_visits", "Total Visits"),
        )
        lifetime = (
            select(EyeCheckup.patient_id, func.count(EyeCheckup.id).label("n"))
            .group_by(EyeCheckup.patient_id)
            .subquery()
        )
        visits = func.count(EyeCheckup.id)
        stmt = (
            select(
                Patient,
                visits,
                func.min(EyeCheckup.examination_date),
                func.max(EyeCheckup.examination_date),
                func.max(lifetime.c.n),
            )
            .join(EyeCheckup, EyeCheckup.patient_id == Patient.id)
            .join(lifetime, lifetime.c.patient_id == Patient.id)
            .where(*_checkup_filters(f, start, end))
            .group_by(Patient.id)
            .having(visits >= 2)
            .order_by(visits.desc(), Patient.id)
            .limit(MAX_REPORT_ROWS + 1)
        )
        rows = [
            {
                "patient_code": p.patient_code,
                "patient_name": p.full_name,
                "age": calculate_age(p.date_of_birth, on),
                "gender": p.gender.title(),
                "mobile_number": p.mobile_number,
                "visits": int(v),
                "first_visit": first,
                "last_visit": last,
                "lifetime_visits": int(n),
            }
            for p, v, first, last, n in db.execute(stmt).unique().all()
        ]
        summary = [
            SeriesPoint(label="Repeat patients", value=len(rows)),
            SeriesPoint(label="Visits by repeat patients", value=sum(r["visits"] for r in rows)),
        ]
    else:  # pragma: no cover - enum is exhaustive
        raise ValidationError("Unknown report type")

    truncated = len(rows) > MAX_REPORT_ROWS
    rows = rows[:MAX_REPORT_ROWS]
    return ReportOut(
        report_type=report_type,
        title=REPORT_TITLES[report_type],
        start_date=start,
        end_date=end,
        filters=f.labels,
        columns=columns,
        rows=rows,
        total_rows=len(rows),
        summary=summary,
        truncated=truncated,
    )


def describe_filters(db: Session, f: ReportFilters) -> dict[str, str]:
    labels: dict[str, str] = {}
    if f.doctor_id:
        doctor = db.get(User, f.doctor_id)
        labels["Doctor"] = doctor.name if doctor else f"#{f.doctor_id}"
    if f.gender:
        labels["Gender"] = f.gender.title()
    if f.patient_code:
        labels["Patient ID"] = f.patient_code.upper()
    if f.checkup_type:
        labels["Check-up type"] = _fmt_type(f.checkup_type)
    return labels
