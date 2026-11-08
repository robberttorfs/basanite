/* global state, h, esc, openPop, dur, k */
// The agents strip on a tile: what is running now, one row, gone when the turn ends.
// One click opens the list with the detail: every agent, what it is doing, time and tokens.
'use strict';

const HangarAgents = (() => {
  const QUIET_MS = 3 * 60000;   // no transcript activity for this long is worth a mention
  const CHIP_W = 170, SUM_W = 70;
  const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';

  /** What the strip shows for these agents, this session status and this width. */
  function plan(agents, status, width) {
    const running = agents.filter((a) => a.running);
    const done = agents.length - running.length;
    const turnOn = status === 'working' || status === 'needs_input';
    const fits = Math.max(1, Math.floor((width - SUM_W) / CHIP_W));
    return { show: running.length > 0 || (turnOn && done > 0), chips: running.slice(0, fits), more: Math.max(0, running.length - fits), done };
  }
  const title = (a) => a.desc || a.type || 'Agent';
  const spent = (a, now) => (a.running ? dur(now - a.startedAt) : a.endedAt > a.startedAt ? dur(a.endedAt - a.startedAt) : '');
  const isQuiet = (a) => a.running && a.quiet >= QUIET_MS;

  function stripHtml(p, now) {
    if (!p.show) return '';
    const chips = p.chips.map((a) => `<span class="chip${isQuiet(a) ? ' quiet' : ''}"><span class="cd"></span><span class="cdsc">${esc(title(a))}</span><span class="cn">${spent(a, now)}</span></span>`).join('');
    return `${chips}${p.more ? `<span class="chip more">+${p.more}</span>` : ''}<span class="grow"></span>${p.done ? `<span class="ag-done">${CHECK}${p.done}</span>` : ''}`;
  }

  function row(a, now) {
    const custom = a.type && a.type !== 'general-purpose' ? a.type : '';
    const now_ = isQuiet(a) ? `No activity for ${dur(a.quiet)}` : a.running ? a.doing || '' : '';
    const sub = [custom, now_].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('');
    return `<div class="ap-row${a.running ? '' : ' done'}${isQuiet(a) ? ' quiet' : ''}">${a.running ? '<span class="cd"></span>' : `<span class="ap-ck">${CHECK}</span>`}` +
      `<div class="ap-main"><div class="ap-desc">${esc(title(a))}</div>${sub ? `<div class="ap-sub">${sub}</div>` : ''}</div>` +
      `<span class="ap-num">${spent(a, now)}</span><span class="ap-num" title="Output tokens">${a.output ? k(a.output) : ''}</span></div>`;
  }
  function listHtml(agents, now) {
    const on = agents.filter((a) => a.running), off = agents.filter((a) => !a.running);
    return `${on.map((a) => row(a, now)).join('')}${off.length ? `<div class="ap-head">Finished</div>${off.map((a) => row(a, now)).join('')}` : ''}`;
  }

  let open_ = null;   // { id, el }
  function refresh(snap) {
    if (!open_ || open_.id !== snap.id) return;
    const html = listHtml(snap.agents, Date.now());
    if (open_.el.innerHTML !== html) open_.el.innerHTML = html;
  }
  function show(strip, id) {
    const snap = state.tiles.find((t) => t.id === id);
    if (!snap) return;
    const el = h('div', 'pop agents-pop');
    el.setAttribute('aria-label', 'Agents');
    open_ = { id, el };
    refresh(snap);
    openPop(el, strip, { alignLeft: true, onClose: () => { open_ = null; } });
  }

  /** Called whenever a tile is drawn. */
  function draw(strip, snap, width) {
    const now = Date.now();
    const p = plan(snap.agents, snap.status, width);
    const html = stripHtml(p, now);
    if (strip.innerHTML !== html) strip.innerHTML = html;
    if (p.show) strip.setAttribute('aria-label', `${p.chips.length + p.more} running, ${p.done} finished. Show agents`);
    refresh(snap);
  }

  const target = (e) => e.target.closest?.('.agents');
  const openFrom = (strip) => show(strip, strip.closest('.tile').dataset.id);
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => { const s = target(e); if (s) openFrom(s); });
    document.addEventListener('keydown', (e) => { const s = target(e); if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFrom(s); } });
  }

  return { draw, plan };
})();
if (typeof module !== 'undefined') module.exports = HangarAgents; else window.HangarAgents = HangarAgents;
