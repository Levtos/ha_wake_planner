# AGENTS.md — Wake Planner

## GitLab Workflow

- GitLab project `ha-platform/control` is the central workflow truth.
- Relevant work requires a GitLab issue in `ha-platform/control`.
- Before work starts, read the issue description and all issue notes.
- Document current state, decisions, scope changes, tests, commits, merge requests, blockers, and completion in the issue.
- Code changes happen in this GitLab repository. `origin` must point to GitLab.
- GitHub is only the public distribution and HACS mirror. Do not develop directly on GitHub and do not push manually to GitHub.
- Plane and Forgejo are historical sources only and are not used for active work.
- Full rules live in `ha-platform/control/AGENTS.md`, `ha-platform/control/CLAUDE.md`, and `ha-platform/control/docs/workflow/`.

## Project-Memory Bootstrap

- Before significant work, read the matching GitLab issue description and all notes, then `ha-platform/control/docs/workflow/README.md`, its linked workflow documents, and relevant `ha-platform/control` wiki pages.
- GitLab is the workflow truth. GitHub is only the distribution/HACS mirror; do not develop there directly. Plane is frozen historical context, and Forgejo is out of service.
- Stay inside the decided issue scope: no side quests and no overwriting foreign branches or dirty worktrees.
- Use the smallest sufficient verification for the risk tier. Stable changes to behavior, contracts, operations, or rules belong in the wiki; use live evidence when runtime behavior must be proved. Completion notes must document wiki impact, verification/tests, release state where applicable, and required live evidence.

## Safety

- Do not put secrets in issues, commits, logs, or reports.
- Do not touch production Home Assistant systems without explicit approval.
- No admin, delete, runner, or bulk actions without explicit approval.

**Status:** Eigenständige HACS-Repo, enthält alten Code. **Wird im Hybrid-Pivot mit aktuellem Stand aus `bennis_toolbox/modules/wake_planner/` überschrieben (Codex-Aufgabe).**
**Toolbox-Modul-ID (alt):** `wake_planner`
**Letzte Aktualisierung:** 2026-05-27

---

## Was ist dieses Modul

Berechnet Wake-Zeiten basierend auf konfigurierten Plans (Werktag-Regeln + Kalender-Events + manuelle Ausnahmen). Liefert `wake_next` / `wake_needed` als HA-Sensoren. Konsument: `benni_context` (alt) und `benni_core_user_state` (neu, indirekt).

**Eigenes Lastenheft** im Repo (war historisch immer eigene Spec, kein Modul-Lastenheft in `einhornzentrale/docs/lastenhefte/reviewed/`).

## Architektur-Kontext

Eigene HACS-Custom-Integration. Teil des Hybrid-Setups rund um die VM `einhornzentrale`. Foundation (3 Herzen) lebt in `bennis_toolbox`, dieses Modul wird eigenständig.

**Pendant-Briefings:**
- `bennis_toolbox/AGENTS.md` — Foundation + Pattern für neue Module
- `einhornzentrale/AGENTS.md` — YAML + Cut-Over-Status
- `einhornzentrale/docs/roadmap.md` — Phase 2 (Pivot) detailliert

## Aktueller Stand

- Code im Repo: alt, vermutlich aus früherer Iteration vor `bennis_toolbox`-Konsolidierung
- Aktueller produktiver Code: `bennis_toolbox/modules/wake_planner/` — Status READY, 0.5.0
- Tests: ebenfalls in `bennis_toolbox/tests/wake_planner/`
- HACS-Installation: aktuell über `bennis_toolbox` (Umbrella)

## Migration im Hybrid-Pivot (Codex)

Use the notes below when an explicit extraction issue is assigned. Do not treat this section as permission to start extraction work without a GitLab issue.

Use the `einhornzentrale` Home Assistant MCP server for HA context. Do not use `haos_benni`.

### Extraction Steps

1. Check what is currently in `custom_components/` in this repo. It likely comes from an older iteration.
2. Compare against `bennis_toolbox/custom_components/bennis_toolbox/modules/wake_planner/`; that Toolbox module was the READY / 0.5.0 source at the time this handoff was written.
3. Move the implementation into `custom_components/wake_planner/` as a standalone integration.
4. Adjust imports, for example:
   - `from ...const import DOMAIN` -> `from .const import DOMAIN`
   - `from ...storage import make_store` -> standalone storage in this repo
   - `from ...services import ServiceDef` -> standalone services in this repo
   - domain ownership from `bennis_toolbox` to `wake_planner`
5. Check `manifest.json`, `hacs.json`, `README.md`, and `CHANGELOG.md`.
6. Bring over tests from `bennis_toolbox/tests/wake_planner/` only when extraction work is explicitly in scope.
7. A later `bennis_toolbox` cleanup requires explicit approval.

### Breaking Changes For YAML In Einhornzentrale

- Service calls: `bennis_toolbox.wake_planner_*` -> `wake_planner.*`
- Entity IDs should remain stable if `suggested_object_id` is preserved.
- Unique IDs may change and can require an entity-registry migration.

### Extraction Anti-Patterns

- Do not keep cross-repo imports to the Toolbox umbrella.
- Do not reinterpret the Lastenheft.
- Do not build features on the old `haos_benni` VM.
- Do not enable apply switches on the new VM without explicit cut-over criteria.

### Pivot Order

`wake_planner` is not the pilot. The pilot pattern came from `title-classifier` / `Entity-Title-Mapper`; establish or verify that pattern before repeating it here.

## Pattern (für Neubau / Erweiterung nach Extraction)

Referenz: `bennis_toolbox/modules/benni_core_user_state/`
- Pure Logic in `logic.py` (HA-frei, pytest-testbar)
- Coordinator als HA-Brücke
- Decision-Output via Sensoren — kein direktes Apply
- Service-API über `services_impl.py`

## UX-Frontend-Standard (verbindlich)

Für jede UX-/Frontend-Arbeit gilt der verbindliche, fleet-weite UX-, Technologie- und
Designstandard. Kanonische Quelle: ADR `ha-platform/control:docs/adr/0001-ux-frontend-standard.md`
(Issue `control#58`). Kurzform: Svelte 5 · Vite · TypeScript · Bits UI · shadcn-svelte ·
Tailwind · CSS Custom Properties · Lucide; Design "Graphite Dark – semantic accent system";
zentrale UX = statisches Bundle + dünnes UX-Gateway (primär HA-Ingress); versionierte/typisierte
Contracts. Details und Abweichungsprozess: `docs/ux-frontend-standard.md` und das ADR. Bestehende
Regeln werden dadurch ergänzt, nie überschrieben oder entfernt.
