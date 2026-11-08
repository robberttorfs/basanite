/* global hangar, state, h, esc, $, openPop, closePop, HangarCommands, HangarThemes, HangarLook, HangarStudio, HangarPalette */
// The Settings dialog: left navigation, search across everything, one line of explanation per
// setting. Pages are data (PAGES), so a new setting is one entry. Themes live on Appearance.
'use strict';

const HangarSettings = (() => {
  const T = HangarThemes;
  const notify = (k) => ({ get: () => state.settings.notify[k], set: (v) => hangar.setSettings({ notify: { [k]: v } }) });
  const plain = (k, fallback) => ({ get: () => state.settings[k] ?? fallback, set: (v) => hangar.setSettings({ [k]: v }) });
  const run = (id) => () => { closePop(); HangarCommands.run(id); };

  const ICONS = {
    appearance: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11" /><path class="half" d="M8 2.5a5.5 5.5 0 0 1 0 11z"/>',
    terminal: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M4.5 6l2 2-2 2M8.5 10.5h3"/>',
    sessions: '<rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="4.5" rx="1"/><rect x="9" y="9" width="5" height="4.5" rx="1"/>',
    notifications: '<path d="M4 7a4 4 0 0 1 8 0c0 3.5 1.5 4.5 1.5 4.5h-11S4 10.5 4 7z"/><path d="M6.7 13.500a1.5 1.5 0 0 0 2.600 0"/>',
    overseer: '<path d="M1.5 8s2.4-4.5 6.5-4.500S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    keyboard: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.500h.01M6.5 6.500h.01M9 6.500h.01M11.5 6.500h.01M5 9.500h6"/>',
    about: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.500v3M8 5.300v.01"/>',
  };

  const PAGES = [
    { id: 'appearance', label: 'Appearance', sections: [
      { custom: drawThemes, keys: 'theme themes colour color dark light system custom create claude import export gallery preset' },
      { title: 'Interface', rows: [
        { label: 'Density', desc: 'Compact fits more on screen by tightening tile headers and gaps.', type: 'select', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']], ...plain('density', 'comfortable') },
        { label: 'Interface size', desc: 'Makes the whole app larger or smaller. Terminal text has its own size under Terminal.', type: 'stepper', buttons: [['Smaller', -1], ['Reset', 0], ['Larger', 1]] },
        { label: 'Reduce motion', desc: 'Turns off animations and transitions.', type: 'toggle', ...plain('reduceMotion', false) },
      ] },
    ] },
    { id: 'terminal', label: 'Terminal', sections: [
      { title: 'Text', rows: [
        { label: 'Font', desc: 'Used in every terminal. A font that isn\'t installed falls back to the default.', type: 'combo', options: ['Consolas', 'Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Menlo'], placeholder: 'Default', ...plain('termFont', '') },
        { label: 'Font size', desc: 'Terminal text size in points.', type: 'number', min: 8, max: 28, ...plain('fontSize', 13) },
        { label: 'Line spacing', desc: 'How much room each line of terminal text gets.', type: 'select', options: [['', 'Automatic'], ['1.1', 'Tight'], ['1.24', 'Normal'], ['1.4', 'Roomy']], get: () => String(state.settings.termLineHeight || ''), set: (v) => hangar.setSettings({ termLineHeight: Number(v) || 0 }) },
      ] },
      { title: 'Cursor', rows: [
        { label: 'Cursor style', desc: 'Applies to plain terminals. Claude Code draws its own input cursor.', type: 'select', options: [['block', 'Block'], ['bar', 'Bar'], ['underline', 'Underline']], ...plain('cursorStyle', 'block') },
        { label: 'Blinking cursor', desc: 'Makes the terminal cursor blink.', type: 'toggle', ...plain('cursorBlink', false) },
      ] },
      { title: 'Look', rows: [
        { label: 'Polished terminal', desc: 'Adds a little padding around terminal text.', type: 'toggle', get: () => state.settings.polishTerm !== false, set: (v) => hangar.setSettings({ polishTerm: v }) },
        { label: 'Terminal colours', desc: 'These come from the theme. Create or edit a theme to change them.', type: 'button', text: 'Open themes', run: () => show('appearance') },
      ] },
    ] },
    { id: 'sessions', label: 'Sessions', sections: [
      { title: 'New sessions', rows: [
        { label: 'Permissions', desc: 'What Claude Code may do without asking, for sessions started from now on.', type: 'select', options: [['default', 'Ask first'], ['acceptEdits', 'Accept edits'], ['plan', 'Plan mode'], ['auto', 'Auto'], ['bypassPermissions', 'Skip all prompts']], ...plain('permissionMode', 'default') },
        { label: 'Open in clean view', desc: 'Starts sessions as a chat rather than a terminal. You can switch per session.', type: 'toggle', ...plain('cleanDefault', false) },
      ] },
    ] },
    { id: 'notifications', label: 'Notifications', sections: [
      { title: 'Tell me when', rows: [
        { label: 'A session needs me', desc: 'Claude is waiting for an answer or a permission.', type: 'toggle', ...notify('needsInput') },
        { label: 'A session finishes', desc: 'Claude has finished what you asked.', type: 'toggle', ...notify('done') },
        { label: 'Context is filling up', desc: 'Notifies at this percentage of a session\'s context. Leave empty to turn it off.', type: 'number', min: 0, max: 100, empty: true, ...notify('contextPct') },
        { label: 'Plan usage is high', desc: 'Notifies at this percentage of your 5-hour or weekly limit. Leave empty to turn it off.', type: 'number', min: 0, max: 100, empty: true, ...notify('usagePct') },
      ] },
      { title: 'How', rows: [{ label: 'Sound', desc: 'Plays the system sound with each notification.', type: 'toggle', ...notify('sound') }] },
    ] },
    { id: 'overseer', label: 'Overseer', sections: [
      { title: 'Overseer', rows: [
        { label: 'Model', desc: 'The small Claude in the side panel that can see all your sessions. Haiku is cheapest, Opus the most capable.', type: 'select', options: [['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus']], ...plain('overseerModel', 'sonnet') },
      ] },
    ] },
    { id: 'keyboard', label: 'Keyboard', sections: [
      { title: 'Shortcuts', rows: [
        { label: 'All keyboard shortcuts', desc: 'Every shortcut in one list.', type: 'button', text: 'Show', run: () => { closePop(); HangarPalette.openShortcuts(); } },
        { label: 'Command palette', desc: 'Search for any action, session or mode.', type: 'button', text: 'Open', run: run('app.palette') },
      ] },
    ] },
    { id: 'about', label: 'About', sections: [
      { title: hangar.appName, rows: [
        { label: 'Show the intro', desc: 'The welcome screen from your first launch.', type: 'button', text: 'Show', run: run('app.intro') },
        { label: 'Report a bug', desc: 'Opens a form on GitHub. Nothing is sent until you submit it.', type: 'button', text: 'Report', run: run('app.report-bug') },
        { label: 'Send feedback', desc: 'Tell us what\'s missing or what you\'d change.', type: 'button', text: 'Send', run: run('app.feedback') },
        { label: 'Debug info', desc: 'Copies your app, system and Claude Code versions.', type: 'button', text: 'Copy', run: () => HangarCommands.run('app.copy-debug') },
      ] },
    ] },
  ];

  let el = null, body = null, page = 'appearance';
  const svg = (id) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  // ---------- rows ----------
  function control(r) {
    const c = h('div', 'st-c');
    if (r.type === 'toggle') {
      c.innerHTML = `<label class="st-switch"><input type="checkbox" aria-label="${esc(r.label)}" ${r.get() ? 'checked' : ''}><i></i></label>`;
      $('input', c).onchange = (e) => r.set(e.target.checked);
    } else if (r.type === 'select') {
      c.innerHTML = `<select class="st-select" aria-label="${esc(r.label)}">${r.options.map(([v, l]) => `<option value="${esc(v)}" ${String(r.get() ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      $('select', c).onchange = (e) => r.set(e.target.value);
    } else if (r.type === 'number') {
      const v = r.get();
      c.innerHTML = `<input class="field st-num" type="number" aria-label="${esc(r.label)}" min="${r.min}" max="${r.max}" value="${v || (r.empty ? '' : r.min)}" ${r.empty ? 'placeholder="Off"' : ''}>`;
      $('input', c).onchange = (e) => {
        const n = Math.round(Number(e.target.value));
        if (r.empty && !e.target.value) { r.set(0); return; }
        const val = Math.max(r.min, Math.min(r.max, Number.isFinite(n) ? n : r.min));
        e.target.value = val;
        r.set(val);
      };
    } else if (r.type === 'combo') {
      const id = `st-l-${Math.random().toString(36).slice(2, 7)}`;
      c.innerHTML = `<input class="field st-text" list="${id}" aria-label="${esc(r.label)}" placeholder="${esc(r.placeholder)}" value="${esc(r.get())}" spellcheck="false" maxlength="60"><datalist id="${id}">${r.options.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
      $('input', c).onchange = (e) => r.set(e.target.value.trim());
    } else if (r.type === 'stepper') {
      c.classList.add('st-steps');
      for (const [t, d] of r.buttons) { const b = h('button', 'btn small', t); b.onclick = () => hangar.zoom(d); c.appendChild(b); }
    } else if (r.type === 'button') {
      const b = h('button', 'btn small', esc(r.text)); b.onclick = r.run; c.appendChild(b);
    }
    return c;
  }
  function rowEl(r) {
    const d = h('div', 'st-row');
    d.innerHTML = `<div class="st-t"><div class="st-l">${esc(r.label)}</div><div class="st-d">${esc(r.desc)}</div></div>`;
    d.appendChild(control(r));
    return d;
  }
  function section(s, into) {
    const w = h('section', 'st-sec');
    if (s.title) w.appendChild(h('h3', '', esc(s.title)));
    if (s.custom) s.custom(w);
    else { const list = h('div', 'st-list'); s.rows.forEach((r) => list.appendChild(rowEl(r))); w.appendChild(list); }
    into.appendChild(w);
  }

  // ---------- themes ----------
  function mini(t) {
    const v = (k) => t.ui[k];
    const ansi = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((n) => `<b style="background:${t.term[n]}"></b>`).join('');
    return `<span class="tc-m" style="background:${v('bg')}"><span class="tc-bar" style="background:${v('panel')}"><u style="background:${v('accent')}"></u></span>
      <span class="tc-tiles"><span class="tc-tile" style="background:${t.term.background};border-color:${v('line')}"><i style="background:${t.term.foreground}"></i><i style="background:${v('muted')};width:62%"></i><span class="tc-ansi">${ansi}</span></span>
      <span class="tc-tile" style="background:${t.term.background};border-color:${v('needs')}"><i style="background:${v('needs')};width:44%"></i><i style="background:${t.term.foreground};width:74%"></i></span></span></span>`;
  }
  function card(t, opts = {}) {
    const on = HangarLook.themeId() === t.id;
    const b = h('div', `tc${on ? ' on' : ''}`);
    b.innerHTML = `<button class="tc-b" aria-pressed="${on}" aria-label="${esc(t.name)} theme">${t.split
      ? `<span class="tc-split">${mini(t.split[0])}${mini(t.split[1])}</span>` : mini(t)}<span class="tc-n">${esc(t.name)}${on ? '<span class="tc-ok" aria-hidden="true">✓</span>' : ''}</span></button>`;
    $('.tc-b', b).onclick = () => { hangar.setSettings({ theme: t.id }); setTimeout(() => show('appearance'), 0); };
    if (opts.custom) {
      const a = h('div', 'tc-acts');
      const mk = (label, fn) => { const x = h('button', 'tc-a', esc(label)); x.onclick = (e) => { e.stopPropagation(); fn(x); }; a.appendChild(x); };
      mk('Edit', () => HangarStudio.open({ theme: t, tab: 'colours' }));
      mk('Export', () => hangar.themeExport(t));
      mk('Delete', async (x) => {
        if (x.dataset.sure) { await hangar.themeDelete(t.id); setTimeout(() => show('appearance'), 0); return; }
        x.dataset.sure = '1'; x.textContent = 'Sure?'; x.classList.add('danger');
      });
      b.appendChild(a);
    }
    return b;
  }
  function drawThemes(w) {
    w.innerHTML = `<div class="st-th"><h3>Theme</h3><div class="grow"></div><button class="btn small" data-import>Import</button><button class="btn small" data-custom>Customise current</button><button class="btn small primary" data-claude>Create with Claude</button></div>`;
    const grid = h('div', 'tc-grid');
    const dark = T.PRESETS[0], light = T.PRESETS[1];
    grid.appendChild(card({ id: 'system', name: 'System', split: [light, dark] }));
    T.PRESETS.forEach((t) => grid.appendChild(card(t)));
    w.appendChild(grid);
    const customs = HangarLook.customs();
    if (customs.length) {
      w.appendChild(h('h3', 'st-sub', 'Your themes'));
      const g2 = h('div', 'tc-grid');
      customs.forEach((t) => g2.appendChild(card(t, { custom: true })));
      w.appendChild(g2);
    }
    const note = h('p', 'st-note', 'A theme colours the whole app and the inside of every terminal. Programs can still paint some text in their own fixed colours.');
    w.appendChild(note);
    $('[data-claude]', w).onclick = () => HangarStudio.open({ theme: HangarLook.active(), tab: 'chat', fresh: true });
    $('[data-custom]', w).onclick = () => HangarStudio.open({ theme: HangarLook.active(), tab: 'colours', fresh: true });
    $('[data-import]', w).onclick = async () => {
      const r = await hangar.themeImport();
      if (r?.error) { note.textContent = r.error; note.classList.add('bad'); return; }
      if (r?.theme) { hangar.setSettings({ theme: r.theme.id }); setTimeout(() => show('appearance'), 50); }
    };
  }

  // ---------- pages and search ----------
  function show(id) {
    page = id;
    if (!body) return;
    const p = PAGES.find((x) => x.id === id) || PAGES[0];
    body.innerHTML = '';
    el.querySelectorAll('.st-nav button').forEach((b) => { const on = b.dataset.p === p.id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const head = h('h2', '', esc(p.label));
    body.appendChild(head);
    p.sections.forEach((s) => section(s, body));
    body.scrollTop = 0;
  }
  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { show(page); return; }
    const hit = (text) => words.every((w) => text.toLowerCase().includes(w));
    body.innerHTML = '';
    el.querySelectorAll('.st-nav button').forEach((b) => { b.classList.remove('on'); b.removeAttribute('aria-current'); });
    let n = 0;
    for (const p of PAGES) for (const s of p.sections) {
      if (s.custom) {
        if (hit(`${p.label} ${s.keys}`)) { body.appendChild(h('div', 'st-where', esc(p.label))); section(s, body); n++; }
        continue;
      }
      const rows = s.rows.filter((r) => hit(`${p.label} ${s.title || ''} ${r.label} ${r.desc}`));
      if (!rows.length) continue;
      body.appendChild(h('div', 'st-where', esc(`${p.label} › ${s.title || ''}`)));
      const list = h('div', 'st-list');
      rows.forEach((r) => list.appendChild(rowEl(r)));
      body.appendChild(list);
      n += rows.length;
    }
    if (!n) body.appendChild(h('p', 'st-none', 'Nothing matches that.'));
  }

  function open(id) {
    page = id || 'appearance';
    el = h('div', 'pop modal settings-modal');
    el.setAttribute('aria-label', 'Settings');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<aside class="st-side"><div class="st-title">Settings</div>
      <div class="st-search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.500L14 14"/></svg><input type="text" placeholder="Search settings" aria-label="Search settings" spellcheck="false"></div>
      <nav class="st-nav" aria-label="Settings pages">${PAGES.map((p) => `<button data-p="${p.id}">${svg(p.id)}<span>${esc(p.label)}</span></button>`).join('')}</nav></aside>
      <div class="st-main"><button class="btn icon small st-x" aria-label="Close settings" title="Close (Esc)"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button><div class="st-body"></div></div>`;
    body = $('.st-body', el);
    const input = $('.st-search input', el);
    el.querySelectorAll('.st-nav button').forEach((b) => { b.onclick = () => { input.value = ''; show(b.dataset.p); }; });
    $('.st-x', el).onclick = () => closePop();
    input.oninput = () => search(input.value);
    openPop(el, null, { onClose: () => { el = null; body = null; } });
    show(page);
    input.focus();
  }
  return { open, show };
})();
window.HangarSettings = HangarSettings;
