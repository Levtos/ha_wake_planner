# Wake Planner — Bestandsaufnahme & Optimierungsvorschläge

Stand: 2026-05-17 · Branch `claude/codebase-review-ZWHSe`

## 1. Bestandsaufnahme

### Architektur (HA Custom Integration, HACS)

| Datei | LoC | Zweck |
|---|---:|---|
| `__init__.py` | 74 | Setup, Panel-Registrierung, Service-Cleanup |
| `coordinator.py` | 330 | DataUpdateCoordinator (60 s), Persistenz, Calendar-Write |
| `rule_engine.py` | 220 | Entscheidungskaskade |
| `calendar_source.py` | 310 | HA-Kalender + CalDAV inkl. iCal/RRULE-Parser |
| `holiday_source.py` | 148 | Wochenende + Holiday-Calendar + manuelle Datums-Ranges |
| `config_flow.py` | 538 | Mehrstufiger Wizard inkl. Shift-Cycle |
| `options_flow.py` | 248 | Re-Edit aller Optionen |
| `services.py` | 151 | 7 Services |
| `sensor.py` / `binary_sensor.py` | 102 / 62 | 4 Sensoren + 1 Binary pro Person |
| `frontend/wake-planner-panel.js` | 416 | Custom Panel (Today/Calendar/Stats/Settings) |
| `diagnostics.py` | 35 | Minimale Diagnose |

### Vorhandene Features

- Mehrere Personen pro Config Entry
- Wochenprofil (aktiv/Wake-Zeit pro Wochentag)
- Rotierende Schicht-Zyklen (n Slots × m Tage, Anker-Datum)
- Kalender-Override per Event-Titel (`wake: HH:MM`)
- HA-Kalender + CalDAV als Fallback (eigener iCal/RRULE/EXDATE-Parser)
- Holiday-Kalender + manuelle Datums-Ranges (`YYYY-MM-DD..YYYY-MM-DD`, `MM-DD`, …)
- Holiday-Verhalten: Skip oder Wochenend-Profil
- Manuelle Override mit Ablaufdatum, Skip-Next
- Schlaf-Log (90 Einträge) + Ø-Schlafdauer + Bedtime-Vorschlag
- Wake-Window (Binary-Sensor offen ±N min)
- Calendar-Write-Back (plant Wake-Events in den nächsten 14 Tagen)
- Custom Panel mit Today / 14-Tage-Kalender / Stats / Settings
- DE/EN-Übersetzung des Config-Flows
- Diagnostics-Export

### Entitäten pro Person

- `sensor.wake_planner_<slug>_wake_state`
- `sensor.wake_planner_<slug>_next_wake` (Timestamp)
- `sensor.wake_planner_<slug>_sleep_duration_avg`
- `sensor.wake_planner_<slug>_suggested_bedtime` (Timestamp)
- `binary_sensor.wake_planner_<slug>_wake_needed`

---

## 2. Bugs / Korrekturen

| # | Wo | Befund |
|---|---|---|
| B1 | `config_flow.py:152` + `:233` | `_persons.append` wird zweimal aufgerufen — `sleep_target` führt zu doppeltem Eintrag, falls erreicht. Pfad wirkt teils unerreichbar; Logik bereinigen. |
| B2 | `services.py:106` | `set_special_rules` nimmt `coordinators[0]` — bei mehreren Config-Entries werden falsche Optionen geschrieben. |
| B3 | `coordinator.py:178` | `sleep_average_hours` addiert pauschal 24 h bei negativer Differenz; >24-h-Schlafphasen werden falsch interpretiert. |
| B4 | `coordinator.py:124` | `async_write_calendar_events` läuft nur einmal pro Tag (`_last_write_date`); Profil-/Override-Änderungen propagieren erst am Folgetag. |
| B5 | `coordinator.py:56` | Hartes 60-s-Polling unabhängig von nächstem Wake; nachts unnötig, am Window-Rand zu grob. Besser: dynamisches Intervall + `async_track_point_in_time` auf Window-Grenzen. |
| B6 | `calendar_source.py:202` | `_expand_rrule` ohne `COUNT`, `UNTIL`, `BYMONTHDAY`, `BYSETPOS`; MONTHLY-Schaltjahr-Logik hartkodiert; horizont fix 60 Tage. |
| B7 | `calendar_source.py:117` | CalDAV-Credentials werden in `entry.data` im Klartext gespeichert. |
| B8 | `services.py:122` | `set_weekly_profile`-Schema validiert nur `wake_time`, akzeptiert beliebige Day-Keys (sollte auf `DAYS` einschränken). |
| B9 | `__init__.py:54` | `"wake-planner" in hass.data.get("frontend_panels", {})` — Schlüssel können bei HA-Versionen anders heißen, Re-Registrierungs-Logik fragil. |
| B10 | `frontend/wake-planner-panel.js:84` | Liest `write_calendar_entity_id` aus den Sensor-Attributen, das Attribut wird aber nicht (mehr) gesetzt → Calendar-Tab zeigt evtl. nichts. |
| B11 | `frontend/wake-planner-panel.js:1` | `set hass()` rendert bei jedem State-Tick komplett neu (innerHTML); teures Repaint mehrmals pro Sekunde. |
| B12 | `holiday_source.py:65` | `is_holiday` macht pro Tag einen separaten `calendar.get_events`-Call → 14 Calls/Refresh. Sollte einen Range-Call machen. |

---

## 3. Fehlende Features (priorisierbar)

### Funktional

- **Adaptive Wake-Time**: Wenn jemand spät ins Bett geht (Sleep-Log oder externer Sensor), Wake nach hinten verschieben bis Mindestschlaf erfüllt — der `wake_window` macht das laut Doku gerade *nicht*.
- **Automation-Trigger-Plattform**: `wake_planner.wake_triggered` Event + Trigger Platform statt nur Binary-Sensor pollen.
- **Notify/Light/Script Action**: optionaler Auto-Call eines `notify.*`/`script.*`/`light.*` beim Window-Start.
- **Sleep-Phasen-Integration**: Optional Wearable-Sensor (Withings/Fitbit/Sleep-as-Android) als Sleep-Quelle.
- **Mehrere parallele Schichtzyklen** pro Person (z. B. Schule + Sport-Frühtraining).
- **Anwesenheits-Logik**: `person_entity_id` ist konfiguriert, aber unbenutzt — bei `not_home` könnte automatisch geskippt werden.
- **Snooze/Soft-Wake**: gestaffelter Wake-Window (Pre-Wake-Licht 30 min vorher, Hard-Wake zur Soll-Zeit).

### UX

- Frontend-Panel mit **`prompt()`** statt HA-Dialog → schlechte Mobile-UX.
- Panel **komplett englisch hardcoded** trotz `translations/`.
- Kein **Re-Auth-Flow** für CalDAV.
- Keine **Reconfigure**-Action für einzelne Personen (immer kompletter Options-Flow).
- Keine **`HomeAssistantView`** / WS-API für Frontend → liest Konfig via Attribute (fragil).

### Plattform/Qualität

- **Keine Tests** (`tests/`, `pyproject.toml`, CI fehlen).
- Kein **hassfest / HACS-Validation-Workflow**.
- Kein **`quality_scale`** im Manifest.
- **`urlopen`** statt `aiohttp_client` für CalDAV (async-fremd, eigener Executor-Hop).
- Eigener iCal/RRULE-Parser statt `icalendar` + `python-dateutil` (Manifest hat `requirements: []` — bewusst dependency-frei?).
- Frontend ohne Build-Step / Lit / Reactivity.
- Kein **`info.md`** für HACS, kein automatisches Release/Tag.
- Keine **Brand-PR** an `home-assistant/brands`.

---

## 4. Vorschläge nach Aufwand

### Quick Wins (< 1 h je Punkt)

- B2 (`set_special_rules` Multi-Entry), B8 (Schema-Validierung), B12 (Range-Call)
- `iot_class` / `quality_scale` ins Manifest
- `info.md` für HACS
- Panel-Strings i18n-fähig machen

### Mittelgroß (1–4 h)

- B3, B4, B5, B11
- Trigger-Plattform `wake_planner.wake_triggered`
- Anwesenheits-Check via `person_entity_id`
- Test-Setup (`pytest-homeassistant-custom-component`) + GitHub Actions
- HA-WebSocket-Command statt Attribute-Reading im Panel

### Größere Umbauten

- B6/B7: CalDAV ersetzen durch `caldav` lib + `aiohttp` + Secrets via `auth_provider`
- Frontend auf Lit + Vite-Build
- Adaptive Wake-Time + Sleep-Phasen-Integration
- Mehrere parallele Profile / Regel-Engine erweitern (siehe `wake_planner_schedule_model.md`)
