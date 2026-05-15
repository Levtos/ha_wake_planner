"""Holiday/workday source helpers."""

from __future__ import annotations

from datetime import date

from homeassistant.core import HomeAssistant


def workday_status(hass: HomeAssistant, entity_id: str | None) -> tuple[bool, str | None]:
    """Return whether the selected workday sensor currently indicates a day off."""
    if not entity_id:
        return (False, None)
    state = hass.states.get(entity_id)
    if state is None:
        return (False, "Workday sensor unavailable")
    is_off = state.state.lower() in {"off", "false", "0"}
    name = state.attributes.get("friendly_name") or "Workday sensor is off"
    return (is_off, name if is_off else None)


def current_holiday_map(hass: HomeAssistant, entity_id: str | None, today: date) -> dict[date, tuple[bool, str | None]]:
    """Build a date keyed holiday map for the current day."""
    is_holiday, name = workday_status(hass, entity_id)
    return {today: (is_holiday, name)} if entity_id else {}
