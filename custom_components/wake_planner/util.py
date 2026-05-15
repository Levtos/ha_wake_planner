"""Utility helpers for Wake Planner."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry

from .const import (
    CONF_PERSON_ENTITY_ID,
    CONF_PERSON_NAME,
    CONF_PERSONS,
    CONF_SLUG,
    CONF_TARGET_SLEEP_HOURS,
    CONF_WAKE_WINDOW_MINUTES,
    CONF_WEEKLY_PROFILE,
    DAYS,
    DEFAULT_TARGET_SLEEP_HOURS,
    DEFAULT_WAKE_TIME,
    DEFAULT_WAKE_WINDOW_MINUTES,
    PersonConfig,
    WeeklyDayProfile,
)
from .rule_engine import parse_time


def default_weekly_profile() -> dict[str, dict[str, Any]]:
    """Return default weekdays active/weekend inactive profile."""
    return {
        day: {"active": day not in {"saturday", "sunday"}, "wake_time": DEFAULT_WAKE_TIME}
        for day in DAYS
    }


def persons_from_entry(entry: ConfigEntry) -> list[PersonConfig]:
    """Build PersonConfig objects from a config entry."""
    raw_persons = (entry.options or {}).get(CONF_PERSONS) or entry.data.get(CONF_PERSONS) or []
    persons: list[PersonConfig] = []
    for raw in raw_persons:
        weekly = raw.get(CONF_WEEKLY_PROFILE) or default_weekly_profile()
        persons.append(
            PersonConfig(
                slug=raw[CONF_SLUG],
                name=raw[CONF_PERSON_NAME],
                person_entity_id=raw.get(CONF_PERSON_ENTITY_ID),
                weekly_profile={
                    day: WeeklyDayProfile(
                        active=bool(weekly.get(day, {}).get("active", True)),
                        wake_time=parse_time(str(weekly.get(day, {}).get("wake_time", DEFAULT_WAKE_TIME))),
                    )
                    for day in DAYS
                },
                target_sleep_hours=float(raw.get(CONF_TARGET_SLEEP_HOURS, DEFAULT_TARGET_SLEEP_HOURS)),
                wake_window_minutes=int(raw.get(CONF_WAKE_WINDOW_MINUTES, DEFAULT_WAKE_WINDOW_MINUTES)),
            )
        )
    return persons
