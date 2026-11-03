from datetime import date, datetime

from pydantic import BaseModel, Field, computed_field, field_validator

from app.models.enums import Gender
from app.schemas.auth import _strong_password
from app.schemas.common import ORMModel
from app.utils.dates import today
from app.utils.validators import calculate_age


class PortalLoginRequest(BaseModel):
    patient_code: str = Field(min_length=1, max_length=20)
    password: str = Field(min_length=1, max_length=128)


class PortalPatient(ORMModel):
    """What a patient sees about themselves."""

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
    registration_date: date
    allergies: str | None = None
    medical_history: str | None = None

    @computed_field
    @property
    def age(self) -> int:
        return calculate_age(self.date_of_birth, today())


class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    must_change_password: bool
    patient: PortalPatient


class PortalMe(BaseModel):
    must_change_password: bool
    last_login_at: datetime | None
    patient: PortalPatient


class PortalPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=72)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong_password(v)


class PortalAccessStatus(BaseModel):
    enabled: bool
    exists: bool
    patient_code: str
    must_change_password: bool = False
    last_login_at: datetime | None = None
    locked_until: datetime | None = None
    updated_at: datetime | None = None


class PortalAccessSet(BaseModel):
    """Staff set (or reset) a patient's portal password. The patient is asked to change it."""

    password: str = Field(max_length=72)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong_password(v)
