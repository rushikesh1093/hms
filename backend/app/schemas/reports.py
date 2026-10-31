from datetime import date
from enum import StrEnum

from pydantic import BaseModel


class ReportType(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    REGISTRATIONS = "registrations"
    EXAMINATIONS = "examinations"
    DOCTOR_WISE = "doctor_wise"
    FOLLOWUP_PENDING = "followup_pending"
    REPEAT_PATIENTS = "repeat_patients"


class KPIs(BaseModel):
    total_patients: int
    total_checkups: int
    today_registrations: int
    today_checkups: int
    month_registrations: int
    followups_pending: int
    followups_overdue: int


class SeriesPoint(BaseModel):
    label: str
    value: int


class DoctorCount(BaseModel):
    doctor_id: int
    doctor_name: str
    count: int


class DashboardOut(BaseModel):
    as_of: date
    start_date: date
    end_date: date
    kpis: KPIs
    daily_registrations: list[SeriesPoint]
    monthly_registrations: list[SeriesPoint]
    daily_checkups: list[SeriesPoint]
    age_groups: list[SeriesPoint]
    gender_distribution: list[SeriesPoint]
    common_conditions: list[SeriesPoint]
    doctor_checkups: list[DoctorCount]


class ReportColumn(BaseModel):
    key: str
    label: str


class ReportOut(BaseModel):
    report_type: ReportType
    title: str
    start_date: date
    end_date: date
    filters: dict[str, str]
    columns: list[ReportColumn]
    rows: list[dict]
    total_rows: int
    summary: list[SeriesPoint]
    truncated: bool = False
