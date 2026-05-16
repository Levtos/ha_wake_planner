# Wake Planner schedule model notes

This document records the intended direction for Wake Planner beyond the current
basic weekly profile.

## Current behavior

- One config entry can contain one or more people.
- Each person currently has one weekly profile with active days and wake times.
- Calendar events can override a wake time when an event title contains a wake
  marker such as `wake: 06:30`.
- All-day holiday/vacation calendar events and manually configured dates can
  apply the selected holiday behavior.
- `wake_window_minutes` only controls the active window of the `wake_needed`
  binary sensor around the calculated wake time. It does **not** automatically
  move the wake time when someone goes to bed later.

## Desired future flexibility

The weekly profile is too rigid for shift workers and rotating schedules. A
future model should support multiple named profiles/rules per person, for
example:

- Office week: Monday-Friday at 07:00.
- Weekend / holiday profile: disabled or later wake time.
- Shift cycle: repeat every 4, 6, or 8 days.
- Alternating weeks: week A / week B patterns.
- Monthly or calendar-date rules.
- Priority ordering so a vacation rule can override a regular weekly rule, and a
  one-off manual override can override everything.

## Suggested rule priority

1. Manual service override / skip.
2. One-off date rules.
3. Vacation / holiday calendar or manual holiday dates.
4. Rotating shift-cycle rules.
5. Weekly default profile.
6. Fallback inactive/no wake.

This should be implemented as a separate feature because it changes the data
model and migration story, not just the config-flow UI.
