"""Config flow for Wake Planner."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .const import (
    CONF_CALENDAR_ENTITY_ID,
    CONF_HOLIDAY_BEHAVIOR,
    CONF_HOLIDAY_CALENDAR_ENTITY_ID,
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
    DOMAIN,
    HOLIDAY_SKIP,
    HOLIDAY_WEEKEND_PROFILE,
)
from .rule_engine import parse_time
from .util import default_weekly_profile

_LOGGER = logging.getLogger(__name__)

DAY_FIELDS = {
    "monday": "mon",
    "tuesday": "tue",
    "wednesday": "wed",
    "thursday": "thu",
    "friday": "fri",
    "saturday": "sat",
    "sunday": "sun",
}
CALENDAR_OPTION_KEYS = {
    CONF_CALENDAR_ENTITY_ID,
    CONF_HOLIDAY_CALENDAR_ENTITY_ID,
    CONF_HOLIDAY_BEHAVIOR,
}

_OPTIONAL_ENTITY_FIELDS = {CONF_CALENDAR_ENTITY_ID, CONF_HOLIDAY_CALENDAR_ENTITY_ID}


class WakePlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a Wake Planner config flow."""

    VERSION = 1

    def __init__(self) -> None:
        self._persons: list[dict[str, Any]] = []
        self._person: dict[str, Any] = {}
        self._settings: dict[str, Any] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        """Return the options flow handler."""
        from .options_flow import WakePlannerOptionsFlow

        return WakePlannerOptionsFlow(config_entry)

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        """Start the setup flow with the person step."""
        return await self.async_step_person(user_input)

    async def async_step_person(self, user_input: dict[str, Any] | None = None):
        """Configure a person."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_PERSON_NAME].strip()
            slug = slugify(name)
            if not slug:
                errors[CONF_PERSON_NAME] = "invalid_name"
            elif slug in {person[CONF_SLUG] for person in self._persons}:
                errors[CONF_PERSON_NAME] = "duplicate_person"
            else:
                self._person = {
                    CONF_PERSON_NAME: name,
                    CONF_SLUG: slug,
                    CONF_PERSON_ENTITY_ID: user_input.get(CONF_PERSON_ENTITY_ID) or None,
                }
                return await self.async_step_calendar()
        return self.async_show_form(step_id="person", data_schema=_person_schema(), errors=errors)

    async def async_step_calendar(self, user_input: dict[str, Any] | None = None):
        """Configure optional calendar sources and holiday behavior."""
        if user_input is not None:
            self._settings.update(_clean_calendar_input(user_input))
            return await self.async_step_weekly_profile()
        return self.async_show_form(step_id="calendar", data_schema=_calendar_schema())

    async def async_step_weekly_profile(self, user_input: dict[str, Any] | None = None):
        """Configure weekly profile."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                self._person[CONF_WEEKLY_PROFILE] = _weekly_from_input(user_input)
            except ValueError:
                errors["base"] = "invalid_time"
            else:
                return await self.async_step_sleep_target()
        return self.async_show_form(step_id="weekly_profile", data_schema=_weekly_schema(), errors=errors)

    async def async_step_sleep_target(self, user_input: dict[str, Any] | None = None):
        """Configure sleep target and wake window."""
        if user_input is not None:
            self._person[CONF_TARGET_SLEEP_HOURS] = float(user_input[CONF_TARGET_SLEEP_HOURS])
            self._person[CONF_WAKE_WINDOW_MINUTES] = int(user_input[CONF_WAKE_WINDOW_MINUTES])
            self._persons.append(self._person)
            return await self.async_step_more_people()
        return self.async_show_form(step_id="sleep_target", data_schema=_sleep_schema())

    async def async_step_more_people(self, user_input: dict[str, Any] | None = None):
        """Ask whether to add more people."""
        if user_input is not None:
            if user_input["add_another"]:
                self._person = {}
                return await self.async_step_person()
            data = {CONF_PERSONS: self._persons, **self._settings}
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="Wake Planner", data=data)
        return self.async_show_form(
            step_id="more_people",
            data_schema=vol.Schema({
                vol.Required("add_another", default=False): selector.BooleanSelector(),
            }),
        )


def _normalize(data: dict) -> dict:
    """Coerce empty strings to None for optional entity fields."""
    return {
        k: (None if k in _OPTIONAL_ENTITY_FIELDS and v == "" else v)
        for k, v in data.items()
    }


def _optional_entity(key: str, defaults: dict) -> vol.Optional:
    """Return vol.Optional with default only when a stored entity_id exists."""
    val = defaults.get(key)
    if val:
        return vol.Optional(key, default=val)
    return vol.Optional(key)


def _person_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    return vol.Schema({
        vol.Required(CONF_PERSON_NAME, default=defaults.get(CONF_PERSON_NAME, vol.UNDEFINED)): selector.TextSelector(),
        _optional_entity(CONF_PERSON_ENTITY_ID, defaults): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="person")
        ),
    })


def _weekly_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or default_weekly_profile()
    fields: dict[Any, Any] = {}
    for day in DAYS:
        prefix = DAY_FIELDS[day]
        fields[vol.Required(f"{prefix}_active", default=defaults.get(day, {}).get("active", True))] = selector.BooleanSelector()
        fields[vol.Required(f"{prefix}_wake_time", default=defaults.get(day, {}).get("wake_time", DEFAULT_WAKE_TIME))] = selector.TimeSelector(
            selector.TimeSelectorConfig(has_seconds=False)
        )
    return vol.Schema(fields)


def _sleep_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    return vol.Schema({
        vol.Required(
            CONF_TARGET_SLEEP_HOURS,
            default=float(defaults.get(CONF_TARGET_SLEEP_HOURS, DEFAULT_TARGET_SLEEP_HOURS)),
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(
                mode=selector.NumberSelectorMode.BOX,
                min=4,
                max=12,
                step=0.5,
            )
        ),
        vol.Required(
            CONF_WAKE_WINDOW_MINUTES,
            default=int(defaults.get(CONF_WAKE_WINDOW_MINUTES, DEFAULT_WAKE_WINDOW_MINUTES)),
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(
                mode=selector.NumberSelectorMode.BOX,
                min=1,
                max=60,
                step=1,
            )
        ),
    })


def _calendar_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    return vol.Schema({
        _optional_entity(CONF_CALENDAR_ENTITY_ID, defaults): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="calendar")
        ),
        _optional_entity(CONF_HOLIDAY_CALENDAR_ENTITY_ID, defaults): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="calendar")
        ),
        vol.Required(CONF_HOLIDAY_BEHAVIOR, default=defaults.get(CONF_HOLIDAY_BEHAVIOR, HOLIDAY_SKIP)): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[HOLIDAY_SKIP, HOLIDAY_WEEKEND_PROFILE],
                translation_key="holiday_behavior",
            )
        ),
    })


def _clean_calendar_input(user_input: dict[str, Any]) -> dict[str, Any]:
    """Drop empty optional calendar values before storing config entry data."""
    normalized = _normalize(user_input)
    return {key: value for key, value in normalized.items() if value is not None}


def _weekly_from_input(user_input: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Convert compact day field names into the stored weekly profile format."""
    return {
        day: {
            "active": bool(user_input[f"{prefix}_active"]),
            "wake_time": _validate_time(user_input[f"{prefix}_wake_time"]),
        }
        for day, prefix in DAY_FIELDS.items()
    }


def _validate_time(value: str) -> str:
    parse_time(value)
    return value
