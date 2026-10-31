from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import FollowupStatus, sql_in


class Followup(TimestampMixin, Base):
    __tablename__ = "followups"
    __table_args__ = (
        CheckConstraint(f"status IN ({sql_in(FollowupStatus)})", name="status_valid"),
        CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)", name="completed_at_consistent"
        ),
        Index("ix_followups_status_scheduled", "status", "scheduled_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    checkup_id: Mapped[int | None] = mapped_column(
        ForeignKey("eye_checkups.id", ondelete="RESTRICT"), index=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    notes: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))

    patient = relationship("Patient", lazy="joined")
    checkup = relationship("EyeCheckup", back_populates="followups", lazy="joined")
    completer = relationship("User", foreign_keys=[completed_by], lazy="joined")
