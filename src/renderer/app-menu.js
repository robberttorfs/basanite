/* global HangarCommands, hangar, state, ICON, isMac, esc, h, $, openPop, closePop */
// The ☰ menu on Windows and Linux: the app's own popover instead of the native menu
// template. The most-used actions sit at the top level, workspaces and everything else in
// two flyouts, Help and About at the bottom. Typing filters every item. All rows come from
// the command registry (commands.js), so labels and shortcuts never drift from the native
// menu or the palette. On the Mac the menu bar stays native and this file does nothing.
'use strict';

(function (root) {
  // ---------- the model (pure, tested in test/app-menu.test.js) ----------

  const TOP = [
    ['session.new', 'session.new-terminal'],
    ['view.overview', 'app.palette', '@workspaces'],
    ['@session', '@modes', '@view', '@theme'],
    ['app.usage', 'app.overseer'],
    ['app.settings', '@help'],
  ];
  const FOOT = ['@update'];
  // Each flyout is one short column. What is rarely needed (session IDs, window controls) stays
  // in the search box and the palette.
  const SUBS = {
    session: [['session.rename', 'session.zoom', 'session.pin', 'session.timer', 'session.fresh'], ['session.files', 'session.changes', 'session.history', 'session.fork'],
      ['session.reveal', 'session.open-editor', 'session.copy-path'], ['session.close', 'session.reopen']],
    modes: [['mode.choose', 'mode.none'], ['mode.edit', 'mode.import']],
    view: [['view.clean', 'view.reset-sizes', 'session.next-waiting'], ['view.text-bigger', 'view.text-smaller'], ['view.ui-bigger', 'view.ui-smaller', 'view.ui-actual'], ['@fullscreen']],
    help: [['app.shortcuts', 'app.intro'], ['app.report-bug', 'app.feedback', 'app.copy-debug'], ['@about']],
  };
  const SUB_ROWS = { '@workspaces': ['Workspaces', 'layers', 'workspaces'], '@session': ['Session', 'grid', 'session'], '@modes': ['Modes', 'sliders', 'modes'], '@view': ['View', 'eye', 'view'], '@theme': ['Theme', 'palette', 'theme'], '@help': ['Help', 'info', 'help'] };
  // Window controls the native template adds itself (they're not commands).
  const NATIVE = [
    { id: '@fullscreen', label: 'Full screen', group: 'Window', menuName: 'Window', role: 'fullscreen', shortcut: 'F11' },
    { id: '@minimize', label: 'Minimize', group: 'Window', menuName: 'Window', role: 'minimize' },
    { id: '@maximize', label: 'Maximize', group: 'Window', menuName: 'Window', role: 'maximize' },
  ];

  /** { top: [[cmd]], workspaces: [cmd], subs: { name: [[cmd]] }, themes: [cmd], foot: [cmd], all: [cmd] } */
  function model(C, extra = {}) {
    const all = C.all();
    const byId = new Map(all.map((c) => [c.id, c]));
    const pick = (id) => {
      if (SUB_ROWS[id]) { const [label, icon, sub] = SUB_ROWS[id]; return { id, label, icon, sub }; }
      if (id === '@about') return { id, label: `About ${extra.appName || 'Basanite'}`, icon: 'info', role: 'about' };
      if (id === '@update') return extra.update ? { id, label: extra.update, icon: 'update', role: 'update' } : null;
      if (id === '@fullscreen') return NATIVE[0];
      return byId.get(id) || null;
    };
    const groups = (list) => list.map((g) => g.map(pick).filter(Boolean)).filter((g) => g.length);
    const top = groups(TOP);
    const foot = FOOT.map(pick).filter(Boolean);
    const workspaces = all.filter((c) => c.menu?.menu === 'Workspace');
    const subs = Object.fromEntries(Object.entries(SUBS).map(([k, v]) => [k, groups(v)]));
    const themes = all.filter((c) => c.isTheme);
    // The search covers everything: the rows above, plus single modes, add-ons and the rarer commands.
    const seen = new Set();
    const every = [...top.flat(), ...workspaces, ...Object.values(subs).flat(2), ...themes, ...foot,
      ...all.filter((c) => c.menu && !/^window\.session-/.test(c.id)), ...NATIVE]
      .filter((c) => !c.sub && !seen.has(c.id) && seen.add(c.id));
    return { top, workspaces, subs, themes, foot, all: every };
  }

  /** Items matching the query, best first (ignores palette: false, which is for the palette only). */
  function filter(C, list, query) {
    const q = String(query || '').trim();
    if (!q) return [];
    return list.map((c, i) => ({ c, s: C.score(q, c), i })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
  }

  const api = { model, filter, TOP, FOOT, SUBS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---------- the popover ----------

  const C = HangarCommands;
  const SVG = (d) => `<svg viewBox="0 0 16 16">${d}</svg>`;
  const ICONS = {
    plus: SVG('<path d="M8 3v10M3 8h10"/>'),
    grid: SVG('<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2"/>'),
    search: SVG('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>'),
    layers: SVG('<path d="M8 2.5l5.5 3L8 8.5 2.5 5.5z"/><path d="M2.5 8.5L8 11.5l5.5-3"/><path d="M2.5 11L8 14l5.5-3"/>'),
    eye: SVG('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
    sliders: SVG('<path d="M2.5 4.5h11M2.5 11.5h11"/><circle cx="10.5" cy="4.5" r="1.6" class="fill"/><circle cx="5.5" cy="11.5" r="1.6" class="fill"/>'),
    keyboard: SVG('<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6"/>'),
    info: SVG('<circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3M8 5.3v.01"/>'),
    bug: SVG('<rect x="5" y="5" width="6" height="8" rx="3"/><path d="M8 7.5V13M5 8.5H2.5M13.5 8.5H11M5.5 11.5l-2 1.5M10.5 11.5l2 1.5M6 5.5L4.5 3.5M10 5.5l1.5-2"/>'),
    chat: SVG('<path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z"/>'),
    update: SVG('<path d="M8 2.5v7M5 6.5l3 3 3-3M3 12.5h10"/>'),
    check: SVG('<path d="M3.5 8.5l3 3 6-7"/>'),
    palette: SVG('<circle cx="8" cy="8" r="5.5"/><path class="half" d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none"/>'),
  };
  for (const [k, v] of Object.entries(ICONS)) if (!ICON[k]) ICON[k] = v;

  let update = null;
  hangar.onUpdate?.((st) => { update = st?.kind === 'ready' ? 'Restart to update' : st?.kind === 'available' ? 'Download update' : null; });

  let el = null;
  let sub = null; // { el, row }

  const isOpen = () => !!el && el.isConnected;
  const kbHtml = (c) => {
    const k = c.role === 'fullscreen' ? 'F11' : C.shortcutLabel(c);
    return k ? `<kbd>${esc(k)}</kbd>` : '';
  };
  function iconHtml(c) {
    if (c.isMode && c.color) return `<span class="am-ic" aria-hidden="true"><span class="mdot" style="--c:${esc(c.color)}"></span></span>`;
    if (c.isTheme) { const t = c.themeId === 'system' ? null : HangarLook.themeById(c.themeId); return `<span class="am-ic" aria-hidden="true"><span class="mdot" style="--c:${t ? t.ui.accent : 'var(--muted)'}"></span></span>`; }
    if (c.color && /^addon\.toggle:/.test(c.id)) return `<span class="am-ic" aria-hidden="true"><span class="mdot" style="--c:${esc(c.color)}"></span></span>`;
    return `<span class="am-ic" aria-hidden="true">${ICON[c.icon] || ''}</span>`;
  }
  const activeWs = (c) => c.id === `workspace.go.${state.activeWs}` || (c.isTheme && c.themeId === HangarLook.themeId());

  function row(c, opts = {}) {
    const ok = c.role || c.sub || c.id === '@themes' || C.ok(c);
    const checked = activeWs(c);
    const label = opts.short ? c.short || c.menu?.label || c.label : c.label;
    const b = h('button', `item am-row${c.sub ? ' has-sub' : ''}`,
      `${checked ? `<span class="am-ic am-ck" aria-hidden="true">${ICON.check}</span>` : iconHtml(c)}` +
      `<span class="am-l">${esc(label)}</span>` +
      (opts.ctx ? `<span class="am-ctx">${esc(opts.ctx)}</span>` : '') +
      (c.sub ? '<span class="chev" aria-hidden="true">›</span>' : kbHtml(c)));
    b.setAttribute('role', checked ? 'menuitemradio' : 'menuitem');
    if (checked) b.setAttribute('aria-checked', 'true');
    if (c.sub) { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.dataset.sub = c.sub; }
    if (!ok && !checked) b.disabled = true;
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      if (c.sub) { if (sub?.row === b) closeSub(true); else openSub(b, true); return; }
      if (checked) { closePop(); return; }
      runItem(c);
    };
    b.addEventListener('mouseenter', () => {
      if (c.sub) openSub(b, false);
      else if (sub && !sub.el.contains(b)) closeSub(false);
    });
    return b;
  }

  function runItem(c) {
    closePop();
    if (c.id === '@themes') { HangarSettings.open('appearance'); return; }
    if (c.role) { hangar.menuRole?.(c.role); return; }
    C.run(c.id);
  }

  function section(parent, items, heading) {
    if (!items.length) return;
    if (parent.querySelector('.item')) parent.appendChild(h('div', 'sep'));
    if (heading) parent.appendChild(h('div', 'am-h', esc(heading)));
    for (const it of items) parent.appendChild(it);
  }

  function drawMain(body, m) {
    body.innerHTML = '';
    for (const g of m.top) section(body, g.map((c) => row(c)));
    const foot = h('div', 'am-foot');
    for (const c of m.foot) foot.appendChild(row(c));
    body.appendChild(foot);
  }

  function drawFiltered(body, m, q) {
    body.innerHTML = '';
    const hits = filter(C, m.all, q).filter((c) => c.role || C.ok(c) || activeWs(c));
    if (!hits.length) { body.appendChild(h('div', 'am-none', '–')); return; }
    const ctxOf = (c) => (c.isMode ? 'Mode' : c.isTheme ? 'Theme' : c.context === 'Add-on' ? 'Add-on' : c.menu?.menu === 'Workspace' ? 'Workspace' : '');
    for (const c of hits.slice(0, 40)) body.appendChild(row(c, { ctx: ctxOf(c) }));
  }

  function closeSub(focusRow) {
    if (!sub) return;
    sub.row.setAttribute('aria-expanded', 'false');
    sub.el.remove();
    const r = sub.row;
    sub = null;
    if (focusRow) r.focus();
  }
  function openSub(rowEl, focusFirst) {
    if (sub?.row === rowEl) { if (focusFirst) sub.el.querySelector('.item:not(:disabled)')?.focus(); return; }
    closeSub(false);
    const m = model(C, { appName: hangar.appName, update });
    const s = h('div', 'pop menu sub-menu am-sub');
    s.setAttribute('role', 'menu');
    const kind = rowEl.dataset.sub;
    s.setAttribute('aria-label', kind);
    if (kind === 'workspaces') {
      const go = m.workspaces.filter((c) => /^workspace\.(go|reopen)\./.test(c.id));
      section(s, go.filter((c) => c.id.startsWith('workspace.go.')).map((c) => row(c, { short: true })));
      section(s, go.filter((c) => c.id.startsWith('workspace.reopen.')).map((c) => row(c)));
      // Only what applies now: with one workspace, next, previous, put away and close have nothing to do.
      section(s, m.workspaces.filter((c) => !go.includes(c) && C.ok(c)).map((c) => row(c)));
    } else if (kind === 'theme') {
      s.classList.add('am-themes');
      section(s, m.themes.map((c) => row(c, { short: true })));
      section(s, [row({ id: '@themes', label: 'Customise themes…', icon: 'sliders', run: true }, {})]);
    } else {
      // Only what applies right now; the rest would just be grey noise.
      for (const g of m.subs[kind] || []) section(s, g.filter((c) => c.role || C.ok(c)).map((c) => row(c)));
    }
    el.appendChild(s);
    sub = { el: s, row: rowEl };
    rowEl.setAttribute('aria-expanded', 'true');
    // Beside the menu, level with its row; above the bottom edge, scrolling when long.
    const r = rowEl.getBoundingClientRect(), pr = el.getBoundingClientRect();
    s.style.maxHeight = `${window.innerHeight - 16}px`;
    const right = pr.right + s.offsetWidth + 4 < window.innerWidth;
    s.style.left = right ? `${pr.width - 4}px` : `${-s.offsetWidth + 4}px`;
    const top = Math.min(r.top - 7, window.innerHeight - s.offsetHeight - 8);
    s.style.top = `${Math.max(8, top) - pr.top}px`;
    if (focusFirst) s.querySelector('.item:not(:disabled)')?.focus();
  }

  const visible = (scope) => [...scope.querySelectorAll(scope === sub?.el ? '.item' : ':scope > .item, :scope > .am-foot > .item')].filter((b) => !b.disabled);

  function open(anchor) {
    if (isOpen()) { closePop(); return; }
    sub = null;
    el = h('div', 'pop menu app-menu');
    el.setAttribute('aria-label', 'Menu');
    el.innerHTML = `<div class="am-search">${ICON.search}<input type="text" placeholder="Search" aria-label="Search the menu" spellcheck="false"></div><div class="am-body" role="menu" aria-label="Menu"></div>`;
    const input = $('input', el);
    const body = $('.am-body', el);
    const draw = () => {
      closeSub(false);
      const m = model(C, { appName: hangar.appName, update });
      if (input.value.trim()) drawFiltered(body, m, input.value); else drawMain(body, m);
      el.classList.toggle('filtering', !!input.value.trim());
    };
    draw();
    input.addEventListener('input', draw);
    // Esc closes an open flyout first, then clears the search, then closes the menu.
    // Added before openPop's own key handler, so it runs first.
    const escFirst = (e) => {
      if (e.key !== 'Escape' || !(sub || input.value)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (sub) closeSub(true);
      else { input.value = ''; draw(); input.focus(); }
    };
    window.addEventListener('keydown', escFirst, true);
    openPop(el, anchor, {
      alignLeft: true,
      onKey: (e) => onKey(e, input, body, draw),
      onClose: () => { window.removeEventListener('keydown', escFirst, true); sub = null; document.getElementById('btn-menu')?.setAttribute('aria-expanded', 'false'); },
    });
    el.setAttribute('role', 'presentation');
    input.focus();
  }

  function onKey(e, input, body, draw) {
    if (e.ctrlKey || e.metaKey) return;
    const a = document.activeElement;
    const inSub = sub && sub.el.contains(a);
    const scope = inSub ? sub.el : body;
    const items = visible(scope);
    // Typing anywhere goes to the search field.
    if (a !== input && !e.altKey && ((e.key.length === 1 && e.key !== ' ') || e.key === 'Backspace')) {
      e.preventDefault();
      input.value = e.key === 'Backspace' ? input.value.slice(0, -1) : input.value + e.key;
      draw();
      input.focus();
      return;
    }
    if (a === input) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = visible(body);
        (e.key === 'ArrowDown' ? list[0] : list[list.length - 1])?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        visible(body)[0]?.click();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      const i = items.indexOf(a);
      if (!inSub && e.key === 'ArrowUp' && i === 0) { input.focus(); return; }
      const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      if (!inSub) closeSub(false);
      items[n].focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
    } else if (e.key === 'ArrowRight' && a?.dataset?.sub) {
      e.preventDefault();
      openSub(a, true);
    } else if (e.key === 'ArrowLeft' && inSub) {
      e.preventDefault();
      closeSub(true);
    }
  }

  root.HangarAppMenu = { open, isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
