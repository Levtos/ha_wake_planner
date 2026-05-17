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
        .settings-section { margin-bottom:24px; padding-bottom:20px; border-bottom:1px solid var(--divider-color); }
        .settings-section:last-child { border-bottom:0; margin-bottom:0; padding-bottom:0; }
        .save-btn { background:var(--primary-color); color:var(--text-primary-color,#fff); border-radius:10px; padding:8px 16px; font-size:13px; font-weight:600; }
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

    // Save weekly profile
    this.querySelectorAll('[data-save-profile]').forEach((el) => el.addEventListener('click', async () => {
      const slug = el.dataset.saveProfile;
      const profile = {};
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach((day) => {
        const activeEl = this.querySelector(`[data-person="${slug}"][data-day="${day}"][data-type="active"]`);
        const timeEl = this.querySelector(`[data-person="${slug}"][data-day="${day}"][data-type="time"]`);
        profile[day] = { active: activeEl?.checked ?? false, wake_time: timeEl?.value ?? '07:00' };
      });
      try {
        await this._hass.callService('wake_planner', 'set_weekly_profile', { person_id: slug, profile });
        el.textContent = '✓ Saved';
        setTimeout(() => { el.textContent = '💾 Save weekly profile'; }, 2000);
      } catch (e) {
        el.textContent = '✗ Error'; setTimeout(() => { el.textContent = '💾 Save weekly profile'; }, 3000);
      }
    }));

    // Apply global time to all active days
    this.querySelectorAll('[data-apply-global]').forEach((el) => el.addEventListener('click', () => {
      const slug = el.dataset.applyGlobal;
      const globalTimeEl = this.querySelector(`[data-person="${slug}"][data-type="global-time"]`);
      const globalTime = globalTimeEl?.value;
      if (!globalTime) return;
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach((day) => {
        const activeEl = this.querySelector(`[data-person="${slug}"][data-day="${day}"][data-type="active"]`);
        const timeEl = this.querySelector(`[data-person="${slug}"][data-day="${day}"][data-type="time"]`);
        if (activeEl?.checked && timeEl) timeEl.value = globalTime;
      });
    }));

    // Save sleep settings
    this.querySelectorAll('[data-save-sleep]').forEach((el) => el.addEventListener('click', async () => {
      const slug = el.dataset.saveSleep;
      const hoursEl = this.querySelector(`[data-person="${slug}"][data-type="sleep-hours"]`);
      const windowEl = this.querySelector(`[data-person="${slug}"][data-type="wake-window"]`);
      try {
        await this._hass.callService('wake_planner', 'set_sleep_settings', {
          person_id: slug,
          target_sleep_hours: parseFloat(hoursEl?.value || 7.5),
          wake_window_minutes: parseInt(windowEl?.value || 5),
        });
        el.textContent = '✓ Saved'; setTimeout(() => { el.textContent = '💾 Save sleep settings'; }, 2000);
      } catch (e) {
        el.textContent = '✗ Error'; setTimeout(() => { el.textContent = '💾 Save sleep settings'; }, 3000);
      }
    }));

    // Save special rules (shown on settings tab)
    this.querySelectorAll('[data-save-rules]').forEach((el) => el.addEventListener('click', async () => {
      const behaviorEl = this.querySelector('[data-type="holiday-behavior"]');
      const datesEl = this.querySelector('[data-type="manual-dates"]');
      try {
        await this._hass.callService('wake_planner', 'set_special_rules', {
          holiday_behavior: behaviorEl?.value || 'skip',
          manual_holiday_dates: datesEl?.value || '',
        });
        el.textContent = '✓ Saved'; setTimeout(() => { el.textContent = '💾 Save special rules'; }, 2000);
      } catch (e) {
        el.textContent = '✗ Error'; setTimeout(() => { el.textContent = '💾 Save special rules'; }, 3000);
      }
    }));
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
    const wp = state.attributes.weekly_profile || {};
    const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    const profileRows = DAYS.map((day, i) => {
      const dp = wp[day] || {active: i < 5, wake_time: '07:00'};
      const checked = dp.active ? 'checked' : '';
      return `<tr>
          <td style="font-weight:600;padding:6px 10px 6px 0">${DAY_LABELS[i]}</td>
          <td style="padding:4px 10px"><input type="checkbox" data-person="${slug}" data-day="${day}" data-type="active" ${checked} style="width:18px;height:18px;cursor:pointer"></td>
          <td style="padding:4px 0"><input type="time" data-person="${slug}" data-day="${day}" data-type="time" value="${dp.wake_time}" style="padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px"></td>
      </tr>`;
    }).join('');

    const sleepHours = state.attributes.target_sleep_hours || 7.5;
    const wakeWindow = state.attributes.wake_window_minutes || 5;
    const holidayBehavior = state.attributes.holiday_behavior || 'skip';
    const manualDates = state.attributes.manual_holiday_dates || '';

    return `<ha-card>
        <h2 style="margin:0 0 20px">${name}</h2>

        <div class="settings-section">
            <h3 style="margin:0 0 4px;font-size:15px">Weekly Profile</h3>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">Configure which days Wake Planner is active and the wake time for each.</p>
            <div style="margin-bottom:10px">
                <label style="font-size:13px;display:flex;align-items:center;gap:8px">
                    <span style="opacity:.7">Set all active days to:</span>
                    <input type="time" data-person="${slug}" data-type="global-time" style="padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px">
                    <button data-apply-global="${slug}" style="padding:5px 10px;font-size:12px">Apply</button>
                </label>
            </div>
            <table style="border-collapse:collapse;width:100%"><tbody>${profileRows}</tbody></table>
            <div style="margin-top:12px">
                <button data-save-profile="${slug}" class="save-btn">💾 Save weekly profile</button>
            </div>
        </div>

        <div class="settings-section">
            <h3 style="margin:0 0 4px;font-size:15px">Sleep Settings</h3>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">Target sleep duration determines the suggested bedtime. Wake window controls how long before the wake time the "wake needed" sensor activates.</p>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
                <label style="font-size:13px;display:flex;align-items:center;gap:8px">
                    Target sleep:
                    <input type="number" min="4" max="12" step="0.5" value="${sleepHours}" data-person="${slug}" data-type="sleep-hours" style="width:60px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px"> h
                </label>
                <label style="font-size:13px;display:flex;align-items:center;gap:8px">
                    Wake window:
                    <input type="number" min="1" max="60" value="${wakeWindow}" data-person="${slug}" data-type="wake-window" style="width:60px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px"> min
                </label>
            </div>
            <div style="margin-top:12px">
                <button data-save-sleep="${slug}" class="save-btn">💾 Save sleep settings</button>
            </div>
        </div>

        <div class="settings-section">
            <h3 style="margin:0 0 4px;font-size:15px">Special Rules</h3>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">These settings apply to all persons.</p>
            <label style="font-size:13px;display:block;margin-bottom:10px">
                Weekend / Holiday behavior:<br>
                <select data-type="holiday-behavior" style="margin-top:6px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px;width:100%">
                    <option value="skip" ${holidayBehavior === 'skip' ? 'selected' : ''}>Skip wake</option>
                    <option value="weekend_profile" ${holidayBehavior === 'weekend_profile' ? 'selected' : ''}>Use weekend profile</option>
                </select>
            </label>
            <label style="font-size:13px;display:block">
                Manual holiday/vacation dates (comma-separated, e.g. 2025-12-25, 12-26, 2025-07-01..2025-07-14):<br>
                <input type="text" data-type="manual-dates" value="${manualDates}" placeholder="YYYY-MM-DD, MM-DD, YYYY-MM-DD..YYYY-MM-DD" style="margin-top:6px;width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px">
            </label>
            <div style="margin-top:12px">
                <button data-save-rules="1" class="save-btn">💾 Save special rules</button>
            </div>
        </div>

        <div class="settings-section">
            <h3 style="margin:0 0 4px;font-size:15px">Advanced / Shift Cycle</h3>
            <p style="font-size:12px;opacity:.65;margin:0 0 12px">Shift cycle and calendar settings are configured via the integration options.</p>
            <button data-options="1">Open integration options</button>
        </div>
    </ha-card>`;
  }
}
customElements.define('wake-planner-panel', WakePlannerPanel);
