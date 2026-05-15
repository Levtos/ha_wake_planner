class WakePlannerPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._tab) this._tab = 'today';
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  get _wakeEntities() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([entityId]) => entityId.startsWith('sensor.wake_planner_') && entityId.endsWith('_wake_state'))
      .map(([entityId, state]) => ({ entityId, state }));
  }

  _personSlug(entityId) {
    return entityId.replace('sensor.wake_planner_', '').replace('_wake_state', '');
  }

  _state(entityId) {
    return this._hass?.states?.[entityId];
  }

  _callService(domain, service, data) {
    return this._hass.callService(domain, service, data);
  }

  async _skip(slug) {
    await this._callService('wake_planner', 'skip_next', { person_id: slug });
  }

  async _override(slug) {
    const wakeTime = prompt('Wake time (HH:MM)', '07:00');
    if (!wakeTime) return;
    await this._callService('wake_planner', 'set_override', { person_id: slug, wake_time: wakeTime });
  }

  _setTab(tab) {
    this._tab = tab;
    this.render();
  }

  render() {
    if (!this._hass) return;
    const people = this._wakeEntities;
    const body = people.length ? people.map((item) => this._renderPerson(item)).join('') : '<ha-card><div class="empty">No Wake Planner entities found yet.</div></ha-card>';
    this.innerHTML = `
      <style>
        :host { display:block; padding: 16px; color: var(--primary-text-color); background: var(--primary-background-color); }
        .tabs { display:flex; gap:8px; overflow:auto; margin-bottom:16px; }
        button, .tab { border:0; border-radius:14px; padding:12px 16px; min-height:44px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: var(--ha-card-box-shadow); cursor:pointer; }
        .tab.active { background: var(--primary-color); color: var(--text-primary-color); }
        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; }
        ha-card, .card { display:block; border-radius:18px; padding:18px; background: var(--card-background-color); box-shadow: var(--ha-card-box-shadow); }
        .time { font-size: clamp(42px, 12vw, 72px); font-weight: 800; letter-spacing:-0.05em; margin:8px 0; }
        .badge { display:inline-flex; align-items:center; border-radius:999px; padding:6px 10px; font-weight:700; text-transform:uppercase; font-size:12px; }
        .scheduled { background:#1b5e20; color:white; } .skipped { background:#616161; color:white; } .overridden { background:#ef6c00; color:white; } .holiday { background:#b71c1c; color:white; } .inactive { background:#37474f; color:white; }
        .reason { opacity:.85; margin:12px 0; line-height:1.5; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
        .week { display:grid; grid-template-columns: repeat(7, minmax(120px, 1fr)); gap:10px; overflow:auto; }
        .day { border:1px solid var(--divider-color); border-radius:14px; padding:12px; }
        input { width:100%; box-sizing:border-box; margin-top:8px; padding:10px; border-radius:10px; border:1px solid var(--divider-color); background: var(--secondary-background-color); color: var(--primary-text-color); }
        svg { width:100%; height:120px; }
        .empty { padding: 24px; }
        @media (max-width: 720px) { :host { padding:8px; } .week { grid-template-columns: repeat(2, minmax(140px,1fr)); } }
      </style>
      <div class="tabs">
        ${['today','week','stats','settings'].map((tab) => `<button class="tab ${this._tab === tab ? 'active' : ''}" data-tab="${tab}">${this._label(tab)}</button>`).join('')}
      </div>
      <div class="grid">${body}</div>`;
    this.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => this._setTab(el.dataset.tab)));
    this.querySelectorAll('[data-skip]').forEach((el) => el.addEventListener('click', () => this._skip(el.dataset.skip)));
    this.querySelectorAll('[data-override]').forEach((el) => el.addEventListener('click', () => this._override(el.dataset.override)));
    this.querySelectorAll('[data-options]').forEach((el) => el.addEventListener('click', () => history.pushState(null, '', '/config/integrations')));
  }

  _label(tab) {
    return { today: 'Today / Next wake', week: 'Weekly plan', stats: 'Statistics', settings: 'Settings' }[tab];
  }

  _renderPerson({ entityId, state }) {
    const slug = this._personSlug(entityId);
    const name = state.attributes.friendly_name?.replace(' Wake state', '') || slug;
    if (this._tab === 'week') return this._renderWeek(slug, name, state);
    if (this._tab === 'stats') return this._renderStats(slug, name, state);
    if (this._tab === 'settings') return this._renderSettings(slug, name, state);
    return this._renderToday(slug, name, state);
  }

  _renderToday(slug, name, state) {
    const next = this._state(`sensor.wake_planner_${slug}_next_wake`);
    const bedtime = this._state(`sensor.wake_planner_${slug}_suggested_bedtime`);
    const displayTime = next?.state && next.state !== 'unknown' ? new Date(next.state).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    return `<ha-card>
      <h2>${name}</h2>
      <span class="badge ${state.state}">${state.state}</span>
      <div class="time">${displayTime}</div>
      <div class="reason">Decided by: <b>${state.attributes.decided_by || '—'}</b><br>${state.attributes.reason || ''}</div>
      <div>Suggested bedtime: <b>${bedtime?.state && bedtime.state !== 'unknown' ? new Date(bedtime.state).toLocaleString() : '—'}</b></div>
      <div class="actions"><button data-skip="${slug}">Skip Next</button><button data-override="${slug}">Set Override</button></div>
    </ha-card>`;
  }

  _renderWeek(slug, name, state) {
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    return `<ha-card><h2>${name}</h2><div class="week">${days.map((day) => `<div class="day"><b>${day}</b><input type="time" value="${state.attributes.profile_day === day ? state.attributes.wake_time || '07:00' : '07:00'}"><label><input type="checkbox" checked> active</label></div>`).join('')}</div><div class="reason">Holiday: ${state.attributes.holiday_name || 'none'} · Calendar override indicators appear when current decision was made by calendar.</div><button data-options="1">Save via Options</button></ha-card>`;
  }

  _renderStats(slug, name) {
    const avg = this._state(`sensor.wake_planner_${slug}_sleep_duration_avg`);
    const value = Number(avg?.state || 0);
    const bar = Math.min(100, Math.max(0, value / 10 * 100));
    return `<ha-card><h2>${name}</h2><p>You sleep ${avg?.state || '—'} hours on average. Target is shown in entity attributes.</p><svg viewBox="0 0 100 40"><rect x="0" y="10" width="100" height="20" rx="4" fill="var(--divider-color)"></rect><rect x="0" y="10" width="${bar}" height="20" rx="4" fill="var(--primary-color)"></rect></svg><p>Last 7 days are available in the sleep log attributes after logging sleep.</p></ha-card>`;
  }

  _renderSettings(slug, name, state) {
    return `<ha-card><h2>${name}</h2><p>CalDAV and holiday calendar status are available through diagnostics and entity attributes.</p><p>Current holiday/weekend reason: ${state.attributes.holiday_name || '—'}</p><button data-options="1">Open integration options</button><button>Test CalDAV</button></ha-card>`;
  }
}
customElements.define('wake-planner-panel', WakePlannerPanel);
