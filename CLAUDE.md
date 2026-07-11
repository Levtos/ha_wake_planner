# CLAUDE.md - Wake Planner

Use `AGENTS.md` as the primary repo rule source. This file is only the Claude entry point and must not contain separate or conflicting workflow rules.

## GitLab Workflow

- GitLab project `ha-platform/control` is the central workflow truth.
- Relevant work requires a GitLab issue in `ha-platform/control`.
- Before work starts, read the issue description and all issue notes.
- Document current state, decisions, scope changes, tests, commits, merge requests, blockers, and completion in the issue.
- Code changes happen in this GitLab repository. `origin` must point to GitLab.
- GitHub is only the public distribution and HACS mirror. Do not develop directly on GitHub and do not push manually to GitHub.
- Plane and Forgejo are historical sources only and are not used for active work.
- Full rules live in `ha-platform/control/AGENTS.md`, `ha-platform/control/CLAUDE.md`, and `ha-platform/control/docs/workflow/`.

## Safety

- Do not put secrets in issues, commits, logs, or reports.
- Do not touch production Home Assistant systems without explicit approval.
- No admin, delete, runner, or bulk actions without explicit approval.

## Repo Context

- Wake Planner calculates wake times from configured plans, calendar events, and manual exceptions.
- The repository contains an older standalone iteration; historical handoff notes for the Toolbox extraction live in `AGENTS.md`.
- Use `einhornzentrale` for Home Assistant context. Do not use `haos_benni`.
