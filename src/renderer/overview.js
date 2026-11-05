// Overview: the attention list across every workspace. Sections Needs you,
// Working, Done and Idle (empty ones are not drawn), one line per session, and a
// read-only preview on the right: the end of the clean view plus any pending
// menu in the terminal, which number keys can answer.
// Loaded after app.js and workspaces.js and uses their helpers.
/* global $, h, esc, dur, hangar, isMac, state, tiles, focused, setFocus, focusInput, screenText, openPop, closePop,
   arrowNav, HangarChat, HangarAttention, HangarCommands, HangarWs, STATUS_LABEL */
(function () {
  'use strict';

  const A = HangarAttention;
  const SHAPE = { idle: '○', starting: '○', working: '●', needs_input: '◆', done: '✓', error: '✕', exited: '–' };
  const SECTIONS = [['needs', 'Needs you'], ['working', 'Working'], ['done', 'Done'], ['idle', 'Idle']];
  const DIALOG = /Enter to (confirm|select)|Esc to cancel/;
  const MOON = '<span class="moon" aria-hidden="true"></span>';

  let el = null;
  let sel = null;          // selected tile id
  let returnTo = null;     // tile focused before opening
  let looked = new Set();  // previewed Done sessions, marked seen when you move on or close
  let previewFor = null;
  let previewItems = [];
  let previewAt = 0;

  const allTiles = () => state.allTiles || state.tiles;
  const multiWs = () => (state.workspaces || []).filter((w) => !w.putAway).length > 1 || (state.workspaces || []).length > 1;
  const wsName = (t) => (multiWs() ? (state.workspaces || []).find((w) => w.id === t.ws)?.name || '' : '');
  const isOpen = () => !!el && !el.hidden;

  function ordered() {
    const order = (state.workspaces || []).map((w) => w.id);
    const rank = (t) => { const i = order.indexOf(t.ws); return i < 0 ? 0 : i; };
    const out = [];
    for (const [key] of SECTIONS) {
      // Longest wait first in Needs you; otherwise workspace order, then tile order.
      const list = allTiles().filter((t) => A.section(t) === key);
      if (key === 'needs') list.sort((a, b) => a.statusSince - b.statusSince);
      else list.sort((a, b) => rank(a) - rank(b));
      out.push([key, list]);
    }
    return out;
  }
  const flat = () => ordered().flatMap(([, l]) => l);

  function build() {
    el = h('div', 'overview');
    el.id = 'overview';
    el.hidden = true;
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Overview');
    const grid = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2"/></svg>';
    el.innerHTML = `<div class="ovw-head"><span class="ovw-title">${grid}Overview</span><div class="ovw-counts" aria-live="polite"></div><div class="grow"></div>
        <button class="btn small ovw-close" aria-label="Close overview" title="Close (Esc)">Esc</button></div>
      <div class="ovw-body"><div class="ovw-list" role="listbox" aria-label="Sessions"></div><div class="ovw-preview"></div></div>`;
    $('#main').appendChild(el);
    $('.ovw-close', el).onclick = () => close();
    el.addEventListener('keydown', onKey);
  }

  function open() {
    if (!el) build();
    if (isOpen()) { close(); return; }
    returnTo = focused;
    const list = flat();
    sel = list.find((t) => t.id === focused && A.section(t) === 'needs')?.id || list[0]?.id || null;
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    document.body.classList.add('ovw-open');
    draw();
    el.focus();
  }

  function close(openId = null) {
    if (!isOpen()) return;
    markLooked();
    el.hidden = true;
    document.body.classList.remove('ovw-open');
    releasePreview();
    const back = openId || returnTo;
    if (openId) setFocus(openId);
    else if (back && tiles.has(back)) focusInput(back);
  }

  /** Done sessions you previewed become Idle once you move on, so nothing jumps while you read. */
  function markLooked(keep = null) {
    for (const id of looked) if (id !== keep) hangar.seen(id);
    looked = new Set(keep && looked.has(keep) ? [keep] : []);
  }

  function select(id) {
    if (id === sel) return;
    markLooked(id);
    sel = id;
    draw();
  }

  // ---------- drawing ----------

  function draw() {
    if (!isOpen()) return;
    const groups = ordered();
    const all = groups.flatMap(([, l]) => l);
    if (sel && !all.some((t) => t.id === sel)) sel = all[0]?.id || null;
    if (!sel && all.length) sel = all[0].id;
    const c = A.counts(all);
    const counts = [['needs_input', c.needs_input, 'need you'], ['working', c.working, 'working'], ['done', c.done, 'done'], ['idle', c.idle, 'idle']]
      .filter(([, n]) => n).map(([st, n, word]) => `<span class="pal-shape st-${st}" aria-hidden="true">${SHAPE[st]}</span><span class="ovw-n" aria-label="${n} ${word}">${n}</span>`).join('');
    const ch = $('.ovw-counts', el);
    if (ch.innerHTML !== counts) ch.innerHTML = counts;

    const now = Date.now();
    let html = '';
    for (const [key, list] of groups) {
      if (!list.length) continue;
      html += `<div class="ovw-sec">${SECTIONS.find(([k]) => k === key)[1]}</div>`;
      for (const t of list) {
        const doing = typeof t.doing === 'string' ? t.doing : t.doing?.label || '';
        const shape = t.snoozed ? MOON : `<span class="pal-shape st-${esc(t.status)}" aria-hidden="true">${SHAPE[t.status] || '○'}</span>`;
        const label = `${t.name}, ${STATUS_LABEL[t.status] || t.status}${t.snoozed ? ', snoozed' : ''}${wsName(t) ? `, ${wsName(t)}` : ''}`;
        html += `<div class="ovw-row${t.id === sel ? ' sel' : ''}" role="option" aria-selected="${t.id === sel}" aria-label="${esc(label)}" data-id="${esc(t.id)}">` +
          `${shape}<span class="ovw-name">${esc(t.name)}</span>` +
          (doing ? `<span class="ovw-doing">${esc(doing)}</span>` : '') +
          `<span class="ovw-ws">${esc(wsName(t))}</span>` +
          `<span class="ovw-age">${key === 'idle' ? '' : dur(now - t.statusSince)}</span></div>`;
      }
    }
    if (!html) html = '<div class="ovw-sec">No sessions</div>';
    const listEl = $('.ovw-list', el);
    if (listEl._html !== html) {
      listEl.innerHTML = html;
      listEl._html = html;
      listEl.querySelectorAll('.ovw-row').forEach((r) => {
        r.onclick = () => select(r.dataset.id);
        r.ondblclick = () => close(r.dataset.id);
      });
      listEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    }
    drawPreview();
  }

  // ---------- preview ----------

  /** The pending menu in a tile's terminal, if one is showing: { lines, options: [{ n, text }] }. */
  function pendingMenu(id) {
    const t = tiles.get(id);
    if (!t) return null;
    const text = screenText(t.term, 24);
    if (!DIALOG.test(text)) return null;
    const lines = text.split('\n');
    // From the box rule above the first option down to the footer.
    const RULE = /^[\s│]*[─━]{8,}/;
    const first = lines.findIndex((l) => /^\s*(?:[❯>›]\s*)?1\.\s/.test(l));
    let start = 0;
    for (let i = (first < 0 ? lines.length : first) - 1; i >= 0; i--) if (RULE.test(lines[i])) { start = i + 1; break; }
    const body = lines.slice(start).filter((l) => !DIALOG.test(l) && !RULE.test(l))
      .map((l) => l.replace(/[│╭╮╰╯]/g, '').replace(/[─-╿]{12,}/g, '').replace(/\s+$/, ''));
    for (let i = body.length - 1; i > 0; i--) if (!body[i].trim() && !body[i - 1].trim()) body.splice(i, 1);  // no double gaps
    while (body.length && !body[body.length - 1].trim()) body.pop();
    const options = [];
    for (const l of body) {
      const m = /^\s*(?:[❯>›]\s*)?(\d)\.\s+(.+)$/.exec(l);
      if (m) options.push({ n: Number(m[1]), text: m[2].trim() });
    }
    while (body.length && !body[0].trim()) body.shift();
    return { lines: body, options };
  }

  async function loadPreview(id) {
    if (previewFor !== id) releasePreview();
    previewFor = id;
    const t = tiles.get(id);
    if (!t || t.snap.kind === 'shell') { previewItems = []; return; }
    previewAt = Date.now();
    try { previewItems = (await hangar.chatOpen(id)) || []; } catch { previewItems = []; }
    if (previewFor === id) drawPreview(true);
  }
  /** Stops following a transcript the preview opened, unless the tile's own clean view uses it. */
  function releasePreview() {
    if (previewFor && !tiles.get(previewFor)?.chat?.on) hangar.chatClose(previewFor);
    previewFor = null;
    previewItems = [];
  }

  function drawPreview(fresh = false) {
    const pane = $('.ovw-preview', el);
    const t = allTiles().find((x) => x.id === sel);
    if (!t) { pane.innerHTML = ''; pane._key = ''; return; }
    if (previewFor !== sel || (!fresh && Date.now() - previewAt > 2000 && t.status !== 'idle')) { loadPreview(sel); if (previewFor !== sel) return; }
    if (t.status === 'done') looked.add(t.id);
    const menu = t.status === 'needs_input' || t.status === 'starting' ? pendingMenu(t.id) : null;
    const tail = previewItems.filter((it) => it.k === 'claude' || it.k === 'you').slice(-3);
    const lastTool = [...previewItems].reverse().find((it) => it.k === 'tool');
    const key = JSON.stringify([t.id, t.status, t.snoozed, t.name, tail.map((x) => x.n + x.text.length), lastTool?.n, menu]);
    if (pane._key === key) return;
    pane._key = key;
    const ws = wsName(t);
    let html = `<div class="ovw-ph"><span class="ovw-pn">${esc(t.name)}</span>${ws ? `<span class="ovw-ws">${esc(ws)}</span>` : ''}</div><div class="ovw-feed">`;
    for (const it of tail) {
      html += it.k === 'claude' ? `<div class="msg claude">${HangarChat.md(it.text.length > 1600 ? `…${it.text.slice(-1600)}` : it.text)}</div>`
        : `<div class="msg you"><div class="bubble">${esc(it.text.slice(0, 400))}</div></div>`;
    }
    if (!tail.length) html += `<div class="empty-chat">${t.kind === 'shell' ? 'Terminal' : 'No messages yet.'}</div>`;
    html += '</div>';
    if (menu) {
      html += `<pre class="ovw-menu">${esc(menu.lines.join('\n'))}</pre>`;
    }
    html += '<div class="ovw-acts">';
    if (menu) for (const o of menu.options) html += `<button class="btn small" data-n="${o.n}" title="${esc(o.text)} (${o.n})" aria-label="${esc(`${o.n}. ${o.text}`)}">${o.n}</button>`;
    html += '<div class="grow"></div><button class="btn small primary" data-open>Open<kbd>↩</kbd></button></div>';
    pane.innerHTML = html;
    const feed = $('.ovw-feed', pane);
    feed.scrollTop = feed.scrollHeight;
    pane.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => answer(t.id, Number(b.dataset.n)); });
    $('[data-open]', pane).onclick = () => close(t.id);
  }

  /** Answers a permission menu with option n, the safe way: read the screen first, send only a listed choice. */
  function answer(id, n) {
    const t = allTiles().find((x) => x.id === id);
    if (!t || (t.status !== 'needs_input' && t.status !== 'starting')) return false;
    const menu = pendingMenu(id);
    if (!menu || !menu.options.some((o) => o.n === n)) return false;
    hangar.input(id, String(n));
    $('.ovw-preview', el)._key = '';
    setTimeout(() => draw(), 700);
    return true;
  }

  // ---------- keys ----------

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;  // shortcuts go to the menu as usual
    const list = flat();
    const i = list.findIndex((t) => t.id === sel);
    const go = (j) => { if (list.length) select(list[(j + list.length) % list.length].id); };
    let used = true;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Enter' && sel) close(sel);
    else if ((e.key === 'h' || e.key === 'H') && sel) snoozeMenu(sel, el.querySelector('.ovw-row.sel'));
    else if (e.key === 'Backspace' && sel) { const id = sel; go(i + 1); looked.delete(id); hangar.seen(id); }
    else if (/^[1-9]$/.test(e.key) && sel) answer(sel, Number(e.key));
    else used = !e.key || e.key.length === 1 || e.key === 'Tab';  // nothing reaches the terminal underneath
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  // ---------- snooze ----------

  function snoozeMenu(id, anchorEl) {
    const t = allTiles().find((x) => x.id === id);
    if (!t) return;
    const m = h('div', 'pop menu');
    const items = t.snoozed
      ? [['Glow again', 'off']]
      : [["Don't glow for 30 min", 'time'], ["Don't glow until it changes", 'change']];
    for (const [label, how] of items) {
      const b = h('button', 'item', esc(label));
      b.onclick = () => { closePop(); hangar.snooze(id, how); };
      m.appendChild(b);
    }
    openPop(m, anchorEl || (tiles.get(id) && $('.more', tiles.get(id).el)), { alignLeft: true, onKey: arrowNav(m), onClose: () => { if (isOpen()) setTimeout(() => el.focus(), 0); } });
    m.querySelector('.item').focus();
  }

  // ---------- wiring ----------

  hangar.onState(() => { if (isOpen()) draw(); });
  setInterval(() => { if (isOpen()) draw(); }, 1000);

  const C = window.HangarCommands;
  if (C) {
    C.register([
      { id: 'view.overview', label: 'Overview', group: 'App', icon: 'grid', aliases: ['attention', 'inbox', 'all sessions'], shortcut: 'CmdOrCtrl+Shift+A',
        menu: { menu: 'View', section: 'overview' }, run: () => open() },
      { id: 'session.snooze', label: "Don't glow for 30 min", group: 'Actions', aliases: ['snooze'],
        when: (cx) => !!cx.snap && cx.snap.kind !== 'shell' && !cx.snap.snoozed, run: (cx) => hangar.snooze(cx.snap.id, 'time') },
      { id: 'session.snooze-change', label: "Don't glow until it changes", group: 'Actions', aliases: ['snooze'],
        when: (cx) => !!cx.snap && cx.snap.kind !== 'shell' && !cx.snap.snoozed, run: (cx) => hangar.snooze(cx.snap.id, 'change') },
      { id: 'session.unsnooze', label: 'Glow again', group: 'Actions', aliases: ['snooze', 'wake'],
        when: (cx) => !!cx.snap?.snoozed, run: (cx) => hangar.snooze(cx.snap.id, 'off') },
    ]);
  }

  window.HangarOverview = { open, close, isOpen, snoozeMenu, answer, pendingMenu };
})();
