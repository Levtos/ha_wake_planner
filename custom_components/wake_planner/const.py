"""Constants and data models for Wake Planner."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import StrEnum
from typing import Any

DOMAIN = "wake_planner"
NAME = "Wake Planner"
PLATFORMS = ["sensor", "binary_sensor"]

CONF_PERSONS = "persons"
CONF_PERSON_NAME = "name"
CONF_PERSON_ENTITY_ID = "person_entity_id"
CONF_SLUG = "slug"
CONF_WEEKLY_PROFILE = "weekly_profile"
CONF_TARGET_SLEEP_HOURS = "target_sleep_hours"
CONF_WAKE_WINDOW_MINUTES = "wake_window_minutes"
CONF_WORKDAY_ENTITY_ID = "workday_entity_id"
CONF_HOLIDAY_BEHAVIOR = "holiday_behavior"
CONF_CALENDAR_ENTITY_ID = "calendar_entity_id"
CONF_CALDAV_URL = "caldav_url"
CONF_CALDAV_USERNAME = "caldav_username"
CONF_CALDAV_PASSWORD = "caldav_password"
CONF_CALENDAR_WAKE_PATTERN = "calendar_wake_pattern"
CONF_CALENDAR_SKIP_TITLES = "calendar_skip_titles"

DEFAULT_WAKE_TIME = "07:00"
DEFAULT_TARGET_SLEEP_HOURS = 7.5
DEFAULT_WAKE_WINDOW_MINUTES = 5
DEFAULT_CALENDAR_WAKE_PATTERN = r"(?:wake:\s*)?(?P<time>[0-2]?\d:[0-5]\d)"
DEFAULT_CALENDAR_SKIP_TITLES = "no-wake,schlaf aus"

HOLIDAY_SKIP = "skip"
HOLIDAY_WEEKEND_PROFILE = "weekend_profile"

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKEND_DAYS = {"saturday", "sunday"}
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.state"

SERVICE_SKIP_NEXT = "skip_next"
SERVICE_SET_OVERRIDE = "set_override"
SERVICE_CLEAR_OVERRIDE = "clear_override"
SERVICE_LOG_SLEEP = "log_sleep"

ATTR_DECIDED_BY = "decided_by"
ATTR_REASON = "reason"
ATTR_WAKE_TIME = "wake_time"
ATTR_WAKE_WINDOW_START = "wake_window_start"
ATTR_WAKE_WINDOW_END = "wake_window_end"
ATTR_PROFILE_DAY = "profile_day"
ATTR_HOLIDAY_NAME = "holiday_name"
ATTR_SKIP_ACTIVE = "skip_active"
ATTR_OVERRIDE_UNTIL = "override_until"

class WakeState(StrEnum):
    """Supported wake decision states."""

    SCHEDULED = "scheduled"
    SKIPPED = "skipped"
    OVERRIDDEN = "overridden"
    HOLIDAY = "holiday"
    INACTIVE = "inactive"


@dataclass(slots=True)
class WeeklyDayProfile:
    """Wake profile for one weekday."""

    active: bool = True
    wake_time: time = time(7, 0)


@dataclass(slots=True)
class PersonConfig:
    """Configured wake planner person."""

    slug: str
    name: str
    person_entity_id: str | None
    weekly_profile: dict[str, WeeklyDayProfile]
    target_sleep_hours: float = DEFAULT_TARGET_SLEEP_HOURS
    wake_window_minutes: int = DEFAULT_WAKE_WINDOW_MINUTES


@dataclass(slots=True)
class CalendarDecision:
    """Calendar-derived wake instruction for a day."""

    wake_time: time | None = None
    skip: bool = False
    summary: str | None = None
    source: str = "not_configured"


@dataclass(slots=True)
class WakeDecision:
    """Result of evaluating the rule engine."""

    wake_time: time | None
    state: WakeState
    decided_by: str
    reason: str
    profile_day: str | None = None
    holiday_name: str | None = None
    skip_active: bool = False
    override_until: date | None = None
    next_wake: datetime | None = None
    wake_window_start: datetime | None = None
    wake_window_end: datetime | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable representation."""
        return {
            "wake_time": self.wake_time.strftime("%H:%M") if self.wake_time else None,
            "state": self.state.value,
            "decided_by": self.decided_by,
            "reason": self.reason,
            "profile_day": self.profile_day,
            "holiday_name": self.holiday_name,
            "skip_active": self.skip_active,
            "override_until": self.override_until.isoformat() if self.override_until else None,
            "next_wake": self.next_wake.isoformat() if self.next_wake else None,
            "wake_window_start": self.wake_window_start.isoformat() if self.wake_window_start else None,
            "wake_window_end": self.wake_window_end.isoformat() if self.wake_window_end else None,
        }


@dataclass(slots=True)
class RuntimePersonState:
    """Persisted runtime state for one person."""

    skip_next: bool = False
    override_time: time | None = None
    override_until: date | None = None
    sleep_log: list[dict[str, str]] = field(default_factory=list)
