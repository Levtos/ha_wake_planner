"""Config flow for Wake Planner."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.util import slugify

from .const import (
    CONF_CALDAV_PASSWORD,
    CONF_CALDAV_URL,
    CONF_CALDAV_USERNAME,
    CONF_CALENDAR_ENTITY_ID,
    CONF_CALENDAR_SKIP_TITLES,
    CONF_CALENDAR_WAKE_PATTERN,
    CONF_HOLIDAY_BEHAVIOR,
    CONF_PERSON_ENTITY_ID,
    CONF_PERSON_NAME,
    CONF_PERSONS,
    CONF_SLUG,
    CONF_TARGET_SLEEP_HOURS,
    CONF_WAKE_WINDOW_MINUTES,
    CONF_WEEKLY_PROFILE,
    CONF_HOLIDAY_CALENDAR_ENTITY_ID,
    DAYS,
    DEFAULT_CALENDAR_SKIP_TITLES,
    DEFAULT_CALENDAR_WAKE_PATTERN,
    DEFAULT_TARGET_SLEEP_HOURS,
    DEFAULT_WAKE_TIME,
    DEFAULT_WAKE_WINDOW_MINUTES,
    DOMAIN,
    HOLIDAY_SKIP,
    HOLIDAY_WEEKEND_PROFILE,
)
from .rule_engine import parse_time
from .util import default_weekly_profile

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
                    CONF_PERSON_ENTITY_ID: user_input.get(CONF_PERSON_ENTITY_ID),
                }
                return await self.async_step_weekly_profile()
        return self.async_show_form(step_id="user", data_schema=_person_schema(), errors=errors)

    async def async_step_weekly_profile(self, user_input: dict[str, Any] | None = None):
        """Configure weekly profile."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                weekly = {
                    day: {"active": user_input[f"{day}_active"], "wake_time": _validate_time(user_input[f"{day}_wake_time"])}
                    for day in DAYS
                }
            except ValueError:
                errors["base"] = "invalid_time"
            else:
                self._person[CONF_WEEKLY_PROFILE] = weekly
                return await self.async_step_sleep()
        return self.async_show_form(step_id="weekly_profile", data_schema=_weekly_schema(), errors=errors)

    async def async_step_sleep(self, user_input: dict[str, Any] | None = None):
        """Configure sleep target and wake window."""
        if user_input is not None:
            self._person[CONF_TARGET_SLEEP_HOURS] = user_input[CONF_TARGET_SLEEP_HOURS]
            self._person[CONF_WAKE_WINDOW_MINUTES] = user_input[CONF_WAKE_WINDOW_MINUTES]
            self._persons.append(self._person)
            return await self.async_step_more_people()
        return self.async_show_form(step_id="sleep", data_schema=_sleep_schema())

    async def async_step_more_people(self, user_input: dict[str, Any] | None = None):
        """Ask whether to add more people."""
        if user_input is not None:
            if user_input["add_another"]:
                self._person = {}
                return await self.async_step_user()
            return await self.async_step_holidays()
        return self.async_show_form(step_id="more_people", data_schema=vol.Schema({vol.Required("add_another", default=False): bool}))

    async def async_step_holidays(self, user_input: dict[str, Any] | None = None):
        """Configure holiday behavior."""
        if user_input is not None:
            self._settings.update(user_input)
            return await self.async_step_calendar()
        return self.async_show_form(step_id="holidays", data_schema=_holiday_schema())

    async def async_step_calendar(self, user_input: dict[str, Any] | None = None):
        """Configure optional calendar sources."""
        if user_input is not None:
            self._settings.update({key: value for key, value in user_input.items() if value not in (None, "")})
            data = {CONF_PERSONS: self._persons, **self._settings}
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="Wake Planner", data=data)
        return self.async_show_form(step_id="calendar", data_schema=_calendar_schema())


def _person_schema() -> vol.Schema:
    return vol.Schema({
        vol.Required(CONF_PERSON_NAME): str,
        vol.Optional(CONF_PERSON_ENTITY_ID): selector.EntitySelector(selector.EntitySelectorConfig(domain="person")),
    })


def _weekly_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or default_weekly_profile()
    fields: dict[Any, Any] = {}
    for day in DAYS:
        fields[vol.Required(f"{day}_active", default=defaults.get(day, {}).get("active", True))] = bool
        fields[vol.Required(f"{day}_wake_time", default=defaults.get(day, {}).get("wake_time", DEFAULT_WAKE_TIME))] = selector.TimeSelector()
    return vol.Schema(fields)


def _sleep_schema() -> vol.Schema:
    return vol.Schema({
        vol.Required(CONF_TARGET_SLEEP_HOURS, default=DEFAULT_TARGET_SLEEP_HOURS): vol.Coerce(float),
        vol.Required(CONF_WAKE_WINDOW_MINUTES, default=DEFAULT_WAKE_WINDOW_MINUTES): vol.All(vol.Coerce(int), vol.Range(min=1, max=60)),
    })


def _holiday_schema() -> vol.Schema:
    return vol.Schema({
        vol.Optional(CONF_HOLIDAY_CALENDAR_ENTITY_ID): selector.EntitySelector(selector.EntitySelectorConfig(domain="calendar")),
        vol.Required(CONF_HOLIDAY_BEHAVIOR, default=HOLIDAY_SKIP): selector.SelectSelector(
            selector.SelectSelectorConfig(options=[HOLIDAY_SKIP, HOLIDAY_WEEKEND_PROFILE], mode=selector.SelectSelectorMode.DROPDOWN)
        ),
    })


def _calendar_schema() -> vol.Schema:
    return vol.Schema({
        vol.Optional(CONF_CALENDAR_ENTITY_ID): selector.EntitySelector(selector.EntitySelectorConfig(domain="calendar")),
        vol.Optional(CONF_CALDAV_URL): str,
        vol.Optional(CONF_CALDAV_USERNAME): str,
        vol.Optional(CONF_CALDAV_PASSWORD): str,
        vol.Required(CONF_CALENDAR_WAKE_PATTERN, default=DEFAULT_CALENDAR_WAKE_PATTERN): str,
        vol.Required(CONF_CALENDAR_SKIP_TITLES, default=DEFAULT_CALENDAR_SKIP_TITLES): str,
    })


def _validate_time(value: str) -> str:
    parse_time(value)
    return value
