import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import Role
from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserOut"


def _strong_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not (re.search(r"[A-Z]", value) and re.search(r"[a-z]", value) and re.search(r"\d", value)):
        raise ValueError("Password must contain upper-case, lower-case letters and a digit")
    return value


class UserOut(ORMModel):
    id: int
    username: str
    name: str
    email: str
    role: Role
    designation: str | None
    registration_number: str | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.\-]+$")
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(max_length=72)
    role: Role
    designation: str | None = Field(default=None, max_length=120)
    registration_number: str | None = Field(default=None, max_length=60)

    @field_validator("username")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong_password(v)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    role: Role | None = None
    designation: str | None = Field(default=None, max_length=120)
    registration_number: str | None = Field(default=None, max_length=60)
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: str = Field(max_length=72)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong_password(v)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=72)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _strong_password(v)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    designation: str | None = Field(default=None, max_length=120)


TokenResponse.model_rebuild()
