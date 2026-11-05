// One command registry behind the native menu, the command palette, the shortcut
// sheet and the tile menus. Every user action is one entry here, so their labels and
// shortcuts never drift apart.
//
// API (window.HangarCommands in the renderer, require() in tests):
//   register(cmd | [cmd])   add or replace commands. A command:
//     id        unique, e.g. 'session.rename'
//     label     what the palette and the menu show
//     group     'Sessions' | 'Workspaces' | 'Actions' | 'Modes' | 'Start' | 'App'
//     icon      optional ICON key or raw svg
//     aliases   optional extra search words
//     shortcut  optional { mac, win } Electron accelerators ('CmdOrCtrl+Shift+R'); one string = both
//     menu      optional { menu: 'Session', section: 'edit', label? } places it in the native menu
//     palette   false hides it from the palette (e.g. Session 1..9)
//     when(ctx) optional; false hides it from the palette and greys it in the menu
//     run(ctx, opts)       ↩ (opts.shift for ⇧↩)
//     secondary(ctx, opts) optional ⌘↩ / Ctrl+↩
//     actions(ctx)         optional sub-list for ⇥ (session rows)
//   provide(name, fn)       dynamic commands, rebuilt on every read (sessions, modes, folders)
//   setContext(fn)          fn() returns ctx handed to when() and run()
//   run(id, opts)           run one by id, records it for the palette's recent list
//   all() / get(id) / search(query, list) / recent(n) / menuSpec(isMac) / keyLabel(acc, isMac)
//   changed()               call after state changes; listeners (the menu) rebuild when needed
//   onChange(fn)
(function (root) {
  'use strict';

  const statics = new Map();
  const providers = new Map();
  const listeners = [];
  let ctxFn = () => ({});
  let isMac = false;

  function register(cmds) {
    for (const c of [].concat(cmds)) {
      if (!c || !c.id || !c.label) throw new Error('A command needs an id and a label.');
      statics.set(c.id, c);
    }
    changed();
  }
  function unregister(id) { statics.delete(id); changed(); }
  function provide(name, fn) { providers.set(name, fn); changed(); }
  function setContext(fn) { ctxFn = fn; }
  function setPlatform(mac) { isMac = !!mac; }
  const ctx = () => ctxFn() || {};

  function all() {
    const out = [...statics.values()];
    for (const fn of providers.values()) {
      try { out.push(...(fn(ctx()) || [])); } catch (e) { console.error(e); }
    }
    return out;
  }
  const get = (id) => all().find((c) => c.id === id);
  function ok(c, cx = ctx()) {
    try { return !c.when || !!c.when(cx); } catch { return false; }
  }

  // ---------- recent commands (frecency) ----------
  const USE_KEY = 'hangar.cmd.uses';
  let uses = {};
  try { uses = JSON.parse(root.localStorage?.getItem(USE_KEY) || '{}') || {}; } catch { uses = {}; }
  function recordUse(id, now = Date.now()) {
    const u = uses[id] || { n: 0, at: 0 };
    uses[id] = { n: u.n + 1, at: now };
    try { root.localStorage?.setItem(USE_KEY, JSON.stringify(uses)); } catch {}
  }
  /** count × recency decay, with a half life of three days. */
  function frecency(id, now = Date.now()) {
    const u = uses[id];
    if (!u) return 0;
    return u.n * Math.pow(0.5, (now - u.at) / (3 * 864e5));
  }
  function recent(n = 5, list = all()) {
    return list.filter((c) => uses[c.id] && c.palette !== false && c.group !== 'Sessions' && ok(c))
      .sort((a, b) => frecency(b.id) - frecency(a.id)).slice(0, n);
  }

  function run(id, opts = {}, which = 'run') {
    const c = typeof id === 'string' ? get(id) : id;
    if (!c) return false;
    const cx = ctx();
    if (!ok(c, cx)) return false;
    const fn = which === 'secondary' && c.secondary ? c.secondary : c.run;
    if (!fn) return false;
    if (c.group !== 'Sessions') recordUse(c.id);
    fn(cx, opts);
    return true;
  }

  // ---------- matching ----------
  // exact prefix > word-start initials > fuzzy subsequence, then frecency. Ties keep table order.
  function scoreText(q, text) {
    const t = text.toLowerCase();
    if (!q) return 1;
    if (t === q) return 1000;
    if (t.startsWith(q)) return 900 - t.length / 100;
    const words = t.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((w) => w.startsWith(q))) return 700 - t.length / 100;
    const initials = words.map((w) => w[0]).join('');
    if (initials.startsWith(q)) return 600;
    if (q.length > 1 && initials.includes(q)) return 500;
    // Fuzzy: every typed letter in order; tighter matches score higher.
    let i = 0, gaps = 0, last = -1;
    for (let j = 0; j < t.length && i < q.length; j++) {
      if (t[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
    }
    if (i < q.length) return 0;
    return Math.max(1, 300 - gaps * 5);
  }
  function score(query, c) {
    const q = String(query || '').trim().toLowerCase();
    let best = scoreText(q, c.label);
    for (const a of c.aliases || []) best = Math.max(best, scoreText(q, a) - 50);
    return best;
  }
  function search(query, list = all()) {
    const scored = [];
    list.forEach((c, i) => {
      if (c.palette === false || !ok(c)) return;
      const s = score(query, c);
      if (s > 0) scored.push({ c, s: s + Math.min(80, frecency(c.id) * 20), i });
    });
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    return scored.map((x) => x.c);
  }

  // ---------- shortcuts ----------
  function accel(c, mac = isMac) {
    const s = c.shortcut;
    if (!s) return null;
    return typeof s === 'string' ? s : (mac ? s.mac : s.win) || null;
  }
  /** 'CmdOrCtrl+Shift+R' -> '⇧⌘R' on Mac, 'Ctrl+Shift+R' elsewhere. */
  function keyLabel(acc, mac = isMac) {
    if (!acc) return '';
    const parts = acc.split('+');
    const key = parts.pop();
    const names = { Enter: mac ? '↩' : 'Enter', Return: mac ? '↩' : 'Enter', Plus: '+', '=': '+', Up: '↑', Down: '↓', Escape: 'Esc' };
    const k = names[key] || (key.length === 1 ? key.toUpperCase() : key);
    const mods = parts.map((p) => p.toLowerCase());
    const has = (...m) => mods.some((x) => m.includes(x));
    if (mac) {
      return (has('ctrl', 'control') ? '⌃' : '') + (has('alt', 'option') ? '⌥' : '') + (has('shift') ? '⇧' : '')
        + (has('cmd', 'command', 'cmdorctrl', 'commandorcontrol') ? '⌘' : '') + k;
    }
    const out = [];
    if (has('ctrl', 'control', 'cmdorctrl', 'commandorcontrol', 'cmd')) out.push('Ctrl');
    if (has('alt')) out.push('Alt');
    if (has('shift')) out.push('Shift');
    return [...out, k].join('+');
  }
  const shortcutLabel = (id) => { const c = typeof id === 'string' ? get(id) : id; return c ? keyLabel(accel(c)) : ''; };

  // ---------- native menu ----------
  const MENU_ORDER = ['App', 'Session', 'Workspace', 'Modes', 'View', 'Window', 'Help'];
  /** Plain data for main.js: [{ label, items: [{ id, label, accel, enabled } | { sep: true }] }]. */
  function menuSpec(mac = isMac) {
    const cx = ctx();
    const menus = new Map();
    for (const c of all()) {
      if (!c.menu) continue;
      const name = c.menu.menu;
      if (!menus.has(name)) menus.set(name, []);
      menus.get(name).push(c);
    }
    const names = [...menus.keys()].sort((a, b) => (MENU_ORDER.indexOf(a) + 1 || 99) - (MENU_ORDER.indexOf(b) + 1 || 99));
    return names.map((name) => {
      const items = [];
      let section = null;
      for (const c of menus.get(name)) {
        const sec = c.menu.section || '';
        if (items.length && sec !== section) items.push({ sep: true });
        section = sec;
        items.push({ id: c.id, label: c.menu.label || c.label, accel: accel(c, mac), enabled: ok(c, cx) });
      }
      return { label: name, items };
    });
  }
  // Menus only rebuild when what they show changes.
  let lastSpec = '';
  function changed() {
    if (!listeners.length) return;
    const spec = menuSpec();
    const key = JSON.stringify(spec);
    if (key === lastSpec) return;
    lastSpec = key;
    for (const fn of listeners) fn(spec);
  }
  function onChange(fn) { listeners.push(fn); lastSpec = ''; changed(); }

  const api = {
    register, unregister, provide, setContext, setPlatform, all, get, ok, run, search, score, recent, recordUse,
    frecency, accel, keyLabel, shortcutLabel, menuSpec, changed, onChange,
    _reset() { statics.clear(); providers.clear(); listeners.length = 0; uses = {}; lastSpec = ''; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HangarCommands = api;
})(typeof window !== 'undefined' ? window : globalThis);
