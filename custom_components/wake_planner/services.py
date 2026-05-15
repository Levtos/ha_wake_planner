"""Services for Wake Planner."""

from __future__ import annotations

from datetime import datetime
import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    DOMAIN,
    SERVICE_CLEAR_OVERRIDE,
    SERVICE_LOG_SLEEP,
    SERVICE_SET_OVERRIDE,
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


def _coordinator_for_person(hass: HomeAssistant, person_id: str) -> WakePlannerCoordinator:
    for coordinator in hass.data.get(DOMAIN, {}).values():
        if person_id in {person.slug for person in coordinator.persons}:
            return coordinator
    raise ValueError(f"Unknown Wake Planner person_id: {person_id}")
