"""Reminder, follow-up and gamification schemas."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import FollowupResponse, OwnedOut, UtcDatetime

TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]  # no-fake-data-ok: weekdays Mon..Sun, not health data


def _check_days(value: list[int] | None) -> list[int] | None:
    if value is None:
        return value
    if not value:
        raise ValueError("Pick at least one day of the week.")
    if any(day < 1 or day > 7 for day in value):
        raise ValueError("Days of the week are 1 (Monday) to 7 (Sunday).")
    return sorted(set(value))


class ReminderCreate(BaseModel):
    id: UUID
    astronaut_id: UUID | None = None
    kind: str = Field(min_length=1, max_length=30)
    local_time: str = Field(pattern=TIME_PATTERN)  # "HH:MM", device-local
    days_of_week: list[int] = Field(default_factory=lambda: list(ALL_DAYS))
    message: str = Field(min_length=1, max_length=60)
    enabled: bool = True

    _days = field_validator("days_of_week")(_check_days)


class ReminderUpdate(BaseModel):
    kind: str | None = Field(None, min_length=1, max_length=30)
    local_time: str | None = Field(None, pattern=TIME_PATTERN)
    days_of_week: list[int] | None = None
    message: str | None = Field(None, min_length=1, max_length=60)
    enabled: bool | None = None

    _days = field_validator("days_of_week")(_check_days)


class ReminderOut(OwnedOut):
    id: UUID
    kind: str
    local_time: str
    days_of_week: list[int]
    message: str
    enabled: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
    version: int


class FollowupIn(BaseModel):
    """"Did you follow the advice?" for one action of an earlier result."""

    id: UUID
    astronaut_id: UUID | None = None
    evaluation_id: UUID | None = None
    action_id: str = Field(min_length=1, max_length=100)
    followup_date: date
    response: FollowupResponse
    note: str | None = Field(None, max_length=500)


class FollowupOut(OwnedOut):
    id: UUID
    evaluation_id: UUID | None
    action_id: str
    followup_date: date
    response: FollowupResponse
    note: str | None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    version: int


class GameStateIn(BaseModel):
    """A snapshot the client worked out from its own saved check-ins
    (the app derives points; the server only stores what it is sent)."""

    astronaut_id: UUID | None = None
    points: int = Field(ge=0)
    level: int = Field(ge=1)
    current_streak: int = Field(ge=0)
    best_streak: int = Field(ge=0)
    badges: list[str] = Field(default_factory=list, max_length=50)


class GameStateOut(OwnedOut):
    points: int
    level: int
    current_streak: int
    best_streak: int
    badges: list[str]
    # Null = nothing has been stored for this astronaut yet.
    updated_at: UtcDatetime | None
    version: int
