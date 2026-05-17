"""Services for Wake Planner."""

from __future__ import annotations

from datetime import datetime
from typing import Any
import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_HOLIDAY_BEHAVIOR,
    CONF_MANUAL_HOLIDAY_DATES,
    CONF_TARGET_SLEEP_HOURS,
    CONF_WAKE_WINDOW_MINUTES,
    CONF_WEEKLY_PROFILE,
    DOMAIN,
    SERVICE_CLEAR_OVERRIDE,
    SERVICE_LOG_SLEEP,
    SERVICE_SET_OVERRIDE,
    SERVICE_SET_SLEEP_SETTINGS,
    SERVICE_SET_SPECIAL_RULES,
    SERVICE_SET_WEEKLY_PROFILE,
    SERVICE_SKIP_NEXT,
)
from .coordinator import WakePlannerCoordinator
from .rule_engine import parse_time

PERSON_SCHEMA = vol.Schema({vol.Required("person_id"): cv.string})


def _time_string(value: str) -> str:
    parse_time(value)
    return value


def _datetime_string(value: str) -> str:
    datetime.fromisoformat(value)
    return value


def async_setup_services(hass: HomeAssistant) -> None:
    """Register integration services once."""
    if hass.services.has_service(DOMAIN, SERVICE_SKIP_NEXT):
        return

    async def skip_next(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        await coordinator.async_skip_next(call.data["person_id"])

    async def set_override(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        await coordinator.async_set_override(
            call.data["person_id"], call.data["wake_time"], call.data.get("until")
        )

    async def clear_override(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        await coordinator.async_clear_override(call.data["person_id"])

    async def log_sleep(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        await coordinator.async_log_sleep(call.data["person_id"], call.data["sleep_time"], call.data["wake_time"])

    hass.services.async_register(DOMAIN, SERVICE_SKIP_NEXT, skip_next, schema=PERSON_SCHEMA)
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_OVERRIDE,
        set_override,
        schema=vol.Schema({vol.Required("person_id"): cv.string, vol.Required("wake_time"): _time_string, vol.Optional("until"): cv.date}),
    )
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_OVERRIDE, clear_override, schema=PERSON_SCHEMA)
    hass.services.async_register(
        DOMAIN,
        SERVICE_LOG_SLEEP,
        log_sleep,
        schema=vol.Schema({
            vol.Required("person_id"): cv.string,
            vol.Required("sleep_time"): _datetime_string,
            vol.Required("wake_time"): _datetime_string,
        }),
    )

    async def set_weekly_profile(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        profile_raw = call.data["profile"]
        for day_data in profile_raw.values():
            parse_time(day_data.get("wake_time", "07:00"))
        await coordinator.async_update_person_config(
            call.data["person_id"],
            **{CONF_WEEKLY_PROFILE: profile_raw}
        )

    async def set_sleep_settings(call: ServiceCall) -> None:
        coordinator = _coordinator_for_person(hass, call.data["person_id"])
        updates: dict[str, Any] = {}
        if "target_sleep_hours" in call.data:
            updates[CONF_TARGET_SLEEP_HOURS] = float(call.data["target_sleep_hours"])
        if "wake_window_minutes" in call.data:
            updates[CONF_WAKE_WINDOW_MINUTES] = int(call.data["wake_window_minutes"])
        if updates:
            await coordinator.async_update_person_config(call.data["person_id"], **updates)

    async def set_special_rules(call: ServiceCall) -> None:
        coordinators = list(hass.data.get(DOMAIN, {}).values())
        if not coordinators:
            raise ValueError("No Wake Planner coordinator found")
        coordinator = coordinators[0]
        updates: dict[str, Any] = {}
        if "holiday_behavior" in call.data:
            updates[CONF_HOLIDAY_BEHAVIOR] = call.data["holiday_behavior"]
        if "manual_holiday_dates" in call.data:
            updates[CONF_MANUAL_HOLIDAY_DATES] = str(call.data.get("manual_holiday_dates", ""))
        if updates:
            await coordinator.async_update_global_config(**updates)

    hass.services.async_register(
        DOMAIN, SERVICE_SET_WEEKLY_PROFILE, set_weekly_profile,
        schema=vol.Schema({
            vol.Required("person_id"): cv.string,
            vol.Required("profile"): {
                str: vol.Schema({
                    vol.Required("active"): bool,
                    vol.Required("wake_time"): str,
                })
            },
        })
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_SLEEP_SETTINGS, set_sleep_settings,
        schema=vol.Schema({
            vol.Required("person_id"): cv.string,
            vol.Optional("target_sleep_hours"): vol.All(vol.Coerce(float), vol.Range(min=4, max=12)),
            vol.Optional("wake_window_minutes"): vol.All(vol.Coerce(int), vol.Range(min=1, max=60)),
        })
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_SPECIAL_RULES, set_special_rules,
        schema=vol.Schema({
            vol.Optional("holiday_behavior"): cv.string,
            vol.Optional("manual_holiday_dates"): cv.string,
        })
    )


def _coordinator_for_person(hass: HomeAssistant, person_id: str) -> WakePlannerCoordinator:
    for coordinator in hass.data.get(DOMAIN, {}).values():
        if person_id in {person.slug for person in coordinator.persons}:
            return coordinator
    raise ValueError(f"Unknown Wake Planner person_id: {person_id}")
