from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    DOCTOR = "doctor"
    RECEPTIONIST = "receptionist"


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class CheckupType(StrEnum):
    NEW = "new"
    FOLLOW_UP = "follow_up"
    REVIEW = "review"
    POST_OPERATIVE = "post_operative"
    EMERGENCY = "emergency"


class FollowupStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    MISSED = "missed"
    CANCELLED = "cancelled"


def sql_in(enum_cls) -> str:
    """Render enum values as a SQL IN list for CHECK constraints."""
    return ", ".join(f"'{m.value}'" for m in enum_cls)
