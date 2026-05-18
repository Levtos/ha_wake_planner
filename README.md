# Wake Planner

A Home Assistant custom integration that answers a single question for every
person in your household: **when do I need to get up next?**

Wake Planner exposes a per-person `next_wake` timestamp sensor, a `wake_state`
sensor with rule metadata, and a `wake_needed` binary sensor that switches
on during the configurable wake window. Schedules are built from a flexible
rule engine and edited from a dedicated sidebar panel — no YAML, no
restarts.

---

## Table of contents

- [Installation](#installation)
- [Setup](#setup)
- [The sidebar panel](#the-sidebar-panel)
- [Rule engine](#rule-engine)
  - [Evaluation order](#evaluation-order)
  - [Rule fields reference](#rule-fields-reference)
  - [Recipes](#recipes)
- [Calendar integration](#calendar-integration)
- [Holidays](#holidays)
- [Entities](#entities)
- [Events](#events)
- [Services](#services)
- [WebSocket API](#websocket-api)
- [Automation examples](#automation-examples)
- [Multiple people](#multiple-people)
- [Migration from older versions](#migration-from-older-versions)
- [Troubleshooting](#troubleshooting)
- [Limitations & roadmap](#limitations--roadmap)
- [Development](#development)

---

## Installation

### Via HACS (recommended)

1. In HACS → Integrations, add this repository as a custom repository
   (category *Integration*).
2. Install **Wake Planner**.
3. Restart Home Assistant.

### Manual

Copy the `custom_components/wake_planner` folder into your Home Assistant
config directory (so the final path is `<config>/custom_components/wake_planner/`),
then restart Home Assistant.

---

## Setup

1. **Settings → Devices & Services → Add Integration → Wake Planner.**
2. The setup wizard asks for two **optional** calendars (you can leave both
   empty and configure them later from the panel):
   - **Wake calendar** — events with `wake: HH:MM` in the title will
     override that day's wake time, all-day events titled `no-wake` or
     `schlaf aus` will skip the day.
   - **Holiday calendar** — every all-day event on this calendar marks
     that date as a holiday for rule matching (`on_holiday` condition).
3. Open the **Wake Planner** entry in the sidebar.
4. Add your first person on the **People & rules** tab. A default rule
   *"Weekday mornings — Mon–Fri 07:00"* is created automatically; edit,
   replace or expand it as needed.

> The integration creates one device per person. Sensors are automatically
> grouped under that device in Home Assistant.

---

## The sidebar panel

The panel is the primary configuration UI. It is added automatically
when the integration loads and uses the WebSocket API for all reads and
writes — every change is immediately persisted.

Four tabs:

| Tab | Purpose |
|---|---|
| **Today** | Per-person card showing next wake time, day label, matched rule reason, and quick actions (Skip next, Override, Clear). Buttons turn green/orange when their state is active. |
| **14 days** | 7×2 calendar grid with the per-person decision for each day (incl. holidays). Non-wake calendar events for those days appear with their start time. |
| **People & rules** | Add/edit/delete people, link them to a `person.*` HA entity, configure their wake window, and edit the full rule list with weekday toggles + advanced conditions. |
| **Settings** | Pick wake & holiday calendars, set the fallback holiday behaviour and the manual holiday list. |

---

## Rule engine

Every person has an ordered list of **rules**. For a given date, the
engine evaluates the enabled rules in priority order (lowest priority
number first; ties broken by name) and the **first matching rule wins**.

### Evaluation order

For each day, decision-making proceeds top-down:

1. **Manual override** — if you set an override via the panel or the
   `set_override` service that covers this day, it wins outright.
2. **Skip next** — applies only to *today* if set.
3. **Calendar override** — an event with `wake: HH:MM` in the title
   forces that time; an all-day skip-title event skips the day.
4. **Rules** — evaluated in priority order with holiday awareness.
   The first rule whose conditions all match wins.
5. **Holiday fallback** — only used when **no rule matched** on a holiday:
   - `holiday_behavior = skip` → wake skipped, state = `holiday`.
   - `holiday_behavior = weekend_profile` → the highest-priority rule
     that includes Saturday is used instead.
6. **Inactive** — nothing matched, state = `inactive`.

### Rule fields reference

A rule has one action and any combination of conditions. Unset conditions
are ignored (they don't restrict matching).

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Free-form, used in the UI and `decided_by`. |
| `priority` | int (default 100) | Lower number = evaluated first. |
| `enabled` | bool | Disabled rules are skipped entirely. |
| **Action** | | |
| `action` | `"wake"` \| `"skip"` | Wake at the configured time, or skip the day. |
| `wake_time` | `HH:MM` | Required when `action = "wake"`. |
| **Conditions (AND-combined; unset = ignored)** | | |
| `weekdays` | set of `0..6` | 0=Mon … 6=Sun. Day must be in the set. |
| `date_from` / `date_to` | ISO date | Inclusive bounds. |
| `week_interval` | int ≥ 1 | Match every Nth week relative to `week_anchor`. |
| `week_anchor` | ISO date | A date inside the reference week 0. |
| `specific_dates` | list of ISO dates | Day must be in this list. |
| `cycle_anchor` | ISO date | Day 0 of a recurring cycle. |
| `cycle_length` | int ≥ 1 | Total cycle length in days. |
| `cycle_slot_start` | int 0…length-1 | First day of this rule's slot in the cycle. |
| `cycle_slot_length` | int ≥ 1 | Number of consecutive days the slot covers. |
| `on_holiday` | `true` \| `false` \| `null` | `true` = only on holidays, `false` = only on non-holidays, `null` = ignore. |

### Recipes

#### Office week

| Prio | Name | Weekdays | Action |
|---:|---|---|---|
| 100 | Workday | Mon–Fri | wake 07:00 |
| 100 | Weekend lie-in | Sat–Sun | wake 09:30 |

#### Skip every public holiday

Add the German (or your country's) holiday calendar as the holiday
calendar in Settings, then:

| Prio | Name | On holiday | Action |
|---:|---|---|---|
| 10 | Holiday off | only on holidays | skip |
| 100 | Workday | Mon–Fri | wake 07:00 |

Holiday-off has lower priority number → it wins on holidays. On normal
days it doesn't match (no holiday) so the workday rule applies.

#### Every second Monday late

Bi-weekly late-shift Mondays at 08:30, otherwise 07:00:

| Prio | Name | Weekdays | Every N weeks | Week anchor | Action |
|---:|---|---|---|---|---|
| 10 | Bi-weekly late | Mon | 2 | a Monday in your week 0 | wake 08:30 |
| 100 | Workday | Mon–Fri | – | – | wake 07:00 |

#### Fixed vacation

Skip a holiday week entirely:

| Prio | Name | Date from | Date to | Action |
|---:|---|---|---|---|
| 5 | Sommer 2026 | 2026-07-01 | 2026-07-14 | skip |

#### Rotating 6-on / 4-off shift cycle

10-day cycle, days 0–5 early shift, days 6–9 off, anchored to 2026-01-05:

| Prio | Name | Cycle anchor | Cycle length | Slot start | Slot length | Action |
|---:|---|---|---|---|---|---|
| 50 | Early shift | 2026-01-05 | 10 | 0 | 6 | wake 05:30 |
| 50 | Off | 2026-01-05 | 10 | 6 | 4 | skip |

#### One-off appointment

Doctor at 06:00 on a single date:

| Prio | Name | Specific dates | Action |
|---:|---|---|---|
| 1 | Doctor | 2026-06-15 | wake 06:00 |

---

## Calendar integration

Wake Planner only **reads** from calendars. It never writes back, creates
or modifies events.

### Wake calendar

Optional. Events whose title contains `wake: HH:MM` (case-insensitive)
override the rule decision for that day. The regex is configurable
internally but defaults to:

```
(?:wake:\s*)?(?P<time>[0-2]?\d:[0-5]\d)
```

All-day events whose title (lower-cased) is in the configured skip-titles
list (`no-wake,schlaf aus` by default) skip the day.

Practical workflow: an event titled `wake: 09:00` in your normal calendar
on the day you have a late appointment will automatically push the wake
time without touching the Wake Planner UI. Edit the calendar event title
to a different time and Wake Planner picks it up on the next refresh.

### Holiday calendar

Optional. Every **all-day** event found in this calendar marks that date
as a holiday. Holiday-marked days do **not** automatically skip — the
behaviour is decided by your rules (`on_holiday: true/false` condition)
or, as a fallback, by the global *holiday behaviour* setting.

Examples of useful holiday calendar sources:

- The Home Assistant **Holiday** integration (built-in, country-aware).
- A subscribed iCal feed like the German `Feiertage` calendar.
- A custom local calendar with all-day events.

---

## Holidays

Three combinable sources:

- The configured **holiday calendar entity** — all-day events on it.
- **Manual dates** entered in *Settings → Manual holiday dates*. Supported
  formats (comma- or semicolon-separated):
  - `YYYY-MM-DD` — one-off
  - `YYYYMMDD` — one-off
  - `MM-DD` — yearly (e.g. `12-25`)
  - `MMDD` — yearly compact
  - Ranges with `..`, `/`, `to` or `bis`, e.g. `2026-07-01..2026-07-14`
- **Weekends** — Saturday and Sunday are always considered holidays for
  matching purposes (so `on_holiday: true` rules trigger on weekends
  unless overridden by another rule).

The global **Behaviour** dropdown only takes effect when no rule explicitly
handles the holiday:

- `Skip wake` — default; the day's state becomes `holiday`.
- `Use weekend (Saturday) rule` — the highest-priority enabled rule that
  includes Saturday is applied as fallback. Useful if your Saturday rule
  already represents your "sleep in" time.

---

## Entities

For each person Wake Planner creates one device with three entities. The
slug is auto-derived from the name (lowercased, ASCII-only) and is
visible on the person card.

### `sensor.wake_planner_<slug>_wake_state`

State is one of `scheduled`, `skipped`, `overridden`, `holiday`, `inactive`.

Attributes:

| Attribute | Description |
|---|---|
| `wake_time` | `HH:MM` of the upcoming wake, if any |
| `reason` | Human-readable explanation (e.g. `Rule 'Workday': 07:00`) |
| `decided_by` | `override`, `calendar`, `holiday`, `rule:<name>`, `holiday_fallback`, `no_rule` |
| `matched_rule_id` | UUID of the rule that won (when applicable) |
| `holiday_name` | Name of the holiday if today is one |
| `skip_active` | `true` when *Skip next* is queued |
| `override_until` | End date of an active override |
| `wake_window_start` / `wake_window_end` | ISO datetimes |
| `rules` | The full rule list (for diagnostics & the panel) |
| `wake_window_minutes` | Configured tolerance |
| `holiday_behavior`, `manual_holiday_dates` | Global config snapshot |
| `person_id` | The slug |

### `sensor.wake_planner_<slug>_next_wake`

A `device_class: timestamp` sensor: the next datetime (in HA's local
timezone) when the person should be woken, looking up to 30 days ahead.
Attributes mirror the relevant decision fields. Useful for dashboards
and `template:` automations.

### `binary_sensor.wake_planner_<slug>_wake_needed`

`on` whenever the current time is inside the wake window
(`wake_time ± wake_window_minutes`) and the day is in state `scheduled`
or `overridden`. `device_class: running`.

Use this as the dead-simple trigger for any "do the morning routine"
automation.

---

## Events

### `wake_planner_wake_triggered`

Fired **once** when a person's wake window first opens. De-duplication
key is `<person_id>:<window_start_iso>`, so re-evaluations during the
window do not re-fire. Payload:

```yaml
event_type: wake_planner_wake_triggered
data:
  person_id: benni
  name: Benni
  wake_time: "07:00"
  decided_by: "rule:Workday"
  matched_rule_id: 9c7f-...
```

Use it as an automation trigger when you want a single, edge-triggered
signal rather than polling the binary sensor.

---

## Services

All persistent state changes can also be performed via the panel — the
services are there for automations and scripts.

| Service | Purpose |
|---|---|
| `wake_planner.skip_next` | Skip *tomorrow's* wake for `person_id`. Cleared automatically after the day passes. |
| `wake_planner.set_override` | Force `wake_time` (HH:MM) for `person_id`, optionally with `until` date. Affects every day up to and including `until`. |
| `wake_planner.clear_override` | Remove both override and skip-next for a person. |
| `wake_planner.add_person` | Create a new person with a default rule. `name`, optional `person_entity_id`, optional `entry_id` if multiple Wake Planner entries exist. |
| `wake_planner.remove_person` | Delete a person (irreversible). |
| `wake_planner.set_rules` | Replace the full rule list of a person (advanced; the panel is friendlier). |
| `wake_planner.set_special_rules` | Update `holiday_behavior` and/or `manual_holiday_dates`. |

See **Developer Tools → Services → Wake Planner** for parameter
schemas and validators.

---

## WebSocket API

Used internally by the panel; also handy for custom Lovelace cards or
external clients. Every command returns the full state envelope on
success.

| Command | Payload |
|---|---|
| `wake_planner/get_state` | – |
| `wake_planner/get_schedule` | `days` (1–60, default 14) |
| `wake_planner/add_person` | `name`, optional `person_entity_id` |
| `wake_planner/remove_person` | `person_id` |
| `wake_planner/update_person` | `person_id`, any of `name`, `person_entity_id`, `wake_window_minutes` |
| `wake_planner/set_rules` | `person_id`, `rules` (list of rule dicts) |
| `wake_planner/set_global` | `holiday_behavior`, `manual_holiday_dates`, `calendar_entity_id`, `holiday_calendar_entity_id` |
| `wake_planner/skip_next` | `person_id` |
| `wake_planner/set_override` | `person_id`, `wake_time` (HH:MM), optional `until` (ISO date) |
| `wake_planner/clear_override` | `person_id` |

---

## Automation examples

### Wake routine using the binary sensor

```yaml
alias: Morning routine — Benni
trigger:
  - platform: state
    entity_id: binary_sensor.wake_planner_benni_wake_needed
    to: "on"
action:
  - service: light.turn_on
    target:
      area_id: bedroom
    data:
      brightness_pct: 40
      transition: 60
  - service: media_player.play_media
    target:
      entity_id: media_player.bedroom
    data:
      media_content_id: "spotify:playlist:wake"
      media_content_type: playlist
```

### One-shot event trigger

```yaml
alias: Tell me when wake fires
trigger:
  - platform: event
    event_type: wake_planner_wake_triggered
    event_data:
      person_id: benni
action:
  - service: notify.mobile_app_benni
    data:
      title: "Good morning"
      message: "Wake time {{ trigger.event.data.wake_time }} — rule {{ trigger.event.data.decided_by }}"
```

### Skip if not at home

```yaml
alias: Skip wake if away
trigger:
  - platform: time
    at: "22:00:00"
condition:
  - condition: state
    entity_id: person.benni
    state: not_home
action:
  - service: wake_planner.skip_next
    data:
      person_id: benni
```

### Show next wake on a dashboard

```yaml
type: entity
entity: sensor.wake_planner_benni_next_wake
name: Next wake
```

…or with a markdown card:

```yaml
type: markdown
content: |
  ### Next wake: {{ as_timestamp(states('sensor.wake_planner_benni_next_wake')) | timestamp_custom('%a %d.%m. %H:%M') }}
  {{ state_attr('sensor.wake_planner_benni_wake_state', 'reason') }}
```

---

## Multiple people

Wake Planner supports any number of people in a single config entry.
Each gets their own device, sensors, and rule list. The panel renders
one card per person on every tab.

Slugs are derived from the name and stay stable on rename — so
`person_id: benni` keeps working even if you change the display name to
"Benjamin" later.

Linking a person to a Home Assistant `person.*` entity is optional and
currently informational only.

---

## Migration from older versions

If you used Wake Planner before the rule-engine refactor, your existing
data is automatically migrated on first load:

- An old **weekly profile** becomes one rule per active weekday (priority 100).
- An old **shift cycle** becomes one rule per slot × weekday combination,
  carrying the cycle anchor and slot length into the new `cycle_*` rule
  fields (priority 50).

The legacy fields are left in storage untouched (for safety) but no
longer read. Once you're happy with the new rules you can delete and
re-create persons to clean things up, or simply leave them — the
migrated rules are normal rules you can edit freely.

The following older features were removed:

- **Sleep tracking** (`sleep_log`, `sleep_duration_avg`, `suggested_bedtime`)
  — moved out of scope; use a dedicated sleep-tracking integration if
  you need it.
- **CalDAV-direct** — bind your CalDAV calendar to Home Assistant via the
  built-in *CalDAV* integration and use it as a regular calendar entity.
- **Calendar write-back** — Wake Planner is now strictly read-only on
  calendars.

---

## Troubleshooting

### "No persons yet" after install

Expected — the setup wizard only configures the calendars. Open the
sidebar panel and click **People & rules → Add**.

### Sensors say `inactive` although I set up a rule

Check the rule's conditions; "unset" means *unrestricted*, but if you
toggled all weekdays off the rule will never match. Also confirm the
rule is **enabled** (toggle on the rule card).

### A holiday I added isn't applied

- Confirm it's listed under **Settings → Manual holiday dates**, or that
  the configured **Holiday calendar** has an *all-day* event on that date
  (timed events don't count).
- Inspect `sensor.wake_planner_<slug>_wake_state`'s attributes — the
  `holiday_name` attribute should show the source ("Manual holiday" /
  "Holiday calendar" / "Weekend").

### `wake: HH:MM` calendar event is ignored

- The event must be on the **wake calendar** configured in Settings, not
  any other calendar.
- It must fall within the next 30 days of the coordinator's lookahead.
- The pattern is case-insensitive but the time must be `HH:MM` (24-hour).

### The 14-day view doesn't match the Today badge

The 14-day view uses `wake_planner/get_schedule` which evaluates the
rule engine for each future day **with** holidays and calendar overrides
applied. The Today badge only reflects today. If they differ that's
correct — re-check tomorrow's rule matching for the discrepancy.

### Override I set yesterday is still active

Overrides without an `until` date only cover the day they were set on.
Overrides with an `until` date persist through that date inclusive. Use
**Clear** on the Today card to remove an override prematurely.

### Diagnostics

Settings → Devices & Services → Wake Planner → ⋮ → **Download diagnostics**
exports the loaded persons, current decisions, calendar source status
and runtime state. Useful when filing issues.

---

## Limitations & roadmap

- **One wake per day per person.** Night-shift workers who need to wake
  twice in 24 h (e.g. 22:00 + 14:00) aren't supported yet; this would
  require extending the rule model to a list of wake times. Planned but
  not committed.
- **Presence-based skip** (`person.*` linked) is informational only at the
  moment. A future `on_present` / `on_away` rule condition is on the
  list.
- **Calendar override pattern is global**, not per-person. If you have
  multiple persons sharing one wake calendar, all of them honour the
  same `wake: HH:MM` event. Workaround: per-person calendars.
- **No automated tests yet.** The rule engine has been built for testability
  (pure functions, dataclasses, no I/O); tests are next on the backlog.

---

## Development

The integration is plain Python with **no external dependencies**
(only `homeassistant` + `voluptuous`). The frontend panel is vanilla
JavaScript served from `custom_components/wake_planner/frontend/` and
talks to the integration via the WebSocket API — no build step.

Project layout:

```
custom_components/wake_planner/
├── __init__.py          # entry setup, services, panel registration
├── coordinator.py       # DataUpdateCoordinator + persistence + WS helpers
├── rule_engine.py       # pure rule matcher / decision builder
├── util.py              # parsing, serialisation, migration
├── const.py             # constants + dataclasses (Rule, PersonConfig…)
├── calendar_source.py   # read HA calendar entities for overrides
├── holiday_source.py    # read holiday calendar + manual dates
├── config_flow.py       # one-step setup (calendars only)
├── options_flow.py      # global re-config (calendars + holidays)
├── services.py          # service registration
├── services.yaml        # service field schemas
├── websocket_api.py     # wake_planner/* WS commands
├── sensor.py            # wake_state + next_wake sensors
├── binary_sensor.py     # wake_needed binary sensor
├── diagnostics.py       # diagnostics export
├── strings.json         # canonical i18n source
├── translations/
│   ├── en.json
│   └── de.json
└── frontend/
    └── wake-planner-panel.js
```

Issues and PRs welcome on the GitHub repository.

---

## License

See repository.
