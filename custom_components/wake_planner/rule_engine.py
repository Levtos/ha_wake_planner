"""Rule evaluation for Wake Planner."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
import logging

from .const import (
    DAYS,
    HOLIDAY_SKIP,
    HOLIDAY_WEEKEND_PROFILE,
    WEEKEND_DAYS,
    CalendarDecision,
    PersonConfig,
    RuntimePersonState,
    WakeDecision,
    WakeState,
)

_LOGGER = logging.getLogger(__name__)


def parse_time(value: str) -> time:
    """Parse a HH:MM time string."""
    hour, minute = value.strip().split(":", 1)
    parsed = time(int(hour), int(minute))
    if parsed.hour > 23:
        raise ValueError("hour must be between 0 and 23")
    return parsed


def parse_date(value: str | None) -> date | None:
    """Parse an ISO date string when present."""
    if not value:
        return None
    return date.fromisoformat(value)


def format_time(value: time | None) -> str | None:
    """Format a time for entity state/attributes."""
    return value.strftime("%H:%M") if value else None


class RuleEngine:
    """Evaluate the configured wake priority cascade."""

    def __init__(
        self,
        *,
        runtime_states: dict[str, RuntimePersonState],
        calendar_decisions: dict[tuple[str, date], CalendarDecision],
        holiday_by_date: dict[date, tuple[bool, str | None]],
        holiday_behavior: str,
    ) -> None:
        """Initialise the engine with current source data."""
        self._runtime_states = runtime_states
        self._calendar_decisions = calendar_decisions
        self._holiday_by_date = holiday_by_date
        self._holiday_behavior = holiday_behavior

    def decide(self, person: PersonConfig, now: datetime) -> WakeDecision:
        """Decide whether and when a person should wake today."""
        decision = self._decide_for_date(person, now.date(), now)
        _LOGGER.debug(
            "Wake decision for %s at %s: %s",
            person.slug,
            now.isoformat(),
            decision.as_dict(),
        )
        return decision

    def next_wake(self, person: PersonConfig, now: datetime, days: int = 14) -> datetime | None:
        """Find the next scheduled or overridden wake datetime."""
        for offset in range(days + 1):
            candidate_date = now.date() + timedelta(days=offset)
            decision = self._decide_for_date(person, candidate_date, now)
            if decision.wake_time is None or decision.state in {WakeState.SKIPPED, WakeState.HOLIDAY, WakeState.INACTIVE}:
                continue
            candidate = datetime.combine(candidate_date, decision.wake_time, tzinfo=now.tzinfo)
            if candidate >= now:
                return candidate
        return None

    def _decide_for_date(self, person: PersonConfig, day: date, now: datetime) -> WakeDecision:
        runtime = self._runtime_states.setdefault(person.slug, RuntimePersonState())
        profile_day = DAYS[day.weekday()]
        active_override = runtime.override_time is not None and (
            runtime.override_until is None or runtime.override_until >= day
        )
        if active_override:
            return self._build_decision(
                person,
                day,
                runtime.override_time,
                now.tzinfo,
                WakeState.OVERRIDDEN,
                "override",
                f"Manual override: {runtime.override_time.strftime('%H:%M')}",
                profile_day,
                skip_active=runtime.skip_next,
                override_until=runtime.override_until,
            )

        if runtime.skip_next and day == now.date():
            return WakeDecision(
                wake_time=None,
                state=WakeState.SKIPPED,
                decided_by="override",
                reason="Next wake skipped manually",
                profile_day=profile_day,
                skip_active=True,
            )

        calendar = self._calendar_decisions.get((person.slug, day))
        if calendar and calendar.skip:
            return WakeDecision(
                wake_time=None,
                state=WakeState.SKIPPED,
                decided_by="calendar",
                reason=f"Calendar skip marker: {calendar.summary or 'all-day event'}",
                profile_day=profile_day,
                skip_active=runtime.skip_next,
            )
        if calendar and calendar.wake_time:
            return self._build_decision(
                person,
                day,
                calendar.wake_time,
                now.tzinfo,
                WakeState.SCHEDULED,
                "calendar",
                f"Calendar event: {calendar.summary or calendar.wake_time.strftime('%H:%M')}",
                profile_day,
                skip_active=runtime.skip_next,
            )

        is_holiday, holiday_name = self._holiday_by_date.get(day, (False, None))
        if is_holiday:
            if self._holiday_behavior == HOLIDAY_SKIP:
                return WakeDecision(
                    wake_time=None,
                    state=WakeState.HOLIDAY,
                    decided_by="holiday",
                    reason=holiday_name or "Workday sensor is off",
                    profile_day=profile_day,
                    holiday_name=holiday_name,
                    skip_active=runtime.skip_next,
                )
            if self._holiday_behavior == HOLIDAY_WEEKEND_PROFILE and profile_day not in WEEKEND_DAYS:
                profile_day = "saturday"

        profile = person.weekly_profile.get(profile_day)
        if profile is None or not profile.active:
            return WakeDecision(
                wake_time=None,
                state=WakeState.INACTIVE,
                decided_by="weekly_profile",
                reason=f"{profile_day.title()} profile inactive",
                profile_day=profile_day,
                holiday_name=holiday_name,
                skip_active=runtime.skip_next,
            )

        return self._build_decision(
            person,
            day,
            profile.wake_time,
            now.tzinfo,
            WakeState.SCHEDULED,
            "weekly_profile",
            f"{profile_day.title()} profile: {profile.wake_time.strftime('%H:%M')}",
            profile_day,
            holiday_name=holiday_name,
            skip_active=runtime.skip_next,
        )

    def _build_decision(
        self,
        person: PersonConfig,
        day: date,
        wake_time: time,
        tzinfo,
        state: WakeState,
        decided_by: str,
        reason: str,
        profile_day: str,
        *,
        holiday_name: str | None = None,
        skip_active: bool = False,
        override_until: date | None = None,
    ) -> WakeDecision:
        wake_dt = datetime.combine(day, wake_time, tzinfo=tzinfo)
        window = timedelta(minutes=person.wake_window_minutes)
        return WakeDecision(
            wake_time=wake_time,
            state=state,
            decided_by=decided_by,
            reason=reason,
            profile_day=profile_day,
            holiday_name=holiday_name,
            skip_active=skip_active,
            override_until=override_until,
            next_wake=wake_dt,
            wake_window_start=wake_dt - window,
            wake_window_end=wake_dt + window,
        )
