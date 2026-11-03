"""Patient portal: patients sign in with their patient ID and a password set by hospital
staff, and can see only their own record, eye examinations and follow-ups (read-only).

Patient tokens carry type "patient_access", so they are rejected by every staff endpoint,
and staff tokens are rejected here.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentPatient, DbSession, RegistrationUser, client_ip
from app.core.exceptions import AppError, AuthenticationError, NotFoundError
from app.core.security import DUMMY_HASH, create_patient_token, hash_password, verify_password
from app.models import Followup, PatientAccount
from app.schemas.common import Message
from app.schemas.eye_checkup import CheckupOut
from app.schemas.followup import FollowupOut
from app.schemas.portal import (
    PortalAccessSet,
    PortalAccessStatus,
    PortalLoginRequest,
    PortalMe,
    PortalPasswordChange,
    PortalPatient,
    PortalTokenResponse,
)
from app.services import audit_service, checkup_service, followup_service, patient_service
from app.utils.pdf_generator import render_checkup_pdf

router = APIRouter(prefix="/api/portal", tags=["Patient portal"])
staff_router = APIRouter(prefix="/api/patients", tags=["Patients"])


# ---------------------------------------------------------------- patient-facing


@router.post("/login", response_model=PortalTokenResponse)
def portal_login(data: PortalLoginRequest, request: Request, db: DbSession):
    ip = client_ip(request)
    patient = patient_service.get_patient_by_code(db, data.patient_code)
    account = (
        db.scalar(select(PatientAccount).where(PatientAccount.patient_id == patient.id)) if patient else None
    )
    now = datetime.now(UTC)
    generic = "Invalid patient ID or password"

    if account is None:
        verify_password(data.password, DUMMY_HASH)  # equalise timing
        audit_service.record(db, user_id=None, action="portal_login_failed", entity_type="patient_portal", entity_id=data.patient_code[:50], ip_address=ip)
        db.commit()
        raise AuthenticationError(generic)

    if account.locked_until and account.locked_until > now:
        raise AuthenticationError("Too many failed attempts. Please try again later.", code="account_locked")

    if not verify_password(data.password, account.password_hash):
        account.failed_login_attempts += 1
        if account.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
            account.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            account.failed_login_attempts = 0
        audit_service.record(db, user_id=None, action="portal_login_failed", entity_type="patient_portal", entity_id=patient.patient_code, ip_address=ip)
        db.commit()
        raise AuthenticationError(generic)

    if not account.is_active or not patient.is_active:
        raise AuthenticationError("Your patient login is disabled. Please contact the hospital.", code="account_inactive")

    account.failed_login_attempts = 0
    account.locked_until = None
    account.last_login_at = now
    audit_service.record(db, user_id=None, action="portal_login", entity_type="patient_portal", entity_id=patient.patient_code, ip_address=ip)
    db.commit()
    token, expires_in = create_patient_token(account.id, patient.id)
    return PortalTokenResponse(
        access_token=token,
        expires_in=expires_in,
        must_change_password=account.must_change_password,
        patient=PortalPatient.model_validate(patient),
    )


@router.get("/me", response_model=PortalMe)
def portal_me(account: CurrentPatient):
    return PortalMe(
        must_change_password=account.must_change_password,
        last_login_at=account.last_login_at,
        patient=PortalPatient.model_validate(account.patient),
    )


@router.get("/checkups", response_model=list[CheckupOut])
def portal_checkups(account: CurrentPatient, db: DbSession):
    """The patient's own eye examinations, newest first."""
    return checkup_service.patient_history(db, account.patient_id)


@router.get("/checkups/{checkup_id}/pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def portal_checkup_pdf(checkup_id: int, request: Request, account: CurrentPatient, db: DbSession):
    checkup = checkup_service.get_checkup(db, checkup_id)
    if checkup.patient_id != account.patient_id:
        raise NotFoundError("Check-up not found")  # never reveal other patients' records
    pdf = render_checkup_pdf(checkup, f"{account.patient.full_name} (patient portal)")
    audit_service.record(db, user_id=None, action="portal_export_pdf", entity_type="eye_checkup", entity_id=checkup.checkup_code, ip_address=client_ip(request))
    db.commit()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{checkup.checkup_code}.pdf"', "Cache-Control": "no-store"},
    )


@router.get("/followups", response_model=list[FollowupOut])
def portal_followups(account: CurrentPatient, db: DbSession):
    rows = db.scalars(
        select(Followup).where(Followup.patient_id == account.patient_id).order_by(Followup.scheduled_date.desc())
    ).unique()
    return [followup_service.to_out(f, include_clinical=True) for f in rows]


@router.post("/change-password", response_model=Message)
def portal_change_password(data: PortalPasswordChange, request: Request, account: CurrentPatient, db: DbSession):
    if not verify_password(data.current_password, account.password_hash):
        raise AppError("Current password is incorrect", code="wrong_password")
    account.password_hash = hash_password(data.new_password)
    account.must_change_password = False
    audit_service.record(db, user_id=None, action="portal_password_change", entity_type="patient_portal", entity_id=account.patient.patient_code, ip_address=client_ip(request))
    db.commit()
    return Message(message="Password changed")


# ---------------------------------------------------------------- staff management


def _status(patient, account: PatientAccount | None) -> PortalAccessStatus:
    if account is None:
        return PortalAccessStatus(enabled=False, exists=False, patient_code=patient.patient_code)
    return PortalAccessStatus(
        enabled=account.is_active,
        exists=True,
        patient_code=patient.patient_code,
        must_change_password=account.must_change_password,
        last_login_at=account.last_login_at,
        locked_until=account.locked_until,
        updated_at=account.updated_at,
    )


def _account(db, patient_id: int) -> PatientAccount | None:
    return db.scalar(select(PatientAccount).where(PatientAccount.patient_id == patient_id))


@staff_router.get("/{patient_id}/portal-access", response_model=PortalAccessStatus)
def get_portal_access(patient_id: int, _: RegistrationUser, db: DbSession):
    patient = patient_service.get_patient(db, patient_id, include_inactive=True)
    return _status(patient, _account(db, patient_id))


@staff_router.put("/{patient_id}/portal-access", response_model=PortalAccessStatus)
def set_portal_access(patient_id: int, data: PortalAccessSet, request: Request, user: RegistrationUser, db: DbSession):
    """Enable the patient's login (or reset its password). The patient must change it on first sign-in."""
    patient = patient_service.get_patient(db, patient_id)
    account = _account(db, patient_id)
    action = "portal_password_reset"
    if account is None:
        account = PatientAccount(patient_id=patient.id, password_hash="", created_by=user.id)
        db.add(account)
        action = "portal_enable"
    account.password_hash = hash_password(data.password)
    account.is_active = True
    account.must_change_password = True
    account.failed_login_attempts = 0
    account.locked_until = None
    account.updated_by = user.id
    audit_service.record(db, user_id=user.id, action=action, entity_type="patient_portal", entity_id=patient.patient_code, ip_address=client_ip(request))
    db.commit()
    db.refresh(account)
    return _status(patient, account)


@staff_router.delete("/{patient_id}/portal-access", response_model=PortalAccessStatus)
def disable_portal_access(patient_id: int, request: Request, user: RegistrationUser, db: DbSession):
    patient = patient_service.get_patient(db, patient_id, include_inactive=True)
    account = _account(db, patient_id)
    if account is not None and account.is_active:
        account.is_active = False
        account.updated_by = user.id
        audit_service.record(db, user_id=user.id, action="portal_disable", entity_type="patient_portal", entity_id=patient.patient_code, ip_address=client_ip(request))
        db.commit()
        db.refresh(account)
    return _status(patient, account)
