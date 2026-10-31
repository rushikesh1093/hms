from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response

from app.core.dependencies import DbSession, StaffUser, client_ip, require_roles
from app.models import User
from app.models.enums import CheckupType, Gender, Role
from app.schemas.reports import DashboardOut, ReportOut, ReportType
from app.services import audit_service, report_service
from app.services.report_service import ReportFilters
from app.utils.exporters import render_report_csv, render_report_excel
from app.utils.pdf_generator import render_report_pdf

router = APIRouter(prefix="/api/reports", tags=["Reports"])

ReportUser = Annotated[User, Depends(require_roles(Role.ADMIN, Role.DOCTOR))]


def report_filters(
    db: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    doctor_id: int | None = None,
    gender: Gender | None = None,
    patient_code: Annotated[str | None, Query(max_length=20)] = None,
    checkup_type: CheckupType | None = None,
) -> ReportFilters:
    f = ReportFilters(
        start_date=start_date,
        end_date=end_date,
        doctor_id=doctor_id,
        gender=gender.value if gender else None,
        patient_code=patient_code.strip() if patient_code and patient_code.strip() else None,
        checkup_type=checkup_type.value if checkup_type else None,
    )
    f.labels = report_service.describe_filters(db, f)
    return f


Filters = Annotated[ReportFilters, Depends(report_filters)]


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(_: StaffUser, db: DbSession, start_date: date | None = None, end_date: date | None = None):
    """KPIs and chart series. Aggregates only; contains no patient-identifying data."""
    return report_service.dashboard(db, start_date, end_date)


@router.get("/generate", response_model=ReportOut)
def generate(report_type: ReportType, f: Filters, _: ReportUser, db: DbSession):
    return report_service.build_report(db, report_type, f)


@router.get("/patients", response_model=ReportOut, summary="Patient registration report")
def patients_report(f: Filters, _: ReportUser, db: DbSession):
    return report_service.build_report(db, ReportType.REGISTRATIONS, f)


@router.get("/checkups", response_model=ReportOut, summary="Eye examination report")
def checkups_report(f: Filters, _: ReportUser, db: DbSession):
    return report_service.build_report(db, ReportType.EXAMINATIONS, f)


@router.get("/followups", response_model=ReportOut, summary="Follow-up pending report")
def followups_report(f: Filters, _: ReportUser, db: DbSession):
    return report_service.build_report(db, ReportType.FOLLOWUP_PENDING, f)


def _export(db, user: User, request: Request, report_type: ReportType, f: ReportFilters, fmt: str) -> Response:
    report = report_service.build_report(db, report_type, f)
    stem = f"{report_type.value}_{report.start_date:%Y%m%d}_{report.end_date:%Y%m%d}"
    if fmt == "pdf":
        content, media, ext = render_report_pdf(report, user.name), "application/pdf", "pdf"
    elif fmt == "excel":
        content = render_report_excel(report, user.name)
        media, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    else:
        content, media, ext = render_report_csv(report), "text/csv; charset=utf-8", "csv"
    audit_service.record(
        db,
        user_id=user.id,
        action=f"export_{fmt}",
        entity_type="report",
        entity_id=report_type.value,
        new_values={"start_date": report.start_date.isoformat(), "end_date": report.end_date.isoformat(), "rows": report.total_rows, **f.labels},
        ip_address=client_ip(request),
    )
    db.commit()
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{stem}.{ext}"', "Cache-Control": "no-store"},
    )


@router.get("/export/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def export_pdf(report_type: ReportType, f: Filters, request: Request, user: ReportUser, db: DbSession):
    return _export(db, user, request, report_type, f, "pdf")


@router.get("/export/excel", response_class=Response)
def export_excel(report_type: ReportType, f: Filters, request: Request, user: ReportUser, db: DbSession):
    return _export(db, user, request, report_type, f, "excel")


@router.get("/export/csv", response_class=Response)
def export_csv(report_type: ReportType, f: Filters, request: Request, user: ReportUser, db: DbSession):
    return _export(db, user, request, report_type, f, "csv")
