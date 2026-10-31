"""Application settings loaded from environment variables / backend/.env."""

from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = "development"
    APP_NAME: str = "Hospital Patient & Eye Check-up Management System"

    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None

    SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False
    REFRESH_COOKIE_NAME: str = "hms_refresh"

    CORS_ORIGINS: str = "http://localhost:5173"

    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15

    HOSPITAL_NAME: str = "Government District Hospital"
    HOSPITAL_ADDRESS: str = ""
    HOSPITAL_PHONE: str = ""
    TIMEZONE: str = "Asia/Kolkata"

    # Used by `python -m app.seed --bootstrap-admin` to create the first admin on a fresh
    # deployment (no interactive shell needed). Ignored once any admin exists.
    BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@hospital.example.org"
    BOOTSTRAP_ADMIN_PASSWORD: str | None = None

    SEED_ADMIN_PASSWORD: str | None = None
    SEED_DOCTOR_PASSWORD: str | None = None
    SEED_RECEPTIONIST_PASSWORD: str | None = None

    @field_validator("DATABASE_URL", "TEST_DATABASE_URL")
    @classmethod
    def _psycopg_driver(cls, v: str | None) -> str | None:
        """Hosting providers (e.g. Render) hand out postgres:// or postgresql:// URLs;
        SQLAlchemy needs the explicit psycopg 3 driver."""
        if v is None:
            return v
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @field_validator("ENVIRONMENT")
    @classmethod
    def _env(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in {"development", "production", "test"}:
            raise ValueError("ENVIRONMENT must be development, production or test")
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.TIMEZONE)

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
