"""Holiday source helpers using weekends and optional HA holiday calendars."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_holiday_map(
    hass: HomeAssistant,
    holiday_calendar_entity_id: str | None,
    start: date,
    end: date,
) -> dict[date, tuple[bool, str | None]]:
    """Build a date keyed holiday map from weekends and an optional HA calendar.

    Weekends are detected locally with ``date.weekday() >= 5``. When a holiday
    calendar is configured, all-day events returned by Home Assistant's native
    calendar service are marked as holidays as well.
    """
    holidays: dict[date, tuple[bool, str | None]] = {}
    current = start
    while current <= end:
        if current.weekday() >= 5:
            holidays[current] = (True, "Weekend")
        current += timedelta(days=1)

    if not holiday_calendar_entity_id:
        return holidays

    try:
        response = await hass.services.async_call(
            "calendar",
            "get_events",
            {
                "entity_id": holiday_calendar_entity_id,
                "start_date_time": datetime.combine(start, datetime.min.time()).isoformat(),
                "end_date_time": datetime.combine(end + timedelta(days=1), datetime.min.time()).isoformat(),
            },
            blocking=True,
            return_response=True,
        )
    except Exception as err:  # noqa: BLE001 - holiday source must not break coordinator
        _LOGGER.debug("Holiday calendar fetch failed for %s: %s", holiday_calendar_entity_id, err)
        return holidays

    payload = (response or {}).get(holiday_calendar_entity_id, {})
    for event in payload.get("events", []):
        summary = str(event.get("summary") or event.get("title") or "Holiday")
        for event_date in _event_dates(event, start, end):
            holidays[event_date] = (True, summary)
    return holidays


def _event_dates(event: dict[str, Any], start: date, end: date) -> set[date]:
    """Return all dates covered by a Home Assistant calendar event."""
    start_value = event.get("start") or event.get("start_time") or event.get("date")
    end_value = event.get("end") or event.get("end_time")
    event_start = _parse_event_date(start_value)
    event_end = _parse_event_date(end_value)
    if event_start is None:
        return set()
    if event_end is None or event_end < event_start:
        event_end = event_start
    # HA all-day event end dates are often exclusive; include start-only single-day holidays correctly.
    if _is_all_day_event(event, start_value) and event_end > event_start:
        event_end -= timedelta(days=1)

    dates: set[date] = set()
    current = max(event_start, start)
    last = min(event_end, end)
    while current <= last:
        dates.add(current)
        current += timedelta(days=1)
    return dates


def _parse_event_date(value: Any) -> date | None:
    """Parse Home Assistant calendar date/dateTime values."""
    if isinstance(value, dict):
        value = value.get("dateTime") or value.get("date")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def _is_all_day_event(event: dict[str, Any], start_value: Any) -> bool:
    """Return whether a Home Assistant event represents an all-day calendar entry."""
    if event.get("all_day"):
        return True
    if isinstance(start_value, dict):
        return "date" in start_value and "dateTime" not in start_value
    return isinstance(start_value, str) and len(start_value) == 10
