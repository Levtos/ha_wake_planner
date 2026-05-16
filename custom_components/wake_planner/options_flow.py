"""Options flow for Wake Planner."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries

from .config_flow import (
    CALENDAR_OPTION_KEYS,
    SPECIAL_RULE_OPTION_KEYS,
    _calendar_schema,
    _clean_calendar_input,
    _clean_special_rules_input,
    _person_schema,
    _sleep_schema,
    _special_rules_schema,
    _weekly_from_input,
    _weekly_schema,
)
from .const import CONF_PERSONS, CONF_WEEKLY_PROFILE
from .util import default_weekly_profile


class WakePlannerOptionsFlow(config_entries.OptionsFlow):
    """Edit Wake Planner settings without YAML."""

    def __init__(self, entry: config_entries.ConfigEntry | None = None) -> None:
        self._entry = entry
        self._options: dict[str, Any] = {}
        self._persons: list[dict[str, Any]] = []
        self._index = 0
        self._initialized = False
        self._special_rules_configured = False

    def _ensure_initialized(self) -> None:
        """Load the current config entry once Home Assistant attaches it."""
        if self._initialized:
            return
        entry = self._entry or self.config_entry
        self._options = {**entry.data, **entry.options}
        self._persons = [dict(person) for person in self._options.get(CONF_PERSONS, [])]
        self._index = 0
        self._special_rules_configured = False
        self._initialized = True

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        """Entry point."""
        self._ensure_initialized()
        return await self.async_step_calendar(user_input)

    async def async_step_calendar(self, user_input: dict[str, Any] | None = None):
        """Edit calendar settings and holiday behavior."""
        self._ensure_initialized()
        if user_input is not None:
            for key in CALENDAR_OPTION_KEYS:
                self._options.pop(key, None)
            self._options.update(_clean_calendar_input(user_input))
            return await self.async_step_person()
        return self.async_show_form(
            step_id="calendar",
            data_schema=_calendar_schema(self._options),
        )

    def _async_finish_options(self):
        """Persist options while preserving the configured people."""
        self._options[CONF_PERSONS] = self._persons
        return self.async_create_entry(title="", data=self._options)

    async def async_step_person(self, user_input: dict[str, Any] | None = None):
        """Edit the current person basics."""
        if not self._persons:
            self._persons = [{"name": "Person", "slug": "person"}]
        person = self._persons[self._index]
        if user_input is not None:
            person.update({key: value or None for key, value in user_input.items()})
            return await self.async_step_weekly_profile()
        return self.async_show_form(
            step_id="person",
            data_schema=_person_schema(person),
        )

    async def async_step_weekly_profile(self, user_input: dict[str, Any] | None = None):
        """Edit weekly profile."""
        errors: dict[str, str] = {}
        person = self._persons[self._index]
        if user_input is not None:
            try:
                person[CONF_WEEKLY_PROFILE] = _weekly_from_input(user_input)
            except ValueError:
                errors["base"] = "invalid_time"
            else:
                if not self._special_rules_configured:
                    return await self.async_step_special_rules()
                return await self.async_step_sleep_target()
        return self.async_show_form(
            step_id="weekly_profile",
            data_schema=_weekly_schema(
                person.get(CONF_WEEKLY_PROFILE) or default_weekly_profile()
            ),
            errors=errors,
        )

    async def async_step_special_rules(self, user_input: dict[str, Any] | None = None):
        """Edit holiday and vacation handling."""
        if user_input is not None:
            for key in SPECIAL_RULE_OPTION_KEYS:
                self._options.pop(key, None)
            self._options.update(_clean_special_rules_input(user_input))
            self._special_rules_configured = True
            return await self.async_step_sleep_target()
        return self.async_show_form(
            step_id="special_rules",
            data_schema=_special_rules_schema(self._options),
        )

    async def async_step_sleep_target(self, user_input: dict[str, Any] | None = None):
        """Edit sleep settings."""
        if user_input is not None:
            from .const import CONF_TARGET_SLEEP_HOURS, CONF_WAKE_WINDOW_MINUTES
            self._persons[self._index].update({
                **user_input,
                CONF_TARGET_SLEEP_HOURS: float(user_input[CONF_TARGET_SLEEP_HOURS]),
                CONF_WAKE_WINDOW_MINUTES: int(user_input[CONF_WAKE_WINDOW_MINUTES]),
            })
            self._index += 1
            if self._index < len(self._persons):
                return await self.async_step_person()
            return self._async_finish_options()
        return self.async_show_form(
            step_id="sleep_target",
            data_schema=_sleep_schema(self._persons[self._index]),
        )
