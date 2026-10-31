from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, computed_field, model_validator

from app.models.enums import Gender
from app.schemas.common import ORMModel, UserRef
from app.utils.dates import today
from app.utils.validators import (
    calculate_age,
    clean_name,
    clean_text,
    validate_mobile,
    validate_optional_phone,
)

Name = Annotated[str, Field(max_length=150), AfterValidator(clean_name)]
Mobile = Annotated[str, Field(max_length=20), AfterValidator(validate_mobile)]
OptPhone = Annotated[str | None, Field(default=None, max_length=20), AfterValidator(validate_optional_phone)]
OptText = Annotated[str | None, Field(default=None, max_length=4000), AfterValidator(clean_text)]


def _required(v: str) -> str:
    v = clean_text(v)
    if not v:
        raise ValueError("This field is required")
    return v


class PatientBase(BaseModel):
    full_name: Name
    date_of_birth: date
    gender: Gender
    mobile_number: Mobile
    alternate_phone: OptPhone = None
    address: Annotated[str, Field(max_length=255), AfterValidator(_required)]
    village: Annotated[str, Field(max_length=100), AfterValidator(_required)]
    district: Annotated[str, Field(max_length=100), AfterValidator(_required)]
    state: Annotated[str, Field(max_length=100), AfterValidator(_required)]
    registration_date: date | None = None
    emergency_contact: Annotated[str | None, Field(default=None, max_length=150), AfterValidator(clean_text)] = None
    medical_history: OptText = None
    allergies: OptText = None
    previous_eye_problems: OptText = None
    previous_eye_surgery: OptText = None
    remarks: OptText = None

    @model_validator(mode="after")
    def _dates(self):
        reg = self.registration_date or today()
        if reg > today():
            raise ValueError("Registration date cannot be in the future")
        if self.date_of_birth > reg:
            raise ValueError("Date of birth cannot be after the registration date")
        if calculate_age(self.date_of_birth, reg) > 130:
            raise ValueError("Date of birth gives an age above 130 years")
        if self.alternate_phone and self.alternate_phone == self.mobile_number:
            raise ValueError("Alternate phone must differ from the mobile number")
        return self


class PatientCreate(PatientBase):
    # Set to true after the user has reviewed possible duplicates and confirmed this is a new patient.
    confirm_not_duplicate: bool = False


class PatientUpdate(PatientBase):
    pass


class PatientOut(ORMModel):
    id: int
    patient_code: str
    full_name: str
    date_of_birth: date
    gender: Gender
    mobile_number: str
    alternate_phone: str | None
    address: str
    village: str
    district: str
    state: str
    registration_date: date
    emergency_contact: str | None
    medical_history: str | None
    allergies: str | None
    previous_eye_problems: str | None
    previous_eye_surgery: str | None
    remarks: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    creator: UserRef | None = None
    updater: UserRef | None = None

    @computed_field
    @property
    def age(self) -> int:
        return calculate_age(self.date_of_birth, today())


class PatientListItem(BaseModel):
    id: int
    patient_code: str
    full_name: str
    date_of_birth: date
    age: int
    gender: Gender
    mobile_number: str
    village: str
    district: str
    registration_date: date
    last_checkup_date: date | None
    total_checkups: int
    is_active: bool


class DuplicateCandidate(BaseModel):
    id: int
    patient_code: str
    full_name: str
    date_of_birth: date
    age: int
    gender: Gender
    mobile_number: str
    village: str
    registration_date: date
    match_reasons: list[str]


class DuplicateCheckRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    date_of_birth: date | None = None
    mobile_number: str | None = Field(default=None, max_length=20)
    exclude_id: int | None = None
