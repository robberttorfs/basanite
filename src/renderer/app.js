/* global Terminal, FitAddon, Unicode11Addon, WebglAddon, HangarLayout, HangarChat, HangarColors, hangar */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const isMac = hangar.platform === 'darwin';
const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT_MOD = isMac ? '⇧⌘' : 'Ctrl+Shift+';
document.body.classList.add(isMac ? 'mac' : hangar.platform === 'win32' ? 'win' : 'linux');
if (!isMac) {
  $('#kbd-new').textContent = 'Ctrl+Shift+N';
  // Tooltips are written with Mac keys; show the Windows and Linux ones instead.
  $('#usage').title = 'Usage (Ctrl+Shift+Y)';
  $('#btn-new').title = 'New session or terminal (Ctrl+Shift+N)';
  $('#btn-overseer').title = 'Overseer (Ctrl+Shift+O)';
  // No menu bar here, so a button opens the app menu (Session, Modes, View, Window).
  const mb = $('#btn-menu');
  mb.hidden = false;
  mb.onmousedown = (e) => e.preventDefault();
  // The app's own menu (app-menu.js); the native one only if that file is missing.
  mb.setAttribute('aria-haspopup', 'menu');
  mb.onclick = (e) => {
    if (window.HangarAppMenu) { HangarAppMenu.open(mb); mb.setAttribute('aria-expanded', String(HangarAppMenu.isOpen())); return; }
    const r = e.currentTarget.getBoundingClientRect(); hangar.openMenu(r.left, r.bottom + 4);
  };
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey && altAlone) mb.click();
  });
}
// Alt pressed and released on its own opens the menu, as in other Windows apps.
let altAlone = false;
window.addEventListener('keydown', (e) => { altAlone = e.key === 'Alt'; }, true);
window.addEventListener('mousedown', () => { altAlone = false; }, true);

// Ctrl (or Cmd) + scroll sizes the whole interface; a trackpad pinch does the same.
let zoomAcc = 0;
window.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  e.stopPropagation();
  zoomAcc += e.deltaY;
  if (Math.abs(zoomAcc) >= 60) { hangar.zoom(zoomAcc < 0 ? 1 : -1); zoomAcc = 0; }
}, { passive: false, capture: true });

const stage = $('#stage');
const tiles = new Map();   // id -> { el, term, fit, snap, lastRect, handles }
let state = { tiles: [], settings: { fontSize: 13 }, modes: [] };
let focused = null;

let GAP = 8;  // look.js makes it smaller in Compact density
const SWATCHES = HangarColors.PALETTE; // no status colours (src/shared/palette.js)

const ICON = {
  pin: '<svg viewBox="0 0 16 16"><path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5"/></svg>',
  timer: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5"/><path d="M8 6.5V9l1.5 1.5M6.5 2h3"/></svg>',
  more: '<svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/></svg>',
  lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  term: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 7l2 1.5L5 10M8.5 10.5H11"/></svg>',
  chart: '<svg viewBox="0 0 16 16"><path d="M3 13V8M8 13V3M13 13v-7"/></svg>',
  chat: '<svg viewBox="0 0 16 16"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h0A1.5 1.5 0 0 1 3 9.5z"/></svg>',
  spark: '<svg viewBox="0 0 16 16"><path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.2 4.2l1.8 1.8M10 10l1.8 1.8M11.8 4.2L10 6M6 10l-1.8 1.8"/></svg>',
};

const STATUS_LABEL = {
  starting: 'Starting', working: 'Working', needs_input: 'Needs you', done: 'Done',
  idle: 'Idle', error: 'Error', exited: 'Ended',
};

// ---------- formatting ----------

function k(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n || 0);
}
function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}
function mmss(min) {
  const s = Math.max(0, Math.round(min * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function shortPath(p, max = 60) {
  const s = p.replace(/^\/Users\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/i, '~');
  return s.length > max ? `…${s.slice(s.length - max + 1)}` : s;
}
const folderName = (dir) => dir.split(/[\\/]/).filter(Boolean).pop() || dir;
const modeById = (id) => state.modes.find((m) => m.id === id);
const visibleModes = () => state.modes.filter((m) => !m.hidden && m.kind !== 'addon');

// ---------- terminals ----------

const THEME = {
  background: '#121318', foreground: '#d8dbe2', cursor: '#d8dbe2', cursorAccent: '#121318',
  selectionBackground: '#33415c', selectionInactiveBackground: '#2a3040',
  black: '#1c1e24', red: '#ff7b7b', green: '#7bd88f', yellow: '#f2c66d', blue: '#7aa7ff',
  magenta: '#c49cff', cyan: '#6fd4e0', white: '#c9ccd3',
  brightBlack: '#5b616d', brightRed: '#ff9a9a', brightGreen: '#9ae6ab', brightYellow: '#f7d88f',
  brightBlue: '#9cbfff', brightMagenta: '#d7bbff', brightCyan: '#95e3ec', brightWhite: '#f1f2f5',
};

// Polished terminal: a little more air between lines, softer greys for Claude Code's dim text.
const POLISH = { foreground: '#d3d7df', brightBlack: '#6c7280', black: '#22252c' };
const polished = () => state.settings.polishTerm !== false;
function termLook(bg) {
  const theme = { ...THEME, ...(polished() ? POLISH : {}) };
  const out = { lineHeight: polished() ? 1.24 : 1.15, theme: bg ? { ...theme, background: bg, cursorAccent: bg } : theme };
  return window.HangarLook ? HangarLook.term(out, bg) : out;  // light theme swaps the palette
}

function makeTerm(container, onInput, onResize, bg) {
  const term = new Terminal({
    fontFamily: isMac ? '"SF Mono", Menlo, monospace' : 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: state.settings.fontSize || 13,
    ...termLook(bg),
    scrollback: 20000,
    allowProposedApi: true,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    cursorBlink: false,
    linkHandler: { activate: (_e, uri) => window.open(uri) },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon.Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.open(container);
  try {
    const gl = new WebglAddon.WebglAddon();
    gl.onContextLoss(() => gl.dispose());
    term.loadAddon(gl);
  } catch { /* falls back to the DOM renderer */ }
  // A repaint's cursor hide split across two pieces of output must not show as a flicker.
  const steady = window.HangarCursor ? HangarCursor.steady(term.write.bind(term)) : null;
  if (steady) term.write = steady.write;

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    // Shift+Enter: newline in Claude Code's prompt.
    if (e.key === 'Enter' && e.shiftKey) { onInput('\x1b\r'); return false; }
    if (!isMac && e.ctrlKey && e.shiftKey && e.code === 'KeyC') { navigator.clipboard.writeText(term.getSelection()); return false; }
    if (!isMac && e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); return false;
    }
    // Ctrl+V and Ctrl+Shift+V: let Chromium fire its paste event, which xterm and the
    // picture handler pick up. (Pasting here as well used to double it.)
    // Ctrl+V pastes too, as in Windows Terminal; otherwise xterm sends a raw ^V and nothing arrives.
    if (!isMac && e.ctrlKey && !e.altKey && e.code === 'KeyV') return false;
    return true;
  });
  term.onData(onInput);
  // Pasting a picture or a copied file: hand Claude Code its path, which it turns into an attachment.
  container.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pastedFiles(files).then((list) => { if (list.length) pastePaths(onInput, list.map((f) => f.path)); });
  }, true);

  // Refit once the box has settled. Every refit makes Claude Code redraw its
  // whole screen, so wait out animations and drags instead of following them.
  let pending = null;
  const doFit = () => {
    pending = null;
    if (!container.offsetWidth || !container.offsetHeight) return;
    if (document.body.classList.contains('resizing')) { pending = setTimeout(doFit, 120); return; }
    try {
      const dims = fit.proposeDimensions();
      // At zoomed or fractional pixel ratios the drawn rows are a bit taller than
      // the fit addon assumes, so the last one spills out. Count rows from the real cell height.
      const cellH = term._core?._renderService?.dimensions?.css?.cell?.height;
      const box = term.element?.parentElement;
      if (dims && cellH && box) {
        const cs = getComputedStyle(box);
        const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        dims.rows = Math.min(dims.rows, Math.floor(avail / cellH));
      }
      if (dims && dims.cols > 10 && dims.rows > 3 && (dims.cols !== term.cols || dims.rows !== term.rows)) {
        term.resize(dims.cols, dims.rows);
        onResize(dims.cols, dims.rows);
      }
    } catch {}
  };
  const schedule = (ms = 140) => { clearTimeout(pending); pending = setTimeout(doFit, ms); };
  const ro = new ResizeObserver(() => schedule());
  ro.observe(container);
  // fitSoon: for callers that just moved the box. ResizeObserver does not fire
  // while the window is hidden behind others; a timer still does.
  return { term, bg, fit: doFit, fitSoon: schedule, dispose: () => { clearTimeout(pending); ro.disconnect(); steady?.dispose(); term.dispose(); } };
}

function screenText(term, lines) {
  const buf = term.buffer.active;
  let end = buf.length - 1;
  while (end > 0 && !buf.getLine(end)?.translateToString(true).trim()) end--;
  const out = [];
  for (let i = Math.max(0, end - lines + 1); i <= end; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '');
  return out.join('\n');
}

// ---------- tiles ----------

function createTile(snap) {
  const el = h('div', 'tile');
  el.dataset.id = snap.id;
  el.innerHTML = `
    <div class="head" draggable="true">
      <span class="dot" role="img"></span><span class="ticon" aria-hidden="true">${ICON.term}</span>
      <span class="name"></span>
      <button class="mode-chip" aria-label="Mode"></button>
      <span class="state"></span>
      <span class="doing"></span><span class="tx"></span>
      <span class="meta">
        <button class="fresh-hint" hidden>Fresh start</button>
        <span class="ctx"><span class="bar"><i></i></span><span class="cv"></span></span>
      </span>
      <button class="hbtn lock" aria-label="Unlock size">${ICON.lock}</button>
      <button class="hbtn timer" aria-label="Time budget">${ICON.timer}<span class="tv"></span></button>
      <button class="hbtn pin" aria-label="Pin as main">${ICON.pin}</button>
      <button class="hbtn view" aria-label="Clean view">${ICON.chat}</button>
      <button class="hbtn more" aria-label="More" title="More">${ICON.more}</button>
    </div>
    <div class="agents"></div>
    <div class="term"></div>
    <div class="chat-slot"></div>
    <div class="overlay"><div class="msg"></div><div class="row">
      <button class="btn primary restart">Resume</button><button class="btn close">Close</button></div></div>`;
  stage.appendChild(el);

  const t = makeTerm($('.term', el), (d) => hangar.input(snap.id, d), (c, r) => hangar.resize(snap.id, c, r));
  const tile = { el, ...t, snap, handles: makeHandles(snap.id), chat: null };
  tiles.set(snap.id, tile);
  if (snap.kind !== 'shell' && viewPref(snap.id)) setView(snap.id, true, tile);

  el.addEventListener('mousedown', () => setFocus(snap.id, false), true);
  $('.pin', el).onclick = (e) => { e.stopPropagation(); hangar.pin(snap.id); };
  $('.timer', el).onclick = (e) => { e.stopPropagation(); openTimer(snap.id, e.currentTarget); };
  $('.more', el).onclick = (e) => { e.stopPropagation(); openMore(snap.id, e.currentTarget); };
  $('.lock', el).onclick = (e) => { e.stopPropagation(); setLock(snap.id, null); };
  $('.view', el).onclick = (e) => { e.stopPropagation(); setView(snap.id, !tile.chat?.on); };
  $('.mode-chip', el).onclick = (e) => { e.stopPropagation(); openModePicker(snap.id, e.currentTarget); };
  $('.fresh-hint', el).onclick = (e) => { e.stopPropagation(); openFresh(snap.id, e.currentTarget); };
  $('.restart', el).onclick = () => hangar.restart(snap.id);
  $('.close', el).onclick = () => closeNow(snap.id);
  $('.name', el).ondblclick = (e) => { e.stopPropagation(); openRename(snap.id); };
  $('.head', el).ondblclick = (e) => { if (!e.target.closest('button')) toggleZoom(snap.id); };

  // Reorder by dragging the header onto another tile.
  const head = $('.head', el);
  head.addEventListener('dragstart', (e) => {
    if (e.target.closest('button')) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-hangar-tile', snap.id); e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragover', (e) => {
    const types = [...e.dataTransfer.types];
    if (types.includes('application/x-hangar-tile') || types.includes('Files')) { e.preventDefault(); el.classList.add('drop-target'); }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-target');
    document.body.classList.remove('dragging');
    const moved = e.dataTransfer.getData('application/x-hangar-tile');
    e.preventDefault();
    e.stopPropagation();
    if (moved) {
      if (moved !== snap.id) hangar.move(moved, state.tiles.findIndex((x) => x.id === snap.id));
      return;
    }
    // Files dropped on a tile: in clean view they wait above the message box, in the terminal their paths are
    // pasted like a normal terminal does (Claude Code turns image paths into attachments).
    filePaths([...e.dataTransfer.files]).then((list) => {
      if (!list.length) return;
      if (tile.chat?.on && !el.classList.contains('term-forced')) { tile.chat.view.attach(list); tile.chat.view.focus(); }
      else { pastePaths((d) => hangar.input(snap.id, d), list.map((f) => f.path)); t.term.focus(); }
    });
  });
  return tile;
}

function setFocus(id, moveKeyboard = true) {
  if (!tiles.has(id)) return;
  if (window.HangarWs?.reveal(id)) return;  // in another workspace: that one comes up first
  if (zoomed && zoomed !== id) toggleZoom(zoomed);
  if (focused !== id) {
    focused = id;
    hangar.focus(id);
    for (const [tid, t] of tiles) t.el.classList.toggle('focused', tid === id);
    anchorOn(id);
  }
  if (moveKeyboard) focusInput(id);
}

/** Keyboard into the tile: the message box in clean view, otherwise the terminal. */
function focusInput(id) {
  const t = tiles.get(id);
  if (!t) return;
  if (t.chat?.on && !t.el.classList.contains('term-forced')) t.chat.view.focus();
  else t.term.focus();
}

// ---------- clean view ----------

function viewPref(id) {
  try {
    const v = localStorage.getItem(`hangar.view.${id}`);
    if (v != null) return v === 'chat';
  } catch {}
  return id === 'overseer' ? true : !!state.settings.cleanDefault;
}
function saveViewPref(id, on) { try { localStorage.setItem(`hangar.view.${id}`, on ? 'chat' : 'term'); } catch {} }

const IMAGE_TYPES = /\.(png|jpe?g|gif|webp)$/i;
const quotePath = (p) => (/[\s'"()&]/.test(p) ? `"${p}"` : p);
/** Pastes file paths into a session; Claude Code turns pasted image paths into [Image #n]. */
const pastePaths = (write, list) => write(`\x1b[200~${list.map(quotePath).join(' ')}\x1b[201~ `);

/** Dropped or pasted files as paths Claude Code can read. Files keep their own path; a pasted picture is saved first. */
async function filePaths(files) {
  const out = [];
  for (const f of files) {
    const image = f.type.startsWith('image/');
    let p = hangar.pathForFile(f);
    if (!p && image) p = await hangar.saveImage(new Uint8Array(await f.arrayBuffer()), f.type);
    if (p && !out.some((o) => o.path === p)) out.push({ path: p, name: f.name || p.split(/[\\/]/).pop(), url: image || IMAGE_TYPES.test(p) ? URL.createObjectURL(f) : null });
  }
  return out;
}

/** One ⌘V can arrive as two paste events; the same files again within half a second are the same paste. */
let lastPaste = { key: '', at: 0 };
function pastedFiles(files) {
  const key = files.map((f) => `${f.name}:${f.size}:${f.type}`).join('|');
  const again = key === lastPaste.key && Date.now() - lastPaste.at < 500;
  lastPaste = { key, at: Date.now() };
  return again ? Promise.resolve([]) : filePaths(files);
}

/** Types a message into a Claude Code session, as if typed in its prompt. Attached files go first, as pasted paths. */
function typeMessage(write, text, files = []) {
  if (files.length) pastePaths(write, files.map((f) => f.path));
  // Bracketed paste keeps line breaks inside one message.
  setTimeout(() => {
    if (text) write(text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text);
    setTimeout(() => write('\r'), 90);
  }, files.length ? 250 : 0);
}

/** Holds a message until the session can take one: typed while Claude Code is still starting, it would be lost. */
function whenReady(id, fn) {
  const t = tiles.get(id);
  if (!t || (t.snap.status !== 'starting' && !t.snap.booting)) return fn();
  (t.waiting ||= []).push(fn);
}

function setView(id, on, tile = tiles.get(id)) {
  if (!tile || tile.snap.kind === 'shell') return;
  if (on && !tile.chat) {
    const view = HangarChat.create({
      send: (text, files) => whenReady(id, () => typeMessage((d) => hangar.input(id, d), text, files)),
      takeFiles: pastedFiles,
      interrupt: () => hangar.input(id, '\x1b'),
      empty: '',
    });
    $('.chat-slot', tile.el).replaceWith(view.el);
    tile.chat = { view, on: false };
  }
  if (!tile.chat) return;
  tile.chat.on = on;
  tile.el.classList.toggle('chat-on', on);
  saveViewPref(id, on);
  $('.view', tile.el).classList.toggle('active', on);
  $('.view', tile.el).title = on ? `Show the terminal (${HangarCommands.shortcutLabel('view.clean')})` : `Clean view (${HangarCommands.shortcutLabel('view.clean')})`;
  if (on) hangar.chatOpen(id).then((items) => { tile.chat.view.set(items, true); tile.chat.view.scrollToEnd(); });
  else hangar.chatClose(id);
  tile.fitSoon(60);
  if (focused === id) setTimeout(() => focusInput(id), 0);
}

function updateTile(tile, snap) {
  tile.snap = snap;
  // Claude Code exited inside a terminal tile: the tile is a plain terminal again.
  if (snap.kind === 'shell' && tile.chat?.on) {
    tile.chat.on = false;
    tile.el.classList.remove('chat-on');
    $('.view', tile.el).classList.remove('active');
    hangar.chatClose(snap.id);
    tile.fitSoon(60);
  }
  if (tile.waiting && snap.status !== 'starting' && !snap.booting) {
    const queue = tile.waiting;
    tile.waiting = null;
    queue.forEach((fn, i) => setTimeout(fn, 400 + i * 600));
  }
  const el = tile.el;
  const shell = snap.kind === 'shell';
  el.className = `tile st-${snap.status}${shell ? ' shell' : ''}${focused === snap.id ? ' focused' : ''}${tile.sizeClass || ''}${snap.color ? ' colored' : ''}` +
    `${tile.chat?.on ? ' chat-on' : ''}${el.classList.contains('term-forced') ? ' term-forced' : ''}${zoomed === snap.id ? ' zoomed' : ''}${snap.ws && snap.ws !== state.activeWs ? ' ws-off' : ''}`;
  el.style.setProperty('--tc', snap.color || 'transparent');
  $('.name', el).textContent = snap.name;
  el.classList.toggle('snoozed', !!snap.snoozed);  // a tiny moon instead of the glow
  $('.dot', el).title = snap.snoozed ? 'Snoozed' : '';
  $('.name', el).title = snap.cwd;

  const since = Date.now() - snap.statusSince;
  // Only say something when it matters: quiet tiles show just their dot.
  let label = snap.status === 'idle' ? '' : STATUS_LABEL[snap.status] || snap.status;
  if (shell) label = snap.status === 'exited' ? 'Ended' : '';
  else if (snap.status === 'working') {
    const running = snap.agents.filter((a) => a.running).length;
    label = running ? `${running} agent${running > 1 ? 's' : ''} working` : `Working ${dur(since)}`;
  }
  // The ✕ already says error, so a leading "API error:" is dropped (the word appears once).
  if (snap.status === 'error' && snap.error) label = `Error: ${String(snap.error).replace(/^(api\s+)?error:\s*/i, '')}`.slice(0, 60);
  if (snap.handover) label = { queued: 'Fresh start after this turn', writing: 'Writing handover', clearing: 'Clearing context', continuing: 'Continuing' }[snap.handover] || label;
  $('.state', el).textContent = label;
  $('.dot', el).setAttribute('aria-label', STATUS_LABEL[snap.status] || snap.status);

  // Mode chip: filled once Claude has the instructions, outlined until the next message carries them.
  const chip = $('.mode-chip', el);
  chip.hidden = shell;
  if (window.HangarModes) HangarModes.drawChip(chip, snap); // mode name plus add-on glyphs

  const tk = snap.tokens;
  const pct = tk.contextSize ? Math.min(100, (tk.context / tk.contextSize) * 100) : 0;
  const ctx = $('.ctx', el);
  ctx.className = `ctx${pct >= 90 ? ' hot' : pct >= 70 ? ' warn' : ''}${pct > 0 ? '' : ' empty'}`;
  $('.bar i', ctx).style.width = `${pct}%`;
  $('.cv', ctx).textContent = pct >= 70 ? `${Math.round(pct)}%` : '';
  // Past 60% context, offer a fresh start right where you look.
  $('.fresh-hint', el).hidden = shell || pct < 60 || !!snap.handover || snap.status === 'exited';
  const totalOut = tk.output + tk.agentOutput;
  ctx.title = [
    `Context ${k(tk.context)} of ${k(tk.contextSize)} (${Math.round(pct)}%)`,
    snap.model, totalOut ? `${k(totalOut)} output tokens${tk.agentOutput ? `, ${k(tk.agentOutput)} by agents` : ''}` : '',
    tk.costUSD ? `$${tk.costUSD.toFixed(2)} at API prices` : '',
  ].filter(Boolean).join('\n');

  const tb = $('.timer', el);
  const tm = snap.timer;
  tb.className = 'hbtn timer';
  if (tm && !tm.finished) {
    if (!tm.startedAt) { tb.classList.add('armed'); $('.tv', el).textContent = `${tm.minutes}m`; tb.title = `${tm.minutes} min budget, starts with your next prompt`; }
    else {
      const frac = 1 - tm.remaining / tm.minutes;
      tb.classList.add('active');
      if (frac >= 1) tb.classList.add('over'); else if (frac >= 0.8) tb.classList.add('wrap');
      $('.tv', el).textContent = tm.remaining > 0 ? mmss(tm.remaining) : `+${mmss(-tm.remaining)}`;
      tb.title = frac >= 1 ? 'Time is up, Claude was told to wrap up' : frac >= 0.8 ? 'Wrapping up' : `${Math.round(tm.remaining)} min left of ${tm.minutes}`;
    }
  } else if (tm && tm.finished) {
    $('.tv', el).textContent = 'done'; tb.title = 'Timer finished';
  } else {
    $('.tv', el).textContent = ''; tb.title = `Time budget (${HangarCommands.shortcutLabel('session.timer')})`;
  }
  $('.pin', el).classList.toggle('active', snap.pinned);
  $('.pin', el).title = snap.pinned ? 'Unpin' : `Pin as main (${HangarCommands.shortcutLabel('session.pin')})`;
  const lk = $('.lock', el);
  lk.hidden = !snap.lock;
  lk.title = 'Unlock size';

  // Agents strip
  const strip = $('.agents', el);
  const agents = snap.agents;
  const maxChips = Math.max(1, Math.floor((tile.lastRect?.w || 600) / 190));
  const html = agents.slice(0, maxChips).map((a) => {
    const time = a.running ? dur(Date.now() - a.startedAt) : a.endedAt > a.startedAt ? dur(a.endedAt - a.startedAt) : '';
    return `<span class="chip${a.running ? '' : ' done'}" title="${esc(`${a.type || 'agent'}: ${a.desc || ''}\n${k(a.output)} output tokens`)}">` +
      `<span class="cd"></span><span class="ct">${esc(a.type || 'agent')}</span>` +
      `${a.desc ? `<span class="cdsc">${esc(a.desc)}</span>` : ''}<span class="cn">${[time, a.output ? k(a.output) : ''].filter(Boolean).join('  ')}</span></span>`;
  }).join('') + (agents.length > maxChips ? `<span class="chip more">+${agents.length - maxChips}</span>` : '');
  if (strip.innerHTML !== html) strip.innerHTML = html;
  if (tile.chat?.on) {
    // Menus and permission prompts need the real terminal; the chat comes back after.
    const forced = snap.status === 'needs_input';
    if (forced !== el.classList.contains('term-forced')) {
      el.classList.toggle('term-forced', forced);
      if (focused === snap.id) setTimeout(() => focusInput(snap.id), 0);
    }
    const working = snap.status === 'working' || !!snap.handover;
    tile.chat.view.setBusy(working, snap.handover ? label : working ? label || 'Working' : '');
  } else el.classList.remove('term-forced');
  $('.view', el).hidden = shell;
  if (!$('.view', el).title) $('.view', el).title = `Clean view (${HangarCommands.shortcutLabel('view.clean')})`;
  $('.overlay .msg', el).textContent = shell ? 'Terminal closed' : 'Session ended';
  $('.overlay .restart', el).textContent = shell ? 'Reopen' : snap.sessionId ? 'Resume' : 'Restart';
}

// ---------- layout ----------
//
// Tiles size themselves by status, but calmly:
// - the selected tile is anchored: it keeps its size and place while others change;
// - a status has to hold for a moment before it moves anything, so a session
//   flickering between working and done does not shake the screen;
// - shifts smaller than a few pixels are skipped, since every resize makes
//   Claude Code redraw.

const SETTLE_MS = { needs_input: 400, working: 1500, done: 1500, idle: 2500, starting: 0, exited: 800, error: 400 };
const MIN_SHIFT = 16;
let anchor = { id: null, rect: null, grow: false };
let layoutKey = '';
let drag = null;  // active edge drag
let zoomed = null; // tile shown over the whole stage; the others stay put underneath

function anchorOn(id) {
  const r = tiles.get(id)?.lastRect;
  // A tile too small to work in grows once when you pick it, then stays put.
  const small = r && (r.w < 520 || r.h < 240);
  anchor = { id, rect: small ? null : r || null, grow: !!small };
}

function settledStatus(tile, now) {
  const st = tile.snap.status;
  if (tile.effStatus == null) { tile.effStatus = st; return st; }
  if (st === tile.effStatus) { tile.pending = null; return st; }
  if (!tile.pending || tile.pending.status !== st) tile.pending = { status: st, since: now };
  if (now - tile.pending.since >= (SETTLE_MS[st] ?? 1000)) { tile.effStatus = st; tile.pending = null; }
  return tile.effStatus;
}

function layout(force = false) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const pinnedId = state.tiles.find((t) => t.pinned)?.id || '';
  const key = `${W}x${H}|${state.tiles.map((t) => t.id).join(',')}|${pinnedId}`;
  if (key !== layoutKey) {
    // The stage or the set of tiles changed: the anchor has to give way.
    if (layoutKey && anchor.id) anchor.rect = null;
    layoutKey = key;
    force = true;
  }
  const now = Date.now();
  const items = state.tiles.map((t) => {
    const tile = tiles.get(t.id);
    const lock = t.lock ? { w: t.lock.w != null ? t.lock.w * W : null, h: t.lock.h != null ? t.lock.h * H : null } : null;
    return {
      id: t.id, pinned: t.pinned, lock,
      weight: HangarLayout.weightFor(tile ? settledStatus(tile, now) : t.status),
      anchor: anchor.id === t.id && anchor.rect ? anchor.rect : null,
    };
  });
  let rects = HangarLayout.computeLayout(items, W, H, GAP);
  if (anchor.id && !anchor.rect && rects[anchor.id]) {
    if (anchor.grow && items.length > 1) {
      const it = items.find((i) => i.id === anchor.id);
      if (it && !it.lock) { it.weight *= 1.8; rects = HangarLayout.computeLayout(items, W, H, GAP); }
    }
    anchor.rect = rects[anchor.id];
    anchor.grow = false;
  }
  if (zoomed && rects[zoomed]) rects = { ...rects, [zoomed]: { x: 0, y: 0, w: W, h: H } };
  else if (zoomed || document.body.classList.contains('has-zoom')) clearZoom();
  const prev = {};
  for (const [id, t] of tiles) if (t.lastRect) prev[id] = t.lastRect;
  if (!force && HangarLayout.maxShift(prev, rects) < MIN_SHIFT) {
    // Skipped: keep the anchor on where the selected tile really is.
    if (anchor.id && prev[anchor.id] && anchor.id !== zoomed) anchor.rect = prev[anchor.id];
    return;
  }
  applyRects(rects, W, H);
}

function applyRects(rects, W, H) {
  for (const [id, r] of Object.entries(rects)) {
    const t = tiles.get(id);
    if (!t) continue;
    const prev = t.lastRect;
    t.lastRect = r;
    placeHandles(t, r, W, H);
    if (prev && prev.x === r.x && prev.y === r.y && prev.w === r.w && prev.h === r.h) continue;
    // A new tile appears in place; only existing tiles glide.
    if (!prev) t.el.classList.add('placing');
    Object.assign(t.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    if (!prev) { void t.el.offsetWidth; t.el.classList.remove('placing'); }
    t.fitSoon(prev ? 340 : 0);
    t.sizeClass = r.w < 420 ? ' narrow tiny' : r.w < 640 ? ' narrow' : '';
    t.el.classList.toggle('narrow', r.w < 640);
    t.el.classList.toggle('tiny', r.w < 420);
  }
  document.body.classList.toggle('no-tiles', state.tiles.length === 0);
}

// ---------- resizing by hand ----------
//
// Each tile has a handle on its right and bottom edge when another tile sits
// there. Dragging sets that tile's size and locks it; the tile across the edge
// gives up its own lock on that side so the space can come from it.

function makeHandles(id) {
  const out = {};
  for (const side of ['r', 'b']) {
    const hd = h('div', `rz rz-${side}`);
    hd.setAttribute('role', 'separator');
    hd.setAttribute('aria-orientation', side === 'r' ? 'vertical' : 'horizontal');
    hd.title = 'Drag to resize. Double-click to let it size itself again.';
    hd.addEventListener('mousedown', (e) => startDrag(e, id, side));
    hd.addEventListener('dblclick', () => setLock(id, null));
    stage.appendChild(hd);
    out[side] = hd;
  }
  return out;
}

function placeHandles(t, r, W, H) {
  const { r: hr, b: hb } = t.handles;
  if (zoomed) { hr.hidden = hb.hidden = true; return; }
  const hasRight = r.x + r.w < W - GAP;
  const hasBelow = r.y + r.h < H - GAP;
  hr.hidden = !hasRight;
  hb.hidden = !hasBelow;
  Object.assign(hr.style, { left: `${r.x + r.w - 3}px`, top: `${r.y}px`, width: `${GAP + 6}px`, height: `${r.h}px` });
  Object.assign(hb.style, { left: `${r.x}px`, top: `${r.y + r.h - 3}px`, width: `${r.w}px`, height: `${GAP + 6}px` });
}

function neighbours(id, side) {
  const r = tiles.get(id)?.lastRect;
  if (!r) return [];
  const out = [];
  for (const [tid, t] of tiles) {
    const q = t.lastRect;
    if (tid === id || !q) continue;
    if (side === 'r' && Math.abs(q.x - (r.x + r.w + GAP)) < 3 && q.y < r.y + r.h && r.y < q.y + q.h) out.push(tid);
    if (side === 'b' && Math.abs(q.y - (r.y + r.h + GAP)) < 3 && q.x < r.x + r.w && r.x < q.x + q.w) out.push(tid);
  }
  return out;
}

function startDrag(e, id, side) {
  if (e.button !== 0) return;
  e.preventDefault();
  setFocus(id, false);
  const t = tiles.get(id);
  if (!t?.lastRect) return;
  drag = { id, side, x0: e.clientX, y0: e.clientY, rect: { ...t.lastRect }, across: neighbours(id, side), moved: false };
  document.body.classList.add('resizing', side === 'r' ? 'resizing-x' : 'resizing-y');
  t.handles[side].classList.add('active');
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', endDrag, { once: true });
}

function onDrag(e) {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 3) return;
    drag.moved = true;
    // The tile across the edge gives up its lock on that axis, so the space comes from it.
    const axis = drag.side === 'r' ? 'w' : 'h';
    for (const nid of drag.across) {
      const snap = state.tiles.find((s) => s.id === nid);
      if (snap?.lock?.[axis] != null) snap.lock = { ...snap.lock, [axis]: null };
    }
  }
  const W = stage.clientWidth, H = stage.clientHeight;
  const r = { ...drag.rect };
  if (drag.side === 'r') r.w = Math.round(Math.max(HangarLayout.MIN_W, Math.min(W - r.x - HangarLayout.MIN_W - GAP, drag.rect.w + e.clientX - drag.x0)));
  else r.h = Math.round(Math.max(HangarLayout.MIN_H, Math.min(H - r.y - HangarLayout.MIN_H - GAP, drag.rect.h + e.clientY - drag.y0)));
  anchor = { id: drag.id, rect: r, grow: false };
  const snap = state.tiles.find((s) => s.id === drag.id);
  if (snap) snap.lock = { ...(snap.lock || {}), ...(drag.side === 'r' ? { w: r.w / W } : { h: r.h / H }) };
  layout(true);
}

function endDrag() {
  window.removeEventListener('mousemove', onDrag);
  document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
  if (!drag) return;
  const { id, side, across, moved } = drag;
  tiles.get(id)?.handles[side].classList.remove('active');
  drag = null;
  if (!moved) return;
  for (const nid of across) {
    const snap = state.tiles.find((s) => s.id === nid);
    if (snap) hangar.setLock(nid, snap.lock);
  }
  const snap = state.tiles.find((s) => s.id === id);
  if (snap?.lock) hangar.setLock(id, snap.lock);
  for (const t of tiles.values()) t.fit();
}

function toggleZoom(id) {
  // Focus first, so the anchor is taken from the tile's place in the grid, not the zoomed rect.
  if (zoomed !== id) setFocus(id);
  // Coming back from zoom puts everything exactly where it was.
  if (anchor.id === id && tiles.get(id)?.lastRect && !zoomed) anchor = { id, rect: tiles.get(id).lastRect, grow: false };
  zoomed = zoomed === id ? null : id;
  for (const [tid, t] of tiles) t.el.classList.toggle('zoomed', tid === zoomed);
  document.body.classList.toggle('has-zoom', !!zoomed);
  layout(true);
}

function clearZoom() {
  zoomed = null;
  for (const t of tiles.values()) t.el.classList.remove('zoomed');
  document.body.classList.remove('has-zoom');
}

function setLock(id, lock) {
  const snap = state.tiles.find((s) => s.id === id);
  if (snap) snap.lock = lock;
  hangar.setLock(id, lock);
  if (!lock && anchor.id === id) anchor.rect = null;
  layout(true);
}

function resetSizes() {
  for (const s of state.tiles) if (s.lock) setLock(s.id, null);
  anchor.rect = null;
  layout(true);
}

// ---------- render ----------

function render() {
  document.documentElement.style.setProperty("--zoom", String(state.settings?.uiZoom || 1));
  // Tiles of hidden workspaces stay mounted (hidden), so switching back is instant.
  const all = state.allTiles || state.tiles;
  const ids = new Set(all.map((t) => t.id));
  for (const [id, t] of tiles) {
    if (!ids.has(id)) {
      t.dispose(); t.el.remove(); t.handles.r.remove(); t.handles.b.remove(); tiles.delete(id);
      if (focused === id) focused = null;
      if (anchor.id === id) anchor = { id: null, rect: null, grow: false };
    }
  }
  for (const snap of all) {
    const t = tiles.get(snap.id) || createTile(snap);
    updateTile(t, snap);
  }
  if (!drag) layout();
  renderBar();
  if (!state.tiles.length) renderRecent($('#empty-recent'), 6);
  if (!focused && state.tiles.length) setFocus(state.tiles[0].id);
  window.HangarWs?.afterRender();
}

// ---------- top bar ----------

function renderBar() {
  // Every workspace counts; snoozed sessions do not count as needing you. A click opens the overview.
  const c = HangarAttention.counts(state.allTiles || state.tiles);
  const ovKey = `Overview (${HangarCommands.shortcutLabel('view.overview')})`;
  const parts = [];
  if (c.needs_input) parts.push(`<button class="s needs" data-act="next" title="${jumpOnly() ? `Jump to it (${SHIFT_MOD}U)` : ovKey}"><span class="dot"></span>${c.needs_input} need${c.needs_input > 1 ? '' : 's'} you</button>`);
  if (c.error) parts.push(`<button class="s error" data-act="overview" title="${ovKey}"><span class="dot"></span>${c.error} error${c.error > 1 ? 's' : ''}</button>`);
  if (c.working) parts.push(`<button class="s working" data-act="overview" title="${ovKey}"><span class="dot"></span>${c.working} working</button>`);
  if (c.done) parts.push(`<button class="s done" data-act="overview" title="${ovKey}"><span class="dot"></span>${c.done} done</button>`);
  const sum = $('#summary');
  const html = parts.join('');
  if (sum.innerHTML !== html) sum.innerHTML = html;
  // The overview's own way in: shown once there is a session anywhere, tooltip from the registry.
  const ovb = $('#btn-overview');
  ovb.hidden = !(state.allTiles || state.tiles).length;
  if (ovb.title !== ovKey) ovb.title = ovKey;

  const rl = state.rateLimits;
  const u = [];
  for (const [key, label] of [['five_hour', '5h'], ['seven_day', 'Week']]) {
    const r = rl?.[key];
    if (r?.used_percentage == null) continue;
    const p = Math.round(r.used_percentage);
    u.push(`<span class="u${p >= 90 ? ' hot' : p >= 70 ? ' warn' : ''}">${label}<span class="meter"><i style="width:${p}%"></i></span>${p}%</span>`);
  }
  const uh = u.length ? u.join('') : `<span class="u">${ICON.chart}</span>`;
  if ($('#usage').innerHTML !== uh) $('#usage').innerHTML = uh;
  $('#usage').classList.toggle('icon-only', !u.length);
  $('#ov-model').textContent = state.settings.overseerModel || '';
}

// One workspace with a few sessions: "needs you" jumps straight there, as before. Otherwise the counts open the overview.
const jumpOnly = () => (state.workspaces || []).length < 2 && (state.allTiles || state.tiles).length <= 4;
$('#summary').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'next' && jumpOnly()) nextWaiting();
  else window.HangarOverview?.open();
});
$('#btn-overview').onmousedown = (e) => e.preventDefault();
$('#btn-overview').onclick = () => window.HangarOverview?.open();
new MutationObserver(() => $('#btn-overview').setAttribute('aria-pressed', String(document.body.classList.contains('ovw-open'))))
  .observe(document.body, { attributes: true, attributeFilter: ['class'] });

function nextWaiting() {
  if (window.HangarWs) return HangarWs.nextWaiting();  // hops workspaces when it has to
  const waiting = state.tiles.filter((t) => t.status === 'needs_input' || t.status === 'error');
  if (!waiting.length) return;
  const i = waiting.findIndex((t) => t.id === focused);
  setFocus(waiting[(i + 1) % waiting.length].id);
}

// ---------- popovers ----------

const layer = $('#layer');
let closePop = null;
// The last place the keyboard was (a terminal, the message box, the overseer), so every
// popover, the palette and the menus hand it back to exactly that element.
let lastInput = null;
window.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t.closest?.('#layer')) return;
  if (t.matches?.('textarea, input, [contenteditable="true"]')) lastInput = t;
}, true);
function returnFocus() {
  const t = lastInput;
  const tile = t?.closest?.('.tile');
  if (t && t.isConnected && t.getClientRects().length && (!tile || tile.classList.contains('focused'))) t.focus();
  else if (focused && tiles.has(focused)) focusInput(focused);
}
function openPop(el, anchorEl, opts = {}) {
  if (closePop) closePop();
  layer.innerHTML = '';
  layer.appendChild(el);
  layer.classList.add('open');
  el.setAttribute('role', 'dialog');
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    const w = el.offsetWidth;
    const below = r.bottom + 6;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, below))}px`;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, opts.alignLeft ? r.left : r.right - w))}px`;
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); opts.onEscape?.(); closePop(); return; } opts.onKey?.(e); };
  const onDown = (e) => { if (!el.contains(e.target)) closePop(); };
  closePop = () => {
    layer.classList.remove('open'); layer.innerHTML = '';
    window.removeEventListener('keydown', onKey, true);
    layer.removeEventListener('mousedown', onDown);
    closePop = null;
    opts.onClose?.();
    returnFocus();
  };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('mousedown', onDown);
  return el;
}

/** A list of buttons, navigable with the arrow keys. */
function menuItems(el, items) {
  for (const it of items) {
    if (!it) { el.appendChild(h('div', 'sep')); continue; }
    const b = h('button', `item${it.cls ? ` ${it.cls}` : ''}`, it.html || esc(it.label));
    if (it.kbd) b.insertAdjacentHTML('beforeend', `<span class="kb">${esc(it.kbd)}</span>`);
    b.onclick = () => { closePop(); it.run(); };
    el.appendChild(b);
  }
}
/** Arrow keys move between the visible items. With opts.filter, typing filters the rows:
 *  opts.filter(query) hides what doesn't match and returns nothing; Backspace edits the query. */
function arrowNav(el, opts = {}) {
  let q = '';
  const visible = () => [...el.querySelectorAll('.item')].filter((b) => b.offsetParent !== null && !b.disabled);
  return (e) => {
    if (opts.filter && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT' &&
      ((e.key.length === 1 && (q || e.key !== ' ')) || (e.key === 'Backspace' && q))) {
      e.preventDefault();
      q = e.key === 'Backspace' ? q.slice(0, -1) : q + e.key;
      opts.filter(q);
      visible()[0]?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = visible();
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[n].focus();
  };
}

function openTimer(id, anchorEl) {
  const snap = state.tiles.find((t) => t.id === id);
  if (!snap || snap.kind === 'shell') return;
  anchorEl = anchorEl || $('.timer', tiles.get(id).el);
  const el = h('div', 'pop');
  el.innerHTML = `<h3>Time budget</h3>
    <div class="row">${[10, 15, 30, 45, 60, 90].map((m) => `<button class="btn small" data-m="${m}">${m}m</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input type="number" min="1" max="600" placeholder="min" aria-label="Minutes"><button class="btn small" data-custom>Set</button>
    ${snap.timer ? '<div class="grow"></div><button class="btn small" data-clear>Clear</button>' : ''}</div>
`;
  openPop(el, anchorEl);
  el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { hangar.setTimer(id, Number(b.dataset.m)); closePop(); }; });
  const input = $('input', el);
  const custom = () => { const v = Number(input.value); if (v > 0) { hangar.setTimer(id, v); closePop(); } };
  $('[data-custom]', el).onclick = custom;
  input.onkeydown = (e) => { if (e.key === 'Enter') custom(); };
  const clr = $('[data-clear]', el);
  if (clr) clr.onclick = () => { hangar.setTimer(id, null); closePop(); };
  el.querySelector('[data-m]').focus();
}

function openMore(id, anchorEl) {
  const snap = state.tiles.find((t) => t.id === id);
  if (!snap) return;
  const shell = snap.kind === 'shell';
  const el = h('div', 'pop menu tile-menu');
  // About seven rows. Rarer actions (copy session ID, let it size itself, Review and Simplify)
  // live in the palette and the Session menu; Review and Simplify also in the changes peek.
  const extra = window.HangarExtras?.moreItems(snap) || { folder: [], items: [] };
  const asks = snap.status === 'needs_input' || snap.snoozed;  // snooze only matters while it glows
  menuItems(el, [
    { label: 'Rename and colour…', kbd: HangarCommands.shortcutLabel('session.rename'), run: () => openRename(id) },
    ...(shell ? [] : [{ label: 'Mode…', kbd: HangarCommands.shortcutLabel('mode.choose'), run: () => openModePicker(id) }]),
    ...(shell || snap.status === 'exited' ? [] : [{ label: 'Fresh start…', run: () => openFresh(id) }]),
    { label: snap.pinned ? 'Unpin' : 'Pin as main', kbd: HangarCommands.shortcutLabel('session.pin'), run: () => hangar.pin(id) },
    ...(shell || snap.status === 'exited' || !asks ? [] : [{ label: snap.snoozed ? 'Glow again' : 'Snooze…', run: () => (snap.snoozed ? hangar.snooze(id, 'off') : window.HangarOverview?.snoozeMenu(id)) }]),
    ...(snap.status === 'exited' ? [{ label: shell ? 'Reopen' : snap.sessionId ? 'Resume' : 'Restart', run: () => hangar.restart(id) }] : []),
    null,
    ...extra.items,
    null,
    { label: shell ? 'Close terminal' : 'Close session', cls: 'danger', run: () => closeTile(id) },
  ]);
  // Folder › opens a small flyout beside the menu.
  const folderRow = h('button', 'item has-sub', `<span>Folder</span><span class="chev" aria-hidden="true">›</span>`);
  folderRow.setAttribute('aria-haspopup', 'menu');
  folderRow.setAttribute('aria-expanded', 'false');
  const seps = el.querySelectorAll(':scope > .sep');
  el.insertBefore(folderRow, seps[1] || null);
  let sub = null;
  const closeSub = (focusRow) => { sub?.remove(); sub = null; folderRow.setAttribute('aria-expanded', 'false'); if (focusRow) folderRow.focus(); };
  const openSub = (focusFirst) => {
    if (sub) { if (focusFirst) sub.querySelector('.item')?.focus(); return; }
    sub = h('div', 'pop menu sub-menu');
    sub.setAttribute('role', 'menu');
    sub.setAttribute('aria-label', 'Folder');
    menuItems(sub, extra.folder);
    el.appendChild(sub);
    folderRow.setAttribute('aria-expanded', 'true');
    const r = folderRow.getBoundingClientRect(), pr = el.getBoundingClientRect();
    const right = pr.right + sub.offsetWidth + 4 < window.innerWidth;
    sub.style.left = right ? `${pr.width - 4}px` : `${-sub.offsetWidth + 4}px`;
    sub.style.top = `${r.top - pr.top - 5}px`;
    if (focusFirst) sub.querySelector('.item')?.focus();
  };
  folderRow.onclick = () => (sub ? closeSub(true) : openSub(true));
  folderRow.addEventListener('mouseenter', () => openSub(false));
  el.querySelectorAll(':scope > .item').forEach((b) => { if (b !== folderRow) b.addEventListener('mouseenter', () => closeSub(false)); });
  const nav = arrowNav(el);
  openPop(el, anchorEl, {
    onKey: (e) => {
      if (sub && sub.contains(document.activeElement)) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); closeSub(true); return; }
        arrowNav(sub)(e);
        return;
      }
      if (e.key === 'ArrowRight' && document.activeElement === folderRow) { e.preventDefault(); openSub(true); return; }
      if (sub && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) closeSub(false);
      nav(e);
    },
  });
  el.querySelector('.item').focus();
}

// ---------- fresh start ----------

function openFresh(id, anchorEl) {
  const snap = state.tiles.find((t) => t.id === id);
  if (!snap || snap.kind === 'shell' || snap.handover) return;
  const t = tiles.get(id);
  const el = h('div', 'pop');
  el.style.width = '300px';
  const busy = snap.status === 'working' || snap.status === 'needs_input';
  el.innerHTML = `<h3>Fresh start</h3>
    <p class="hint first">Claude writes a handover, the context is cleared, and the session carries on from the handover. Nothing is lost.${busy ? ' Starts when this turn ends.' : ''}</p>
    <div class="row end"><button class="btn small" data-no>Cancel</button><button class="btn small primary" data-go>Fresh start</button></div>`;
  openPop(el, anchorEl || $('.more', t.el));
  $('[data-no]', el).onclick = () => closePop();
  $('[data-go]', el).onclick = () => { hangar.freshStart(id); closePop(); };
  $('[data-go]', el).focus();
}

/** The one notice style: text, optional buttons, a ×. It stays until acted on or closed
 *  (nothing closes by itself). actions: [label, fn, primary?]. */
function makeNotice(html, actions, done) {
  const el = h('div', 'toast', `<span>${html}</span>`);
  el.setAttribute('role', 'status');
  for (const [label, fn, primary] of actions) {
    const b = h('button', `btn small${primary ? ' primary' : ''}`, esc(label));
    b.onclick = () => { if (fn() !== false) { el.remove(); done(); } };
    el.appendChild(b);
  }
  const x = h('button', 'hbtn tx-x', '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>');
  x.setAttribute('aria-label', 'Dismiss');
  x.title = 'Dismiss';
  x.onclick = () => { el.remove(); done(); };
  el.appendChild(x);
  return el;
}

/** A notice about one tile, inside it just below its header, so it never covers the header's controls. */
function tileNotice(id, html, actions = []) {
  const t = tiles.get(id);
  if (!t) return;
  t.el.querySelector(':scope > .toast')?.remove();
  t.el.appendChild(makeNotice(html, actions, () => focusInput(id)));
}

/** A notice about the window (a workspace, a closed session, an update): in the top bar, never over a tile.
 *  One per key; a newer one with the same key replaces it. Returns the element. */
function windowNotice(html, actions = [], key = 'any') {
  let box = $('#notices');
  if (!box) { box = h('div', 'notices'); box.id = 'notices'; $('#bar').insertBefore(box, $('#usage')); }
  box.querySelector(`[data-key="${key}"]`)?.remove();
  const el = makeNotice(html, actions, () => {});
  el.dataset.key = key;
  box.appendChild(el);
  while (box.children.length > 2) box.firstChild.remove();
  return el;
}

/** Close a session or terminal, with Undo (the same as put away). */
function closeNow(id) {
  const snap = (state.allTiles || state.tiles).find((t) => t.id === id);
  hangar.close(id);
  if (snap) windowNotice(`${esc(snap.name)} closed`, [['Undo', () => hangar.reopen()]], 'closed');
}

// ---------- rename and colour ----------

function swatchRow(current, onPick) {
  const row = h('div', 'swatches');
  const opts = [null, ...SWATCHES];
  for (const c of opts) {
    const b = h('button', `sw${c === current ? ' sel' : ''}${c ? '' : ' none'}`);
    b.type = 'button';
    if (c) b.style.setProperty('--c', c);
    b.setAttribute('aria-label', c ? `Colour ${c}` : 'No colour');
    b.title = c ? '' : 'No colour';
    b.onclick = () => { row.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); onPick(c); };
    row.appendChild(b);
  }
  return row;
}

function openRename(id) {
  const t = tiles.get(id);
  const snap = state.tiles.find((s) => s.id === id);
  if (!t || !snap) return;
  const el = h('div', 'pop');
  el.style.width = '300px';
  el.innerHTML = '<h3>Rename</h3><input class="field" maxlength="40" aria-label="Session name"><h3 class="sub">Colour</h3>';
  const input = $('input', el);
  input.value = snap.name;
  let color = snap.color || null;
  el.appendChild(swatchRow(color, (c) => { color = c; hangar.setColor(id, c); }));
  let cancelled = false;
  const save = () => { if (!cancelled && input.value.trim() && input.value.trim() !== snap.name) hangar.rename(id, input.value); };
  openPop(el, $('.name', t.el), { alignLeft: true, onClose: save, onEscape: () => { cancelled = true; } });
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); closePop(); } };
  input.focus();
  input.select();
}

// ---------- modes ----------
// The picker, library and editor live in modes-ui.js.

function openModePicker(id, anchorEl) { window.HangarModes?.openPicker(id, anchorEl); }
function modeFromSession(id) { window.HangarModes?.modeFromSession(id); }
function openModes(selectId) { window.HangarModes?.openLibrary(selectId); }

/** Asks inside the given popover instead of a native dialog. Resolves true or false. */
function askInline(container, text, okLabel = 'OK', danger = false) {
  container.querySelector('.ask-bar')?.remove();
  return new Promise((resolve) => {
    const bar = h('div', 'ask-bar', `<span>${esc(text)}</span><div class="grow"></div>`);
    const no = h('button', 'btn small', 'Cancel'); no.type = 'button';
    const yes = h('button', `btn small ${danger ? 'danger' : 'primary'}`, esc(okLabel)); yes.type = 'button';
    const done = (v) => { bar.remove(); resolve(v); };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    bar.append(no, yes);
    container.appendChild(bar);
    yes.focus();
  });
}

/** A small confirm popover next to a tile. */
function askTile(id, text, okLabel, onYes) {
  const t = tiles.get(id);
  if (!t) return;
  const el = h('div', 'pop');
  el.style.width = '300px';
  el.innerHTML = `<p class="hint first">${esc(text)}</p><div class="row end"><button class="btn small" data-no>Cancel</button><button class="btn small danger" data-go>${esc(okLabel)}</button></div>`;
  openPop(el, $('.more', t.el));
  $('[data-no]', el).onclick = () => closePop();
  $('[data-go]', el).onclick = () => { closePop(); onYes(); };
  $('[data-go]', el).focus();
}

function closeTile(id) {
  const snap = state.tiles.find((t) => t.id === id);
  if (!snap) return;
  if (snap.kind !== 'shell' && (snap.status === 'working' || snap.status === 'needs_input')) askTile(id, `${snap.name} is still working. Close it?`, 'Close', () => closeNow(id));
  else closeNow(id);
}

function flash(el, text) {
  const f = h('div', 'flash', esc(text));
  el.appendChild(f);
  setTimeout(() => f.remove(), 1400);
}

// ---------- usage ----------

function openUsage(anchorEl) {
  const el = h('div', 'pop usage-pop');
  el.style.width = '380px';
  const draw = () => {
    const rl = state.rateLimits;
    const limits = [['five_hour', '5-hour limit'], ['seven_day', 'Weekly limit']].map(([key, label]) => {
      const r = rl?.[key];
      if (r?.used_percentage == null) return '';
      const p = Math.round(r.used_percentage);
      const reset = r.resets_at ? `Resets in ${dur(r.resets_at * (r.resets_at < 1e12 ? 1000 : 1) - Date.now())}` : '';
      return `<div class="lim${p >= 90 ? ' hot' : p >= 70 ? ' warn' : ''}"><div class="lt"><span>${label}</span><b>${p}%</b></div>
        <div class="lbar"><i style="width:${p}%"></i></div><div class="lr">${reset}</div></div>`;
    }).join('');
    // Only sessions with numbers; the block stays away until one has some.
    const rows = state.tiles.filter((t) => t.kind !== 'shell').map((t) => {
      const out = t.tokens.output + t.tokens.agentOutput;
      return { t, out, cost: t.tokens.costUSD || 0 };
    }).filter((r) => r.out || r.cost).sort((a, b) => b.cost - a.cost || b.out - a.out);
    const total = rows.reduce((a, r) => a + r.cost, 0);
    const table = rows.length ? `<h3 class="sub">Open sessions</h3><div class="ut">${rows.map(({ t, out, cost }) =>
      `<div class="ur"><span class="mdot" style="--c:${t.color || 'var(--line)'}"></span><span class="un">${esc(t.name)}</span><span class="uo">${out ? `${k(out)} out` : ''}</span><span class="uc" title="Estimate at API prices">${cost ? `≈${cost.toFixed(2)}` : ''}</span></div>`).join('')}
      ${total ? `<div class="ur total"><span></span><span class="un">Total</span><span></span><span class="uc" title="Estimate at API prices">≈${total.toFixed(2)}</span></div>` : ''}</div>` : '';
    el.innerHTML = `<h3>Usage</h3>${limits}${table}`;
    window.HangarExtras?.usageSection(el);
  };
  draw();
  usageRefresh = draw;
  openPop(el, anchorEl || $('#usage'), { onClose: () => { usageRefresh = null; } });
}
let usageRefresh = null;
$('#usage').onclick = (e) => openUsage(e.currentTarget);

// ---------- new session ----------

/** Folder label: its name, or parent/name when two recent folders share a name. */
function folderLabels(dirs) {
  const count = new Map();
  for (const d of dirs) count.set(folderName(d).toLowerCase(), (count.get(folderName(d).toLowerCase()) || 0) + 1);
  return dirs.map((d) => {
    if (count.get(folderName(d).toLowerCase()) < 2) return folderName(d);
    const parts = d.split(/[\\/]/).filter(Boolean);
    return parts.slice(-2).join('/');
  });
}

async function renderRecent(container, limit, onPick, opts = {}) {
  // Only the latest call draws, so two quick renders can't interleave and reorder the list.
  const tok = (container.dataset.tok = String(Number(container.dataset.tok || 0) + 1));
  const all = await hangar.recent();
  if (container.dataset.tok !== tok) return [];
  const labels = folderLabels(all);
  const q = (opts.filter?.() || '').trim().toLowerCase();
  const list = all.filter((d, i) => !q || labels[i].toLowerCase().includes(q) || d.toLowerCase().includes(q)).slice(0, limit);
  container.innerHTML = '';
  if (opts.listbox) { container.setAttribute('role', 'listbox'); container.setAttribute('aria-label', 'Folders'); }
  for (const dir of list) {
    const row = h('div', 'recent-item', `<span class="rn">${esc(labels[all.indexOf(dir)])}</span><span class="rp">${esc(shortPath(dir))}</span>` +
      (opts.terminal?.() ? '' : '<button class="rc rh" title="History" tabindex="-1">History</button><button class="rc" title="Continue the last conversation in this folder" tabindex="-1">Continue</button>'));
    row.dataset.dir = dir;
    row.tabIndex = -1;
    if (opts.listbox) { row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false'); row.id = `np-opt-${container.children.length}`; }
    row.onclick = (e) => {
      if (e.target.closest('.rh')) { onPick?.(); window.HangarExtras?.openHistory(dir); return; }
      const how = opts.terminal?.() ? 'shell' : e.target.closest('.rc') ? 'continue' : 'new';
      start(dir, how, opts.mode?.());
      onPick?.();
    };
    container.appendChild(row);
  }
  return list;
}

async function start(dir, how = 'new', sessionMode = null) {
  if (how === 'new' && dir && window.HangarExtras?.wantsWorktree(dir)) return HangarExtras.startWorktree(dir);
  const id = await hangar.create(dir, how, sessionMode);
  if (id) setTimeout(() => setFocus(id), 50);
}

let lastNewKind = 'claude';
let lastNewMode = null;
async function openNew() {
  const el = h('div', 'pop modal new-pop');
  el.innerHTML = `<div class="np-head"><h3>New</h3>
      <div class="seg" role="tablist"><button role="tab" data-kind="claude">${ICON.spark}Claude Code</button><button role="tab" data-kind="shell">${ICON.term}Terminal</button></div></div>
    <input class="field np-filter" type="text" placeholder="Filter" aria-label="Filter folders" spellcheck="false" role="combobox" aria-controls="np-list" aria-expanded="true">
    <div class="recent-list" id="np-list"></div>
    <div class="foot"><button class="btn small np-mode" data-mode></button><div class="grow"></div>
      <button class="btn" data-pick>Choose folder…</button><button class="btn primary" data-home>${ICON.term}Open terminal</button></div>`;
  let kind = lastNewKind;
  let mode = window.HangarWs?.defaultMode() || (modeById(lastNewMode) && !modeById(lastNewMode).hidden ? lastNewMode : null);
  let touched = false;  // left alone, a folder that remembers its own mode starts in that
  const pickedMode = () => (touched ? mode || 'none' : `default:${mode || 'none'}`);
  let sel = 0;
  const list = $('.recent-list', el);
  const modeBtn = $('[data-mode]', el);
  const filter = $('.np-filter', el);
  const highlight = () => {
    [...list.children].forEach((c, i) => { c.classList.toggle('sel', i === sel); c.setAttribute('aria-selected', String(i === sel)); });
    const cur = list.children[sel];
    if (cur) { filter.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else filter.removeAttribute('aria-activedescendant');
  };
  const drawMode = () => {
    const m = modeById(mode);
    modeBtn.innerHTML = m ? `<span class="mdot" style="--c:${m.color}"></span>${esc(m.name)} mode` : 'No mode';
    modeBtn.title = 'Mode the session starts in';
  };
  // One small menu instead of a row of every mode.
  modeBtn.onclick = (e) => {
    e.stopPropagation();
    const menu = h('div', 'pop menu inline-menu');
    for (const m of [null, ...visibleModes()]) {
      const b = h('button', 'item', `<span class="mdot" style="--c:${m ? m.color : 'transparent'}"></span>${esc(m ? m.name : 'No mode')}${(m?.id || null) === mode ? `<span class="ck">${ICON.check}</span>` : ''}`);
      b.onclick = (ev) => { ev.stopPropagation(); mode = m?.id || null; lastNewMode = mode; touched = true; drawMode(); menu.remove(); };
      menu.appendChild(b);
    }
    el.querySelector('.inline-menu')?.remove();
    el.appendChild(menu);
    const r = modeBtn.getBoundingClientRect(), pr = el.getBoundingClientRect();
    menu.style.left = `${r.left - pr.left}px`;
    menu.style.bottom = `${pr.bottom - r.top + 6}px`;
    el.addEventListener('mousedown', function off(ev) { if (!menu.contains(ev.target)) { menu.remove(); el.removeEventListener('mousedown', off); } });
  };
  const draw = async () => {
    el.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    modeBtn.hidden = kind === 'shell';
    $('[data-home]', el).hidden = kind !== 'shell';
    drawMode();
    await renderRecent(list, 8, () => closePop && closePop(), { terminal: () => kind === 'shell', mode: pickedMode, filter: () => filter.value, listbox: true });
    sel = Math.min(sel, Math.max(0, list.children.length - 1));
    highlight();
  };
  // Remembered only for this run of the app, and only when picked here (New terminal doesn't count).
  el.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { kind = b.dataset.kind; lastNewKind = kind; draw(); filter.focus(); }; });
  filter.oninput = () => { sel = 0; draw(); };
  openPop(el, null, {
    onKey: (e) => {
      if (el.querySelector('.inline-menu')) return;
      const n = list.children.length;
      if (e.key === 'ArrowDown' && n) { sel = (sel + 1) % n; highlight(); e.preventDefault(); }
      if (e.key === 'ArrowUp' && n) { sel = (sel - 1 + n) % n; highlight(); e.preventDefault(); }
      if (e.key === 'Enter' && n && !e.target.closest?.('button')) {
        e.preventDefault();
        const d = list.children[sel].dataset.dir;
        closePop();
        start(d, kind === 'shell' ? 'shell' : e.shiftKey ? 'continue' : 'new', pickedMode());
      }
    },
  });
  await draw();
  filter.focus();
  window.HangarExtras?.newPopover(el, list, () => kind);
  $('[data-pick]', el).onclick = async () => {
    const dir = await hangar.pickFolder();
    if (dir) { closePop?.(); start(dir, kind === 'shell' ? 'shell' : 'new', pickedMode()); }
  };
  $('[data-home]', el).onclick = () => { closePop(); start(null, 'shell'); };
}

const PERMISSION_LABELS = [
  ['default', 'Ask first'], ['acceptEdits', 'Accept edits'], ['plan', 'Plan mode'],
  ['auto', 'Auto'], ['bypassPermissions', 'Skip all prompts'],
];

function openSettings(anchorEl) {
  const s = state.settings;
  const el = h('div', 'pop');
  el.style.width = '310px';
  el.innerHTML = `<h3>Notifications</h3>
    <label class="opt">Session needs you<input type="checkbox" data-k="needsInput" ${s.notify.needsInput ? 'checked' : ''}></label>
    <label class="opt">Session finished a task<input type="checkbox" data-k="done" ${s.notify.done ? 'checked' : ''}></label>
    <label class="opt">Sound<input type="checkbox" data-k="sound" ${s.notify.sound ? 'checked' : ''}></label>
    <label class="opt">Context fuller than (%)<input type="number" min="0" max="100" data-n="contextPct" value="${s.notify.contextPct || ''}" placeholder="Off"></label>
    <label class="opt">Plan usage above (%)<input type="number" min="0" max="100" data-n="usagePct" value="${s.notify.usagePct || ''}" placeholder="Off"></label>
    <div class="sep"></div><h3>Sessions</h3>
    <label class="opt">Permissions<select data-perm>${PERMISSION_LABELS.map(([v, l]) => `<option value="${v}" ${(s.permissionMode || 'default') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="opt">New sessions open in clean view<input type="checkbox" data-s="cleanDefault" ${s.cleanDefault ? 'checked' : ''}></label>
    <label class="opt">Polished terminal<input type="checkbox" data-s="polishTerm" ${s.polishTerm !== false ? 'checked' : ''}></label>
    <div class="sep"></div><h3>Overseer</h3>
    <label class="opt">Model<select data-model>${['haiku', 'sonnet', 'opus'].map((m) => `<option ${s.overseerModel === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>`;
  window.HangarLook?.settingsRows(el);
  openPop(el, anchorEl);
  el.querySelectorAll('[data-k]').forEach((c) => { c.onchange = () => hangar.setSettings({ notify: { [c.dataset.k]: c.checked } }); });
  el.querySelectorAll('[data-s]').forEach((c) => { c.onchange = () => hangar.setSettings({ [c.dataset.s]: c.checked }); });
  el.querySelectorAll('[data-n]').forEach((c) => { c.onchange = () => hangar.setSettings({ notify: { [c.dataset.n]: Number(c.value) || 0 } }); });
  $('[data-model]', el).onchange = (e) => hangar.setSettings({ overseerModel: e.target.value });
  $('[data-perm]', el).onchange = (e) => hangar.setSettings({ permissionMode: e.target.value });
}

$('#btn-new').onclick = openNew;
$('#btn-settings').onclick = (e) => openSettings(e.currentTarget);

// ---------- overseer ----------

let ov = null;
function toggleOverseer(force, prompt) {
  const open = force ?? !document.body.classList.contains('ov-open');
  document.body.classList.toggle('ov-open', open);
  $('#btn-overseer').classList.toggle('on', open);
  $('#btn-overseer').setAttribute('aria-pressed', String(open));
  if (open && !ov) {
    ov = makeTerm($('#ov-term'), (d) => hangar.overseerInput(d), (c, r) => hangar.overseerResize(c, r), '#16141c');
    ovChat = HangarChat.create({
      send: (text, files) => typeMessage((d) => hangar.overseerInput(d), text, files),
      takeFiles: pastedFiles,
      interrupt: () => hangar.overseerInput('\x1b'),
      placeholder: 'Ask about your sessions',
      empty: '',
    });
    $('#ov-chat').appendChild(ovChat.el);
    setOvView(viewPref('overseer'));
  }
  if (open && prompt) hangar.overseerAsk(prompt);
  else if (open && !state.overseerRunning) hangar.overseerStart();
  // An instant switch with a short fade: the tiles re-fit once, behind the fade, and never slide.
  const st = $('#stage');
  st.classList.add('swap');
  layout(true);
  requestAnimationFrame(() => requestAnimationFrame(() => st.classList.remove('swap')));
  if (open) setTimeout(() => { ov?.fit(); focusOverseer(); }, 30);
}

let ovChat = null;
let ovChatOn = false;
function setOvView(on) {
  ovChatOn = on;
  saveViewPref('overseer', on);
  document.body.classList.toggle('ov-chat-on', on);
  $('#ov-view').classList.toggle('on', on);
  $('#ov-view').title = on ? 'Show the terminal' : 'Clean view';
  if (on) hangar.chatOpen('overseer').then((items) => { ovChat.set(items, true); ovChat.scrollToEnd(); });
  else hangar.chatClose('overseer');
  ov?.fitSoon(60);
  focusOverseer();
}
function focusOverseer() {
  if (ovChatOn && !document.body.classList.contains('ov-term-forced')) ovChat?.focus(); else ov?.term.focus();
}
$('#ov-view').onclick = () => { if (ov) setOvView(!ovChatOn); };
$('#btn-overseer').onclick = () => toggleOverseer();
$('#ov-close').onclick = () => toggleOverseer(false);
$('#ov-new').onclick = () => hangar.overseerRestart();
hangar.onOverseerData((d) => ov?.term.write(d));
hangar.onOverseerClear(() => ov?.term.reset());

// ---------- drag a folder in ----------

let dragDepth = 0;
const dz = $('#dropzone');
window.addEventListener('dragenter', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  for (const f of e.dataTransfer.files) {
    const p = hangar.pathForFile(f);
    if (p) start(p);
  }
});
dz.addEventListener('dragenter', () => dz.classList.add('hover'));
dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
dz.addEventListener('drop', () => dz.classList.remove('hover'));

// ---------- wiring ----------

hangar.onData(({ id, data }) => tiles.get(id)?.term.write(data));
hangar.onChat(({ id, items, reset }) => {
  if (id === 'overseer') {
    if (!ovChat) return;
    ovChat.set(items, reset);
    ovChat.setBusy(ovChat.guessBusy());
    return;
  }
  tiles.get(id)?.chat?.view.set(items, reset);
});
hangar.onClear(({ id }) => tiles.get(id)?.term.reset());

// A typed exit phrase ended a mode: say so on the tile, with a way back.
hangar.onModeEnded(({ id, mode }) => tileNotice(id, `${esc(mode.name)} mode ended`, [['Undo', () => hangar.setMode(id, mode.id)]]));
hangar.onNotice(({ id, text }) => tileNotice(id, esc(text)));
hangar.onFocus(({ id }) => setFocus(id));
hangar.onScreenRequest(({ req, id, lines }) => {
  const t = tiles.get(id);
  hangar.screenReply(req, t ? screenText(t.term, lines) : null);
});
// Menu items and shortcuts run through the command registry (commands.js, app-commands.js).

let lastFont = null;
let lastZoom = null;
let lastLook = null;
hangar.onState((s) => {
  if (drag) {
    // Keep the locks being dragged; the rest of the state is fresh.
    for (const t of s.tiles) { const cur = state.tiles.find((x) => x.id === t.id); if (cur) t.lock = cur.lock; }
  }
  state = window.HangarWs ? HangarWs.view(s) : s;
  const look = `${s.settings.polishTerm !== false}`;
  if (lastLook !== null && lastLook !== look) {
    for (const t of [...tiles.values(), ov].filter(Boolean)) { Object.assign(t.term.options, termLook(t.bg)); t.fit(); }
  }
  lastLook = look;
  document.body.classList.toggle('polish', s.settings.polishTerm !== false);
  if (lastFont !== null && lastFont !== s.settings.fontSize) {
    for (const t of tiles.values()) { t.term.options.fontSize = s.settings.fontSize; t.fit(); }
    if (ov) { ov.term.options.fontSize = s.settings.fontSize; ov.fit(); }
  }
  lastFont = s.settings.fontSize;
  // After a UI zoom, terminals measure their cells again (a font nudge forces it) and refit.
  const zoom = s.settings.uiZoom || 1;
  if (lastZoom !== null && lastZoom !== zoom) {
    setTimeout(() => {
      for (const t of [...tiles.values(), ov].filter(Boolean)) {
        const f = t.term.options.fontSize;
        t.term.options.fontSize = f + 1;
        t.term.options.fontSize = f;
        t.fit();
      }
    }, 80);
  }
  lastZoom = zoom;
  document.body.classList.toggle('fullscreen', window.innerHeight === screen.height);
  render();
  window.HangarModes?.refresh();
  usageRefresh?.();
});

// Window resizes jump straight to the new layout, without animating every step.
let winResizeTimer = null;
window.addEventListener('resize', () => {
  document.body.classList.add('win-resizing');
  layout(true);
  clearTimeout(winResizeTimer);
  winResizeTimer = setTimeout(() => document.body.classList.remove('win-resizing'), 200);
});

// Claude Code dialogs (permission menus, tips, pickers) do not always fire a
// hook. Spot their footer at the bottom of a quiet tile and report it.
const DIALOG = /Enter to (confirm|select)|Esc to cancel/;
const dialogShown = new Map();
setInterval(() => {
  if (ov && ovChatOn) {
    const open = DIALOG.test(screenText(ov.term, 6));
    if (open !== document.body.classList.contains('ov-term-forced')) {
      document.body.classList.toggle('ov-term-forced', open);
      ov.fitSoon(40);
      focusOverseer();
    }
    ovChat.setBusy(!open && ovChat.guessBusy());
  }
  for (const [id, t] of tiles) {
    const st = t.snap.status;
    // 'starting' is checked too: Claude Code's folder-trust prompt shows before it is ready, and needs you.
    if (t.snap.kind === 'shell' || st === 'working' || st === 'exited') { dialogShown.delete(id); continue; }
    const open = DIALOG.test(screenText(t.term, 6));
    if (open !== (dialogShown.get(id) || false)) {
      dialogShown.set(id, open);
      hangar.dialog(id, open);
    }
  }
  for (const id of dialogShown.keys()) if (!tiles.has(id)) dialogShown.delete(id); // closed tiles
}, 1500);

hangar.init().then((s) => {
  state = window.HangarWs ? HangarWs.view(s) : s;
  lastFont = s.settings.fontSize;
  lastLook = `${s.settings.polishTerm !== false}`;
  document.body.classList.toggle('polish', s.settings.polishTerm !== false);
  render();
  window.HangarCommands?.changed();
});
