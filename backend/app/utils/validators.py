"""Reusable validation and normalisation helpers."""

import re
from datetime import date

MOBILE_RE = re.compile(r"^[6-9]\d{9}$")  # Indian 10-digit mobile number
PHONE_RE = re.compile(r"^\d{6,15}$")
# Snellen (6/6, 20/40), decimal (0.5, 1.0), logMAR (-0.1..1.3) or common clinical notations.
VA_RE = re.compile(
    r"^(\d{1,2}/\d{1,3}(\s?[pP])?|[01](\.\d{1,2})?|-0\.[0-3]|N\d{1,2}|CF\s?\d?\s?m?|CF|HM|PL\+?|PL|NPL|FC)$",
    re.IGNORECASE,
)


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    digits = re.sub(r"[\s\-()]", "", value.strip())
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits or None


def validate_mobile(value: str) -> str:
    digits = normalize_phone(value) or ""
    if not MOBILE_RE.fullmatch(digits):
        raise ValueError("Mobile number must be a valid 10-digit number starting with 6-9")
    return digits


def validate_optional_phone(value: str | None) -> str | None:
    digits = normalize_phone(value)
    if digits is None:
        return None
    if not PHONE_RE.fullmatch(digits):
        raise ValueError("Phone number must contain 6 to 15 digits")
    return digits


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip() if "\n" not in value else value.strip()
    return value or None


def clean_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) < 2:
        raise ValueError("Name must be at least 2 characters")
    if not re.fullmatch(r"[A-Za-z\u0900-\u097F .'\-]+", value):
        raise ValueError("Name may only contain letters, spaces, dots, apostrophes and hyphens")
    return value


def validate_visual_acuity(value: str | None) -> str | None:
    value = clean_text(value)
    if value is None:
        return None
    value = value.upper()
    if not VA_RE.fullmatch(value):
        raise ValueError(
            "Visual acuity must be Snellen (e.g. 6/6, 20/40), decimal (0.5), N-notation or CF/HM/PL/NPL"
        )
    return value


def quarter_step(value, field: str):
    """Sphere/cylinder powers are prescribed in 0.25 D steps."""
    if value is None:
        return None
    if (value * 4) % 1 != 0:
        raise ValueError(f"{field} must be in 0.25 dioptre steps")
    return value


def calculate_age(dob: date, on: date | None = None) -> int:
    on = on or date.today()
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))
