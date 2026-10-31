from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Sequence,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import Gender, sql_in

patient_code_seq = Sequence("patient_code_seq", metadata=Base.metadata)


class Patient(TimestampMixin, Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint(f"gender IN ({sql_in(Gender)})", name="gender_valid"),
        CheckConstraint("date_of_birth <= registration_date", name="dob_before_registration"),
        # Trigram index makes ILIKE '%term%' name searches fast (requires pg_trgm).
        Index(
            "ix_patients_full_name_trgm",
            "full_name",
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    mobile_number: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(15))
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    village: Mapped[str] = mapped_column(String(100), nullable=False)
    district: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    registration_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date(), index=True
    )
    emergency_contact: Mapped[str | None] = mapped_column(String(150))
    medical_history: Mapped[str | None] = mapped_column(Text)  # existing medical conditions
    allergies: Mapped[str | None] = mapped_column(Text)
    previous_eye_problems: Mapped[str | None] = mapped_column(Text)
    previous_eye_surgery: Mapped[str | None] = mapped_column(Text)
    remarks: Mapped[str | None] = mapped_column(Text)

    # Soft deletion: clinical history is preserved when a patient is deactivated.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))

    creator = relationship("User", foreign_keys=[created_by], lazy="joined")
    updater = relationship("User", foreign_keys=[updated_by], lazy="joined")
    checkups = relationship("EyeCheckup", back_populates="patient")


# Used by the duplicate-registration check (case-insensitive name match).
Index("ix_patients_full_name_lower", func.lower(Patient.full_name))
