/* global HangarCommands, hangar, state, ICON, isMac, esc, h, $, openPop, closePop, toggleOverseer */
// Command palette (⌘K on Mac, Ctrl+Shift+K elsewhere) and the ? shortcut sheet.
// Everything it lists comes from the command registry (commands.js).
'use strict';

(() => {
  const C = HangarCommands;
  if (!ICON.search) ICON.search = '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';
  const MAX_ROWS = 50;
  let st = null;

  const keyHtml = (c) => {
    const k = C.shortcutLabel(c);
    return k ? `<kbd>${esc(k)}</kbd>` : '';
  };
  function iconHtml(c) {
    if (c.group === 'Sessions' && c.shape) return `<span class="pal-shape st-${esc(c.status)}" aria-hidden="true">${esc(c.shape)}</span>`;
    if (c.color && c.group === 'Modes') return `<span class="pal-ic" aria-hidden="true"><span class="mdot" style="--c:${esc(c.color)}"></span></span>`;
    const svg = c.icon ? (ICON[c.icon] || '') : '';
    return `<span class="pal-ic" aria-hidden="true">${svg}</span>`;
  }
  const accName = (c) => (c.group === 'Sessions' && c.statusLabel ? `${c.label}, ${c.statusLabel}` : c.label);

  /** The rows for the current query and scope. */
  function rows() {
    const q = st.input.value;
    const trimmed = q.trim();
    if (trimmed === '?') return shortcutCommands().map((c) => ({ c }));
    const list = C.all();
    if (st.sub) {
      const acts = list.filter((c) => (c.group === 'Actions' || c.group === 'Modes') && c.id !== 'mode.edit');
      return C.search(trimmed, acts).slice(0, MAX_ROWS).map((c) => ({ c }));
    }
    if (!trimmed) {
      const needs = list.filter((c) => c.group === 'Sessions' && c.status === 'needs_input');
      const recent = C.recent(5, list);
      const out = [...needs, ...recent];
      return (out.length ? out : C.search('', list).slice(0, 8)).map((c) => ({ c }));
    }
    const found = C.search(trimmed, list).slice(0, MAX_ROWS);
    const out = found.map((c) => ({ c }));
    // Only when nothing matches well (no prefix, word or initials hit).
    const good = found.length && C.score(trimmed, found[0]) >= 500;
    if (!good) out.push({ c: { id: 'overseer.ask', label: `Ask overseer: “${trimmed}”`, group: 'App', icon: 'chat' }, ask: trimmed });
    return out;
  }

  function scopeSnap() {
    const cx = C.ctx();
    return cx.snap;
  }
  function drawChip() {
    const snap = scopeSnap();
    st.chip.hidden = !snap;
    if (snap) {
      st.chip.className = `pal-chip st-${snap.status}`;
      st.chip.innerHTML = `<span class="dot"></span>${esc(snap.name)}`;
      st.chip.title = snap.name;
    }
  }

  function draw() {
    st.rows = rows();
    st.sel = Math.min(st.sel, Math.max(0, st.rows.length - 1));
    st.list.innerHTML = '';
    st.rows.forEach((r, i) => {
      const c = r.c;
      const row = h('div', 'pal-row');
      row.id = `pal-opt-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-label', accName(c));
      row.innerHTML = `${iconHtml(c)}<span class="pal-label">${esc(c.label)}</span>` +
        (c.context && c.context !== c.label ? `<span class="pal-ctx">${esc(c.context)}</span>` : '') +
        `<span class="pal-kb">${keyHtml(c)}</span>`;
      row.onmousedown = (e) => e.preventDefault();
      row.onmousemove = () => { if (st.sel !== i) { st.sel = i; highlight(); } };
      row.onclick = (e) => runRow(i, { shift: e.shiftKey, secondary: isMac ? e.metaKey : e.ctrlKey });
      st.list.appendChild(row);
    });
    st.input.setAttribute('aria-expanded', String(st.rows.length > 0));
    st.list.hidden = !st.rows.length;
    drawChip();
    highlight();
  }
  function highlight() {
    [...st.list.children].forEach((el, i) => {
      el.classList.toggle('sel', i === st.sel);
      el.setAttribute('aria-selected', String(i === st.sel));
    });
    const cur = st.list.children[st.sel];
    if (cur) { st.input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
    else st.input.removeAttribute('aria-activedescendant');
  }

  function runRow(i, o = {}) {
    const r = st.rows[i];
    if (!r) return;
    const scope = C.scope();
    closePop(); // hands the keyboard back first, so the command starts from the right place
    if (r.ask != null) { toggleOverseer(true, r.ask); return; }
    C.setScope(scope);
    try { C.run(r.c, { shift: !!o.shift }, o.secondary ? 'secondary' : 'run'); } finally { C.setScope(null); }
  }

  function enterSub(c) {
    st.sub = { tileId: c.tileId };
    C.setScope(c.tileId);
    st.input.value = '';
    st.sel = 0;
    draw();
  }
  function leaveSub() {
    st.sub = null;
    C.setScope(null);
    st.sel = 0;
    draw();
  }
  function cycleScope(dir) {
    const list = state.tiles;
    if (!list.length) return;
    const cur = C.ctx().id;
    const i = list.findIndex((t) => t.id === cur);
    const next = list[(i + dir + list.length) % list.length];
    C.setScope(next.id);
    if (st.sub) st.sub.tileId = next.id;
    draw();
  }

  function onKey(e) {
    if (!st) return;
    const n = st.rows.length;
    const down = e.key === 'ArrowDown' || (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n');
    const up = e.key === 'ArrowUp' || (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'p');
    if (down || up) {
      e.preventDefault();
      if (n) { st.sel = (st.sel + (down ? 1 : -1) + n) % n; highlight(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runRow(st.sel, { shift: e.shiftKey, secondary: isMac ? e.metaKey : e.ctrlKey });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const r = st.rows[st.sel];
      if (!e.shiftKey && !st.sub && r?.c.group === 'Sessions' && r.c.tileId) enterSub(r.c);
      else cycleScope(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Backspace' && st.sub && !st.input.value) {
      e.preventDefault();
      leaveSub();
    } else if (e.target !== st.input && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      st.input.focus();
    }
  }

  function open() {
    if (st) { closePop(); return; }
    const el = h('div', 'pop palette');
    el.setAttribute('aria-label', 'Command palette');
    el.innerHTML = `<div class="pal-head">${ICON.search}<span class="pal-chip" hidden></span>
      <input class="pal-input" type="text" role="combobox" aria-autocomplete="list" aria-controls="pal-list" aria-expanded="true" aria-label="Command" spellcheck="false"></div>
      <div class="pal-list" id="pal-list" role="listbox" aria-label="Commands"></div>`;
    st = { el, input: $('.pal-input', el), list: $('.pal-list', el), chip: $('.pal-chip', el), rows: [], sel: 0, sub: null };
    C.setScope(null);
    openPop(el, null, { onKey, onClose: () => { st = null; C.setScope(null); } });
    st.input.addEventListener('input', () => { st.sel = 0; draw(); });
    draw();
    st.input.focus();
    // Recent folders arrive a moment later; show them without moving the selection.
    hangar.recent().then((list) => {
      C.setFolders?.(list.slice(0, 8));
      if (st && st.input.value.trim()) draw();
    }).catch(() => {});
  }

  // ---------- ? shortcut sheet ----------

  function shortcutCommands() {
    return C.all().filter((c) => C.accel(c) && c.palette !== false && !/^window\.session-/.test(c.id));
  }
  function openShortcuts() {
    const el = h('div', 'pop modal shortcut-sheet');
    el.setAttribute('aria-label', 'Keyboard shortcuts');
    const list = [...shortcutCommands(), C.get('app.palette')].filter(Boolean);
    const one = C.shortcutLabel('window.session-1');
    const rowsHtml = list.map((c) => `<div class="sk-row"><span>${esc(c.label)}</span>${keyHtml(c)}</div>`).join('') +
      (one ? `<div class="sk-row"><span>Session 1–9</span><kbd>${esc(one.replace(/1$/, '1–9'))}</kbd></div>` : '');
    el.innerHTML = `<h3>Keyboard shortcuts</h3><div class="sk-grid" role="list">${rowsHtml}</div>`;
    el.querySelectorAll('.sk-row').forEach((r) => r.setAttribute('role', 'listitem'));
    el.tabIndex = -1;
    openPop(el, null);
    el.focus();
  }

  window.HangarPalette = { open, openShortcuts, isOpen: () => !!st };
})();
