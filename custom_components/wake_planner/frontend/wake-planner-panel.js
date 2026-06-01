// Wake Planner panel — Home Assistant custom panel Web Component.
//
// The panel keeps the existing `wake_planner/*` WebSocket contract and renders
// a calm, German-first cockpit for daily wake decisions and rule editing.

const WEEKDAYS = [
  { idx: 0, short: "Mo", long: "Montag" },
  { idx: 1, short: "Di", long: "Dienstag" },
  { idx: 2, short: "Mi", long: "Mittwoch" },
  { idx: 3, short: "Do", long: "Donnerstag" },
  { idx: 4, short: "Fr", long: "Freitag" },
  { idx: 5, short: "Sa", long: "Samstag" },
  { idx: 6, short: "So", long: "Sonntag" },
];

const PROFILE_RULE_IDS = new Set(["profile_weekday", "profile_weekend", "profile_holiday"]);
const EXCEPTION_PREFIX = "exception_";

const STYLES = `
:host {
  --wp-bg: #0b1020;
  --wp-surface: #151b2f;
  --wp-surface-elevated: #1b2238;
  --wp-border: rgba(189, 147, 249, 0.18);
  --wp-text: #f8f8f2;
  --wp-text-secondary: #d8d9ff;
  --wp-text-muted: #a7accd;
  --wp-accent-purple: #8b5cf6;
  --wp-accent-cyan: #29b6f6;
  --wp-success: #50fa7b;
  --wp-warning: #ffca3a;
  --wp-danger: #ff5555;
  --wp-inactive: #7c829f;
  --wp-radius-card: 8px;
  --wp-radius-button: 8px;
  --wp-shadow-soft: 0 18px 50px rgba(0, 0, 0, 0.28);
  display: block;
  min-height: 100%;
  box-sizing: border-box;
  padding: 14px 16px 34px;
  color: var(--wp-text);
  background:
    radial-gradient(circle at 18% 0%, rgba(139, 92, 246, 0.16), transparent 34%),
    linear-gradient(135deg, #090d19 0%, var(--wp-bg) 55%, #0d1224 100%);
  font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

* { box-sizing: border-box; }

.shell {
  max-width: 1480px;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(13, 18, 36, 0.72);
  box-shadow: var(--wp-shadow-soft);
  overflow: hidden;
}

.topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wp-border);
  background: rgba(14, 19, 38, 0.82);
}

.brand { display: flex; align-items: center; gap: 12px; min-width: 190px; }
.mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 2px solid var(--wp-accent-purple);
  border-radius: 50%;
  color: var(--wp-accent-purple);
  font-weight: 800;
  box-shadow: 0 0 18px rgba(139, 92, 246, 0.38);
}
.mark::before { content: "◷"; font-size: 20px; line-height: 1; }
.brand h1 { margin: 0; font-size: 18px; font-weight: 760; letter-spacing: 0; }

.tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.tab {
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--wp-radius-button);
  background: transparent;
  color: var(--wp-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.tab:hover, .tab:focus-visible {
  outline: none;
  border-color: var(--wp-border);
  background: rgba(139, 92, 246, 0.14);
}
.tab.active {
  color: var(--wp-text);
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.36), rgba(139, 92, 246, 0.2));
  border-color: rgba(139, 92, 246, 0.42);
  box-shadow: inset 0 -2px 0 var(--wp-accent-purple);
}

.top-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  color: var(--wp-text-secondary);
  font-size: 13px;
  white-space: nowrap;
}
.person-icon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wp-border);
  border-radius: 50%;
  color: var(--wp-text-muted);
}
.person-icon::before { content: "♙"; font-size: 14px; }

.content { padding: 16px; }
.intro { margin: 0 0 14px; color: var(--wp-text-secondary); font-size: 14px; }
.intro strong { color: var(--wp-text); }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 14px; }
.card, ha-card {
  display: block;
  border: 1px solid var(--wp-border);
  border-radius: var(--wp-radius-card);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 100%),
    var(--wp-surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.card { padding: 16px; }
.muted { color: var(--wp-text-muted); font-size: 12px; }
.subtle { color: var(--wp-text-secondary); font-size: 13px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.space { flex: 1; }

.btn {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--wp-radius-button);
  background: rgba(255, 255, 255, 0.04);
  color: var(--wp-text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.08s ease, border-color 0.18s ease, background-color 0.18s ease;
}
.btn:hover, .btn:focus-visible {
  outline: none;
  border-color: rgba(139, 92, 246, 0.58);
  background: rgba(139, 92, 246, 0.16);
}
.btn:active { transform: translateY(1px); }
.btn.primary { background: linear-gradient(135deg, #5f35bf, #7c3aed); border-color: rgba(139, 92, 246, 0.65); color: #fff; }
.btn.danger { background: rgba(255, 85, 85, 0.16); border-color: rgba(255, 85, 85, 0.38); color: #ffd8d8; }
.btn.success, .btn.state-skip { background: rgba(80, 250, 123, 0.12); border-color: rgba(80, 250, 123, 0.48); color: var(--wp-success); }
.btn.state-override { background: rgba(139, 92, 246, 0.18); border-color: rgba(139, 92, 246, 0.58); color: #e9ddff; }
.btn.ghost { background: transparent; }
.icon-btn {
  width: 38px;
  min-width: 38px;
  padding: 0;
  border-radius: var(--wp-radius-button);
}
.icon-btn[aria-label] { font-size: 16px; }
.btn.flash-success { animation: wp-flash-success 0.7s ease-out; }
@keyframes wp-flash-success {
  0% { box-shadow: 0 0 0 0 rgba(80, 250, 123, 0.52); }
  100% { box-shadow: 0 0 0 14px transparent; }
}

input[type=text], input[type=time], input[type=number], input[type=date], select, textarea {
  width: 100%;
  min-height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: var(--wp-radius-button);
  background: rgba(5, 8, 18, 0.42);
  color: var(--wp-text);
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
}
textarea { min-height: 78px; resize: vertical; }
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid rgba(41, 182, 246, 0.65);
  outline-offset: 2px;
}
input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--wp-accent-purple); }
label.field { display: flex; flex-direction: column; gap: 6px; min-width: 130px; color: var(--wp-text-secondary); font-size: 12px; font-weight: 640; }
label.field .label { color: var(--wp-text-muted); font-size: 11px; font-weight: 700; text-transform: none; letter-spacing: 0; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
}
.badge::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.b-scheduled { color: var(--wp-success); background: rgba(80, 250, 123, 0.11); }
.b-skipped { color: var(--wp-danger); background: rgba(255, 85, 85, 0.13); }
.b-overridden { color: #bd93f9; background: rgba(139, 92, 246, 0.16); }
.b-holiday { color: var(--wp-warning); background: rgba(255, 202, 58, 0.13); }
.b-inactive { color: var(--wp-inactive); background: rgba(124, 130, 159, 0.12); }
.b-calendar { color: var(--wp-accent-cyan); background: rgba(41, 182, 246, 0.13); }

.today-card { padding: 12px; }
.person-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 2px 2px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.avatar, .mini-avatar {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.78), rgba(76, 29, 149, 0.74));
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  overflow: hidden;
  flex: 0 0 auto;
}
.avatar img, .mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.person-title h2 { margin: 0; font-size: 18px; }
.person-title .muted { margin-top: 3px; }
.decision-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(270px, 1.1fr);
  gap: 14px;
  margin-top: 14px;
}
.wake-panel, .why-panel {
  min-height: 182px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.wake-time {
  margin: 8px 0 4px;
  font-size: clamp(44px, 7vw, 68px);
  line-height: 1;
  font-weight: 850;
  color: var(--wp-text);
  font-variant-numeric: tabular-nums;
}
.wake-time.no-wake { font-size: clamp(24px, 4vw, 36px); line-height: 1.15; }
.decision-text { color: var(--wp-text-secondary); font-size: 14px; }
.next-box {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: var(--wp-radius-button);
  background: rgba(139, 92, 246, 0.08);
  color: var(--wp-text-secondary);
}
.why-title {
  color: #bd93f9;
  font-size: 12px;
  font-weight: 760;
  margin-bottom: 8px;
}
.why-main { font-size: 15px; font-weight: 760; margin-bottom: 4px; }
.info-list { display: grid; gap: 8px; margin-top: 18px; }
.info-line { display: flex; gap: 8px; align-items: baseline; color: var(--wp-text-secondary); font-size: 13px; }
.info-label { color: #bd93f9; min-width: 94px; font-weight: 760; }
.actions-title { margin: 14px 0 8px; color: #bd93f9; font-size: 12px; font-weight: 760; }
.quick-actions { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 8px; }
.status-panel {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.status-line { display: flex; gap: 10px; align-items: center; color: var(--wp-text-secondary); font-size: 13px; }
.status-dot {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(80, 250, 123, 0.16);
  color: var(--wp-success);
  font-weight: 800;
}
.footer-meta {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 10px 12px 0;
  color: var(--wp-text-muted);
  font-size: 11px;
}

.legend { display: flex; gap: 14px; flex-wrap: wrap; margin: 14px 0 18px; }
.legend-item { display: inline-flex; align-items: center; gap: 7px; color: var(--wp-text-secondary); font-size: 12px; font-weight: 650; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--wp-inactive); }
.legend-dot.today { background: var(--wp-accent-cyan); }
.legend-dot.scheduled { background: var(--wp-success); }
.legend-dot.holiday { background: var(--wp-warning); }
.legend-dot.skipped { background: var(--wp-danger); }
.legend-dot.override { background: var(--wp-accent-purple); }

.forecast-card { padding: 16px; }
.forecast-grid { display: grid; grid-template-columns: repeat(7, minmax(118px, 1fr)); gap: 8px; }
.day-card {
  min-height: 126px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.day-card.today { border-color: var(--wp-accent-cyan); box-shadow: inset 0 0 0 1px rgba(41, 182, 246, 0.55); }
.day-card.weekend { background: rgba(80, 250, 123, 0.08); border-color: rgba(80, 250, 123, 0.16); }
.day-card.holiday { background: rgba(255, 202, 58, 0.08); border-color: rgba(255, 202, 58, 0.28); }
.day-card.overridden { background: rgba(139, 92, 246, 0.11); border-color: rgba(139, 92, 246, 0.34); }
.day-card.skipped { background: rgba(255, 85, 85, 0.08); border-color: rgba(255, 85, 85, 0.26); }
.day-date { color: var(--wp-text-secondary); font-size: 13px; font-weight: 760; }
.day-card.today .day-date { color: var(--wp-accent-cyan); }
.day-card.weekend .day-date { color: var(--wp-success); }
.day-card.holiday .day-date { color: var(--wp-warning); }
.holiday-name { margin-top: 8px; color: var(--wp-warning); font-size: 12px; font-weight: 800; }
.day-person { margin-top: 12px; }
.day-time { font-size: 20px; font-weight: 850; font-variant-numeric: tabular-nums; }
.day-reason { margin-top: 4px; color: var(--wp-text-secondary); font-size: 12px; line-height: 1.35; }
.hint {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--wp-radius-card);
  background: rgba(255, 202, 58, 0.08);
  color: var(--wp-text-secondary);
  font-size: 13px;
}

.profile-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 12px; }
.person-sidebar { padding: 12px; align-self: start; }
.sidebar-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.sidebar-title { font-weight: 760; }
.person-list { display: grid; gap: 8px; }
.person-tab {
  width: 100%;
  min-height: 46px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--wp-radius-button);
  background: rgba(255, 255, 255, 0.035);
  color: var(--wp-text);
  padding: 8px;
  cursor: pointer;
}
.person-tab.active { border-color: rgba(139, 92, 246, 0.52); background: rgba(139, 92, 246, 0.22); }
.mini-avatar {
  width: 28px;
  height: 28px;
  font-size: 14px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.72), rgba(76, 29, 149, 0.7));
}
.main-profile { padding: 16px; min-width: 0; }
.profile-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.profile-head h2 { margin: 0 0 3px; font-size: 20px; }
.section-block { padding: 14px 0; border-top: 1px solid rgba(255, 255, 255, 0.07); }
.section-block:first-of-type { border-top: 0; padding-top: 0; }
.section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.section-title h3 { margin: 0; font-size: 15px; }
.profile-fields { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 8px; margin-top: 12px; }
.profile-field-card {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.compact-list { display: grid; gap: 8px; margin-top: 12px; }
.compact-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(100px, 0.75fr) minmax(90px, 0.5fr) minmax(140px, 1fr) auto;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.rule-row {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.rule-summary { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto; align-items: center; gap: 10px; }
.rule-name { font-weight: 760; }
.rule-pill { border-radius: 999px; padding: 4px 9px; background: rgba(139, 92, 246, 0.16); color: #d9c7ff; font-size: 12px; }
details.advanced {
  margin-top: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.025);
}
details.advanced > summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0 12px;
  color: var(--wp-text);
  font-weight: 760;
}
.rule-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 0 12px 12px; }
.weekday-toggle { display: flex; gap: 5px; flex-wrap: wrap; padding: 0 12px 12px; }
.weekday-toggle label {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--wp-radius-button);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  font-size: 12px;
}
.weekday-toggle label.on { border-color: rgba(139, 92, 246, 0.55); background: rgba(139, 92, 246, 0.18); }
.weekday-toggle input { display: none; }

.settings-card { padding: 16px; }
.settings-section { padding: 14px 0; border-top: 1px solid rgba(255, 255, 255, 0.07); }
.settings-section:first-of-type { border-top: 0; padding-top: 0; }
.settings-section h2, .settings-section h3 { margin: 0; }
.calendar-cards { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }
.calendar-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}
.card-title { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.calendar-glyph {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--wp-radius-button);
  background: rgba(41, 182, 246, 0.18);
  color: var(--wp-accent-cyan);
  font-weight: 800;
}
.calendar-glyph.holiday { background: rgba(255, 85, 85, 0.15); color: #ff9bb0; }
.connected {
  margin-left: auto;
  color: var(--wp-success);
  background: rgba(80, 250, 123, 0.12);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 760;
}
.settings-rows { display: grid; gap: 10px; margin-top: 12px; }
.settings-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(220px, 1.1fr);
  gap: 12px;
  align-items: center;
}
.holiday-chip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--wp-radius-card);
  background: rgba(255, 255, 255, 0.035);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.62);
}
.modal {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--wp-border);
  border-radius: var(--wp-radius-card);
  background: var(--wp-surface);
  color: var(--wp-text);
  box-shadow: var(--wp-shadow-soft);
}
.modal h2 { margin: 0 0 16px; font-size: 18px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.toast {
  position: fixed;
  z-index: 10000;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  opacity: 0;
  padding: 10px 16px;
  border-radius: var(--wp-radius-card);
  background: #1f2937;
  color: #fff;
  transition: opacity 0.18s ease;
}
.toast.show { opacity: 1; }
.toast.error { background: #8f1d32; }
.empty { padding: 34px 16px; text-align: center; color: var(--wp-text-secondary); }

@media (max-width: 900px) {
  :host { padding: 8px; }
  .topbar { grid-template-columns: 1fr; justify-items: stretch; }
  .brand, .top-meta { justify-content: center; }
  .decision-grid, .profile-layout, .calendar-cards, .settings-row { grid-template-columns: 1fr; }
  .quick-actions, .profile-fields { grid-template-columns: 1fr; }
  .forecast-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .compact-row { grid-template-columns: 1fr; align-items: stretch; }
}
@media (max-width: 520px) {
  .content { padding: 12px; }
  .forecast-grid { grid-template-columns: 1fr; }
  .person-head, .rule-summary { grid-template-columns: 1fr; }
  .wake-panel, .why-panel { min-height: auto; }
}
`;

class WakePlannerPanel extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._tab = "today";
    this._schedule = {};
    this._loaded = false;
    this._busy = false;
    this._selectedPersonSlug = null;
  }

  set hass(hass) {
    const wasHass = !!this._hass;
    this._hass = hass;
    if (!wasHass) this._initialFetch();
  }

  connectedCallback() {
    if (!this._delegated) {
      this.addEventListener("click", this._onDelegatedClick.bind(this));
      this.addEventListener("change", this._onDelegatedChange.bind(this));
      this._delegated = true;
    }
    if (this._hass && !this._loaded) this._initialFetch();
  }

  _onDelegatedClick(e) {
    const tabEl = e.target.closest("[data-tab]");
    if (tabEl && this.contains(tabEl)) {
      this._tab = tabEl.dataset.tab;
      if (this._tab === "calendar") this._loadSchedule().then(() => this._renderShell());
      else this._renderShell();
      return;
    }

    const selectPerson = e.target.closest("[data-select-person]");
    if (selectPerson && this.contains(selectPerson)) {
      this._selectedPersonSlug = selectPerson.dataset.selectPerson;
      this._renderShell();
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (actionEl && this.contains(actionEl)) this._handleAction(actionEl);
  }

  _onDelegatedChange(e) {
    const wd = e.target.closest("[data-rule-wd]");
    if (wd && this.contains(wd)) wd.closest("label").classList.toggle("on", wd.checked);
  }

  async _initialFetch() {
    try {
      await this._refresh();
    } catch (e) {
      this._toast(`Laden fehlgeschlagen: ${e.message || e}`, true);
      this._loaded = true;
      this._renderShell();
    }
  }

  async _refresh() {
    if (!this._hass) return;
    this._state = await this._hass.callWS({ type: "wake_planner/get_state" });
    this._loaded = true;
    this._ensureSelectedPerson();
    if (this._tab === "calendar") await this._loadSchedule();
    this._renderShell();
  }

  async _loadSchedule() {
    try {
      const res = await this._hass.callWS({ type: "wake_planner/get_schedule", days: 14 });
      this._schedule = {};
      for (const day of (res?.schedule || [])) this._schedule[day.date] = day;
    } catch (e) {
      this._schedule = {};
      this._toast(`14-Tage-Ansicht konnte nicht geladen werden: ${e.message || e}`, true);
    }
  }

  async _ws(type, payload = {}) {
    if (this._busy) return null;
    this._busy = true;
    try {
      const result = await this._hass.callWS({ type, ...payload });
      if (result && result.persons) {
        this._state = result;
        this._ensureSelectedPerson();
      }
      return result;
    } catch (e) {
      this._toast(e.message || String(e), true);
      return null;
    } finally {
      this._busy = false;
    }
  }

  _ensureSelectedPerson() {
    const persons = this._state?.persons || [];
    if (!persons.length) {
      this._selectedPersonSlug = null;
      return;
    }
    if (!this._selectedPersonSlug || !persons.some(p => p.slug === this._selectedPersonSlug)) {
      this._selectedPersonSlug = persons[0].slug;
    }
  }

  _renderShell() {
    if (!this._loaded) {
      this.innerHTML = `<style>${STYLES}</style><div class="shell"><div class="empty">Wake Planner wird geladen...</div></div>`;
      return;
    }
    const persons = this._state?.persons || [];
    const labels = { today: "Heute", calendar: "14 Tage", people: "Profile & Regeln", settings: "Einstellungen" };
    let body = "";
    if (persons.length === 0 && this._tab !== "settings" && this._tab !== "people") {
      body = this._renderEmptyPeople();
    } else if (this._tab === "today") body = this._renderTodayView(persons);
    else if (this._tab === "calendar") body = this._renderCalendar(persons);
    else if (this._tab === "people") body = this._renderPeople(persons);
    else body = this._renderSettings();

    this.innerHTML = `
      <style>${STYLES}</style>
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span class="mark" aria-hidden="true"></span><h1>Wake Planner</h1></div>
          <nav class="tabs" aria-label="Wake Planner Bereiche">
            ${Object.entries(labels).map(([id, label]) => `<button class="tab ${this._tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
          </nav>
          <div class="top-meta"><span>${persons.length} ${persons.length === 1 ? "Person" : "Personen"}</span><span class="person-icon" aria-hidden="true"></span></div>
        </div>
        <main class="content">${body}</main>
      </div>
    `;
  }

  _renderEmptyPeople() {
    return `<div class="card empty">
      <h2>Noch keine Personen</h2>
      <p>Lege zuerst eine Person an, damit Wake Planner einen Weckplan berechnen kann.</p>
      <button class="btn primary" data-tab="people">Profile öffnen</button>
    </div>`;
  }

  _renderTodayView(persons) {
    return `
      <p class="intro"><strong>Guten Morgen!</strong> Hier ist die heutige Übersicht.</p>
      <div class="grid">${persons.map(p => this._renderTodayCard(p)).join("")}</div>
      ${this._renderFooterMeta()}
    `;
  }

  _renderTodayCard(person) {
    const dec = person.decision || {};
    const state = dec.state || "inactive";
    const wake = dec.wake_time;
    const status = this._statusLabel(dec);
    const entity = this._personEntityLabel(person);
    const nextWake = this._formatDateTime(person.next_wake || dec.next_wake);
    const source = this._sourceLabel(dec, person);
    const detail = this._reasonDetail(dec);
    const noWakeText = this._noWakeText(dec);
    const display = wake || noWakeText;
    const skipActive = !!person.skip_next;
    const overrideActive = !!person.override_time;
    const statusMessage = this._statusMessage(person, dec);
    const badgeClass = dec.decided_by === "calendar" ? "b-calendar" : `b-${state}`;
    return `<article class="card today-card" data-today-card="${person.slug}">
      <div class="person-head">
        ${this._avatarHtml(person, "avatar")}
        <div class="person-title">
          <h2>${escapeHtml(person.name)}</h2>
          <div class="muted">${escapeHtml(entity)}</div>
        </div>
        <span class="badge ${badgeClass}">${status}</span>
      </div>
      <div class="decision-grid">
        <section class="wake-panel" aria-label="Heutige Weckentscheidung">
          <div class="${wake ? "wake-time" : "wake-time no-wake"}">${escapeHtml(display)}</div>
          <div class="decision-text">${wake ? "Heute wird geweckt" : "Heute bleibt der Wecker ruhig"}</div>
          <div class="next-box">
            <div class="muted">Nächster Wecker</div>
            <div>${nextWake || "Kein Wecker in den nächsten Tagen"}</div>
          </div>
        </section>
        <section class="why-panel" aria-label="Warum diese Entscheidung gilt">
          <div class="why-title">Warum?</div>
          <div class="why-main">${escapeHtml(source)}</div>
          <div class="subtle">${escapeHtml(detail)}</div>
          <div class="info-list">
            <div class="info-line"><span class="info-label">Routine</span><span>${Number(person.routine_duration_minutes ?? 60)} min</span></div>
            <div class="info-line"><span class="info-label">Frühe Termine</span><span>${escapeHtml(this._conflictLabel(person.calendar_conflict_behavior))}</span></div>
            <div class="info-line"><span class="info-label">Fenster</span><span>± ${Number(person.wake_window_minutes ?? 5)} min</span></div>
            ${overrideActive ? `<div class="info-line"><span class="info-label">Override</span><span>${person.override_time}${person.override_until ? ` bis ${person.override_until}` : ""}</span></div>` : ""}
            ${skipActive ? `<div class="info-line"><span class="info-label">Skip</span><span>Nächster Wecker wird übersprungen</span></div>` : ""}
          </div>
        </section>
      </div>
      <div class="actions-title">Schnellaktionen</div>
      <div class="quick-actions">
        <button class="btn ${skipActive ? "state-skip" : ""}" data-action="skip" data-person="${person.slug}">Nächsten überspringen</button>
        <button class="btn ${overrideActive ? "state-override" : ""}" data-action="override" data-person="${person.slug}">${overrideActive ? `Override ${person.override_time}` : "Override setzen"}</button>
        <button class="btn ghost" data-action="clear-override" data-person="${person.slug}">Zurücksetzen</button>
      </div>
      <div class="status-panel">
        <div class="status-line"><span class="status-dot">${state === "scheduled" || state === "overridden" ? "✓" : "i"}</span><span>${escapeHtml(statusMessage)}</span></div>
      </div>
    </article>`;
  }

  _renderCalendar(persons) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = localDateKey(d);
      const dayInfo = this._schedule[key] || {};
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const isToday = i === 0;
      const dayDecisions = persons.map(person => ({ person, dec: (dayInfo.persons || {})[person.slug] || {} }));
      const primary = dayDecisions[0]?.dec || {};
      const dayClass = [
        "day-card",
        isToday ? "today" : "",
        isWeekend ? "weekend" : "",
        dayInfo.holiday_name && dayInfo.holiday_name !== "Weekend" ? "holiday" : "",
        primary.state === "overridden" ? "overridden" : "",
        primary.state === "skipped" ? "skipped" : "",
      ].filter(Boolean).join(" ");
      cells.push(`<article class="${dayClass}">
        <div class="day-date">${this._dayLabel(d)}</div>
        ${dayInfo.holiday_name && dayInfo.holiday_name !== "Weekend" ? `<div class="holiday-name">${escapeHtml(dayInfo.holiday_name)}</div>` : ""}
        ${dayDecisions.map(({ person, dec }) => `<div class="day-person">
          ${persons.length > 1 ? `<div class="muted">${escapeHtml(person.name)}</div>` : ""}
          <div class="day-time">${escapeHtml(dec.wake_time || this._shortNoWake(dec))}</div>
          <div class="day-reason">${escapeHtml(this._sourceLabel(dec, person))}</div>
        </div>`).join("")}
      </article>`);
    }
    return `<section class="card forecast-card">
      <h2>Nächste 14 Tage</h2>
      <div class="muted">Übersicht für ${escapeHtml(persons.map(p => p.name).join(", ") || "alle")}</div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot today"></span>Heute</span>
        <span class="legend-item"><span class="legend-dot scheduled"></span>Geplant</span>
        <span class="legend-item"><span class="legend-dot holiday"></span>Feiertag / Sonderregel</span>
        <span class="legend-item"><span class="legend-dot skipped"></span>Übersprungen</span>
        <span class="legend-item"><span class="legend-dot override"></span>Override</span>
        <span class="legend-item"><span class="legend-dot"></span>Kein Wecker</span>
      </div>
      <div class="forecast-grid">${cells.join("")}</div>
      <div class="hint">Tipp: Klicke auf einen Tag für Details und schnelle Aktionen. Diese Detailansicht ist für einen späteren Ausbau vorbereitet.</div>
    </section>`;
  }

  _renderPeople(persons) {
    const selected = persons.find(p => p.slug === this._selectedPersonSlug) || persons[0];
    return `<div class="profile-layout">
      <aside class="card person-sidebar">
        <div class="sidebar-head">
          <span class="sidebar-title">Personen</span>
          <button class="btn icon-btn" data-action="open-add-person" aria-label="Person hinzufügen">+</button>
        </div>
        <div class="person-list">
          ${persons.map(p => `<button class="person-tab ${p.slug === selected?.slug ? "active" : ""}" data-select-person="${p.slug}">
            ${this._avatarHtml(p, "mini-avatar")}
            <span><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(this._personEntityLabel(p))}</span></span>
          </button>`).join("") || `<div class="muted">Noch keine Personen.</div>`}
        </div>
      </aside>
      <section class="card main-profile">
        ${selected ? this._renderSelectedPerson(selected) : this._renderAddPersonInline()}
      </section>
    </div>`;
  }

  _renderSelectedPerson(person) {
    const rules = person.rules || [];
    const exceptions = rules.filter(r => String(r.id || "").startsWith(EXCEPTION_PREFIX));
    const customRules = rules.filter(r => !PROFILE_RULE_IDS.has(r.id) && !String(r.id || "").startsWith(EXCEPTION_PREFIX));
    return `<div data-person-card="${person.slug}">
      <div class="profile-head">
        <div>
          <h2>${escapeHtml(person.name)}</h2>
          <div class="muted">Verknüpft mit ${escapeHtml(this._personEntityLabel(person))}</div>
        </div>
        <span class="space"></span>
        <button class="btn" data-action="edit-person" data-person="${person.slug}">Bearbeiten</button>
        <button class="btn danger" data-action="remove-person" data-person="${person.slug}">Löschen</button>
      </div>
      ${this._renderWakeProfile(person)}
      ${this._renderExceptions(person, exceptions)}
      ${this._renderSpecialRules(person, customRules)}
    </div>`;
  }

  _renderAddPersonInline() {
    return `<div class="empty">
      <h2>Person hinzufügen</h2>
      <button class="btn primary" data-action="open-add-person">Hinzufügen</button>
    </div>`;
  }

  _renderWakeProfile(person) {
    const profile = this._profileRules(person);
    const holidayAction = profile.holiday.action === "skip" ? "skip" : "weekend";
    return `<section class="section-block">
      <div class="section-title"><h3>Standardprofil</h3></div>
      <div class="muted">Dein Standardverhalten für Werktage, Wochenende und Feiertage.</div>
      <div class="profile-fields">
        <div class="profile-field-card"><label class="field"><span class="label">Werktage</span><input type="time" value="${profile.weekday.wake_time || "07:00"}" data-profile-field="${person.slug}|weekday_time"></label></div>
        <div class="profile-field-card"><label class="field"><span class="label">Wochenende</span><input type="time" value="${profile.weekend.wake_time || "09:30"}" data-profile-field="${person.slug}|weekend_time"></label></div>
        <div class="profile-field-card"><label class="field"><span class="label">Feiertage</span><select data-profile-field="${person.slug}|holiday_action"><option value="weekend" ${holidayAction === "weekend" ? "selected" : ""}>wie Wochenende</option><option value="skip" ${holidayAction === "skip" ? "selected" : ""}>kein Wecker</option></select></label></div>
        <div class="profile-field-card"><label class="field"><span class="label">Routine (min)</span><input type="number" min="0" max="240" value="${Number(person.routine_duration_minutes ?? 60)}" data-profile-field="${person.slug}|routine_duration_minutes"></label></div>
        <div class="profile-field-card"><label class="field"><span class="label">Frühe Termine</span><select data-profile-field="${person.slug}|calendar_conflict_behavior">${this._conflictOptions(person.calendar_conflict_behavior)}</select></label></div>
      </div>
      <div class="row" style="margin-top:12px"><span class="space"></span><button class="btn primary" data-action="save-profile" data-person="${person.slug}">Standardprofil speichern</button></div>
    </section>`;
  }

  _renderExceptions(person, exceptions) {
    return `<section class="section-block">
      <div class="section-title">
        <div><h3>Ausnahmen</h3><div class="muted">Einmalige oder zeitlich begrenzte Abweichungen vom Standardprofil.</div></div>
        <span class="space"></span>
        <button class="btn primary" data-action="add-exception" data-person="${person.slug}">+ Ausnahme hinzufügen</button>
      </div>
      <div class="compact-list">
        ${exceptions.map(rule => this._renderExceptionRow(person.slug, rule)).join("") || `<div class="muted">Noch keine Ausnahmen.</div>`}
        <div class="compact-row">
          <label class="field"><span class="label">Datum von</span><input type="date" data-exception-field="${person.slug}|date_from"></label>
          <label class="field"><span class="label">Bis</span><input type="date" data-exception-field="${person.slug}|date_to"></label>
          <label class="field"><span class="label">Aktion</span><select data-exception-field="${person.slug}|action"><option value="wake">wecken um</option><option value="skip">kein Wecker</option></select></label>
          <label class="field"><span class="label">Zeit / Notiz</span><input type="time" value="08:00" data-exception-field="${person.slug}|wake_time"><input style="margin-top:6px" type="text" placeholder="z.B. später Termin" data-exception-field="${person.slug}|name"></label>
          <span class="muted">Neue Ausnahme</span>
        </div>
      </div>
    </section>`;
  }

  _renderExceptionRow(slug, rule) {
    const range = rule.date_from || (rule.specific_dates || [])[0] || "";
    const to = rule.date_to || "";
    return `<div class="compact-row">
      <label class="field"><span class="label">Zeitraum</span><input type="date" value="${range}" data-rule-field="${slug}|${rule.id}|date_from"></label>
      <label class="field"><span class="label">Bis</span><input type="date" value="${to}" data-rule-field="${slug}|${rule.id}|date_to"></label>
      <label class="field"><span class="label">Aktion</span><select data-rule-field="${slug}|${rule.id}|action"><option value="wake" ${rule.action !== "skip" ? "selected" : ""}>wecken um</option><option value="skip" ${rule.action === "skip" ? "selected" : ""}>kein Wecker</option></select></label>
      <label class="field"><span class="label">Zeit / Notiz</span><input type="time" value="${rule.wake_time || "08:00"}" data-rule-field="${slug}|${rule.id}|wake_time"><input style="margin-top:6px" type="text" value="${escapeHtml(rule.name || "")}" data-rule-field="${slug}|${rule.id}|name"></label>
      <div class="row" style="justify-content:flex-end"><button class="btn icon-btn" data-action="save-rule" data-person="${slug}" data-rule="${rule.id}" aria-label="Ausnahme speichern">✓</button><button class="btn danger icon-btn" data-action="delete-rule" data-person="${slug}" data-rule="${rule.id}" aria-label="Ausnahme löschen">×</button></div>
    </div>`;
  }

  _renderSpecialRules(person, customRules) {
    return `<section class="section-block">
      <div class="section-title">
        <div><h3>Spezialregeln <span class="muted">(Advanced)</span></h3><div class="muted">Für komplexe Routinen wie abwechselnde Wochen, bestimmte Wochentage u.v.m.</div></div>
        <span class="space"></span>
        <button class="btn primary" data-action="add-rule" data-person="${person.slug}">+ Regel hinzufügen</button>
      </div>
      <div class="compact-list">
        ${customRules.map((rule, idx) => this._renderRule(person.slug, rule, idx)).join("") || `<div class="muted">Keine Spezialregeln aktiv.</div>`}
      </div>
      <details class="advanced">
        <summary>Erweitert: Wake-Fenster, Prioritäten und Matching</summary>
        <div class="rule-fields">
          <label class="field"><span class="label">Wake-Fenster (min)</span><input type="number" min="1" max="120" value="${Number(person.wake_window_minutes ?? 5)}" data-window-for="${person.slug}"></label>
          <div class="row" style="align-items:end"><button class="btn" data-action="save-window" data-person="${person.slug}">Fenster speichern</button></div>
        </div>
      </details>
    </section>`;
  }

  _renderRule(slug, rule) {
    return `<article class="rule-row">
      <div class="rule-summary">
        <div><div class="rule-name">${escapeHtml(rule.name || "Spezialregel")}</div><div class="muted">${escapeHtml(this._ruleSummary(rule))}</div></div>
        <span class="rule-pill">Priorität ${Number(rule.priority ?? 100)}</span>
        <div class="row"><button class="btn icon-btn" data-action="save-rule" data-person="${slug}" data-rule="${rule.id}" aria-label="Regel speichern">✓</button><button class="btn danger icon-btn" data-action="delete-rule" data-person="${slug}" data-rule="${rule.id}" aria-label="Regel löschen">×</button></div>
      </div>
      <details class="advanced">
        <summary>Regel bearbeiten</summary>
        ${this._renderRuleFields(slug, rule)}
      </details>
    </article>`;
  }

  _renderRuleFields(slug, rule) {
    const wd = new Set(rule.weekdays || []);
    return `
      <div class="rule-fields">
        <label class="field"><span class="label">Name</span><input type="text" value="${escapeHtml(rule.name || "")}" data-rule-field="${slug}|${rule.id}|name"></label>
        <label class="field"><span class="label">Priorität</span><input type="number" value="${Number(rule.priority ?? 100)}" data-rule-field="${slug}|${rule.id}|priority"></label>
        <label class="field"><span class="label">Status</span><select data-rule-field="${slug}|${rule.id}|enabled"><option value="true" ${rule.enabled !== false ? "selected" : ""}>aktiv</option><option value="false" ${rule.enabled === false ? "selected" : ""}>inaktiv</option></select></label>
        <label class="field"><span class="label">Aktion</span><select data-rule-field="${slug}|${rule.id}|action"><option value="wake" ${rule.action !== "skip" ? "selected" : ""}>wecken</option><option value="skip" ${rule.action === "skip" ? "selected" : ""}>überspringen</option></select></label>
        <label class="field"><span class="label">Weckzeit</span><input type="time" value="${rule.wake_time || "07:00"}" data-rule-field="${slug}|${rule.id}|wake_time"></label>
        <label class="field"><span class="label">Feiertage</span><select data-rule-field="${slug}|${rule.id}|on_holiday"><option value="" ${rule.on_holiday == null ? "selected" : ""}>egal</option><option value="true" ${rule.on_holiday === true ? "selected" : ""}>nur Feiertage</option><option value="false" ${rule.on_holiday === false ? "selected" : ""}>nur Nicht-Feiertage</option></select></label>
      </div>
      <div class="weekday-toggle">
        ${WEEKDAYS.map(d => `<label class="${wd.has(d.idx) ? "on" : ""}"><input type="checkbox" ${wd.has(d.idx) ? "checked" : ""} data-rule-wd="${slug}|${rule.id}|${d.idx}">${d.short}</label>`).join("")}
      </div>
      <div class="rule-fields">
        <label class="field"><span class="label">Von Datum</span><input type="date" value="${rule.date_from || ""}" data-rule-field="${slug}|${rule.id}|date_from"></label>
        <label class="field"><span class="label">Bis Datum</span><input type="date" value="${rule.date_to || ""}" data-rule-field="${slug}|${rule.id}|date_to"></label>
        <label class="field"><span class="label">Alle N Wochen</span><input type="number" min="1" value="${rule.week_interval || ""}" data-rule-field="${slug}|${rule.id}|week_interval"></label>
        <label class="field"><span class="label">Wochenanker</span><input type="date" value="${rule.week_anchor || ""}" data-rule-field="${slug}|${rule.id}|week_anchor"></label>
        <label class="field"><span class="label">Einzeldaten</span><input type="text" value="${(rule.specific_dates || []).join(", ")}" data-rule-field="${slug}|${rule.id}|specific_dates" placeholder="2026-06-15, 2026-12-24"></label>
        <label class="field"><span class="label">Zyklusanker</span><input type="date" value="${rule.cycle_anchor || ""}" data-rule-field="${slug}|${rule.id}|cycle_anchor"></label>
        <label class="field"><span class="label">Zykluslänge</span><input type="number" min="1" value="${rule.cycle_length || ""}" data-rule-field="${slug}|${rule.id}|cycle_length"></label>
        <label class="field"><span class="label">Slot Start</span><input type="number" min="0" value="${rule.cycle_slot_start ?? ""}" data-rule-field="${slug}|${rule.id}|cycle_slot_start"></label>
        <label class="field"><span class="label">Slot Länge</span><input type="number" min="1" value="${rule.cycle_slot_length || ""}" data-rule-field="${slug}|${rule.id}|cycle_slot_length"></label>
      </div>`;
  }

  _renderSettings() {
    const g = this._state?.global || {};
    const calOptions = this._calendarEntityOptions();
    const wakeConnected = g.calendar_entity_id && this._hass?.states?.[g.calendar_entity_id];
    const holidayConnected = g.holiday_calendar_entity_id && this._hass?.states?.[g.holiday_calendar_entity_id];
    const manualItems = this._manualHolidayItems(g.manual_holiday_dates);
    return `<section class="card settings-card">
      <div class="settings-section">
        <h2>Globale Einstellungen</h2>
        <div class="muted">Wake Planner liest Kalenderdaten und speichert nur die eigene Konfiguration.</div>
      </div>
      <div class="settings-section">
        <h3>Kalender</h3>
        <div class="calendar-cards">
          <div class="calendar-card">
            <div class="card-title"><span class="calendar-glyph">K</span><div><strong>Weck-Kalender</strong><div class="muted">${escapeHtml(g.calendar_entity_id || "kein Kalender gewählt")}</div></div><span class="connected">${wakeConnected ? "Verbunden" : "Optional"}</span></div>
            <label class="field"><span class="label">Kalender</span><select data-global-field="calendar_entity_id"><option value="">kein Kalender</option>${calOptions.map(o => `<option value="${o.id}" ${o.id === g.calendar_entity_id ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}</select></label>
            <div class="muted" style="margin-top:10px">Marker: <code>wake: 06:30</code> · Skip: <code>no-wake</code> oder <code>schlaf aus</code></div>
            <div class="subtle" style="margin-top:8px">Wake Planner liest diesen Kalender, schreibt aber keine Termine.</div>
          </div>
          <div class="calendar-card">
            <div class="card-title"><span class="calendar-glyph holiday">F</span><div><strong>Feiertags-Kalender</strong><div class="muted">${escapeHtml(g.holiday_calendar_entity_id || "kein Kalender gewählt")}</div></div><span class="connected">${holidayConnected ? "Verbunden" : "Optional"}</span></div>
            <label class="field"><span class="label">Kalender</span><select data-global-field="holiday_calendar_entity_id"><option value="">kein Kalender</option>${calOptions.map(o => `<option value="${o.id}" ${o.id === g.holiday_calendar_entity_id ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}</select></label>
            <div class="subtle" style="margin-top:8px">Feiertage gelten als: ${escapeHtml(this._holidayBehaviorLabel(g.holiday_behavior))}</div>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <h3>Wochenenden & Feiertage</h3>
        <div class="settings-rows">
          <div class="settings-row"><div><strong>Wochenenden</strong><div class="muted">Welche Tage als Wochenende gelten.</div></div><select disabled><option>Samstag und Sonntag</option></select></div>
          <div class="settings-row"><div><strong>Feiertagsverhalten</strong><div class="muted">Wie Wake Planner an Feiertagen reagieren soll.</div></div><select data-global-field="holiday_behavior"><option value="skip" ${g.holiday_behavior === "skip" ? "selected" : ""}>kein Wecker</option><option value="weekend_profile" ${g.holiday_behavior === "weekend_profile" ? "selected" : ""}>wie Wochenende</option></select></div>
          <div class="settings-row"><div><strong>Manuelle Feiertage</strong><div class="muted">Eigene Feiertage, die nicht im Kalender enthalten sind.</div></div><textarea data-global-field="manual_holiday_dates" placeholder="2026-12-25, 12-26, 2026-07-01..2026-07-14">${escapeHtml(g.manual_holiday_dates || "")}</textarea></div>
        </div>
        <div class="compact-list">
          ${manualItems.map((item, idx) => `<div class="holiday-chip-row"><span>${escapeHtml(item)}</span><span class="muted">Manuell</span><button class="btn danger icon-btn" data-action="delete-manual-holiday" data-index="${idx}" aria-label="Manuellen Feiertag löschen">×</button></div>`).join("") || `<div class="muted">Keine manuellen Feiertage eingetragen.</div>`}
        </div>
        <div class="row" style="margin-top:12px"><button class="btn" data-action="add-manual-holiday">+ Feiertag hinzufügen</button><span class="space"></span><button class="btn primary" data-action="save-global">Einstellungen speichern</button></div>
      </div>
    </section>`;
  }

  _renderFooterMeta() {
    const updated = this._state?.last_update_iso ? this._formatDateTime(this._state.last_update_iso) : "noch nicht verfügbar";
    return `<div class="footer-meta"><span>Zeiten in 24h (HH:MM)</span><span>Letzte Aktualisierung: ${escapeHtml(updated)}</span><span>Wake Planner</span></div>`;
  }

  async _handleAction(el) {
    const action = el.dataset.action;
    const slug = el.dataset.person;
    if (action === "skip") {
      const ok = await this._ws("wake_planner/skip_next", { person_id: slug });
      if (ok) { this._flashSuccess(el); this._toast("Nächster Wecker wird übersprungen"); this._renderShell(); }
    } else if (action === "clear-override") {
      const ok = await this._ws("wake_planner/clear_override", { person_id: slug });
      if (ok) { this._flashSuccess(el); this._toast("Skip und Override zurückgesetzt"); this._renderShell(); }
    } else if (action === "override") this._openOverrideDialog(slug, el);
    else if (action === "open-add-person") this._openAddPersonDialog();
    else if (action === "add-person") await this._addPerson(el);
    else if (action === "remove-person") await this._removePerson(slug);
    else if (action === "edit-person") this._openEditPersonDialog(slug);
    else if (action === "save-profile") await this._saveProfile(slug, el);
    else if (action === "add-exception") await this._addException(slug, el);
    else if (action === "add-rule") await this._addRule(slug, el);
    else if (action === "delete-rule") await this._deleteRule(slug, el.dataset.rule);
    else if (action === "save-rule") await this._saveRule(slug, el.dataset.rule, el);
    else if (action === "save-window") await this._saveWindow(slug, el);
    else if (action === "save-global") await this._saveGlobal(el);
    else if (action === "add-manual-holiday") this._openManualHolidayDialog();
    else if (action === "delete-manual-holiday") await this._deleteManualHoliday(Number(el.dataset.index));
  }

  async _addPerson(btn) {
    const name = this.querySelector("#add-name")?.value?.trim();
    if (!name) return this._toast("Bitte einen Namen eingeben", true);
    const personEntity = this.querySelector("#add-person-entity")?.value || null;
    const ok = await this._ws("wake_planner/add_person", { name, person_entity_id: personEntity });
    if (ok) {
      this._selectedPersonSlug = ok.slug;
      this._flashSuccess(btn);
      this._renderShell();
    }
  }

  async _removePerson(slug) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!confirm(`${person?.name || slug} löschen? Regeln und temporäre Zustände gehen verloren.`)) return;
    const ok = await this._ws("wake_planner/remove_person", { person_id: slug });
    if (ok) this._renderShell();
  }

  _collectRuleFields(slug, ruleId) {
    const out = {};
    this.querySelectorAll(`[data-rule-field^="${slug}|${ruleId}|"]`).forEach(input => {
      const field = input.dataset.ruleField.split("|")[2];
      if (input.type === "number") {
        const value = input.value.trim();
        out[field] = value === "" ? null : Number(value);
      } else if (field === "enabled") {
        out[field] = input.value !== "false";
      } else {
        out[field] = input.value;
      }
    });
    const weekdays = [];
    this.querySelectorAll(`[data-rule-wd^="${slug}|${ruleId}|"]`).forEach(input => {
      if (input.checked) weekdays.push(Number(input.dataset.ruleWd.split("|")[2]));
    });
    if (this.querySelector(`[data-rule-wd^="${slug}|${ruleId}|"]`)) out.weekdays = weekdays.length ? weekdays : null;
    if (out.specific_dates && typeof out.specific_dates === "string") {
      const parts = out.specific_dates.split(/[,;\\s]+/).map(s => s.trim()).filter(Boolean);
      out.specific_dates = parts.length ? parts : null;
    }
    for (const k of ["date_from", "date_to", "week_anchor", "cycle_anchor"]) if (out[k] === "") out[k] = null;
    if ("on_holiday" in out) {
      if (out.on_holiday === "") out.on_holiday = null;
      else out.on_holiday = out.on_holiday === "true";
    }
    if (out.action === "skip") out.wake_time = null;
    return out;
  }

  async _saveRule(slug, ruleId, btn) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!person) return;
    const updated = this._collectRuleFields(slug, ruleId);
    let rules = person.rules.map(r => r.id === ruleId ? { ...r, ...updated, id: r.id } : r);
    const changed = rules.find(r => r.id === ruleId);
    if (changed && String(changed.id || "").startsWith(EXCEPTION_PREFIX)) {
      if (changed.date_from && changed.date_to && changed.date_to !== changed.date_from) changed.specific_dates = null;
      else if (changed.date_from) { changed.specific_dates = [changed.date_from]; changed.date_from = null; changed.date_to = null; }
    }
    const ok = await this._ws("wake_planner/set_rules", { person_id: slug, rules });
    if (ok) { this._flashSuccess(btn); this._toast("Gespeichert"); this._renderShell(); }
  }

  async _addRule(slug, btn) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!person) return;
    const rule = {
      id: cryptoRandomId(),
      name: "Spezialregel",
      priority: 200,
      enabled: true,
      weekdays: null,
      on_holiday: null,
      action: "wake",
      wake_time: "07:00",
    };
    const ok = await this._ws("wake_planner/set_rules", { person_id: slug, rules: [...person.rules, rule] });
    if (ok) { this._flashSuccess(btn); this._toast("Regel hinzugefügt"); this._renderShell(); }
  }

  async _addException(slug, btn) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!person) return;
    const read = field => this.querySelector(`[data-exception-field="${slug}|${field}"]`)?.value?.trim() || "";
    const dateFrom = read("date_from");
    const dateTo = read("date_to");
    const action = read("action") || "wake";
    const wakeTime = read("wake_time") || "08:00";
    const note = read("name");
    if (!dateFrom) return this._toast("Datum fehlt", true);
    if (dateTo && dateTo < dateFrom) return this._toast("Bis-Datum liegt vor Von-Datum", true);
    const isRange = Boolean(dateTo && dateTo !== dateFrom);
    const rule = {
      id: `${EXCEPTION_PREFIX}${cryptoRandomId()}`,
      name: note || (isRange ? `Ausnahme ${dateFrom} bis ${dateTo}` : `Ausnahme ${dateFrom}`),
      priority: 20,
      enabled: true,
      weekdays: null,
      on_holiday: null,
      action,
      wake_time: action === "skip" ? null : wakeTime,
      specific_dates: isRange ? null : [dateFrom],
      date_from: isRange ? dateFrom : null,
      date_to: isRange ? dateTo : null,
    };
    const ok = await this._ws("wake_planner/set_rules", { person_id: slug, rules: [...person.rules, rule] });
    if (ok) { this._flashSuccess(btn); this._toast("Ausnahme gespeichert"); this._renderShell(); }
  }

  async _saveProfile(slug, btn) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!person) return;
    const read = field => this.querySelector(`[data-profile-field="${slug}|${field}"]`)?.value;
    const weekdayTime = read("weekday_time") || "07:00";
    const weekendTime = read("weekend_time") || "09:30";
    const holidayAction = read("holiday_action") || "weekend";
    const routine = Math.max(0, Math.min(240, parseInt(read("routine_duration_minutes") || "60", 10)));
    const conflict = read("calendar_conflict_behavior") || "warn_only";
    const profileRules = [
      { id: "profile_weekday", name: "Werktage", priority: 100, enabled: true, weekdays: [0,1,2,3,4], on_holiday: false, action: "wake", wake_time: weekdayTime },
      { id: "profile_weekend", name: "Wochenende", priority: 110, enabled: true, weekdays: [5,6], on_holiday: null, action: "wake", wake_time: weekendTime },
      { id: "profile_holiday", name: "Feiertage", priority: 90, enabled: true, weekdays: [0,1,2,3,4], on_holiday: true, action: holidayAction === "skip" ? "skip" : "wake", wake_time: holidayAction === "skip" ? null : weekendTime },
    ];
    const customRules = (person.rules || []).filter(r => !PROFILE_RULE_IDS.has(r.id));
    const rulesOk = await this._ws("wake_planner/set_rules", { person_id: slug, rules: [...profileRules, ...customRules] });
    if (!rulesOk) return;
    const personOk = await this._ws("wake_planner/update_person", {
      person_id: slug,
      routine_duration_minutes: routine,
      calendar_conflict_behavior: conflict,
    });
    if (personOk) { this._flashSuccess(btn); this._toast("Standardprofil gespeichert"); this._renderShell(); }
  }

  async _deleteRule(slug, ruleId) {
    const person = this._state.persons.find(p => p.slug === slug);
    if (!person) return;
    if (!confirm("Diese Regel löschen?")) return;
    const ok = await this._ws("wake_planner/set_rules", { person_id: slug, rules: person.rules.filter(r => r.id !== ruleId) });
    if (ok) { this._toast("Regel gelöscht"); this._renderShell(); }
  }

  async _saveWindow(slug, btn) {
    const el = this.querySelector(`[data-window-for="${slug}"]`);
    const minutes = Math.max(1, Math.min(120, parseInt(el?.value || "5", 10)));
    const ok = await this._ws("wake_planner/update_person", { person_id: slug, wake_window_minutes: minutes });
    if (ok) { this._flashSuccess(btn); this._toast("Wake-Fenster gespeichert"); }
  }

  async _saveGlobal(btn) {
    const payload = {};
    this.querySelectorAll("[data-global-field]").forEach(el => {
      payload[el.dataset.globalField] = el.value;
    });
    const ok = await this._ws("wake_planner/set_global", payload);
    if (ok) { this._flashSuccess(btn); this._toast("Einstellungen gespeichert"); this._renderShell(); }
  }

  async _deleteManualHoliday(index) {
    const g = this._state?.global || {};
    const items = this._manualHolidayItems(g.manual_holiday_dates);
    items.splice(index, 1);
    const ok = await this._ws("wake_planner/set_global", { manual_holiday_dates: items.join(", ") });
    if (ok) { this._toast("Feiertag entfernt"); this._renderShell(); }
  }

  _openAddPersonDialog() {
    const opts = this._personEntityOptions();
    this._openModal("Person hinzufügen", `
      <label class="field"><span class="label">Name</span><input type="text" id="add-name" placeholder="Benni"></label>
      <label class="field" style="margin-top:12px"><span class="label">Home Assistant Person</span><select id="add-person-entity"><option value="">keine Verknüpfung</option>${opts.map(o => `<option value="${o.id}">${escapeHtml(o.name)} (${o.id})</option>`).join("")}</select></label>
    `, async (modal, sourceBtn) => {
      const name = modal.querySelector("#add-name")?.value?.trim();
      if (!name) return this._toast("Bitte einen Namen eingeben", true);
      const personEntity = modal.querySelector("#add-person-entity")?.value || null;
      const ok = await this._ws("wake_planner/add_person", { name, person_entity_id: personEntity });
      if (ok) {
        this._selectedPersonSlug = ok.slug;
        this._flashSuccess(sourceBtn);
        this._renderShell();
      }
    });
  }

  _openOverrideDialog(slug, sourceBtn) {
    const person = this._state.persons.find(p => p.slug === slug);
    const initialTime = person?.override_time || person?.decision?.wake_time || "07:00";
    const initialUntil = person?.override_until || "";
    this._openModal(`Override für ${escapeHtml(person?.name || slug)}`, `
      <label class="field"><span class="label">Weckzeit</span><input type="time" id="ov-time" value="${initialTime}"></label>
      <label class="field" style="margin-top:12px"><span class="label">Bis Datum (optional)</span><input type="date" id="ov-until" value="${initialUntil}"></label>
      <p class="muted" style="margin-top:10px">Ohne Bis-Datum gilt der Override nur für den aktuellen Tag.</p>
    `, async (modal) => {
      const wake = modal.querySelector("#ov-time").value;
      const until = modal.querySelector("#ov-until").value || null;
      const ok = await this._ws("wake_planner/set_override", { person_id: slug, wake_time: wake, until });
      if (ok) { this._flashSuccess(sourceBtn); this._toast("Override gesetzt"); this._renderShell(); }
    });
  }

  _openEditPersonDialog(slug) {
    const person = this._state.persons.find(p => p.slug === slug);
    const opts = this._personEntityOptions();
    const currentEntity = person?.person_entity_id || "";
    this._openModal(`${escapeHtml(person?.name || slug)} bearbeiten`, `
      <label class="field"><span class="label">Name</span><input type="text" id="ep-name" value="${escapeHtml(person?.name || "")}"></label>
      <label class="field" style="margin-top:12px"><span class="label">Home Assistant Person</span><select id="ep-entity"><option value="">keine Verknüpfung</option>${opts.map(o => `<option value="${o.id}" ${o.id === currentEntity ? "selected" : ""}>${escapeHtml(o.name)} (${o.id})</option>`).join("")}</select></label>
      <p class="muted" style="margin-top:10px">Die technische ID bleibt beim Umbenennen stabil.</p>
    `, async (modal) => {
      const name = modal.querySelector("#ep-name").value.trim();
      const entity = modal.querySelector("#ep-entity").value || null;
      if (!name) return this._toast("Bitte einen Namen eingeben", true);
      const ok = await this._ws("wake_planner/update_person", { person_id: slug, name, person_entity_id: entity });
      if (ok) { this._toast("Person gespeichert"); this._renderShell(); }
    });
  }

  _openManualHolidayDialog() {
    this._openModal("Feiertag hinzufügen", `
      <label class="field"><span class="label">Datum oder Range</span><input type="text" id="manual-holiday" placeholder="2026-12-25 oder 2026-07-01..2026-07-14"></label>
    `, async (modal) => {
      const value = modal.querySelector("#manual-holiday").value.trim();
      if (!value) return this._toast("Datum fehlt", true);
      const items = this._manualHolidayItems(this._state?.global?.manual_holiday_dates);
      const ok = await this._ws("wake_planner/set_global", { manual_holiday_dates: [...items, value].join(", ") });
      if (ok) { this._toast("Feiertag hinzugefügt"); this._renderShell(); }
    });
  }

  _openModal(title, bodyHtml, onConfirm) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        ${bodyHtml}
        <div class="modal-actions">
          <button class="btn" data-modal-cancel>Abbrechen</button>
          <button class="btn primary" data-modal-confirm>OK</button>
        </div>
      </div>`;
    this.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    backdrop.querySelector("[data-modal-cancel]").addEventListener("click", close);
    backdrop.querySelector("[data-modal-confirm]").addEventListener("click", async e => {
      try { await onConfirm(backdrop, e.currentTarget); } finally { close(); }
    });
    setTimeout(() => backdrop.querySelector("input, select, button")?.focus(), 0);
  }

  _flashSuccess(btn) {
    if (!btn) return;
    btn.classList.remove("flash-success");
    void btn.offsetWidth;
    btn.classList.add("flash-success");
    setTimeout(() => btn.classList.remove("flash-success"), 800);
  }

  _toast(message, isError = false) {
    const el = document.createElement("div");
    el.className = `toast${isError ? " error" : ""}`;
    el.textContent = message;
    this.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 180); }, 2400);
  }

  _profileRules(person) {
    const byId = Object.fromEntries((person.rules || []).map(r => [r.id, r]));
    return {
      weekday: byId.profile_weekday || { id: "profile_weekday", name: "Werktage", wake_time: "07:00", action: "wake" },
      weekend: byId.profile_weekend || { id: "profile_weekend", name: "Wochenende", wake_time: "09:30", action: "wake" },
      holiday: byId.profile_holiday || { id: "profile_holiday", name: "Feiertage", wake_time: byId.profile_weekend?.wake_time || "09:30", action: "wake" },
    };
  }

  _personEntityOptions() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id]) => id.startsWith("person."))
      .map(([id, s]) => ({ id, name: s.attributes?.friendly_name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _calendarEntityOptions() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id]) => id.startsWith("calendar."))
      .map(([id, s]) => ({ id, name: s.attributes?.friendly_name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _personEntityLabel(person) {
    return person.person_entity_id || "nicht verknüpft";
  }

  _personPictureUrl(person) {
    if (!person?.person_entity_id || !this._hass?.states) return "";
    const picture = this._hass.states[person.person_entity_id]?.attributes?.entity_picture;
    if (!picture) return "";
    if (/^(https?:)?\/\//.test(picture) || picture.startsWith("data:")) return picture;
    return picture.startsWith("/") ? picture : `/${picture}`;
  }

  _avatarHtml(person, className) {
    const picture = this._personPictureUrl(person);
    const label = escapeHtml(person?.name || "Person");
    if (picture) {
      return `<span class="${className}"><img src="${escapeHtml(picture)}" alt="${label}"></span>`;
    }
    return `<span class="${className}" aria-label="${label}">${escapeHtml(initials(person?.name))}</span>`;
  }

  _statusLabel(dec = {}) {
    const map = { scheduled: "Geplant", skipped: "Übersprungen", overridden: "Override", holiday: "Feiertag", inactive: "Kein Wecker" };
    if (dec.decided_by === "calendar") return "Kalender";
    return map[dec.state] || "Unbekannt";
  }

  _sourceLabel(dec = {}, person = {}) {
    if (dec.decided_by === "override" || dec.state === "overridden") return "Override";
    if (dec.decided_by === "calendar") return "Kalender";
    if (dec.state === "skipped") return "Übersprungen";
    if (dec.state === "holiday" && dec.holiday_name) return dec.holiday_name;
    const rule = (person.rules || []).find(r => r.id && r.id === dec.matched_rule_id);
    if (rule?.id === "profile_weekday") return "Werktagsprofil";
    if (rule?.id === "profile_weekend") return "Wochenendprofil";
    if (rule?.id === "profile_holiday") return "Feiertagsprofil";
    if (rule?.id && String(rule.id).startsWith(EXCEPTION_PREFIX)) return "Ausnahme";
    if (rule?.name) return rule.name;
    if (dec.decided_by === "holiday_fallback") return "Feiertagsregel";
    if (dec.decided_by === "no_rule") return "Keine passende Regel";
    return dec.reason || "Keine Regel";
  }

  _reasonDetail(dec = {}) {
    if (dec.reason) return dec.reason.replace(/^Rule '([^']+)': /, "Regel: $1 · ");
    return "Keine weiteren Details verfügbar";
  }

  _statusMessage(person, dec = {}) {
    if (person.override_time) return `Override aktiv: ${person.override_time}${person.override_until ? ` bis ${person.override_until}` : ""}. Zurücksetzen entfernt den Override.`;
    if (person.skip_next) return "Der nächste Wecker wird übersprungen. Zurücksetzen entfernt den Skip.";
    if (dec.state === "scheduled") return "Alles in Ordnung. Nächster Wecker ist geplant.";
    if (dec.state === "holiday") return `Feiertag erkannt${dec.holiday_name ? `: ${dec.holiday_name}` : ""}.`;
    if (dec.state === "skipped") return "Heute ist kein Wecker geplant.";
    return "Kein aktiver Wecker für heute.";
  }

  _noWakeText(dec = {}) {
    if (dec.state === "holiday") return "Feiertag";
    if (dec.state === "skipped") return "Kein Wecker";
    return "Kein Wecker geplant";
  }

  _shortNoWake(dec = {}) {
    if (dec.state === "holiday") return "Feiertag";
    if (dec.state === "skipped") return "Skip";
    return "—";
  }

  _ruleSummary(rule) {
    const action = rule.action === "skip" ? "kein Wecker" : `${rule.wake_time || "07:00"}`;
    const days = rule.weekdays?.length ? rule.weekdays.map(i => WEEKDAYS.find(d => d.idx === i)?.short).filter(Boolean).join(", ") : "alle Tage";
    return `${days} · ${action}`;
  }

  _conflictOptions(selected = "warn_only") {
    const items = [
      ["warn_only", "nur warnen"],
      ["wake_earlier", "früher wecken"],
      ["ignore", "ignorieren"],
    ];
    return items.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
  }

  _conflictLabel(value = "warn_only") {
    return { warn_only: "nur warnen", wake_earlier: "früher wecken", ignore: "ignorieren" }[value] || "nur warnen";
  }

  _holidayBehaviorLabel(value) {
    return value === "weekend_profile" ? "wie Wochenende" : "kein Wecker";
  }

  _manualHolidayItems(raw) {
    return String(raw || "").split(/[;,]/).map(s => s.trim()).filter(Boolean);
  }

  _formatDateTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  _dayLabel(d) {
    return `${WEEKDAYS[(d.getDay() + 6) % 7].short} ${d.getDate()}.${d.getMonth() + 1}.`;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initials(name) {
  const text = String(name || "?").trim();
  return (text.match(/\p{L}/u)?.[0] || "?").toUpperCase();
}

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cryptoRandomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "r-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

customElements.define("wake-planner-panel", WakePlannerPanel);
