from datetime import date, datetime

from app.core.config import settings


def today() -> date:
    """Today's date in the hospital's configured timezone."""
    return datetime.now(settings.tz).date()


def now() -> datetime:
    return datetime.now(settings.tz)
