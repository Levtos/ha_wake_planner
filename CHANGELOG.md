# Changelog

## 0.5.0 - 2026-05-27

- Extract Wake Planner from the `bennis_toolbox` umbrella into this standalone HACS integration.
- Keep the productive Wake Planner 0.5.0 logic, frontend panel, WebSocket API, services, calendar cache, holiday handling, and entity output contracts.
- Move services to the standalone Home Assistant domain, for example `wake_planner.skip_next`.
- Move WebSocket commands to `wake_planner/<command>`.
- Reset integration metadata to the standalone `wake_planner` domain.
