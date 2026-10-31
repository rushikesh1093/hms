from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import Response as RawResponse

from app.core.dependencies import ClinicalUser, DbSession, client_ip
from app.models.enums import CheckupType
from app.schemas.common import Page
from app.schemas.eye_checkup import CheckupCreate, CheckupListItem, CheckupOut, CheckupUpdate
from app.services import audit_service, checkup_service
from app.utils.pdf_generator import render_checkup_pdf

router = APIRouter(prefix="/api/checkups", tags=["Eye Check-ups"])


@router.post("", response_model=CheckupOut, status_code=status.HTTP_201_CREATED)
def create_checkup(data: CheckupCreate, request: Request, response: Response, user: ClinicalUser, db: DbSession):
    """Record an eye examination. Send a `submission_id` (UUID) to make the request idempotent:
    a repeat with the same id returns the original record with status 200."""
    checkup, created = checkup_service.create_checkup(db, data, user, client_ip(request))
    if not created:
        response.status_code = status.HTTP_200_OK
    return checkup


@router.get("", response_model=Page[CheckupListItem])
def list_checkups(
    _: ClinicalUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=100)] = None,
    patient_id: int | None = None,
    doctor_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    checkup_type: CheckupType | None = None,
    followup_required: bool | None = None,
    sort_order: Literal["asc", "desc"] = "desc",
):
    return checkup_service.list_checkups(
        db,
        page=page,
        page_size=page_size,
        q=q,
        patient_id=patient_id,
        doctor_id=doctor_id,
        date_from=date_from,
        date_to=date_to,
        checkup_type=checkup_type,
        followup_required=followup_required,
        sort_order=sort_order,
    )


@router.get("/{checkup_id}", response_model=CheckupOut)
def get_checkup(checkup_id: int, request: Request, user: ClinicalUser, db: DbSession):
    checkup = checkup_service.get_checkup(db, checkup_id)
    audit_service.record(db, user_id=user.id, action="view", entity_type="eye_checkup", entity_id=checkup.checkup_code, ip_address=client_ip(request))
    db.commit()
    return checkup


@router.put("/{checkup_id}", response_model=CheckupOut)
def update_checkup(checkup_id: int, data: CheckupUpdate, request: Request, user: ClinicalUser, db: DbSession):
    """Edit a check-up. Allowed for the examining doctor and administrators; every change
    is written to the audit log with old and new values."""
    return checkup_service.update_checkup(db, checkup_id, data, user, client_ip(request))


@router.get("/{checkup_id}/pdf", response_class=RawResponse, responses={200: {"content": {"application/pdf": {}}}})
def checkup_pdf(checkup_id: int, request: Request, user: ClinicalUser, db: DbSession):
    checkup = checkup_service.get_checkup(db, checkup_id)
    pdf = render_checkup_pdf(checkup, user.name)
    audit_service.record(db, user_id=user.id, action="export_pdf", entity_type="eye_checkup", entity_id=checkup.checkup_code, ip_address=client_ip(request))
    db.commit()
    return RawResponse(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{checkup.checkup_code}.pdf"', "Cache-Control": "no-store"},
    )
