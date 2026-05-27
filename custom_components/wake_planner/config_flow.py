"""Config flow for Wake Planner."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_PERSONS, DOMAIN, NAME
from .flow import (
    CALENDAR_OPTION_KEYS,
    SPECIAL_RULE_OPTION_KEYS,
    _calendar_entity_ids,
    _calendar_schema,
    _clean_calendar_input,
    _clean_special_rules_input,
    _special_rules_schema,
)


class WakePlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Minimal setup; people and rules are managed in the sidebar panel."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return WakePlannerOptionsFlow(config_entry)

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        if user_input is not None:
            data: dict[str, Any] = {CONF_PERSONS: []}
            data.update(_clean_calendar_input(user_input))
            return self.async_create_entry(title=NAME, data=data)
        return self.async_show_form(
            step_id="user",
            data_schema=_calendar_schema(_calendar_entity_ids(self.hass)),
        )


class WakePlannerOptionsFlow(config_entries.OptionsFlow):
    """Edit Wake Planner global options."""

    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        self._options: dict[str, Any] = {**entry.data, **entry.options}

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        return await self.async_step_calendar(user_input)

    async def async_step_calendar(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        if user_input is not None:
            for key in CALENDAR_OPTION_KEYS:
                self._options.pop(key, None)
            self._options.update(_clean_calendar_input(user_input))
            return await self.async_step_special_rules()
        return self.async_show_form(
            step_id="calendar",
            data_schema=_calendar_schema(_calendar_entity_ids(self.hass), self._options),
        )

    async def async_step_special_rules(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> config_entries.ConfigFlowResult:
        if user_input is not None:
            for key in SPECIAL_RULE_OPTION_KEYS:
                self._options.pop(key, None)
            self._options.update(_clean_special_rules_input(user_input))
            return self.async_create_entry(title="", data=self._options)
        return self.async_show_form(
            step_id="special_rules",
            data_schema=_special_rules_schema(self._options),
        )
