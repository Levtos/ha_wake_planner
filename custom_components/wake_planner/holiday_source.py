"""Holiday source helpers using weekends and optional HA holiday calendars."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
import logging

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


class HolidaySource:
    """Read full-day holiday events from a Home Assistant calendar entity."""

    def __init__(self, hass: HomeAssistant, holiday_calendar_entity_id: str | None) -> None:
        self.hass = hass
        self.entity_id = holiday_calendar_entity_id or None

    async def is_holiday(self, check_date: date) -> bool:
        """Return true if check_date has a full-day event in the holiday calendar."""
        if not self.entity_id:
            return False
        start = datetime.combine(check_date, time.min)
        end = datetime.combine(check_date, time.max)
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": self.entity_id,
                    "start_date_time": start.isoformat(),
                    "end_date_time": end.isoformat(),
                },
                blocking=True,
                return_response=True,
            )
        except Exception as err:  # noqa: BLE001 - holiday source must not break coordinator
            _LOGGER.debug("Holiday calendar fetch failed for %s: %s", self.entity_id, err)
            return False
        events = (response or {}).get(self.entity_id, {}).get("events", [])
        return any(event.get("all_day") for event in events)


async def async_holiday_map(
    hass: HomeAssistant,
    holiday_calendar_entity_id: str | None,
    start: date,
    end: date,
) -> dict[date, tuple[bool, str | None]]:
    """Build a date keyed holiday map from weekends and optional holiday calendar events."""
    source = HolidaySource(hass, holiday_calendar_entity_id)
    holidays: dict[date, tuple[bool, str | None]] = {}
    current = start
    while current <= end:
        if current.weekday() >= 5:
            holidays[current] = (True, "Weekend")
        elif await source.is_holiday(current):
            holidays[current] = (True, "Holiday calendar")
        current += timedelta(days=1)
    return holidays
