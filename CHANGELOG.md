# Changelog

## 1.1.2 - 2026-06-01

- Show the linked Home Assistant person's `entity_picture` in Wake Planner
  person avatars, with initials as fallback.

## 1.1.1 - 2026-06-01

- Add a frontend asset cache-buster based on the integration version so Home
  Assistant loads the updated Wake Planner panel after HACS updates.
- Bump the manifest version for the UX rework release.

## 1.1.0 - 2026-06-01

- Rework the Wake Planner panel into a Dracula-inspired, German-first cockpit.
- Add the 14-day planning overview, structured profile/rule editor, settings
  cleanup, UX briefing, and additive `last_update_iso` WebSocket state field.

## 1.0.2 - 2026-05-27

- Keep generated Wake Planner entity names and wake-state labels in English for German Home Assistant installations.

## 1.0.1 - 2026-05-27

- Fix standalone coordinator discovery for the Wake Planner panel and WebSocket API.
- Add a regression test for adding people via the panel after the standalone extraction.

## 1.0.0 - 2026-05-27

- Release Wake Planner as a standalone HACS integration.
- Keep the extracted production behavior from the former `bennis_toolbox` module.

## 0.5.0 - 2026-05-27

- Extract Wake Planner from the `bennis_toolbox` umbrella into this standalone HACS integration.
- Keep the productive Wake Planner 0.5.0 logic, frontend panel, WebSocket API, services, calendar cache, holiday handling, and entity output contracts.
- Move services to the standalone Home Assistant domain, for example `wake_planner.skip_next`.
- Move WebSocket commands to `wake_planner/<command>`.
- Reset integration metadata to the standalone `wake_planner` domain.
