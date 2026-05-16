"""DataUpdateCoordinator for Wake Planner."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .calendar_source import CalendarSource
from .const import (
    CONF_CALDAV_PASSWORD,
    CONF_CALDAV_URL,
    CONF_CALDAV_USERNAME,
    CONF_CALENDAR_ENTITY_ID,
    CONF_CALENDAR_SKIP_TITLES,
    CONF_CALENDAR_WAKE_PATTERN,
    CONF_HOLIDAY_BEHAVIOR,
    CONF_MANUAL_HOLIDAY_DATES,
    CONF_PERSONS,
    CONF_SLUG,
    CONF_HOLIDAY_CALENDAR_ENTITY_ID,
    DEFAULT_CALENDAR_SKIP_TITLES,
    DEFAULT_CALENDAR_WAKE_PATTERN,
    DOMAIN,
    HOLIDAY_SKIP,
    STORAGE_KEY,
    STORAGE_VERSION,
    PersonConfig,
    RuntimePersonState,
    WakeDecision,
)
from .holiday_source import async_holiday_map
from .rule_engine import RuleEngine, parse_date, parse_time
from .util import persons_from_entry

_LOGGER = logging.getLogger(__name__)

class WakePlannerCoordinator(DataUpdateCoordinator[dict[str, WakeDecision]]):
    """Coordinate wake decisions and persisted runtime state."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{entry.entry_id}",
            update_interval=timedelta(seconds=60),
        )
        self.entry = entry
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry.entry_id}")
        self.runtime_states: dict[str, RuntimePersonState] = {}
        self.sleep_log: dict[str, list[dict[str, str]]] = {}
        self.persons: list[PersonConfig] = persons_from_entry(entry)
        self.calendar_source = self._build_calendar_source()
        self.last_update_iso: str | None = None
        self.next_wakes: dict[str, datetime | None] = {}

    async def async_load(self) -> None:
        """Load persisted runtime state."""
        stored = await self.store.async_load() or {}
        for slug, raw in (stored.get("runtime_states") or {}).items():
            self.runtime_states[slug] = RuntimePersonState(
                skip_next=bool(raw.get("skip_next")),
                override_time=parse_time(raw["override_time"]) if raw.get("override_time") else None,
                override_until=parse_date(raw.get("override_until")),
                sleep_log=list(raw.get("sleep_log") or []),
            )
        for person in self.persons:
            self.runtime_states.setdefault(person.slug, RuntimePersonState())

    async def async_save(self) -> None:
        """Persist runtime state."""
        payload: dict[str, Any] = {"runtime_states": {}}
        for slug, state in self.runtime_states.items():
            payload["runtime_states"][slug] = {
                "skip_next": state.skip_next,
                "override_time": state.override_time.strftime("%H:%M") if state.override_time else None,
                "override_until": state.override_until.isoformat() if state.override_until else None,
                "sleep_log": state.sleep_log[-90:],
            }
        await self.store.async_save(payload)

    async def _async_update_data(self) -> dict[str, WakeDecision]:
        self.persons = persons_from_entry(self.entry)
        for person in self.persons:
            self.runtime_states.setdefault(person.slug, RuntimePersonState())
        self.calendar_source = self._build_calendar_source()
        now = dt_util.now()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        calendar_decisions = await self.calendar_source.async_get_decisions(
            [person.slug for person in self.persons], start, start + timedelta(days=14)
        )
        holiday_map = await async_holiday_map(
            self.hass,
            self.options.get(CONF_HOLIDAY_CALENDAR_ENTITY_ID),
            start.date(),
            (start + timedelta(days=14)).date(),
            self.options.get(CONF_MANUAL_HOLIDAY_DATES),
        )
        engine = RuleEngine(
            runtime_states=self.runtime_states,
            calendar_decisions=calendar_decisions,
            holiday_by_date=holiday_map,
            holiday_behavior=self.options.get(CONF_HOLIDAY_BEHAVIOR, HOLIDAY_SKIP),
        )
        data = {person.slug: engine.decide(person, now) for person in self.persons}
        self.next_wakes = {person.slug: engine.next_wake(person, now) for person in self.persons}
        for slug, next_wake in self.next_wakes.items():
            if slug in data:
                data[slug].next_wake = next_wake
        self.last_update_iso = now.isoformat()
        return data

    @property
    def options(self) -> dict[str, Any]:
        """Merged entry data and options."""
        return {**self.entry.data, **self.entry.options}

    async def async_skip_next(self, person_id: str) -> None:
        """Skip the next wake for a person."""
        state = self._runtime_for(person_id)
        state.skip_next = True
        await self.async_save()
        await self.async_request_refresh()

    async def async_set_override(self, person_id: str, wake_time: str, until: str | date | None) -> None:
        """Set a manual override for a person."""
        state = self._runtime_for(person_id)
        state.override_time = parse_time(wake_time)
        state.override_until = until if isinstance(until, date) else parse_date(until)
        await self.async_save()
        await self.async_request_refresh()

    async def async_clear_override(self, person_id: str) -> None:
        """Clear a person's override."""
        state = self._runtime_for(person_id)
        state.override_time = None
        state.override_until = None
        state.skip_next = False
        await self.async_save()
        await self.async_request_refresh()

    async def async_log_sleep(self, person_id: str, sleep_time: str, wake_time: str) -> None:
        """Append a sleep log entry."""
        state = self._runtime_for(person_id)
        entry = {"sleep_time": sleep_time, "wake_time": wake_time, "logged_at": dt_util.utcnow().isoformat()}
        state.sleep_log = [*state.sleep_log, entry][-90:]
        await self.async_save()
        await self.async_request_refresh()

    def sleep_average_hours(self, person_id: str) -> float | None:
        """Return average sleep duration for the last 30 log entries/days."""
        state = self.runtime_states.get(person_id)
        if not state or not state.sleep_log:
            return None
        durations: list[float] = []
        for item in state.sleep_log[-30:]:
            try:
                sleep = datetime.fromisoformat(item["sleep_time"])
                wake = datetime.fromisoformat(item["wake_time"])
            except (KeyError, ValueError):
                continue
            duration = (wake - sleep).total_seconds() / 3600
            if duration < 0:
                duration += 24
            durations.append(duration)
        return round(sum(durations) / len(durations), 2) if durations else None

    def suggested_bedtime(self, person: PersonConfig) -> datetime | None:
        """Calculate suggested bedtime from target sleep duration and next wake."""
        next_wake = self.next_wakes.get(person.slug)
        if not next_wake:
            return None
        return next_wake - timedelta(hours=person.target_sleep_hours)

    def _runtime_for(self, person_id: str) -> RuntimePersonState:
        if person_id not in {person.slug for person in self.persons}:
            raise ValueError(f"Unknown Wake Planner person_id: {person_id}")
        return self.runtime_states.setdefault(person_id, RuntimePersonState())

    def _build_calendar_source(self) -> CalendarSource:
        options = self.options
        skip_titles = str(options.get(CONF_CALENDAR_SKIP_TITLES, DEFAULT_CALENDAR_SKIP_TITLES)).split(",")
        return CalendarSource(
            self.hass,
            calendar_entity_id=options.get(CONF_CALENDAR_ENTITY_ID),
            caldav_url=options.get(CONF_CALDAV_URL),
            caldav_username=options.get(CONF_CALDAV_USERNAME),
            caldav_password=options.get(CONF_CALDAV_PASSWORD),
            wake_pattern=options.get(CONF_CALENDAR_WAKE_PATTERN, DEFAULT_CALENDAR_WAKE_PATTERN),
            skip_titles=skip_titles,
        )
