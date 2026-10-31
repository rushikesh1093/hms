from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.core.dependencies import ClinicalUser, DbSession, StaffUser, client_ip
from app.models.enums import Role
from app.schemas.common import Page
from app.schemas.followup import FollowupCreate, FollowupOut, FollowupUpdate
from app.services import followup_service
from app.services.followup_service import FollowupView

router = APIRouter(prefix="/api/followups", tags=["Follow-ups"])


def _page(result: dict, clinical: bool) -> dict:
    result["items"] = [followup_service.to_out(f, clinical) for f in result["items"]]
    return result


@router.post("", response_model=FollowupOut, status_code=status.HTTP_201_CREATED)
def create_followup(data: FollowupCreate, request: Request, user: ClinicalUser, db: DbSession):
    f = followup_service.create_followup(db, data, user, client_ip(request))
    return followup_service.to_out(f, True)


@router.get("", response_model=Page[FollowupOut])
def list_followups(
    user: StaffUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    view: FollowupView = FollowupView.ALL,
    q: Annotated[str | None, Query(max_length=100)] = None,
    patient_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    doctor_id: int | None = None,
):
    result = followup_service.list_followups(
        db, page=page, page_size=page_size, view=view, q=q, patient_id=patient_id,
        date_from=date_from, date_to=date_to, doctor_id=doctor_id,
    )
    return _page(result, user.role != Role.RECEPTIONIST)


@router.get("/pending", response_model=Page[FollowupOut])
def pending_followups(
    user: StaffUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=100)] = None,
):
    result = followup_service.list_followups(db, page=page, page_size=page_size, view=FollowupView.PENDING, q=q)
    return _page(result, user.role != Role.RECEPTIONIST)


@router.get("/counts", response_model=dict[str, int])
def followup_counts(_: StaffUser, db: DbSession):
    return followup_service.counts(db)


@router.get("/{followup_id}", response_model=FollowupOut)
def get_followup(followup_id: int, user: StaffUser, db: DbSession):
    return followup_service.to_out(followup_service.get_followup(db, followup_id), user.role != Role.RECEPTIONIST)


@router.put("/{followup_id}", response_model=FollowupOut)
def update_followup(followup_id: int, data: FollowupUpdate, request: Request, user: StaffUser, db: DbSession):
    """Update status / reschedule. Marking a follow-up completed records who did it and when.
    Reception staff may only reschedule."""
    f = followup_service.update_followup(db, followup_id, data, user, client_ip(request))
    return followup_service.to_out(f, user.role != Role.RECEPTIONIST)
