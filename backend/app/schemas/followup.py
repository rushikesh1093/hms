from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

from app.models.enums import FollowupStatus
from app.schemas.common import ORMModel, UserRef
from app.schemas.eye_checkup import PatientSummary
from app.utils.validators import clean_text

Notes = Annotated[str | None, Field(default=None, max_length=4000), AfterValidator(clean_text)]


class FollowupCreate(BaseModel):
    patient_id: int
    checkup_id: int | None = None
    scheduled_date: date
    notes: Notes = None


class FollowupUpdate(BaseModel):
    status: FollowupStatus | None = None
    scheduled_date: date | None = None
    notes: Notes = None


class CheckupBrief(ORMModel):
    id: int
    checkup_code: str
    examination_date: date
    diagnosis: str
    followup_instructions: str | None
    doctor: UserRef


class FollowupOut(ORMModel):
    id: int
    patient_id: int
    checkup_id: int | None
    scheduled_date: date
    status: FollowupStatus
    notes: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    patient: PatientSummary
    checkup: CheckupBrief | None
    completer: UserRef | None = None
    is_overdue: bool = False
    days_until: int = 0
