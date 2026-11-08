/* global hangar, HangarChat, HangarCommands, openPop, closePop, h, esc, arrowNav, state, tiles */
/* exported HangarViewer */
'use strict';

// The file viewer: a file a session made or mentioned, in a panel beside the sessions
// (one button makes it full size).
// Pictures, markdown, HTML pages (sandboxed), PDF, video, audio and text; anything
// else gets Open and Show in folder. It follows the file as it changes on disk.
// Ways in: a path in a terminal or the clean view, the Files list in a session's
// ⋯ menu, and the palette.

const HangarViewer = (() => {
  const IC = {
    prev: '<svg viewBox="0 0 16 16"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
    open: '<svg viewBox="0 0 16 16"><path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>',
    folder: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
    full: '<svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>',
    dock: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M9 3v10"/></svg>',
    file: '<svg viewBox="0 0 16 16"><path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/></svg>',
    image: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.1"/><path d="M3 12l3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5"/></svg>',
    page: '<svg viewBox="0 0 16 16"><path d="M4 2.5h5l3 3v8H4z"/><path d="M6 8.5h4M6 11h4"/></svg>',
    play: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M7 6.2v3.6L10 8z"/></svg>',
  };
  const KIND_ICON = { image: IC.image, markdown: IC.page, html: IC.page, pdf: IC.page, text: IC.page, video: IC.play, audio: IC.play };

  let el = null;          // the open viewer
  let cur = null;         // info of the file on show
  let list = [];          // files to step through with ← →
  let cwd = null;
  let mode = null;        // markdown/html: 'view' | 'source'; image: 'fit' | 'full'
  let lastFocus = null;
  let offChange = null;
  let full = false;       // the viewer's full-size choice, remembered

  const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  function build() {
    el = h('div', 'viewer');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'File');
    el.tabIndex = -1;
    el.innerHTML = `<div class="vgrip" aria-hidden="true"></div><div class="vbar">
        <span class="vnav"><button class="hbtn vprev" aria-label="Previous file" title="Previous (←)">${IC.prev}</button><button class="hbtn vnext" aria-label="Next file" title="Next (→)">${IC.next}</button></span>
        <span class="vname"></span><span class="vdir"></span>
        <span class="grow"></span>
        <span class="vseg" role="group"></span>
        <button class="hbtn vopen" aria-label="Open in its app" title="Open in its app">${IC.open}</button>
        <button class="hbtn vreveal" aria-label="Show in folder" title="Show in folder">${IC.folder}</button>
        <button class="hbtn vsize"></button>
        <button class="hbtn vclose" aria-label="Close" title="Close (Esc)">${IC.close}</button>
      </div><div class="vbody"></div>`;
    el.querySelector('.vprev').onclick = () => step(-1);
    el.querySelector('.vnext').onclick = () => step(1);
    el.querySelector('.vopen').onclick = () => cur && hangar.fileOpen(cur.path);
    el.querySelector('.vreveal').onclick = () => cur && hangar.fileReveal(cur.path);
    el.querySelector('.vclose').onclick = close;
    el.querySelector('.vsize').onclick = () => { full = !full; store('viewerFull', full ? '1' : ''); applySize(); };
    grip(el.querySelector('.vgrip'));
    el.querySelector('.vbody').addEventListener('click', (e) => {
      if (onFeedClick(e, cur?.dir)) return;
      const a = e.target.closest('a[href]');
      if (a) { e.preventDefault(); window.open(a.href); }
    });
    window.addEventListener('keydown', (e) => {
      // Only while the panel has the keyboard: beside a session, Esc still belongs to the session.
      if (!isOpen() || document.getElementById('layer').classList.contains('open') || !hasKeys()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const media = e.target.closest?.('video, audio, iframe');
      if (!media && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && list.length > 1) {
        e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    }, true);
    document.getElementById('main').insertBefore(el, document.getElementById('overseer'));
    const w = Number(load('viewerWidth'));
    if (w) el.style.setProperty('--viewer-w', `${w}px`);
    full = load('viewerFull') === '1';
    offChange = hangar.onFileChanged(({ path, info }) => { if (cur && path === cur.path) { if (info) { cur = info; draw(true); } else drawMissing(cur.path); } });
  }

  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const hasKeys = () => el.contains(document.activeElement) || document.activeElement === document.body;
  const relayout = () => { if (typeof layout === 'function') layout(true); };

  /** Beside the sessions, or full size (always full size when there is no room). */
  function applySize() {
    const big = full || window.innerWidth < 1000;
    document.body.classList.toggle('viewer-full', big);
    const b = el.querySelector('.vsize');
    b.innerHTML = big ? IC.dock : IC.full;
    b.title = big ? 'Beside sessions' : 'Full size';
    b.setAttribute('aria-label', b.title);
    b.hidden = window.innerWidth < 1000;
    relayout();
  }

  /** Drag the panel's left edge. The sessions refit once when the drag ends. */
  function grip(g) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing', 'resizing-x');
      const main = document.getElementById('main').getBoundingClientRect();
      const ov = document.getElementById('overseer').getBoundingClientRect().width;
      const move = (ev) => {
        const w = Math.max(320, Math.min(main.width - ov - 380, main.right - ov - 8 - ev.clientX));
        el.style.setProperty('--viewer-w', `${Math.round(w)}px`);
        relayout();
      };
      const up = () => {
        g.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing', 'resizing-x');
        store('viewerWidth', String(parseInt(el.style.getPropertyValue('--viewer-w'), 10) || ''));
        relayout();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up, { once: true });
      g.addEventListener('pointercancel', up, { once: true });
    });
    window.addEventListener('resize', () => { if (isOpen()) applySize(); });
  }

  function step(d) {
    if (!cur || list.length < 2) return;
    const i = list.findIndex((f) => f.path === cur.path);
    const next = list[(i + d + list.length) % list.length];
    show(next);
  }

  /** Opens the viewer. target: a file info (from the main process) or { raw, cwd }. */
  async function open(target, opts = {}) {
    let info = target && target.url ? target : null;
    cwd = opts.cwd ?? target?.cwd ?? cwd;
    if (!info && target?.raw) info = await hangar.fileResolve(target.raw, cwd);
    list = (opts.list || []).filter(Boolean);
    if (!el) build();
    if (!document.body.classList.contains('viewing')) lastFocus = document.activeElement;
    document.body.classList.add('viewing');
    applySize();
    if (!info) { drawMissing(target?.raw || ''); el.focus(); return; }
    if (!list.some((f) => f.path === info.path)) list = list.length ? [info, ...list] : [info];
    show(info);
    el.focus({ preventScroll: true });
  }

  function show(info) {
    cur = info;
    mode = info.kind === 'image' ? 'fit' : (info.kind === 'markdown' || info.kind === 'html') ? 'view' : null;
    hangar.fileWatch(info.path);
    draw(false);
  }

  function header() {
    el.querySelector('.vnav').hidden = list.length < 2;
    el.querySelector('.vname').textContent = cur ? cur.name : '';
    const dir = el.querySelector('.vdir');
    dir.textContent = cur ? cur.dir : '';
    dir.title = cur ? cur.path : '';
    el.querySelector('.vopen').hidden = el.querySelector('.vreveal').hidden = !cur;
    const seg = el.querySelector('.vseg');
    const opts = !cur ? [] : cur.kind === 'image' ? [['fit', 'Fit'], ['full', '100%']]
      : cur.kind === 'markdown' ? [['view', 'Preview'], ['source', 'Source']]
      : cur.kind === 'html' ? [['view', 'Page'], ['source', 'Source']] : [];
    seg.hidden = !opts.length;
    seg.innerHTML = (cur?.kind === 'image' ? '<span class="vpct"></span>' : '') + opts.map(([k, l]) => `<button class="vs${mode === k ? ' on' : ''}" data-m="${k}" aria-pressed="${mode === k}">${l}</button>`).join('');
    seg.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => { mode = b.dataset.m; if (cur.kind === 'image') { showMode(); marks(); } else draw(false); };
    });
  }

  /** Draws the file. keep: a reload of the same file (keeps the scroll position). */
  async function draw(keep) {
    const body = el.querySelector('.vbody');
    const scroll = keep ? body.scrollTop : 0;
    if (cur?.kind !== 'image') { pic?.ro?.disconnect(); pic = null; }
    const i = cur;
    header();
    if (i.kind === 'image') {
      body.className = 'vbody vimg';
      body.innerHTML = `<img src="${esc(i.url)}" alt="${esc(i.name)}" draggable="false">`;
      const img = body.querySelector('img');
      img.onload = () => imageReady(body, img, keep);
      img.onerror = () => drawOther(body, i);
    } else if (i.kind === 'video') {
      body.className = 'vbody vmedia';
      body.innerHTML = `<video controls src="${esc(i.url)}"></video>`;
    } else if (i.kind === 'audio') {
      body.className = 'vbody vmedia';
      body.innerHTML = `<audio controls src="${esc(i.url)}"></audio>`;
    } else if (i.kind === 'pdf') {
      body.className = 'vbody vframe';
      body.innerHTML = `<iframe src="${esc(i.url)}" title="${esc(i.name)}"></iframe>`;
    } else if (i.kind === 'html' && mode === 'view') {
      body.className = 'vbody vframe page';
      // Scripts run, but the page gets its own opaque origin: no app, no other files.
      body.innerHTML = `<iframe sandbox="allow-scripts allow-forms" src="${esc(i.url)}" title="${esc(i.name)}"></iframe>`;
    } else if (i.kind === 'markdown' || i.kind === 'html' || i.kind === 'text') {
      const r = await hangar.fileRead(i.path);
      if (cur !== i) return;
      if (!r) { drawOther(body, i); return; }
      if (i.kind === 'markdown' && mode === 'view') {
        body.className = 'vbody vdoc';
        body.innerHTML = `<div class="msg vmd">${HangarChat.md(r.text, { headings: true })}</div>${r.cut ? '<div class="vcut">First 2 MB</div>' : ''}`;
        linkFiles(body, i.dir);
      } else {
        body.className = 'vbody vtext';
        body.innerHTML = `<pre>${esc(r.text)}</pre>${r.cut ? '<div class="vcut">First 2 MB</div>' : ''}`;
      }
    } else drawOther(body, i);
    body.scrollTop = scroll;
  }

  // ---------- pictures: scroll to zoom at the pointer, drag to move, double-click for fit / 100% ----------

  const MAX_ZOOM = 16;
  let pic = null;   // { body, img, w, h, s, x, y, ro }

  const fitScale = () => Math.min((pic.body.clientWidth - 32) / pic.w, (pic.body.clientHeight - 32) / pic.h, 1);
  function paint() {
    pic.img.style.transform = `translate(${pic.x}px, ${pic.y}px) scale(${pic.s})`;
    pic.img.style.imageRendering = pic.s >= 4 ? 'pixelated' : 'auto';
    const pct = el.querySelector('.vpct');
    if (pct) pct.textContent = `${Math.round(pic.s * 100)}%`;
  }
  /** Scale s, centred. */
  function centre(s) {
    pic.s = s;
    pic.x = Math.round((pic.body.clientWidth - pic.w * s) / 2);
    pic.y = Math.round((pic.body.clientHeight - pic.h * s) / 2);
    paint();
  }
  /** Keeps the picture from being moved out of sight. */
  function clampPos() {
    const W = pic.body.clientWidth, H = pic.body.clientHeight, w = pic.w * pic.s, h = pic.h * pic.s, m = 40;
    pic.x = Math.min(W - m, Math.max(m - w, pic.x));
    pic.y = Math.min(H - m, Math.max(m - h, pic.y));
  }
  function zoomAt(cx, cy, s) {
    const next = Math.max(Math.min(fitScale(), 0.1), Math.min(MAX_ZOOM, s));
    pic.x = cx - (cx - pic.x) * (next / pic.s);
    pic.y = cy - (cy - pic.y) * (next / pic.s);
    pic.s = next;
    clampPos();
    paint();
  }
  const showMode = () => { if (pic) centre(mode === 'full' ? 1 : fitScale()); };
  function marks() {
    el.querySelectorAll('.vs[data-m]').forEach((b) => {
      const on = b.dataset.m === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function imageReady(body, img, keep) {
    const old = keep && pic && pic.body === body && mode === null ? pic : null;
    pic?.ro?.disconnect();
    pic = { body, img, w: img.naturalWidth || 800, h: img.naturalHeight || 600, s: 1, x: 0, y: 0 };
    img.style.visibility = 'visible';
    if (old) { pic.s = old.s; pic.x = old.x; pic.y = old.y; paint(); } else showMode();
    const here = pic;
    // A fitted picture stays fitted as the panel changes size.
    pic.ro = new ResizeObserver(() => { if (pic === here && mode === 'fit') centre(fitScale()); });
    pic.ro.observe(body);
    if (body._zoomWired) return;
    body._zoomWired = true;
    const local = (e) => { const r = body.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    body.addEventListener('wheel', (e) => {
      if (!pic || pic.body !== body || !body.classList.contains('vimg')) return;
      e.preventDefault();
      mode = null;
      marks();
      const [x, y] = local(e);
      zoomAt(x, y, pic.s * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    body.addEventListener('dblclick', (e) => {
      if (!pic || !body.classList.contains('vimg')) return;
      if (mode === 'fit' || (mode === null && pic.s !== 1)) {
        const [x, y] = local(e);
        mode = 'full';
        zoomAt(x, y, 1);
      } else { mode = 'fit'; centre(fitScale()); }
      marks();
    });
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !pic || !body.classList.contains('vimg')) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      body.setPointerCapture(e.pointerId);
      const sx = e.clientX - pic.x, sy = e.clientY - pic.y;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
        moved = true;
        body.classList.add('dragging');
        pic.x = ev.clientX - sx;
        pic.y = ev.clientY - sy;
        clampPos();
        paint();
        if (mode !== null) { mode = null; marks(); }
      };
      const up = () => { body.removeEventListener('pointermove', move); body.classList.remove('dragging'); };
      body.addEventListener('pointermove', move);
      body.addEventListener('pointerup', up, { once: true });
      body.addEventListener('pointercancel', up, { once: true });
    });
  }

  function drawOther(body, i) {
    body.className = 'vbody vother';
    body.innerHTML = `<div class="vcard">${KIND_ICON[i.kind] || IC.file}<div class="vcn">${esc(i.name)}</div><div class="vcs">${size(i.size)}</div>
      <div class="row"><button class="btn small primary" data-open>Open</button><button class="btn small" data-reveal>Show in folder</button></div></div>`;
    body.querySelector('[data-open]').onclick = () => hangar.fileOpen(i.path);
    body.querySelector('[data-reveal]').onclick = () => hangar.fileReveal(i.path);
  }

  function drawMissing(raw) {
    cur = null;
    list = [];
    hangar.fileWatch(null);
    header();
    el.querySelector('.vname').textContent = String(raw).split(/[\\/]/).pop() || 'File';
    const body = el.querySelector('.vbody');
    body.className = 'vbody vother';
    body.innerHTML = '<div class="vcard">' + IC.file + '<div class="vcn">Not found</div></div>';
  }

  /** In a rendered markdown file, local links open here (relative to that file) and pictures show. */
  async function linkFiles(root, base) {
    root.querySelectorAll('a[data-file]').forEach((a) => { a.dataset.cwd = base; });
    const pics = [...root.querySelectorAll('a.pic[data-file]')];
    if (!pics.length) return;
    const infos = await resolveAll([...new Set(pics.map((a) => a.dataset.file))], base);
    for (const a of pics) {
      const i = infos[a.dataset.file];
      if (i?.kind !== 'image' || !a.isConnected) continue;
      const img = h('img');
      img.src = i.url;
      img.alt = a.textContent;
      img.className = 'vpic';
      a.replaceChildren(img);
    }
  }

  function close() {
    if (!el || !document.body.classList.contains('viewing')) return;
    const had = hasKeys();
    document.body.classList.remove('viewing', 'viewer-full');
    relayout();
    hangar.fileWatch(null);
    const body = el.querySelector('.vbody');
    body.innerHTML = '';   // stops media and pages
    pic?.ro?.disconnect();
    pic = null;
    cur = null;
    if (had) try { lastFocus?.focus?.({ preventScroll: true }); } catch {}
    lastFocus = null;
  }

  const isOpen = () => document.body.classList.contains('viewing');

  // ---------- a session's files ----------

  const ago = (t) => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  };

  /** The Files list for a session, as a small menu by the anchor. */
  async function filesMenu(id, anchorEl) {
    const snap = state.tiles.find((t) => t.id === id);
    if (!snap) return;
    const items = await hangar.filesList(id);
    const pop = h('div', 'pop menu files-menu');
    pop.setAttribute('aria-label', 'Files');
    if (!items.length) pop.innerHTML = '<div class="fm-empty">No files yet</div>';
    for (const f of items) {
      const b = h('button', 'item', `${KIND_ICON[f.kind] || IC.file}<span class="fm-n">${esc(f.name)}</span><span class="kb">${esc(ago(f.at))}</span>`);
      b.title = f.path;
      b.onclick = () => { closePop(); open(f, { list: items, cwd: snap.cwd }); };
      pop.appendChild(b);
    }
    const anchor = anchorEl || tiles.get(id)?.el.querySelector('.more');
    const nav = arrowNav(pop);
    openPop(pop, anchor, { onKey: nav });
    pop.querySelector('.item')?.focus();
  }

  // ---------- paths in a terminal ----------

  const EXT = 'png|jpe?g|gif|webp|bmp|ico|avif|svg|md|markdown|mdx|html?|pdf|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|flac|txt|log|json|jsonl|csv|tsv|ya?ml|toml|xml|diff|patch|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|css|scss|sh|ps1|sql|lua|php|vue|svelte';
  // Absolute (C:\x, /x, ~/x), relative with a folder (src/a.js, ./a.png), or a bare name with a known extension.
  const PATH_RE = new RegExp(String.raw`(?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|/)?(?:[\w.@+-]+[\\/])*[\w.@+-]+\.(?:${EXT})(?::\d+(?::\d+)?)?(?![\w/\\])`, 'gi');
  // An absolute path that may hold spaces runs up to the first known extension.
  const SPACED_RE = new RegExp(String.raw`(?:[A-Za-z]:[\\/]|(?<![\w.])(?:~[\\/]|/))[^\n"'\x60<>|*?]*?\.(?:${EXT})(?![\w])`, 'gi');
  const cache = new Map();   // cwd|raw -> { at, info }

  async function resolveAll(raws, dir, tileId) {
    const need = [];
    const out = {};
    const now = Date.now();
    for (const r of raws) {
      const c = cache.get(`${tileId || dir}|${r}`);
      if (c && now - c.at < 5000) out[r] = c.info; else need.push(r);
    }
    if (need.length) {
      const got = await hangar.fileResolveMany(need, dir, tileId);
      for (const r of need) { out[r] = got[r] || null; cache.set(`${tileId || dir}|${r}`, { at: now, info: out[r] }); }
      if (cache.size > 500) cache.clear();
    }
    return out;
  }

  /**
   * The lines around y that belong together. Claude Code breaks long lines itself with
   * real line breaks and an indent, so a line that reaches the edge counts as continuing.
   * A wrong join is harmless: a path only becomes a link if that file exists.
   */
  function textAround(term, y) {
    const b = term.buffer.active;
    const raw = (n) => b.getLine(n - 1)?.translateToString(true) ?? '';
    const reachesEdge = (n) => raw(n).length >= term.cols - 6 && !/\s$/.test(raw(n));
    const joins = (n) => !!b.getLine(n - 1)?.isWrapped || reachesEdge(n - 1);   // line n continues line n-1
    let top = y;
    while (y - top < 4 && top > 1 && joins(top)) top--;
    let bottom = y;
    while (bottom - y < 4 && bottom < b.length && raw(bottom + 1) && joins(bottom + 1)) bottom++;
    let text = '';
    const segs = [];
    for (let n = top; n <= bottom; n++) {
      const line = raw(n);
      const skip = n === top ? 0 : line.length - line.trimStart().length;   // Claude Code indents its continuation lines
      segs.push({ n, skip, start: text.length });
      text += line.slice(skip);
    }
    return { text, segs };
  }

  const cellAt = (segs, i) => {
    let s = segs[0];
    for (const x of segs) if (x.start <= i) s = x;
    return { x: i - s.start + s.skip + 1, y: s.n };
  };

  /** Path-like pieces of a text that touch line y: { raw, range, len }. */
  function candidates({ text, segs }, y) {
    const out = [];
    for (const re of [PATH_RE, SPACED_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) && out.length < 30) {
        if (/:\/\/$/.test(text.slice(Math.max(0, m.index - 3), m.index)) || /^https?:/i.test(text.slice(Math.max(0, m.index - 6), m.index + 2))) continue;
        const raw = m[0].trim();
        const start = cellAt(segs, m.index);
        const end = cellAt(segs, m.index + raw.length - 1);
        if (start.y <= y && end.y >= y) out.push({ raw, range: { start, end }, len: raw.length });
      }
    }
    return out;
  }

  const before = (a, b) => a.y < b.y || (a.y === b.y && a.x <= b.x);
  const overlaps = (a, b) => before(a.start, b.end) && before(b.start, a.end);

  /** Paths in the session's terminal become links that open in the viewer. */
  function attachTerm(term, getCwd, tileId) {
    term.registerLinkProvider({
      provideLinks(y, done) {
        const line = term.buffer.active.getLine(y - 1);
        if (!line) return done(undefined);
        const joined = textAround(term, y);
        const single = { text: line.translateToString(true), segs: [{ n: y, skip: 0, start: 0 }] };
        const found = [...candidates(joined, y), ...(joined.segs.length > 1 ? candidates(single, y) : [])];
        if (!found.length) return done(undefined);
        const dir = getCwd();
        resolveAll([...new Set(found.map((f) => f.raw))], dir, tileId).then((infos) => {
          const picked = [];
          // The longest real file wins where pieces overlap.
          for (const f of found.filter((c) => infos[c.raw]).sort((a, b) => b.len - a.len)) {
            if (!picked.some((p) => overlaps(p.range, f.range))) picked.push(f);
          }
          done(picked.length ? picked.map((f) => ({
            text: f.raw,
            range: f.range,
            decorations: { underline: true, pointerCursor: true },
            activate: () => open(infos[f.raw], { cwd: dir }),
          })) : undefined);
        }).catch(() => done(undefined));
      },
    });
  }

  // ---------- the clean view ----------

  /** Clicks on file links in a clean view feed. */
  function onFeedClick(e, dir) {
    const a = e.target.closest('a[data-file], [data-thumb]');
    if (!a) return false;
    e.preventDefault();
    open({ raw: a.dataset.file || a.dataset.thumb, cwd: a.dataset.cwd || dir });
    return true;
  }

  /** Small previews under a reply for the pictures it names. */
  async function thumbs(node, dir) {
    const raws = [...new Set([...node.querySelectorAll('a[data-file]')].map((a) => a.dataset.file)
      .filter((r) => /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(r)))].slice(0, 6);
    if (!raws.length || node.querySelector('.thumbs')) return;
    const infos = await resolveAll(raws, dir);
    const ok = raws.filter((r) => infos[r]?.kind === 'image');
    if (!ok.length || !node.isConnected || node.querySelector('.thumbs')) return;
    const row = h('div', 'thumbs');
    row.innerHTML = ok.map((r) => `<button class="thumb" data-thumb="${esc(r)}" title="${esc(infos[r].path)}" aria-label="${esc(infos[r].name)}"><img src="${esc(infos[r].url)}" alt="" loading="lazy" draggable="false"></button>`).join('');
    row.querySelectorAll('img').forEach((img) => { img.onerror = () => img.parentElement.remove(); });
    node.appendChild(row);
  }

  // ---------- commands ----------

  if (window.HangarCommands) {
    HangarCommands.register({
      id: 'session.files', label: 'Files', group: 'Actions', aliases: ['file', 'image', 'picture', 'screenshot', 'viewer', 'open file'],
      menu: { menu: 'Session', section: 'edit' },
      when: (cx) => !!cx.snap && cx.snap.kind !== 'shell',
      run: (cx) => filesMenu(cx.id),
    });
  }

  return { open, close, isOpen, filesMenu, attachTerm, onFeedClick, thumbs, _re: PATH_RE };
})();
window.HangarViewer = HangarViewer;
