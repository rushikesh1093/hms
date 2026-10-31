from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel

from app.core.dependencies import AdminUser, ClinicalUser, DbSession, RegistrationUser, StaffUser, client_ip
from app.core.exceptions import NotFoundError
from app.models.enums import Gender, Role
from app.schemas.common import Message, Page
from app.schemas.eye_checkup import CheckupListItem, CheckupOut
from app.schemas.followup import FollowupOut
from app.schemas.patient import (
    DuplicateCandidate,
    DuplicateCheckRequest,
    PatientCreate,
    PatientListItem,
    PatientOut,
    PatientUpdate,
)
from app.services import audit_service, checkup_service, followup_service, patient_service

router = APIRouter(prefix="/api/patients", tags=["Patients"])

PageNo = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


class SearchResult(BaseModel):
    query: str
    patients: list[PatientListItem]
    checkups: list[CheckupListItem]
    matched_checkup_codes: list[str]


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def register_patient(data: PatientCreate, request: Request, user: RegistrationUser, db: DbSession):
    """Register a new patient. Returns 409 `possible_duplicate` with candidate matches unless
    `confirm_not_duplicate` is true."""
    return patient_service.create_patient(db, data, user, client_ip(request))


@router.get("", response_model=Page[PatientListItem])
def list_patients(
    _: StaffUser,
    db: DbSession,
    page: PageNo = 1,
    page_size: PageSize = 20,
    q: Annotated[str | None, Query(max_length=100)] = None,
    gender: Gender | None = None,
    registered_from: date | None = None,
    registered_to: date | None = None,
    min_age: Annotated[int | None, Query(ge=0, le=130)] = None,
    max_age: Annotated[int | None, Query(ge=0, le=130)] = None,
    sort_by: Literal[
        "patient_code", "full_name", "age", "gender", "registration_date", "last_checkup_date", "total_checkups", "created_at"
    ] = "registration_date",
    sort_order: Literal["asc", "desc"] = "desc",
):
    return patient_service.list_patients(
        db,
        page=page,
        page_size=page_size,
        q=q,
        gender=gender,
        registered_from=registered_from,
        registered_to=registered_to,
        min_age=min_age,
        max_age=max_age,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/search", response_model=SearchResult)
def search_patients(
    user: StaffUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=2, max_length=100, description="Patient ID, name, mobile number or check-up ID")],
):
    result = patient_service.search(db, q, include_clinical=user.role != Role.RECEPTIONIST)
    return result


@router.post("/check-duplicates", response_model=list[DuplicateCandidate])
def check_duplicates(data: DuplicateCheckRequest, _: RegistrationUser, db: DbSession):
    return patient_service.find_duplicates(db, data.full_name, data.date_of_birth, data.mobile_number, data.exclude_id)


@router.get("/by-code/{patient_code}", response_model=PatientOut)
def get_by_code(patient_code: str, _: StaffUser, db: DbSession):
    patient = patient_service.get_patient_by_code(db, patient_code)
    if patient is None or not patient.is_active:
        raise NotFoundError("Patient not found")
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, request: Request, user: StaffUser, db: DbSession):
    patient = patient_service.get_patient(db, patient_id, include_inactive=user.role == Role.ADMIN)
    audit_service.record(db, user_id=user.id, action="view", entity_type="patient", entity_id=patient.patient_code, ip_address=client_ip(request))
    db.commit()
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, data: PatientUpdate, request: Request, user: RegistrationUser, db: DbSession):
    return patient_service.update_patient(db, patient_id, data, user, client_ip(request))


@router.delete("/{patient_id}", response_model=Message)
def deactivate_patient(patient_id: int, request: Request, admin: AdminUser, db: DbSession):
    """Soft-delete: the patient is hidden from lists but all clinical history is preserved."""
    patient_service.deactivate_patient(db, patient_id, admin, client_ip(request))
    return Message(message="Patient record deactivated. Clinical history has been preserved.")


@router.post("/{patient_id}/restore", response_model=PatientOut)
def restore_patient(patient_id: int, request: Request, admin: AdminUser, db: DbSession):
    return patient_service.restore_patient(db, patient_id, admin, client_ip(request))


@router.get("/{patient_id}/checkups", response_model=list[CheckupOut])
def patient_checkups(patient_id: int, _: ClinicalUser, db: DbSession):
    """Full examination history of a patient, newest first."""
    return checkup_service.patient_history(db, patient_id)


@router.get("/{patient_id}/followups", response_model=list[FollowupOut])
def patient_followups(patient_id: int, user: StaffUser, db: DbSession):
    patient_service.get_patient(db, patient_id, include_inactive=True)
    page = followup_service.list_followups(db, page=1, page_size=100, patient_id=patient_id)
    clinical = user.role != Role.RECEPTIONIST
    return [followup_service.to_out(f, clinical) for f in page["items"]]
