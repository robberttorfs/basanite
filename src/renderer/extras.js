/* global HangarCommands, hangar, state, tiles, focused, isMac, esc, h, $, k, folderName, shortPath, setFocus, openPop, closePop,
   tileNotice, focusInput, setLock */
// Tile extras drawn from the data side (data-ipc.js): doing line, git chip and changes peek,
// same-file notice, cache-cold marker, folder actions, history, branch (fork), own-branch
// worktree in New, and the usage history chart. Loaded after app.js.
'use strict';

(() => {
  const C = HangarCommands;
  const SVG = {
    branch: '<svg viewBox="0 0 16 16"><circle cx="5" cy="4" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="11" cy="6" r="1.6"/><path d="M5 5.6v4.8M11 7.6c0 2-2 2.4-4.6 3.4"/></svg>',
    snow: '<svg viewBox="0 0 16 16"><path d="M8 2.5v11M3.2 5.2l9.6 5.6M3.2 10.8l9.6-5.6M6.5 3.5L8 5l1.5-1.5M6.5 12.5L8 11l1.5 1.5"/></svg>',
    overlap: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5"/><rect x="6.5" y="6.5" width="7" height="7" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  };
  const snapOf = (id) => state.tiles.find((t) => t.id === id) || (state.allTiles || []).find((t) => t.id === id);
  const nameOf = (id) => snapOf(id)?.name || 'another session';
  const base = (p) => String(p).split(/[\\/]/).pop();
  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (!ms || s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 86400 * 14) return `${Math.floor(s / 86400)}d`;
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  /** Focus a tile once main has created it and the state has arrived. */
  function focusWhenReady(id, tries = 30) {
    if (!id) return;
    if (tiles.has(id)) { setFocus(id); return; }
    if (tries > 0) setTimeout(() => focusWhenReady(id, tries - 1), 100);
  }

  // ---------- header: doing line, markers, git chip ----------
  function drawHeader(t, snap) {
    const el = t.el;
    const doing = $('.doing', el);
    const tx = $('.tx', el);
    if (!doing || !tx) return;
    const d = snap.status === 'working' && snap.doing ? snap.doing : '';
    if (doing.textContent !== d) { doing.textContent = d; doing.title = d; }
    const parts = [];
    const ov = snap.overlaps || [];
    if (ov.length) {
      const tip = ov.map((o) => `${base(o.file)} is also being edited in ${nameOf(o.otherId)}`).join('\n');
      parts.push(`<span class="txm overlap" role="img" aria-label="${esc(tip)}" title="${esc(tip)}">${SVG.overlap}</span>`);
    }
    if (snap.cacheCold && snap.kind !== 'shell' && snap.status !== 'working') {
      parts.push(`<span class="txm cold" role="img" aria-label="Cache expired" title="Cache expired: next message costs more">${SVG.snow}</span>`);
    }
    if (snap.git?.branch) {
      parts.push(`<button class="gitchip${snap.git.dirty ? ' dirty' : ''}" data-git title="${esc(snap.git.branch)}${snap.git.dirty ? ', changed' : ''}" aria-label="Changes on ${esc(snap.git.branch)}">${SVG.branch}<span class="gb">${esc(snap.git.branch)}</span>${snap.git.dirty ? '<i class="gd" aria-hidden="true"></i>' : ''}</button>`);
    }
    const html = parts.join('');
    if (tx.innerHTML !== html) tx.innerHTML = html;
  }
  function drawAll() { for (const [id, t] of tiles) { const s = snapOf(id) || t.snap; if (s) drawHeader(t, s); } }
  hangar.onState(() => drawAll());
  hangar.init().then(() => setTimeout(drawAll, 0));
  $('#stage').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-git]');
    if (!chip) return;
    e.stopPropagation();
    const id = chip.closest('.tile')?.dataset.id;
    if (id) openChanges(id, chip);
  }, true);

  // ---------- changes peek (read-only) ----------
  function parseDiff(diff) {
    const out = [];
    let cur = null;
    for (const line of String(diff).split('\n')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      if (m) { cur = { file: m[2], lines: [], add: 0, del: 0 }; out.push(cur); continue; }
      if (!cur) continue;
      if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(line)) continue;
      if (line.startsWith('+')) cur.add++;
      else if (line.startsWith('-')) cur.del++;
      cur.lines.push(line);
    }
    return out;
  }
  async function openChanges(id, anchorEl) {
    const t = tiles.get(id);
    if (!t) return;
    const el = h('div', 'pop modal changes-pop');
    el.setAttribute('aria-label', 'Changes');
    el.innerHTML = '<p class="hint">…</p>';
    openPop(el, null);
    el.tabIndex = -1;
    el.focus();
    const r = await hangar.gitChanges(id);
    if (!el.isConnected) return;
    if (!r?.git) { el.innerHTML = '<p class="hint">Not a git folder</p>'; return; }
    const sections = parseDiff(r.diff);
    const files = r.files.map((f) => {
      const s = sections.find((x) => x.file === f.path);
      const word = statusWord(f.status);
      return `<button class="cf" data-file="${esc(f.path)}" aria-label="${esc(`${f.path}, ${word}`)}"><span class="cs" aria-hidden="true">${word}</span><span class="cp">${esc(f.path)}</span>` +
        (s ? `<span class="cn"><span class="add">+${s.add}</span> <span class="del">−${s.del}</span></span>` : '') + '</button>';
    }).join('');
    const body = sections.map((s, i) => `<details class="cd" open data-i="${i}"><summary>${esc(s.file)}</summary><pre>${s.lines.map((l) => {
      const cls = l.startsWith('@@') ? 'hk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '';
      return `<span class="${cls}">${esc(l) || ' '}</span>`;
    }).join('')}</pre></details>`).join('');
    el.innerHTML = `<div class="ch-head">${SVG.branch}<b>${esc(r.branch || '')}</b><span class="faint">${r.fileCount} file${r.fileCount === 1 ? '' : 's'}</span><span class="grow"></span><span class="ch-runs"></span></div>
      <div class="ch-files">${files || '<p class="hint">No changes</p>'}</div>
      ${body ? `<div class="ch-diff">${body}${r.truncated ? '<p class="hint">Diff truncated</p>' : ''}</div>` : ''}`;
    // Everything about changes in one place: Review and Simplify (they cost tokens, so the dots show it).
    const runs = $('.ch-runs', el);
    for (const it of window.HangarModes?.moreItems(snapOf(id)) || []) {
      const b = h('button', 'btn small', it.html);
      b.onclick = () => { closePop(); it.run(); };
      runs.appendChild(b);
    }
    el.querySelectorAll('.cf').forEach((b) => {
      b.onclick = () => {
        const d = [...el.querySelectorAll('.cd summary')].find((s) => s.textContent === b.dataset.file)?.parentElement;
        if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); }
      };
    });
    el.querySelector('.cf')?.focus();
  }

  /** Plain words for git's two-letter status codes. */
  function statusWord(code) {
    const c = String(code || '').trim();
    if (c === '??') return 'new';
    if (c.includes('U')) return 'conflict';
    if (c.includes('A')) return 'added';
    if (c.includes('D')) return 'deleted';
    if (c.includes('R')) return 'renamed';
    return 'modified';
  }

  // ---------- same file in two sessions ----------
  hangar.onOverlap?.(({ file, a, b }) => {
    const f = esc(base(file));
    tileNotice(a, `${f} is also being edited in ${esc(nameOf(b))}`);
    tileNotice(b, `${f} is also being edited in ${esc(nameOf(a))}`);
  });

  // ---------- folder actions, branch ----------
  let editor = null;
  hangar.editorName?.().then((n) => { editor = n; C.changed(); }).catch(() => {});
  const revealLabel = isMac ? 'Reveal in Finder' : hangar.platform === 'win32' ? 'Reveal in Explorer' : 'Open folder';
  // Only once there is a conversation to branch (a new tile has an id before its first prompt).
  const canFork = (s) => !!s && s.kind !== 'shell' && !!s.sessionId && !!s.lastResponseAt;

  function confirmFork(id) {
    const t = tiles.get(id);
    if (!t) return;
    const el = h('div', 'pop');
    el.style.width = '290px';
    el.innerHTML = `<h3>Branch this session</h3><p class="hint first">Re-reads this conversation once.</p>
      <div class="row end"><button class="btn small" data-no>Cancel</button><button class="btn small primary" data-go>Branch</button></div>`;
    openPop(el, $('.more', t.el));
    $('[data-no]', el).onclick = () => closePop();
    $('[data-go]', el).onclick = async () => { closePop(); focusWhenReady(await hangar.fork(id)); };
    $('[data-go]', el).focus();
  }

  /** For the tile's ⋯ menu: the Folder flyout's rows, and the rows that stay in the menu. */
  function moreItems(snap) {
    const folder = [{ label: 'Copy path', run: () => navigator.clipboard.writeText(snap.cwd) }, { label: revealLabel, run: () => hangar.reveal(snap.cwd) }];
    if (editor) folder.push({ label: `Open in ${editor}`, run: () => hangar.openEditor(snap.cwd) });
    const items = [];
    if (snap.kind !== 'shell') items.push({ label: 'History…', run: () => openHistory(snap.cwd) });
    if (canFork(snap) && snap.status !== 'exited') items.push({ label: 'Branch this session', run: () => confirmFork(snap.id) });
    return { folder, items };
  }

  // ---------- history ----------
  function openHistory(dir) {
    if (!dir) return;
    const el = h('div', 'pop modal hist-pop');
    el.setAttribute('aria-label', 'History');
    el.innerHTML = `<div class="pal-head">${SVG.search}<span class="pal-chip">${esc(folderName(dir))}</span>
      <input class="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="hist-list" aria-label="Search history" spellcheck="false"></div>
      <div class="pal-list" id="hist-list" role="listbox" aria-label="Conversations"></div>`;
    const input = $('.pal-input', el);
    const list = $('.pal-list', el);
    let rows = [];
    let sel = 0;
    let all = [];
    const resume = (r) => { if (!r) return; closePop(); hangar.historyOpen(dir, r.sessionId).then(focusWhenReady); };
    const highlight = () => {
      [...list.children].forEach((c, i) => { c.classList.toggle('sel', i === sel); c.setAttribute('aria-selected', String(i === sel)); });
      const cur = list.children[sel];
      if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
    };
    const draw = (items, kind) => {
      rows = items;
      sel = 0;
      list.innerHTML = items.length ? '' : `<p class="hint pad">${kind === 'search' ? 'Nothing found' : 'No conversations yet'}</p>`;
      items.forEach((r, i) => {
        const text = kind === 'search' ? r.snippet : r.firstPrompt || '(no prompt)';
        const meta = kind === 'search' ? ago(r.at) : `${ago(r.lastActivity)}  ${r.size ? bytes(r.size) : ''}`;
        const row = h('div', 'pal-row', `<span class="pal-label">${esc(text)}</span><span class="pal-kb hist-meta">${esc(meta.trim())}</span>`);
        row.id = `hist-${i}`;
        row.setAttribute('role', 'option');
        row.onmousedown = (e) => e.preventDefault();
        row.onclick = () => resume(r);
        list.appendChild(row);
      });
      highlight();
    };
    let timer = null;
    let seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) { draw(all, 'list'); return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        const res = await hangar.historySearch(dir, q);
        if (my !== seq || !el.isConnected) return;
        // One row per conversation: its best line.
        const seen = new Set();
        draw((res || []).filter((r) => !seen.has(r.sessionId) && seen.add(r.sessionId)), 'search');
      }, 200);
    });
    openPop(el, null, {
      onKey: (e) => {
        const n = rows.length;
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; highlight(); }
        if (e.key === 'Enter') { e.preventDefault(); resume(rows[sel]); }
      },
    });
    input.focus();
    list.innerHTML = '<p class="hint pad">…</p>';
    hangar.historyList(dir).then((items) => { all = items || []; if (el.isConnected && !input.value.trim()) draw(all, 'list'); });
  }

  // ---------- own branch (worktree) in New ----------
  const wt = { on: false, name: '', el: null, closedAt: 0, git: new Map() };
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `wt-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  function newPopover(el, list, kind) {
    wt.on = false;
    wt.el = el;
    wt.name = stamp();
    const box = h('label', 'own-branch');
    // The slot stays reserved so the footer never jumps: hidden for terminals, dimmed outside git.
    const set = (vis, git) => { box.style.visibility = vis ? '' : 'hidden'; box.classList.toggle('off', !git); cb.disabled = !git; if (!git && cb.checked) { cb.checked = false; cb.onchange(); } };
    box.innerHTML = `<input type="checkbox" aria-label="Own branch">${SVG.branch}<span>Own branch</span><input class="field wt-name" type="text" aria-label="Branch name" spellcheck="false" hidden>`;
    const cb = box.querySelector('input[type=checkbox]');
    const name = box.querySelector('.wt-name');
    name.value = wt.name;
    cb.onchange = () => { wt.on = cb.checked; name.hidden = !cb.checked; if (cb.checked) name.select(); };
    name.oninput = () => { wt.name = name.value; };
    name.onkeydown = (e) => { if (e.key !== 'Enter' && e.key !== 'Escape') e.stopPropagation(); };
    const foot = $('.foot', el);
    foot.insertBefore(box, foot.querySelector('.grow'));
    const check = async () => {
      const dir = list.querySelector('.recent-item.sel')?.dataset.dir;
      if (kind() === 'shell') { set(false, false); return; }
      if (!dir) { set(true, false); return; }
      box.title = 'Own branch, in .' + base(dir.replace(/[\\/]+$/, '')) + '-worktrees beside the repo';
      if (!wt.git.has(dir)) wt.git.set(dir, await hangar.isGit(dir));
      set(true, wt.git.get(dir));
    };
    new MutationObserver(check).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    el.addEventListener('click', () => setTimeout(check, 0));
    check();
    const layer = $('#layer');
    const mo = new MutationObserver(() => { if (!el.isConnected) { wt.closedAt = Date.now(); mo.disconnect(); } });
    mo.observe(layer, { childList: true });
  }
  function wantsWorktree(dir) {
    const fresh = wt.el && (wt.el.isConnected || Date.now() - wt.closedAt < 1500);
    return !!(wt.on && fresh && wt.git.get(dir));
  }
  async function startWorktree(dir) {
    wt.on = false;
    const r = await hangar.createWorktree(dir, wt.name);
    if (r?.error) {
      const el = h('div', 'pop modal');
      el.innerHTML = `<p class="hint first">${esc(r.error)}</p>`;
      openPop(el, null);
      return;
    }
    focusWhenReady(r?.id);
  }

  // ---------- usage history (Usage popover) ----------
  let usage = null;
  let usageAt = 0;
  const money = (n) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`);
  const tokensOf = (d) => (d.input || 0) + (d.output || 0) + (d.cacheWrite || 0);
  function usageSection(el) {
    const slot = h('div', 'uh');
    el.appendChild(slot);
    // Painted right away from the cache (the popover may not be in the page yet), and again when fresh data lands.
    // Until the history arrives, a quiet empty chart holds its place, so the popover never grows.
    slot.innerHTML = `<h3 class="sub">Last 14 days</h3><div class="uh-read">&nbsp;</div><svg class="uh-chart" viewBox="0 0 344 64" preserveAspectRatio="none" aria-hidden="true"></svg>`;
    const paint = (late) => {
      if (!usage || (late && !slot.isConnected)) return;
      const days = usage.days || [];
      const max = Math.max(1, ...days.map(tokensOf));
      const W = 344, H = 64, n = days.length || 1, gap = 2, bw = (W - gap * (n - 1)) / n;
      const bars = days.map((d, i) => {
        const v = tokensOf(d);
        const bh = v ? Math.max(2, (v / max) * (H - 2)) : 0;
        const x = i * (bw + gap);
        const label = `${new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}  ${k(v)} tokens  ≈${money(d.costUSD || 0)}`;
        return `<g data-label="${esc(label)}"><rect class="hit" x="${x}" y="0" width="${bw}" height="${H}"/>` +
          (bh ? `<path class="bar" d="M${x},${H} v${-(bh - 3)} q0,-3 3,-3 h${bw - 6} q3,0 3,3 v${bh - 3} z"/>` : `<rect class="zero" x="${x}" y="${H - 1}" width="${bw}" height="1"/>`) + '</g>';
      }).join('');
      const tot = usage.total || {};
      const summary = `${k(tokensOf(tot))} tokens  ≈${money(tot.costUSD || 0)}`;
      const projects = (usage.projects || []).filter((p) => tokensOf(p)).slice(0, 5).map((p) =>
        `<div class="ur"><span></span><span class="un" title="${esc(p.project)}">${esc(p.name)}</span><span class="uo">${k(tokensOf(p))}</span><span class="uc" title="Estimate at API prices">≈${money(p.costUSD || 0)}</span></div>`).join('');
      slot.innerHTML = `<h3 class="sub">Last 14 days</h3><div class="uh-read" aria-live="off" title="≈ Estimate at API prices">${esc(summary)}</div>
        <svg class="uh-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Tokens per day, last 14 days">${bars}</svg>
        ${projects ? `<div class="ut">${projects}</div>` : ''}`;
      const read = $('.uh-read', slot);
      slot.querySelectorAll('g[data-label]').forEach((g) => {
        g.onmouseenter = () => { read.textContent = g.dataset.label; g.classList.add('on'); };
        g.onmouseleave = () => { read.textContent = summary; g.classList.remove('on'); };
      });
    };
    if (usage) paint();
    if (Date.now() - usageAt > 60000) {
      usageAt = Date.now();
      hangar.usageHistory?.(14).then((u) => { usage = u; paint(true); }).catch(() => {});
    }
  }

  // ---------- commands ----------
  const any = (cx) => !!cx.snap;
  C.register([
    { id: 'session.copy-path', label: 'Copy folder path', group: 'Actions', aliases: ['path', 'directory'],
      menu: { menu: 'Session', section: 'folder' }, when: any, run: (cx) => navigator.clipboard.writeText(cx.snap.cwd) },
    { id: 'session.reveal', label: revealLabel, group: 'Actions', aliases: ['folder', 'explorer', 'finder', 'show'],
      menu: { menu: 'Session', section: 'folder' }, when: any, run: (cx) => hangar.reveal(cx.snap.cwd) },
    { id: 'session.open-editor', label: 'Open in editor', group: 'Actions', aliases: ['code', 'vscode', 'edit'],
      menu: { menu: 'Session', section: 'folder' }, when: (cx) => any(cx) && !!editor, run: (cx) => hangar.openEditor(cx.snap.cwd) },
    { id: 'session.changes', label: 'Show changes', group: 'Actions', aliases: ['git', 'diff', 'branch'],
      menu: { menu: 'Session', section: 'folder' }, when: (cx) => !!cx.snap?.git, run: (cx) => openChanges(cx.id) },
    { id: 'session.history', label: 'History…', group: 'Actions', aliases: ['past', 'conversations', 'resume'],
      menu: { menu: 'Session', section: 'folder' }, when: (cx) => any(cx) && cx.snap.kind !== 'shell', run: (cx) => openHistory(cx.snap.cwd) },
    { id: 'session.copy-id', label: 'Copy session ID', group: 'Actions', aliases: ['id', 'uuid'],
      menu: { menu: 'Session', section: 'folder' }, when: (cx) => any(cx) && cx.snap.kind !== 'shell' && !!cx.snap.sessionId, run: (cx) => navigator.clipboard.writeText(cx.snap.sessionId) },
    { id: 'session.unlock', label: 'Let it size itself', group: 'Actions', aliases: ['unlock', 'size', 'auto size'],
      menu: { menu: 'Session', section: 'edit' }, when: (cx) => !!cx.snap?.lock, run: (cx) => setLock(cx.id, null) },
    { id: 'session.fork', label: 'Branch this session', group: 'Actions', aliases: ['fork', 'copy'],
      menu: { menu: 'Session', section: 'folder' }, when: (cx) => canFork(cx.snap) && cx.snap.status !== 'exited', run: (cx) => confirmFork(cx.id) },
  ]);

  // Read the history once soon after start, so the first Usage open paints at full size.
  setTimeout(() => { if (!usage && hangar.usageHistory) { usageAt = Date.now(); hangar.usageHistory(14).then((u) => { usage = u; }).catch(() => {}); } }, 4000);

  window.HangarExtras = { drawAll, moreItems, openHistory, openChanges, newPopover, wantsWorktree, startWorktree, usageSection, parseDiff, ago, statusWord };
})();
