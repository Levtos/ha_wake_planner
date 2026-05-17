# Wake Planner

A Home Assistant custom integration that answers a single question for every
person in your household: **when do I need to get up next?**

The integration exposes per-person sensors (`next_wake`, `wake_state`,
`wake_needed`) you can hook into any automation, and a sidebar panel where all
rules are managed live.

## Setup

1. Install via HACS (or copy `custom_components/wake_planner` into your config).
2. Restart Home Assistant.
3. **Settings → Devices & Services → Add Integration → Wake Planner.**
   The setup wizard only asks for two (optional) calendars. Everything else
   lives in the sidebar panel.
4. Open the **Wake Planner** entry in the sidebar to add people and rules.

## Rules

Each person has an ordered list of rules. The engine evaluates them in
**priority** order (lowest number first) — the first matching rule wins.
Each rule has:

- An **action**: wake at `HH:MM`, or skip the day.
- Optional **conditions** (all AND'd, unset = ignored):
  - **Weekdays** (any subset of Mon–Sun)
  - **Date range** (from / to, inclusive)
  - **Every N weeks** plus a week anchor — e.g. *every 2nd Monday*
  - **Specific dates** (list of one-offs)
  - **Cycle slot** — anchor, total cycle length, slot start day, slot length
    (covers any rotating shift system)

Examples you can build entirely from the panel:

- "Mon–Fri 07:00, Sat 09:00, Sun off" → three rules
- "Every second Monday 08:30 instead of 07:00" → one extra higher-priority
  rule with weekdays={Mon}, week_interval=2, anchor=any Monday in that week
- "Holidays 2026-07-01..14 skipped" → one rule with date range + action=skip
- Shift cycle "6 days early shift + 4 days off, repeat" → two rules using the
  cycle fields

## Calendar overrides

If you configure a wake calendar, events whose title contains
`wake: HH:MM` override that day's rule. All-day events with titles like
`no-wake` or `schlaf aus` skip the day. Wake Planner only **reads** from
the calendar — it never creates or modifies events. To change a wake
time for a specific day, either edit the calendar event title or use the
**Override** button in the panel.

## Holiday handling

Configure a separate holiday calendar (all-day events) and/or paste manual
dates (`YYYY-MM-DD`, `MM-DD` for yearly, ranges with `..`, comma separated).
The global behaviour decides whether holidays *skip* the wake or fall back
to the **Saturday** rule.

## Entities (per person)

- `sensor.wake_planner_<slug>_wake_state` — current state + matched rule details
- `sensor.wake_planner_<slug>_next_wake` — next planned wake (timestamp)
- `binary_sensor.wake_planner_<slug>_wake_needed` — `on` during the
  configurable wake window around the wake time

## Events

`wake_planner_wake_triggered` fires once when a person's wake window opens
(payload: `person_id`, `name`, `wake_time`, `decided_by`, `matched_rule_id`).
Use it as an automation trigger.

## Services

`skip_next`, `set_override`, `clear_override`, `add_person`, `remove_person`,
`set_rules`, `set_special_rules` — see *Developer Tools → Services* for
schemas. Everything they do is also available from the panel.
