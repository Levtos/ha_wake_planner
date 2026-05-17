class WakePlannerPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._tab) this._tab = 'today';
    if (!this._calendarEvents) this._calendarEvents = {};
    this._fetchAndRender();
  }

  connectedCallback() { this._fetchAndRender(); }

  get _wakeEntities() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id]) => id.startsWith('sensor.wake_planner_') && id.endsWith('_wake_state'))
      .map(([entityId, state]) => ({ entityId, state }));
  }

  _personSlug(entityId) {
    return entityId.replace('sensor.wake_planner_', '').replace('_wake_state', '');
  }

  _state(entityId) { return this._hass?.states?.[entityId]; }

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

  async _logSleep(slug) {
    const sleepTime = prompt('Sleep time (ISO or HH:MM)', '23:00');
    if (!sleepTime) return;
    const wakeTime = prompt('Wake time (ISO or HH:MM)', '07:00');
    if (!wakeTime) return;
    await this._callService('wake_planner', 'log_sleep', { person_id: slug, sleep_time: sleepTime, wake_time: wakeTime });
  }

  _setTab(tab) { this._tab = tab; this._fetchAndRender(); }

  async _fetchAndRender() {
    if (!this._hass) return;
    if (this._tab === 'calendar') await this._loadCalendarEvents();
    this.render();
  }

  async _loadCalendarEvents() {
    const writeCalEntityId = this._getWriteCalendarEntityId();
    const readCalEntityId = this._getReadCalendarEntityId();
    const entities = [writeCalEntityId, readCalEntityId].filter(Boolean);
    if (!entities.length) return;

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 14);

    this._calendarEvents = {};
    for (const entityId of entities) {
      try {
        const events = await this._hass.callApi(
          'GET',
          `calendars/${entityId}?start=${now.toISOString()}&end=${end.toISOString()}`
        );
        for (const evt of (events || [])) {
          const dateKey = (evt.start?.dateTime || evt.start?.date || '').substring(0, 10);
          if (!dateKey) continue;
          if (!this._calendarEvents[dateKey]) this._calendarEvents[dateKey] = [];
          this._calendarEvents[dateKey].push(evt);
        }
      } catch (e) { /* calendar may not be configured */ }
    }
  }

  _getWriteCalendarEntityId() {
    const entity = this._wakeEntities[0];
    if (!entity) return null;
    return entity.state.attributes.write_calendar_entity_id || null;
  }

  _getReadCalendarEntityId() {
    const entity = this._wakeEntities[0];
    if (!entity) return null;
    return entity.state.attributes.calendar_entity_id || null;
  }

  render() {
    if (!this._hass) return;
    const people = this._wakeEntities;
    const tabs = ['today', 'calendar', 'stats', 'settings'];
    const labels = { today: 'Today', calendar: 'Calendar', stats: 'Statistics', settings: 'Settings' };
    let body;
    if (!people.length) {
      body = '<ha-card><div class="empty"><p>No Wake Planner entities found yet.</p><p>Set up the integration under Settings → Devices &amp; Services → Add Integration → Wake Planner.</p></div></ha-card>';
    } else if (this._tab === 'calendar') {
      body = this._renderCalendarView(people);
    } else {
      body = `<div class="grid">${people.map((item) => this._renderPerson(item)).join('')}</div>`;
    }
    this.innerHTML = `
      <style>
        :host { display:block; padding:16px; color:var(--primary-text-color); background:var(--primary-background-color); }
        .tabs { display:flex; gap:8px; overflow:auto; margin-bottom:16px; flex-wrap:wrap; }
        button, .tab { border:0; border-radius:14px; padding:10px 16px; min-height:44px; background:var(--card-background-color); color:var(--primary-text-color); box-shadow:var(--ha-card-box-shadow,0 2px 6px #0002); cursor:pointer; font-size:14px; }
        .tab.active { background:var(--primary-color); color:var(--text-primary-color,#fff); }
        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
        ha-card, .card { display:block; border-radius:18px; padding:18px; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow,0 2px 6px #0002); }
        .time { font-size:clamp(42px,12vw,72px); font-weight:800; letter-spacing:-0.05em; margin:8px 0; }
        .badge { display:inline-flex; align-items:center; border-radius:999px; padding:6px 10px; font-weight:700; text-transform:uppercase; font-size:12px; }
        .scheduled{background:#1b5e20;color:#fff} .skipped{background:#616161;color:#fff} .overridden{background:#ef6c00;color:#fff} .holiday{background:#b71c1c;color:#fff} .inactive{background:#37474f;color:#fff} .shift_cycle{background:#1a237e;color:#fff}
        .reason { opacity:.85; margin:12px 0; line-height:1.5; font-size:14px; }
        .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
        .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; min-width:560px; }
        .cal-day { border:1px solid var(--divider-color); border-radius:10px; padding:8px; min-height:80px; }
        .cal-day.today { border-color:var(--primary-color); border-width:2px; }
        .cal-day.weekend { background:var(--secondary-background-color); }
        .cal-day-header { font-size:11px; opacity:.6; margin-bottom:4px; }
        .cal-date { font-weight:700; font-size:15px; }
        .cal-wake { margin-top:6px; font-size:13px; font-weight:600; }
        .cal-wake.from-calendar { color:var(--warning-color,#ef6c00); }
        .cal-wake.from-shift { color:var(--info-color,#1976d2); }
        .cal-evt { font-size:11px; opacity:.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
        .cal-scroll { overflow-x:auto; }
        .cal-week-label { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:4px; min-width:560px; }
        .cal-week-label div { font-size:11px; font-weight:700; text-align:center; opacity:.5; padding:4px; }
        .info-chip { display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:600; background:var(--secondary-background-color); margin:2px; }
        .empty { padding:24px; }
        svg { width:100%; height:120px; }
        @media (max-width:720px) { :host { padding:8px; } }
      </style>
      <div class="tabs">
        ${tabs.map((tab) => `<button class="tab ${this._tab === tab ? 'active' : ''}" data-tab="${tab}">${labels[tab]}</button>`).join('')}
      </div>
      ${body}`;
    this.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => this._setTab(el.dataset.tab)));
    this.querySelectorAll('[data-skip]').forEach((el) => el.addEventListener('click', () => this._skip(el.dataset.skip)));
    this.querySelectorAll('[data-override]').forEach((el) => el.addEventListener('click', () => this._override(el.dataset.override)));
    this.querySelectorAll('[data-log-sleep]').forEach((el) => el.addEventListener('click', () => this._logSleep(el.dataset.logSleep)));
    this.querySelectorAll('[data-options]').forEach((el) => el.addEventListener('click', () => history.pushState(null, '', '/config/integrations')));
  }

  _renderPerson({ entityId, state }) {
    const slug = this._personSlug(entityId);
    const name = state.attributes.friendly_name?.replace(' Wake state', '') || slug;
    if (this._tab === 'stats') return this._renderStats(slug, name);
    if (this._tab === 'settings') return this._renderSettings(slug, name, state);
    return this._renderToday(slug, name, state);
  }

  _renderToday(slug, name, state) {
    const next = this._state(`sensor.wake_planner_${slug}_next_wake`);
    const bedtime = this._state(`sensor.wake_planner_${slug}_suggested_bedtime`);
    const displayTime = next?.state && next.state !== 'unknown' && next.state !== 'unavailable'
      ? new Date(next.state).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    const bedDisplay = bedtime?.state && bedtime.state !== 'unknown' && bedtime.state !== 'unavailable'
      ? new Date(bedtime.state).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    const decidedBy = state.attributes.decided_by || '—';
    const isCalOverride = decidedBy === 'calendar';
    const isShift = decidedBy === 'shift_cycle';
    const badgeClass = isCalOverride ? 'overridden' : isShift ? 'shift_cycle' : state.state;
    return `<ha-card>
      <h2 style="margin:0 0 12px">${name}</h2>
      <span class="badge ${badgeClass}">${isShift ? '⏰ Shift' : isCalOverride ? '📅 Calendar override' : state.state}</span>
      <div class="time">${displayTime}</div>
      <div class="reason">${state.attributes.reason || ''}</div>
      <div style="font-size:14px;opacity:.8">Bedtime suggestion: <b>${bedDisplay}</b></div>
      <div class="actions">
        <button data-skip="${slug}">Skip next</button>
        <button data-override="${slug}">Set override</button>
        <button data-log-sleep="${slug}">Log sleep</button>
      </div>
    </ha-card>`;
  }

  _renderCalendarView(people) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const cells = days.map((d) => {
      const dateKey = d.toISOString().substring(0, 10);
      const isToday = d.getTime() === today.getTime();
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const events = this._calendarEvents[dateKey] || [];

      let wakeHtml = '';
      for (const { entityId, state } of people) {
        const slug = this._personSlug(entityId);
        const name = people.length > 1 ? `<span style="opacity:.6;font-size:11px">${slug}: </span>` : '';
        if (isToday) {
          const wakeTime = state.attributes.wake_time;
          const decidedBy = state.attributes.decided_by || '';
          const cls = decidedBy === 'calendar' ? 'from-calendar' : decidedBy === 'shift_cycle' ? 'from-shift' : '';
          const indicator = decidedBy === 'calendar' ? ' 📅' : decidedBy === 'shift_cycle' ? ' 🔄' : '';
          wakeHtml += `<div class="cal-wake ${cls}">${name}${wakeTime || state.state}${indicator}</div>`;
        } else {
          const wakeEvt = events.find((e) => /wake:\s*\d{1,2}:\d{2}/i.test(e.summary || e.title || ''));
          if (wakeEvt) {
            const m = (wakeEvt.summary || wakeEvt.title || '').match(/wake:\s*(\d{1,2}:\d{2})/i);
            wakeHtml += `<div class="cal-wake from-calendar">${name}${m ? m[1] : '?'} 📅</div>`;
          }
        }
      }

      const evtHtml = events
        .filter((e) => !/wake:/i.test(e.summary || e.title || ''))
        .slice(0, 2)
        .map((e) => `<div class="cal-evt">• ${e.summary || e.title || '?'}</div>`)
        .join('');

      return `<div class="cal-day${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}">
        <div class="cal-day-header">${dayNames[d.getDay()]}</div>
        <div class="cal-date">${d.getDate()}</div>
        ${wakeHtml}
        ${evtHtml}
      </div>`;
    });

    const noCalWarning = !this._getWriteCalendarEntityId() && !this._getReadCalendarEntityId()
      ? '<span class="info-chip" style="color:var(--error-color,red)">⚠ No calendar configured</span>'
      : '';
    const legend = `<div style="margin-top:12px;font-size:12px;opacity:.7">
      <span class="info-chip">📅 Calendar override</span>
      <span class="info-chip">🔄 Shift cycle</span>
      ${noCalWarning}
    </div>`;

    return `<ha-card>
      <h2 style="margin:0 0 16px">Next 14 days</h2>
      <div class="cal-scroll">
        <div class="cal-week-label">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>
      ${legend}
    </ha-card>`;
  }

  _renderStats(slug, name) {
    const avg = this._state(`sensor.wake_planner_${slug}_sleep_duration_avg`);
    const value = Number(avg?.state || 0);
    const bar = Math.min(100, Math.max(0, value / 10 * 100));
    return `<ha-card>
      <h2 style="margin:0 0 12px">${name}</h2>
      <p>Average sleep: <b>${avg?.state !== 'unknown' && avg?.state ? avg.state + ' h' : '—'}</b></p>
      <svg viewBox="0 0 100 40">
        <rect x="0" y="10" width="100" height="20" rx="4" fill="var(--divider-color)"></rect>
        <rect x="0" y="10" width="${bar}" height="20" rx="4" fill="var(--primary-color)"></rect>
      </svg>
      <p style="font-size:13px;opacity:.7">Log sleep with the "Log sleep" button on the Today tab. Last 90 entries are stored.</p>
      <button data-log-sleep="${slug}">Log sleep</button>
    </ha-card>`;
  }

  _renderSettings(slug, name, state) {
    const decidedBy = state.attributes.decided_by || '—';
    const shiftActive = decidedBy === 'shift_cycle';
    const profileDay = state.attributes.profile_day || '—';
    return `<ha-card>
      <h2 style="margin:0 0 12px">${name}</h2>
      <p><b>Current decision source:</b> ${decidedBy}</p>
      <p><b>Profile day:</b> ${profileDay}</p>
      ${shiftActive ? `<p><b>Shift active:</b> ${state.attributes.reason || '—'}</p>` : ''}
      <p><b>Holiday/weekend:</b> ${state.attributes.holiday_name || 'none'}</p>
      <p><b>Override until:</b> ${state.attributes.override_until || 'none'}</p>
      <div class="actions">
        <button data-options="1">Edit configuration</button>
      </div>
      <p style="font-size:12px;opacity:.6;margin-top:12px">To change shift cycles, weekly profiles, or calendars, click "Edit configuration" to open the integration options.</p>
    </ha-card>`;
  }
}
customElements.define('wake-planner-panel', WakePlannerPanel);
