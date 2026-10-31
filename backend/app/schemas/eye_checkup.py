from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, computed_field, model_validator

from app.models.enums import CheckupType, FollowupStatus, Gender
from app.schemas.common import ORMModel, UserRef
from app.utils.dates import today
from app.utils.validators import calculate_age, clean_text, quarter_step, validate_visual_acuity

VA = Annotated[str | None, Field(default=None, max_length=20), AfterValidator(validate_visual_acuity)]
Sphere = Annotated[
    Decimal | None,
    Field(default=None, ge=-30, le=30, max_digits=5, decimal_places=2),
    AfterValidator(lambda v: quarter_step(v, "Sphere")),
]
Cylinder = Annotated[
    Decimal | None,
    Field(default=None, ge=-15, le=15, max_digits=5, decimal_places=2),
    AfterValidator(lambda v: quarter_step(v, "Cylinder")),
]
Axis = Annotated[int | None, Field(default=None, ge=0, le=180)]
IOP = Annotated[Decimal | None, Field(default=None, ge=0, le=80, max_digits=4, decimal_places=1)]
OptText = Annotated[str | None, Field(default=None, max_length=5000), AfterValidator(clean_text)]


def _required(v: str) -> str:
    v = clean_text(v)
    if not v:
        raise ValueError("This field is required")
    return v


ReqText = Annotated[str, Field(max_length=5000), AfterValidator(_required)]

EYE_FIELDS = ("unaided_va", "corrected_va", "sphere", "cylinder", "axis", "iop", "findings")


class CheckupFields(BaseModel):
    examination_date: date | None = None
    checkup_type: CheckupType = CheckupType.NEW
    chief_complaints: ReqText
    symptom_duration: Annotated[str | None, Field(default=None, max_length=100), AfterValidator(clean_text)] = None

    right_eye_unaided_va: VA = None
    right_eye_corrected_va: VA = None
    right_eye_sphere: Sphere = None
    right_eye_cylinder: Cylinder = None
    right_eye_axis: Axis = None
    right_eye_iop: IOP = None
    right_eye_findings: OptText = None

    left_eye_unaided_va: VA = None
    left_eye_corrected_va: VA = None
    left_eye_sphere: Sphere = None
    left_eye_cylinder: Cylinder = None
    left_eye_axis: Axis = None
    left_eye_iop: IOP = None
    left_eye_findings: OptText = None

    diagnosis: ReqText
    observations: OptText = None
    doctor_notes: OptText = None
    recommended_treatment: OptText = None
    prescription: OptText = None
    referral_recommendation: OptText = None

    followup_required: bool = False
    followup_date: date | None = None
    followup_instructions: OptText = None

    @model_validator(mode="after")
    def _cross_field(self):
        exam = self.examination_date or today()
        if exam > today():
            raise ValueError("Examination date cannot be in the future")
        for side in ("right", "left"):
            cyl = getattr(self, f"{side}_eye_cylinder")
            axis = getattr(self, f"{side}_eye_axis")
            label = "Right eye (OD)" if side == "right" else "Left eye (OS)"
            if cyl not in (None, 0) and axis is None:
                raise ValueError(f"{label}: axis is required when a cylinder power is recorded")
        if self.followup_required:
            if self.followup_date is None:
                raise ValueError("Follow-up date is required when follow-up is marked as required")
            if self.followup_date <= exam:
                raise ValueError("Follow-up date must be after the examination date")
        else:
            self.followup_date = None
        return self


class CheckupCreate(CheckupFields):
    patient_id: int
    # Admins must choose the examining doctor; doctors are recorded as themselves.
    doctor_id: int | None = None
    # Client-generated UUID that makes the create request idempotent.
    submission_id: UUID | None = None


class CheckupUpdate(CheckupFields):
    doctor_id: int | None = None


class PatientSummary(ORMModel):
    id: int
    patient_code: str
    full_name: str
    date_of_birth: date
    gender: Gender
    mobile_number: str
    address: str
    village: str
    district: str
    state: str
    allergies: str | None = None
    medical_history: str | None = None
    is_active: bool = True

    @computed_field
    @property
    def age(self) -> int:
        return calculate_age(self.date_of_birth, today())


class FollowupBrief(ORMModel):
    id: int
    scheduled_date: date
    status: FollowupStatus
    notes: str | None
    completed_at: datetime | None


class CheckupOut(ORMModel):
    id: int
    checkup_code: str
    patient_id: int
    doctor_id: int
    examination_date: date
    checkup_type: CheckupType
    chief_complaints: str
    symptom_duration: str | None

    right_eye_unaided_va: str | None
    right_eye_corrected_va: str | None
    right_eye_sphere: Decimal | None
    right_eye_cylinder: Decimal | None
    right_eye_axis: int | None
    right_eye_iop: Decimal | None
    right_eye_findings: str | None

    left_eye_unaided_va: str | None
    left_eye_corrected_va: str | None
    left_eye_sphere: Decimal | None
    left_eye_cylinder: Decimal | None
    left_eye_axis: int | None
    left_eye_iop: Decimal | None
    left_eye_findings: str | None

    diagnosis: str
    observations: str | None
    doctor_notes: str | None
    recommended_treatment: str | None
    prescription: str | None
    referral_recommendation: str | None

    followup_required: bool
    followup_date: date | None
    followup_instructions: str | None

    created_at: datetime
    updated_at: datetime
    patient: PatientSummary
    doctor: UserRef
    followups: list[FollowupBrief] = []


class CheckupListItem(ORMModel):
    id: int
    checkup_code: str
    examination_date: date
    checkup_type: CheckupType
    chief_complaints: str
    diagnosis: str
    followup_required: bool
    followup_date: date | None
    patient: PatientSummary
    doctor: UserRef
