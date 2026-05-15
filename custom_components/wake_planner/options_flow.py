"""Options flow for Wake Planner."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .config_flow import _calendar_schema, _holiday_schema, _person_schema, _sleep_schema, _validate_time, _weekly_schema
from .const import CONF_PERSONS, CONF_WEEKLY_PROFILE, DAYS
from .util import default_weekly_profile

class WakePlannerOptionsFlow(config_entries.OptionsFlow):
    """Edit Wake Planner settings without YAML."""

    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        self.entry = entry
        self._options: dict[str, Any] = {**entry.data, **entry.options}
        self._persons: list[dict[str, Any]] = [dict(person) for person in self._options.get(CONF_PERSONS, [])]
        self._index = 0

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        """Entry point."""
        return await self.async_step_person()

    async def async_step_person(self, user_input: dict[str, Any] | None = None):
        """Edit the current person basics."""
        if not self._persons:
            self._persons = [{"name": "Person", "slug": "person"}]
        person = self._persons[self._index]
        if user_input is not None:
            person.update(user_input)
            return await self.async_step_weekly_profile()
        return self.async_show_form(step_id="person", data_schema=_person_schema())

    async def async_step_weekly_profile(self, user_input: dict[str, Any] | None = None):
        """Edit weekly profile."""
        errors: dict[str, str] = {}
        person = self._persons[self._index]
        if user_input is not None:
            try:
                person[CONF_WEEKLY_PROFILE] = {
                    day: {"active": user_input[f"{day}_active"], "wake_time": _validate_time(user_input[f"{day}_wake_time"])}
                    for day in DAYS
                }
            except ValueError:
                errors["base"] = "invalid_time"
            else:
                return await self.async_step_sleep()
        return self.async_show_form(
            step_id="weekly_profile",
            data_schema=_weekly_schema(person.get(CONF_WEEKLY_PROFILE) or default_weekly_profile()),
            errors=errors,
        )

    async def async_step_sleep(self, user_input: dict[str, Any] | None = None):
        """Edit sleep settings."""
        if user_input is not None:
            self._persons[self._index].update(user_input)
            self._index += 1
            if self._index < len(self._persons):
                return await self.async_step_person()
            return await self.async_step_holidays()
        return self.async_show_form(step_id="sleep", data_schema=_sleep_schema())

    async def async_step_holidays(self, user_input: dict[str, Any] | None = None):
        """Edit holiday settings."""
        if user_input is not None:
            self._options.update(user_input)
            return await self.async_step_calendar()
        return self.async_show_form(step_id="holidays", data_schema=_holiday_schema())

    async def async_step_calendar(self, user_input: dict[str, Any] | None = None):
        """Edit calendar settings."""
        if user_input is not None:
            self._options.update(user_input)
            self._options[CONF_PERSONS] = self._persons
            return self.async_create_entry(title="", data=self._options)
        return self.async_show_form(step_id="calendar", data_schema=_calendar_schema())
