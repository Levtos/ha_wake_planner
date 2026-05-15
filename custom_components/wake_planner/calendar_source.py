"""Calendar sources for Wake Planner."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
import logging
import re
from typing import Any
from urllib.request import Request, urlopen
import base64
import xml.etree.ElementTree as ET

from homeassistant.core import HomeAssistant

from .const import CalendarDecision, DEFAULT_CALENDAR_WAKE_PATTERN
from .rule_engine import parse_time

_LOGGER = logging.getLogger(__name__)

@dataclass(slots=True)
class CalendarSourceStatus:
    """Current health of configured calendar sources."""

    ha_calendar: str = "not_configured"
    caldav: str = "not_configured"


class CalendarSource:
    """Fetch and parse HA calendar and optional CalDAV events."""

    def __init__(
        self,
        hass: HomeAssistant,
        *,
        calendar_entity_id: str | None,
        caldav_url: str | None,
        caldav_username: str | None,
        caldav_password: str | None,
        wake_pattern: str,
        skip_titles: list[str],
    ) -> None:
        self.hass = hass
        self.calendar_entity_id = calendar_entity_id
        self.caldav_url = caldav_url
        self.caldav_username = caldav_username
        self.caldav_password = caldav_password
        self.wake_re = re.compile(wake_pattern or DEFAULT_CALENDAR_WAKE_PATTERN, re.IGNORECASE)
        self.skip_titles = [title.strip().lower() for title in skip_titles if title.strip()]
        self.status = CalendarSourceStatus()

    async def async_get_decisions(self, person_slugs: list[str], start: datetime, end: datetime) -> dict[tuple[str, date], CalendarDecision]:
        """Return calendar-derived decisions for each person/date."""
        decisions: dict[tuple[str, date], CalendarDecision] = {}
        events: list[dict[str, Any]] = []
        events.extend(await self._async_get_ha_events(start, end))
        events.extend(await self._async_get_caldav_events(start, end))
        for event in events:
            summary = str(event.get("summary") or event.get("title") or "")
            event_date = self._event_date(event, start.date())
            decision = self._parse_summary(summary, bool(event.get("all_day")))
            if decision is None:
                continue
            for slug in person_slugs:
                decisions[(slug, event_date)] = decision
        return decisions

    async def _async_get_ha_events(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        if not self.calendar_entity_id:
            self.status.ha_calendar = "not_configured"
            return []
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {"entity_id": self.calendar_entity_id, "start_date_time": start.isoformat(), "end_date_time": end.isoformat()},
                blocking=True,
                return_response=True,
            )
            self.status.ha_calendar = "ok"
        except Exception as err:  # noqa: BLE001 - source health must not break coordinator
            self.status.ha_calendar = "error"
            _LOGGER.debug("HA calendar fetch failed: %s", err)
            return []
        entity_payload = (response or {}).get(self.calendar_entity_id, {})
        return list(entity_payload.get("events", []))

    async def _async_get_caldav_events(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        if not self.caldav_url:
            self.status.caldav = "not_configured"
            return []
        try:
            text = await self.hass.async_add_executor_job(self._fetch_caldav, start, end)
            self.status.caldav = "ok"
            return self._parse_caldav_response(text)
        except Exception as err:  # noqa: BLE001 - source health must not break coordinator
            self.status.caldav = "error"
            _LOGGER.debug("CalDAV fetch failed: %s", err)
            return []

    def _fetch_caldav(self, start: datetime, end: datetime) -> str:
        body = f'''<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
    <C:time-range start="{start.strftime('%Y%m%dT%H%M%SZ')}" end="{end.strftime('%Y%m%dT%H%M%SZ')}"/>
  </C:comp-filter></C:comp-filter></C:filter>
</C:calendar-query>'''
        headers = {"Depth": "1", "Content-Type": "application/xml; charset=utf-8"}
        if self.caldav_username and self.caldav_password:
            token = base64.b64encode(f"{self.caldav_username}:{self.caldav_password}".encode()).decode()
            headers["Authorization"] = f"Basic {token}"
        request = Request(self.caldav_url, data=body.encode(), headers=headers, method="REPORT")
        with urlopen(request, timeout=20) as response:  # noqa: S310 - user-configured local/remote CalDAV URL
            return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")

    def _parse_caldav_response(self, text: str) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        try:
            root = ET.fromstring(text)
            calendar_data = [node.text or "" for node in root.iter() if node.tag.endswith("calendar-data")]
        except ET.ParseError:
            calendar_data = [text]
        for ical in calendar_data:
            summary = None
            dtstart = None
            all_day = False
            for line in ical.splitlines():
                if line.startswith("SUMMARY"):
                    summary = line.split(":", 1)[-1].replace("\\,", ",")
                if line.startswith("DTSTART"):
                    key, value = line.split(":", 1)
                    all_day = "VALUE=DATE" in key or len(value.strip()) == 8
                    dtstart = value.strip()
            if summary:
                event_date = self._parse_ical_date(dtstart) if dtstart else None
                events.append({"summary": summary, "start": event_date.isoformat() if event_date else None, "all_day": all_day})
        return events

    def _parse_summary(self, summary: str, all_day: bool) -> CalendarDecision | None:
        normalized = summary.strip().lower()
        if all_day and normalized in self.skip_titles:
            return CalendarDecision(skip=True, summary=summary, source="calendar")
        match = self.wake_re.search(summary)
        if not match:
            return None
        value = match.groupdict().get("time") if match.groupdict() else match.group(1)
        try:
            wake = parse_time(value)
        except ValueError:
            return None
        return CalendarDecision(wake_time=wake, summary=summary, source="calendar")

    def _event_date(self, event: dict[str, Any], fallback: date) -> date:
        raw = event.get("start") or event.get("start_time") or event.get("date")
        if isinstance(raw, dict):
            raw = raw.get("dateTime") or raw.get("date")
        if isinstance(raw, str):
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
            except ValueError:
                try:
                    return date.fromisoformat(raw[:10])
                except ValueError:
                    return fallback
        return fallback

    def _parse_ical_date(self, value: str | None) -> date | None:
        if not value:
            return None
        if len(value) == 8:
            return datetime.strptime(value, "%Y%m%d").date()
        return datetime.strptime(value[:15], "%Y%m%dT%H%M%S").date()
