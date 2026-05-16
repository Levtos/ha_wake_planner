"""Utility helpers for Wake Planner."""

from __future__ import annotations

from datetime import date
from typing import Any

from homeassistant.config_entries import ConfigEntry

from .const import (
    CONF_PERSON_ENTITY_ID,
    CONF_PERSON_NAME,
    CONF_PERSONS,
    CONF_SHIFT_ANCHOR_DATE,
    CONF_SHIFT_CYCLE,
    CONF_SHIFT_SLOT_DAYS,
    CONF_SHIFT_SLOT_NAME,
    CONF_SHIFT_SLOTS,
    CONF_SLUG,
    CONF_TARGET_SLEEP_HOURS,
    CONF_WAKE_WINDOW_MINUTES,
    CONF_WEEKLY_PROFILE,
    DAYS,
    DEFAULT_TARGET_SLEEP_HOURS,
    DEFAULT_WAKE_TIME,
    DEFAULT_WAKE_WINDOW_MINUTES,
    PersonConfig,
    ShiftCycle,
    ShiftSlot,
    WeeklyDayProfile,
)
from .rule_engine import parse_time


def default_weekly_profile() -> dict[str, dict[str, Any]]:
    """Return default weekdays active/weekend inactive profile."""
    return {
        day: {"active": day not in {"saturday", "sunday"}, "wake_time": DEFAULT_WAKE_TIME}
        for day in DAYS
    }


def _parse_weekly_profile(raw: dict) -> dict[str, WeeklyDayProfile]:
    return {
        day: WeeklyDayProfile(
            active=bool(raw.get(day, {}).get("active", True)),
            wake_time=parse_time(str(raw.get(day, {}).get("wake_time", DEFAULT_WAKE_TIME))),
        )
        for day in DAYS
    }


def _parse_shift_cycle(raw: dict | None) -> ShiftCycle | None:
    if not raw:
        return None
    slots_raw = raw.get(CONF_SHIFT_SLOTS) or []
    anchor_str = raw.get(CONF_SHIFT_ANCHOR_DATE)
    if not slots_raw or not anchor_str:
        return None
    try:
        anchor = date.fromisoformat(str(anchor_str))
    except ValueError:
        return None
    slots = [
        ShiftSlot(
            name=str(s.get(CONF_SHIFT_SLOT_NAME, "Profile")),
            duration_days=max(1, int(s.get(CONF_SHIFT_SLOT_DAYS, 7))),
            weekly_profile=_parse_weekly_profile(s.get(CONF_WEEKLY_PROFILE) or default_weekly_profile()),
        )
        for s in slots_raw
    ]
    return ShiftCycle(anchor_date=anchor, slots=slots) if slots else None


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
                weekly_profile=_parse_weekly_profile(weekly),
                target_sleep_hours=float(raw.get(CONF_TARGET_SLEEP_HOURS, DEFAULT_TARGET_SLEEP_HOURS)),
                wake_window_minutes=int(raw.get(CONF_WAKE_WINDOW_MINUTES, DEFAULT_WAKE_WINDOW_MINUTES)),
                shift_cycle=_parse_shift_cycle(raw.get(CONF_SHIFT_CYCLE)),
            )
        )
    return persons
