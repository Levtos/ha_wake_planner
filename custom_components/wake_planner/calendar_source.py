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


def _unfold(text: str) -> str:
    """RFC 5545 §3.1: unfold lines (CRLF + whitespace → continuation)."""
    return re.sub(r"\r?\n[ \t]", "", text)


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
        self.calendar_entity_id = calendar_entity_id or None
        self.caldav_url = caldav_url or None
        self.caldav_username = caldav_username or None
        self.caldav_password = caldav_password or None
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
        """Parse a CalDAV REPORT response into a list of event dicts.

        Handles RFC 5545 line folding, DTSTART VALUE=DATE/TZID forms,
        RRULE expansion, and EXDATE exclusions.
        """
        events: list[dict[str, Any]] = []
        try:
            root = ET.fromstring(text)
            calendar_data_blocks = [
                node.text or "" for node in root.iter() if node.tag.endswith("calendar-data")
            ]
        except ET.ParseError:
            calendar_data_blocks = [text]

        for ical in calendar_data_blocks:
            ical = _unfold(ical)
            vevent_blocks = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", ical, re.DOTALL)
            for block in vevent_blocks:
                event = self._parse_vevent_block(block)
                if event:
                    occurrences = event.pop("_rrule_occurrences", None)
                    if occurrences:
                        for occ_date in occurrences:
                            occ_event = dict(event)
                            occ_event["start"] = occ_date
                            events.append(occ_event)
                    else:
                        events.append(event)
        return events

    def _parse_vevent_block(self, block: str) -> dict[str, Any] | None:
        """Parse a single VEVENT block into an event dict, expanding RRULE if present."""
        props: dict[str, list[tuple[str, str]]] = {}

        for line in block.splitlines():
            if ":" not in line:
                continue
            key_part, _, value = line.partition(":")
            name, _, params = key_part.partition(";")
            props.setdefault(name.strip().upper(), []).append((params.strip(), value.strip()))

        _, summary = (props.get("SUMMARY") or [("", "")])[-1]
        summary = summary.replace("\\,", ",").replace("\\n", "\n").replace("\\;", ";")
        if not summary:
            return None

        dtstart_params, dtstart_raw = (props.get("DTSTART") or [("", "")])[-1]
        all_day = "VALUE=DATE" in dtstart_params or (len(dtstart_raw) == 8 and dtstart_raw.isdigit())

        start_date = self._parse_ical_date(dtstart_raw, all_day)
        if start_date is None:
            return None

        exdates: set[date] = set()
        for ex_params, ex_value in props.get("EXDATE", []):
            ex_all_day = "VALUE=DATE" in ex_params
            for ex_raw in ex_value.split(","):
                ex_raw = ex_raw.strip()
                ex_d = self._parse_ical_date(
                    ex_raw, ex_all_day or (len(ex_raw) == 8 and ex_raw.isdigit())
                )
                if ex_d:
                    exdates.add(ex_d)

        base_event = {"summary": summary, "start": start_date.isoformat(), "all_day": all_day}

        _, rrule_value = (props.get("RRULE") or [("", "")])[-1]
        if not rrule_value:
            return base_event if start_date not in exdates else None

        occurrences = self._expand_rrule(start_date, rrule_value, exdates)
        if not occurrences:
            return None

        result = dict(base_event)
        result["_rrule_occurrences"] = [occurrence.isoformat() for occurrence in occurrences]
        return result

    def _expand_rrule(
        self, start: date, rrule_value: str, exdates: set[date], horizon_days: int = 60
    ) -> list[date]:
        """Expand a minimal RRULE string into concrete dates within a rolling horizon."""
        today = date.today()
        until = today + timedelta(days=horizon_days)

        rules: dict[str, str] = {}
        for part in rrule_value.split(";"):
            if "=" in part:
                key, _, value = part.partition("=")
                rules[key.upper()] = value.upper()

        freq = rules.get("FREQ", "")
        try:
            interval = max(1, int(rules.get("INTERVAL", "1")))
        except ValueError:
            interval = 1
        byday = rules.get("BYDAY", "")

        day_map = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
        byday_nums: set[int] = set()
        if byday:
            for part in byday.split(","):
                abbr = re.sub(r"^[-+]?\d*", "", part.strip())
                if abbr in day_map:
                    byday_nums.add(day_map[abbr])

        occurrences: list[date] = []
        current = start
        max_iterations = 3650
        iterations = 0
        while current <= until and iterations < max_iterations:
            iterations += 1
            if current >= today and current not in exdates:
                if not byday_nums or current.weekday() in byday_nums:
                    occurrences.append(current)

            if freq == "DAILY":
                current += timedelta(days=interval)
            elif freq == "WEEKLY":
                if byday_nums:
                    current += timedelta(days=1)
                else:
                    current += timedelta(weeks=interval)
            elif freq == "MONTHLY":
                month = current.month - 1 + interval
                year = current.year + month // 12
                month = month % 12 + 1
                day = min(current.day, [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                current = current.replace(year=year, month=month, day=day)
            elif freq == "YEARLY":
                current = current.replace(year=current.year + interval)
            else:
                break

        return occurrences

    def _parse_ical_date(self, value: str | None, all_day: bool = False) -> date | None:
        """Parse an iCal date/datetime string to a date object."""
        if not value:
            return None
        value = value.strip().split(",")[0]

        if len(value) == 8 and value.isdigit():
            try:
                return datetime.strptime(value, "%Y%m%d").date()
            except ValueError:
                return None

        clean = re.sub(r"[Z+\-]\d{4}$", "", value)
        clean = clean.rstrip("Z")
        clean = clean[:15]

        for date_format in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M", "%Y%m%d"):
            try:
                return datetime.strptime(clean, date_format).date()
            except ValueError:
                continue
        return None

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

