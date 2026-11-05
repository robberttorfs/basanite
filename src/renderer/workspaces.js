// Workspaces in the window: pills in the top bar (only with 2 or more), the
// pill menu, switching, moving sessions between workspaces, and the Undo notice.
// Loaded after app.js and uses its helpers ($, h, esc, state, tiles, setFocus,
// openPop, menuItems...). The two pure helpers at the top are unit tested.
/* global $, h, esc, ICON, SWATCHES, hangar, isMac, state:writable, tiles, focused:writable, anchor:writable, layoutKey:writable,
   setFocus, focusInput, openPop, closePop, arrowNav, swatchRow, visibleModes, modeById, render, dragDepth:writable, HangarCommands, windowNotice */
(function (root) {
  'use strict';

  /** Next tile that needs you, across workspaces: the active workspace first, then the others in pill order. */
  function nextWaiting(allTiles, order, active, focusedId) {
    const i0 = Math.max(0, order.indexOf(active));
    const rot = [...order.slice(i0), ...order.slice(0, i0)];
    const waiting = rot.flatMap((w) => allTiles.filter((t) => t.ws === w && !t.snoozed && (t.status === 'needs_input' || t.status === 'error')));
    if (!waiting.length) return null;
    const i = waiting.findIndex((t) => t.id === focusedId);
    return waiting[(i + 1) % waiting.length].id;
  }

  /** Which pills show and which fold into the ▾ menu. The active one always shows. */
  function pillPlan(ids, active, max = 6) {
    if (ids.length <= max) return { shown: ids.slice(), folded: [] };
    let shown = ids.slice(0, max);
    if (!shown.includes(active) && ids.includes(active)) shown = [...ids.slice(0, max - 1), active];
    return { shown, folded: ids.filter((id) => !shown.includes(id)) };
  }

  const pure = { nextWaiting, pillPlan };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- in the window ----------

  const MAX_PILLS = 6;
  const NOTIFY_LABEL = { all: 'All', needs: 'Needs you', none: 'None' };
  const wsKey = (i) => (i < 9 ? (isMac ? `⌥⌘${i + 1}` : `Ctrl+Shift+${i + 1}`) : '');
  let raw = null;        // last state from main, before filtering
  let shown = null;      // workspace currently drawn
  let pendingFocus = null;
  const mem = new Map(); // workspace id -> { anchor, layoutKey } so coming back puts tiles where they were

  const list = () => state.workspaces || [];
  const openList = () => list().filter((w) => !w.putAway);
  const get = (id) => list().find((w) => w.id === id);

  /** The state the rest of the window works with: tiles = the active workspace's, allTiles = every one. */
  function view(s) {
    raw = s;
    const active = s.activeWs;
    const out = { ...s, allTiles: s.tiles, tiles: s.tiles.filter((t) => !t.ws || t.ws === active) };
    if (shown !== null && shown !== active) leave(shown, active, out);
    shown = active;
    return out;
  }

  function leave(from, to, next) {
    mem.set(from, { anchor, layoutKey });
    const back = mem.get(to);
    anchor = back ? back.anchor : { id: null, rect: null, grow: false };
    layoutKey = back ? back.layoutKey : '';
    const ws = (next.workspaces || []).find((w) => w.id === to);
    const want = [pendingFocus, ws?.focused].find((id) => id && next.tiles.some((t) => t.id === id)) || next.tiles[0]?.id || null;
    pendingFocus = null;
    focused = want;
    if (want) hangar.focus(want);
    // Incoming tiles fade in; the outgoing set simply goes.
    // Tiles take their places without gliding.
    document.body.classList.add('win-resizing');
    setTimeout(() => document.body.classList.remove('win-resizing'), 200);
    const stage = $('#stage');
    stage.classList.remove('ws-in');
    void stage.offsetWidth;
    stage.classList.add('ws-in');
    requestAnimationFrame(() => { if (focused && tiles.has(focused)) focusInput(focused); });
  }

  /** Switches at once, then tells main (which keeps it and broadcasts the same). */
  function switchTo(id, focusId = null) {
    const w = get(id);
    if (!w || w.putAway) return;
    pendingFocus = focusId;
    if (id === state.activeWs) { if (focusId) setFocus(focusId); return; }
    hangar.wsSwitch(id);
    if (raw) { state = view({ ...raw, activeWs: id }); render(); }
  }
  const step = (dir) => {
    const o = openList();
    const i = o.findIndex((w) => w.id === state.activeWs);
    if (o.length > 1) switchTo(o[(i + dir + o.length) % o.length].id);
  };

  /** For setFocus: a tile in another workspace brings its workspace up first. */
  function reveal(id) {
    const t = state.allTiles?.find((x) => x.id === id);
    if (!t || !t.ws || t.ws === state.activeWs) return false;
    switchTo(t.ws, id);
    return true;
  }

  function goNextWaiting() {
    const id = nextWaiting(state.allTiles || state.tiles, openList().map((w) => w.id), state.activeWs, focused);
    if (id) setFocus(id);
  }

  const defaultMode = () => { const m = modeById(get(state.activeWs)?.defaultMode); return m && !m.hidden ? m.id : null; };

  // ---------- pills ----------

  const bar = $('#ws-pills');
  let drawnKey = '';

  function afterRender() {
    const active = state.activeWs;
    for (const [id, t] of tiles) {
      const off = !!t.snap.ws && t.snap.ws !== active;
      t.handles.r.classList.toggle('ws-off', off);
      t.handles.b.classList.toggle('ws-off', off);
    }
    // layout() can skip drawing when the tiles come back exactly where they were, so set this here too.
    document.body.classList.toggle('no-tiles', state.tiles.length === 0);
    // A moved or closed focused tile hands focus to the first one left here.
    if (focused && !state.tiles.some((t) => t.id === focused)) { focused = null; if (state.tiles.length) setFocus(state.tiles[0].id); }
    drawPills();
  }

  function drawPills() {
    const all = list();
    const open = openList();
    const away = all.filter((w) => w.putAway);
    if (all.length < 2) { if (!bar.hidden) { bar.hidden = true; bar.innerHTML = ''; drawnKey = ''; } return; }
    const waiting = new Set((state.allTiles || []).filter((t) => t.status === 'needs_input' && !t.snoozed && t.ws !== state.activeWs).map((t) => t.ws));
    const plan = pillPlan(open.map((w) => w.id), state.activeWs, MAX_PILLS);
    const key = JSON.stringify([open.map((w) => [w.id, w.name, w.color]), away.map((w) => w.id), state.activeWs, [...waiting], isMac]);
    if (key === drawnKey) return;
    drawnKey = key;
    bar.hidden = false;
    bar.innerHTML = '';
    for (const id of plan.shown) {
      const w = get(id);
      const i = open.indexOf(w);
      const on = id === state.activeWs;
      const wait = waiting.has(id);
      const b = h('button', `wp${on ? ' on' : ''}${w.color ? ' colored' : ''}`, `<span class="wn">${esc(w.name)}</span>${wait ? '<span class="wdot" aria-hidden="true"></span>' : ''}`);
      b.dataset.ws = id;
      b.draggable = true;
      if (w.color) b.style.setProperty('--wc', w.color);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${w.name}${wait ? ', needs you' : ''}`);
      b.title = wsKey(i) ? `${w.name} (${wsKey(i)})` : w.name;
      b.onclick = () => switchTo(id);
      b.oncontextmenu = (e) => { e.preventDefault(); openMenu(id, b); };
      wireDrop(b, id);
      bar.appendChild(b);
    }
    if (plan.folded.length || away.length) {
      const anyWait = plan.folded.some((id) => waiting.has(id));
      const more = h('button', 'wp wmore', `<svg viewBox="0 0 16 16"><path d="M4.5 6.5L8 10l3.5-3.5"/></svg>${anyWait ? '<span class="wdot" aria-hidden="true"></span>' : ''}`);
      more.setAttribute('aria-label', `More workspaces${anyWait ? ', one needs you' : ''}`);
      more.title = 'Workspaces';
      more.onclick = () => openOverflow(more, plan.folded, waiting);
      bar.appendChild(more);
    }
    const add = h('button', 'wp wadd', '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9"/></svg>');
    add.setAttribute('aria-label', 'New workspace');
    add.title = 'New workspace';
    add.onclick = () => createWs();
    bar.appendChild(add);
  }

  // Drag a pill to reorder, a tile header to move the session here, or a folder to start one here.
  let draggingWs = null;
  function wireDrop(b, id) {
    b.addEventListener('dragstart', (e) => { draggingWs = id; e.dataTransfer.setData('application/x-hangar-ws', id); e.dataTransfer.effectAllowed = 'move'; });
    b.addEventListener('dragend', () => { draggingWs = null; bar.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); });
    b.addEventListener('dragover', (e) => {
      const types = [...e.dataTransfer.types];
      if (types.includes('application/x-hangar-ws') || types.includes('application/x-hangar-tile') || types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('drop');
      }
    });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', (e) => {
      b.classList.remove('drop');
      e.preventDefault();
      e.stopPropagation();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      const ws = e.dataTransfer.getData('application/x-hangar-ws') || draggingWs;
      const tile = e.dataTransfer.getData('application/x-hangar-tile');
      if (ws) { if (ws !== id) hangar.wsMove(ws, openList().findIndex((w) => w.id === id)); return; }
      if (tile) { hangar.tileToWs(tile, id); return; }
      const dirs = [...e.dataTransfer.files].map((f) => hangar.pathForFile(f)).filter(Boolean);
      if (!dirs.length) return;
      Promise.all(dirs.map((d) => hangar.create(d, 'new', null, id))).then((ids) => {
        const first = ids.find(Boolean);
        if (first) switchTo(id, first);
      });
    });
  }

  // ---------- menus ----------

  function openOverflow(anchorEl, folded, waiting) {
    const el = h('div', 'pop menu ws-menu');
    const items = folded.map((id) => {
      const w = get(id);
      return { html: `<span class="wn">${esc(w.name)}</span>${waiting.has(id) ? '<span class="wdot" aria-label="needs you"></span>' : ''}`, kbd: wsKey(openList().indexOf(w)), run: () => switchTo(id) };
    });
    const away = list().filter((w) => w.putAway);
    if (items.length && away.length) items.push(null);
    for (const w of away) items.push({ cls: 'away', html: `<span class="wn">${esc(w.name)}</span>`, kbd: w.saved ? String(w.saved) : '', label: `Reopen ${w.name}`, run: () => reopen(w.id) });
    menuList(el, items);
    openPop(el, anchorEl, { alignLeft: true, onKey: arrowNav(el) });
    el.querySelector('.item')?.focus();
  }

  /** menuItems, plus an accessible name when the item shows html. */
  function menuList(el, items) {
    for (const it of items) {
      if (!it) { el.appendChild(h('div', 'sep')); continue; }
      const b = h('button', `item${it.cls ? ` ${it.cls}` : ''}`, it.html || esc(it.label));
      if (it.html && it.label) b.setAttribute('aria-label', it.label);
      if (it.kbd) b.insertAdjacentHTML('beforeend', `<span class="kb">${esc(it.kbd)}</span>`);
      b.onclick = (e) => { if (it.keep) { e.stopPropagation(); it.run(b); return; } closePop(); it.run(); };
      el.appendChild(b);
    }
  }

  function openMenu(id, anchorEl) {
    const w = get(id);
    if (!w) return;
    anchorEl = anchorEl || bar.querySelector(`[data-ws="${id}"]`) || $('#summary');
    const el = h('div', 'pop menu ws-menu');
    const count = (state.allTiles || []).filter((t) => t.ws === id).length;
    const main = () => {
      el.innerHTML = '';
      menuList(el, [
        { label: 'Rename', run: () => openRename(id) },
        { label: 'Notifications', kbd: NOTIFY_LABEL[w.notify] || 'All', keep: true, run: () => drill('notify') },
        { label: 'Default mode', kbd: modeById(w.defaultMode)?.name || 'None', keep: true, run: () => drill('mode') },
      ]);
      el.appendChild(swatchRow(w.color || null, (c) => { w.color = c; hangar.wsUpdate(id, { color: c }); }));
      const canGo = openList().length > 1;
      const confirmItem = (label, ask, fn, cls) => ({
        label, cls, keep: true,
        run: (b) => {
          if (!count || b.dataset.ask) { closePop(); fn(); return; }
          b.dataset.ask = '1';
          b.firstChild.textContent = ask;
        },
      });
      menuList(el, [
        null,
        ...(canGo ? [confirmItem('Put away', `Put away ${count} session${count === 1 ? '' : 's'}`, () => putAway(id))] : []),
        ...(canGo ? [confirmItem('Close', `Close ${count} session${count === 1 ? '' : 's'}`, () => closeWs(id), 'danger')] : []),
      ].filter((x, i, a) => x || a.length > 1));
      el.querySelector('.item')?.focus();
    };
    const drill = (what) => {
      el.innerHTML = '';
      const back = { html: `<svg viewBox="0 0 16 16"><path d="M10 4L6 8l4 4"/></svg>${what === 'notify' ? 'Notifications' : 'Default mode'}`, label: 'Back', keep: true, run: main };
      const check = (on) => (on ? `<span class="ck">${ICON.check}</span>` : '');
      const opts = what === 'notify'
        ? Object.entries(NOTIFY_LABEL).map(([k, l]) => ({ html: `${esc(l)}${check(w.notify === k)}`, label: l, run: () => hangar.wsUpdate(id, { notify: k }) }))
        : [null, ...visibleModes()].map((m) => ({
          html: `<span class="mdot" style="--c:${m ? m.color : 'transparent'}"></span>${esc(m ? m.name : 'No mode')}${check((m?.id || null) === (w.defaultMode || null))}`,
          label: m ? m.name : 'No mode', run: () => hangar.wsUpdate(id, { defaultMode: m?.id || null }),
        }));
      menuList(el, [back, null, ...opts]);
      el.querySelectorAll('.item')[1]?.focus();
    };
    main();
    openPop(el, anchorEl, { alignLeft: true, onKey: arrowNav(el) });
    el.querySelector('.item')?.focus();
  }

  function openRename(id, isNew = false) {
    const w = get(id);
    if (!w) return;
    const el = h('div', 'pop');
    el.style.width = '260px';
    el.innerHTML = '<h3>Workspace</h3><input class="field" maxlength="40" aria-label="Workspace name">';
    const input = $('input', el);
    input.value = w.name;
    let cancelled = false;
    const save = () => { if (!cancelled && input.value.trim() && input.value.trim() !== w.name) hangar.wsUpdate(id, { name: input.value }); };
    openPop(el, bar.querySelector(`[data-ws="${id}"]`) || $('#summary'), { alignLeft: true, onClose: save, onEscape: () => { cancelled = !isNew; } });
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); closePop(); } };
    input.focus();
    input.select();
  }

  async function createWs() {
    const id = await hangar.wsCreate();
    if (!id) return;
    // Main switches to it; name it straight away once its pill is drawn.
    const wait = () => (get(id) && bar.querySelector(`[data-ws="${id}"]`) ? openRename(id, true) : setTimeout(wait, 30));
    wait();
  }

  // ---------- put away, close, undo ----------

  function putAway(id) {
    const w = get(id);
    if (!w || openList().length < 2) return;
    hangar.wsPutAway(id);
    notice(`${esc(w.name)} put away`, () => reopen(id));
  }
  function closeWs(id) {
    const w = get(id);
    if (!w || (!w.putAway && openList().length < 2)) return;
    hangar.wsClose(id);
    notice(`${esc(w.name)} closed`, () => hangar.wsUndoClose(id));
  }
  function reopen(id) { hangar.wsReopen(id); }

  /** The app's one window notice (app.js), in the top bar. It stays until Undo or ×. */
  function notice(html, undo) {
    windowNotice(html, [['Undo', undo]], 'ws');
  }

  // ---------- commands (palette and native menu) ----------

  function registerCommands() {
    const C = root.HangarCommands;
    if (!C) return;
    const W = { menu: 'Workspace' };
    C.register([
      { id: 'workspace.new', label: 'New workspace', group: 'Workspaces', menu: { ...W, section: 'new' }, run: () => createWs() },
      { id: 'workspace.next', label: 'Next workspace', group: 'Workspaces', shortcut: { mac: 'Control+Command+Right', win: 'Ctrl+Shift+PageDown' }, menu: { ...W, section: 'go' }, when: () => openList().length > 1, run: () => step(1) },
      { id: 'workspace.prev', label: 'Previous workspace', group: 'Workspaces', shortcut: { mac: 'Control+Command+Left', win: 'Ctrl+Shift+PageUp' }, menu: { ...W, section: 'go' }, when: () => openList().length > 1, run: () => step(-1) },
      { id: 'workspace.rename', label: 'Rename workspace…', group: 'Workspaces', menu: { ...W, section: 'this' }, run: () => openRename(state.activeWs) },
      { id: 'workspace.options', label: 'Workspace options…', group: 'Workspaces', aliases: ['colour', 'color', 'notifications', 'default mode'], menu: { ...W, section: 'this' }, run: () => openMenu(state.activeWs) },
      { id: 'workspace.putaway', label: 'Put away workspace', group: 'Workspaces', menu: { ...W, section: 'this' }, when: () => openList().length > 1, run: () => putAway(state.activeWs) },
      { id: 'workspace.close', label: 'Close workspace', group: 'Workspaces', menu: { ...W, section: 'this' }, when: () => openList().length > 1, run: () => closeWs(state.activeWs) },
    ]);
    // One row per workspace. Open ones switch, the first nine with ⌥⌘1-9 (Windows Ctrl+Shift+1-9)
    // by their place in the pill row; put away ones reopen.
    C.provide('workspaces', () => {
      const open = openList();
      return list().map((w) => {
        if (w.putAway) return { id: `workspace.reopen.${w.id}`, label: `Reopen ${w.name}`, group: 'Workspaces', menu: { ...W, section: 'away' }, run: () => reopen(w.id) };
        const i = open.indexOf(w);
        return {
          id: `workspace.go.${w.id}`, label: `Switch to ${w.name}`, group: 'Workspaces', menu: { ...W, section: 'list', label: w.name },
          shortcut: i < 9 ? { mac: `Alt+Command+${i + 1}`, win: `Ctrl+Shift+${i + 1}` } : undefined,
          when: () => w.id !== state.activeWs, run: () => switchTo(w.id),
        };
      });
    });
  }

  root.HangarWs = { ...pure, view, afterRender, switchTo, step, reveal, nextWaiting: goNextWaiting, defaultMode, openMenu, openRename, createWs, putAway, closeWs, reopen, notice };
  registerCommands();
  // The registry may load after this file; registering twice only replaces.
  document.addEventListener('DOMContentLoaded', registerCommands);
})(typeof window !== 'undefined' ? window : globalThis);
