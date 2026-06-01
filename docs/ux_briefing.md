# Wake Planner UX briefing

## Product intent

Wake Planner should make one household question obvious at a glance: who needs
to wake up next, when, and why? The integration is for Home Assistant users who
want reliable wake decisions without editing YAML, restarting Home Assistant, or
debugging template logic before bed.

The panel is both a daily control surface and a schedule editor. The daily view
must feel immediate and calm; the rule editor can be more detailed, but it must
always explain the consequence of each configuration choice through previewable
states and plain labels.

## Primary users

- Household maintainers who configure automations and need predictable entities.
- People with regular weekday/weekend routines.
- Shift workers or households with exceptions, holidays, and alternating weeks.
- Advanced Home Assistant users who may call services or WebSocket commands
  directly, but still expect the panel to be the source of truth.

## Core UX principles

- **Answer first, configure second.** The first screen should show today's
  decision and the next wake timestamp before any editor controls.
- **Every wake decision needs a reason.** Users should see whether the result
  came from an override, calendar event, rule, holiday fallback or no match.
- **Rules should be powerful without making simple routines feel complex.** The
  default profile handles weekday, weekend and holiday behavior; advanced rule
  fields stay behind progressive disclosure.
- **Calendar behavior must be explicit.** Wake Planner reads calendars, never
  writes them. Calendar wake markers and skip titles should be visible in the
  copy wherever users choose calendars.
- **Edits should feel reversible.** Temporary actions such as Skip next and
  Override need clear active states and a visible Clear/Reset path.

## Information architecture

| Area | Job |
|---|---|
| Today / Heute | Daily operational view: status badge, wake time or no-wake state, next wake timestamp, reason, quick actions. |
| 14 days / 14 Tage | Planning view: two-week schedule, per-person decisions, holidays and calendar-derived markers. |
| Profile & rules / Profile & Regeln | Person management, default profile, quick exceptions, advanced rules and wake-window settings. |
| Settings / Einstellungen | Global calendar sources, holiday behavior and manual holiday dates. |

## Core flows

### First setup

1. User installs the integration and optionally selects wake and holiday
   calendars.
2. The panel opens with an empty state that points to Profile & rules.
3. User adds a person and receives the default weekday/weekend/holiday profile.
4. Today immediately shows the calculated decision and matching reason.

### Daily adjustment

1. User opens Today.
2. They choose Skip next, Override, or Clear.
3. The card updates in place, the active button state changes color, and a
   short toast confirms the action.

### Schedule planning

1. User opens 14 days.
2. They scan wake times, skips, holidays and calendar markers across all people.
3. If a date looks wrong, they move to Profile & rules for a lasting rule or
   use Today/Override for a temporary change.

### Rule editing

1. User starts with profile times for weekdays, weekends and holidays.
2. For vacation or one-off cases, they add a quick exception with date range,
   action and optional wake time.
3. For advanced patterns, they add a custom rule with priority, weekday,
   holiday, date-range, alternating-week, specific-date or cycle conditions.
4. Saving a rule refreshes the affected person card and Today decision.

## Interaction and state guidelines

- Status badges should use consistent semantic states: scheduled, skipped,
  overridden, holiday and inactive.
- Calendar-derived wake decisions should be visually distinguishable from normal
  rules.
- Busy states should prevent duplicate writes and preserve form focus where
  possible.
- Destructive actions such as deleting a person or rule require confirmation.
- Empty states should offer the next useful action, not only describe absence.

## Content guidelines

- Use short, concrete labels in the UI: "Nächsten überspringen", "Override",
  "Zurücksetzen", "Profil speichern".
- Avoid internal implementation terms in primary UI copy unless the user is in
  an advanced editor.
- Always show times in 24-hour `HH:MM` format.
- Error messages should name the missing or invalid field, for example
  "Datum fehlt" or "Bis-Datum liegt vor Von-Datum".

## Accessibility and responsive behavior

- The panel must remain usable on narrow Home Assistant side panels and mobile
  screens.
- Tap targets should be at least 38 px high, matching the current button style.
- Status color must not be the only signal; labels and reason text carry the
  same meaning.
- Modals need clear titles, cancel/confirm actions and keyboard-friendly form
  controls.

## Future UX opportunities

- Add a diagnostics/export view that packages rules, decisions, calendar source
  status and runtime state for issue reports.
- Add conflict hints for early calendar events when
  `calendar_conflict_behavior` is set to warn or wake earlier.
- Add per-person calendar override sources for households that share calendars.
- Add a rule preview inspector that explains why each rule did or did not match
  a selected date.
- Add richer automated tests around the frontend contract and Home Assistant UI
  interactions.
