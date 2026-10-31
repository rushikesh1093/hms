from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Sequence,
    SmallInteger,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import CheckupType, sql_in

checkup_code_seq = Sequence("checkup_code_seq", metadata=Base.metadata)


def _eye_checks(side: str) -> list[CheckConstraint]:
    return [
        CheckConstraint(f"{side}_eye_sphere BETWEEN -30 AND 30", name=f"{side}_sphere_range"),
        CheckConstraint(f"{side}_eye_cylinder BETWEEN -15 AND 15", name=f"{side}_cylinder_range"),
        CheckConstraint(f"{side}_eye_axis BETWEEN 0 AND 180", name=f"{side}_axis_range"),
        CheckConstraint(f"{side}_eye_iop BETWEEN 0 AND 80", name=f"{side}_iop_range"),
    ]


class EyeCheckup(TimestampMixin, Base):
    __tablename__ = "eye_checkups"
    __table_args__ = (
        CheckConstraint(f"checkup_type IN ({sql_in(CheckupType)})", name="checkup_type_valid"),
        CheckConstraint(
            "followup_required = false OR followup_date IS NOT NULL", name="followup_date_required"
        ),
        CheckConstraint(
            "followup_date IS NULL OR followup_date >= examination_date", name="followup_after_exam"
        ),
        *_eye_checks("right"),
        *_eye_checks("left"),
        Index("ix_eye_checkups_patient_exam_date", "patient_id", "examination_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    checkup_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    # RESTRICT: a patient with clinical records can never be hard-deleted.
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    examination_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    checkup_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="new")
    chief_complaints: Mapped[str] = mapped_column(Text, nullable=False)
    symptom_duration: Mapped[str | None] = mapped_column(String(100))

    right_eye_unaided_va: Mapped[str | None] = mapped_column(String(20))
    right_eye_corrected_va: Mapped[str | None] = mapped_column(String(20))
    right_eye_sphere: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    right_eye_cylinder: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    right_eye_axis: Mapped[int | None] = mapped_column(SmallInteger)
    right_eye_iop: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    right_eye_findings: Mapped[str | None] = mapped_column(Text)

    left_eye_unaided_va: Mapped[str | None] = mapped_column(String(20))
    left_eye_corrected_va: Mapped[str | None] = mapped_column(String(20))
    left_eye_sphere: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    left_eye_cylinder: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    left_eye_axis: Mapped[int | None] = mapped_column(SmallInteger)
    left_eye_iop: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    left_eye_findings: Mapped[str | None] = mapped_column(Text)

    diagnosis: Mapped[str] = mapped_column(Text, nullable=False)
    observations: Mapped[str | None] = mapped_column(Text)
    doctor_notes: Mapped[str | None] = mapped_column(Text)
    recommended_treatment: Mapped[str | None] = mapped_column(Text)
    prescription: Mapped[str | None] = mapped_column(Text)
    referral_recommendation: Mapped[str | None] = mapped_column(Text)

    followup_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    followup_date: Mapped[date | None] = mapped_column(Date)
    followup_instructions: Mapped[str | None] = mapped_column(Text)

    # Idempotency key sent by the client so a double-submitted form creates only one record.
    submission_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), unique=True)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))

    patient = relationship("Patient", back_populates="checkups", lazy="joined")
    doctor = relationship("User", foreign_keys=[doctor_id], lazy="joined")
    followups = relationship("Followup", back_populates="checkup", order_by="Followup.scheduled_date")
