// Workspaces: named sets of sessions plus their layout. There is always at
// least one ("Main"). Sessions of every open workspace keep running; a put
// away workspace keeps only its saved tiles, which resume when it reopens.
//
// The workspace file (workspace.json) holds, from version 2:
//   { version: 2, active, workspaces: [{ id, name, color, notify, defaultMode,
//     focused, putAway, tiles: [...] }], tiles: [...], recent: [...] }
// Top-level `tiles` repeats the open workspaces' tiles so an older Hangar
// still finds them. Old files ({ tiles, recent }) load as one "Main".
'use strict';

const crypto = require('crypto');
const { migrate: migrateColor } = require('../shared/palette');

const MAIN_ID = 'main';
const NOTIFY = ['all', 'needs', 'none'];

function blank(id, name) {
  return { id, name, color: null, notify: 'all', defaultMode: null, focused: null, putAway: false, tiles: [] };
}

function clean(w, i) {
  const out = blank(typeof w?.id === 'string' && w.id ? w.id : i === 0 ? MAIN_ID : `w${i}`, typeof w?.name === 'string' && w.name.trim() ? w.name.trim().slice(0, 40) : i === 0 ? 'Main' : `Workspace ${i + 1}`);
  out.color = migrateColor(w?.color);
  out.notify = NOTIFY.includes(w?.notify) ? w.notify : 'all';
  out.defaultMode = typeof w?.defaultMode === 'string' ? w.defaultMode : null;
  out.focused = typeof w?.focused === 'string' ? w.focused : null;
  out.putAway = !!w?.putAway;
  out.tiles = Array.isArray(w?.tiles) ? w.tiles.filter((t) => t && typeof t.cwd === 'string') : [];
  return out;
}

/** Any saved workspace file (old or new) to { list, active }. */
function migrate(raw) {
  let list;
  if (raw && Array.isArray(raw.workspaces) && raw.workspaces.length) {
    const seen = new Set();
    list = raw.workspaces.map(clean).filter((w) => !seen.has(w.id) && seen.add(w.id));
  } else {
    const main = blank(MAIN_ID, 'Main');
    main.tiles = Array.isArray(raw?.tiles) ? raw.tiles.filter((t) => t && typeof t.cwd === 'string') : [];
    list = [main];
  }
  if (!list.some((w) => !w.putAway)) list[0].putAway = false;
  const ws = new Workspaces(list, raw?.active);
  return ws;
}

class Workspaces {
  constructor(list = [blank(MAIN_ID, 'Main')], active) {
    this.list = list;
    this.active = active;
    this.ensureActive();
  }

  get(id) { return this.list.find((w) => w.id === id) || null; }
  open() { return this.list.filter((w) => !w.putAway); }
  putAwayList() { return this.list.filter((w) => w.putAway); }
  current() { return this.get(this.active); }

  /** The active workspace is always an open one; with none open, the first comes back. */
  ensureActive() {
    if (!this.list.length) this.list.push(blank(MAIN_ID, 'Main'));
    const cur = this.get(this.active);
    if (cur && !cur.putAway) return;
    const open = this.open();
    this.active = (open[0] || this.list[0]).id;
    this.get(this.active).putAway = false;
  }

  uniqueName(base) {
    const names = new Set(this.list.map((w) => w.name.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let i = 2;
    while (names.has(`${base} ${i}`.toLowerCase())) i++;
    return `${base} ${i}`;
  }

  /** A new open workspace, placed right after the active one. */
  create(name) {
    let id;
    do id = crypto.randomBytes(3).toString('hex'); while (this.get(id));
    const w = blank(id, name && String(name).trim() ? this.uniqueName(String(name).trim().slice(0, 40)) : this.uniqueName(`Workspace ${this.list.length + 1}`));
    const at = this.list.indexOf(this.current());
    this.list.splice(at + 1, 0, w);
    return w;
  }

  /** Name, colour, notifications and default mode. Unknown or bad values are ignored. */
  update(id, patch = {}) {
    const w = this.get(id);
    if (!w) return null;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      const n = patch.name.trim().slice(0, 40);
      if (n.toLowerCase() !== w.name.toLowerCase()) w.name = this.uniqueName(n);
      else w.name = n;
    }
    if ('color' in patch) w.color = migrateColor(patch.color);
    if ('notify' in patch && NOTIFY.includes(patch.notify)) w.notify = patch.notify;
    if ('defaultMode' in patch) w.defaultMode = typeof patch.defaultMode === 'string' && patch.defaultMode ? patch.defaultMode : null;
    return w;
  }

  /** Moves a workspace to position `to` among the open ones (the pill order). */
  move(id, to) {
    const w = this.get(id);
    if (!w || w.putAway) return;
    const others = this.open().filter((x) => x !== w);
    const target = others[Math.max(0, Math.min(to, others.length))];
    this.list.splice(this.list.indexOf(w), 1);
    if (target) this.list.splice(this.list.indexOf(target), 0, w);
    else this.list.push(w);
  }

  switchTo(id) {
    const w = this.get(id);
    if (!w || w.putAway) return false;
    this.active = id;
    return true;
  }

  /** The open workspace `dir` steps away from the active one, wrapping round. */
  adjacent(dir) {
    const open = this.open();
    const i = open.findIndex((w) => w.id === this.active);
    return open[(i + dir + open.length) % open.length]?.id || this.active;
  }

  byIndex(i) { return this.open()[i]?.id || null; }

  /** Marks a workspace put away and keeps its tiles. The last open one cannot go. */
  putAway(id, tiles) {
    const w = this.get(id);
    if (!w || w.putAway || this.open().length < 2) return false;
    if (this.active === id) this.active = this.adjacent(1);
    w.putAway = true;
    w.tiles = tiles;
    this.ensureActive();
    return true;
  }

  /** Opens a put away workspace again; returns the tiles to resume. */
  reopen(id) {
    const w = this.get(id);
    if (!w || !w.putAway) return null;
    const tiles = w.tiles;
    w.putAway = false;
    w.tiles = [];
    this.active = id;
    return tiles;
  }

  /** Removes a workspace for good; returns it (with its index) for Undo. The last open one cannot go. */
  remove(id, tiles) {
    const w = this.get(id);
    if (!w || (!w.putAway && this.open().length < 2)) return null;
    const index = this.list.indexOf(w);
    if (this.active === id) this.active = this.adjacent(1);
    this.list.splice(index, 1);
    this.ensureActive();
    return { ws: { ...w, tiles: w.putAway ? w.tiles : tiles, putAway: true }, index };
  }

  /** Puts a removed workspace back (as put away), for Undo. */
  restore({ ws, index }) {
    if (this.get(ws.id)) return null;
    this.list.splice(Math.min(index, this.list.length), 0, ws);
    return ws;
  }

  /** Whether a workspace's notifications allow this kind: 'needs' (waiting on you) or 'other'. */
  allows(id, kind) {
    const n = this.get(id)?.notify || 'all';
    if (n === 'none') return false;
    if (n === 'needs') return kind === 'needs';
    return true;
  }

  /** The file content. tilesByWs: open workspace id -> its running tiles, in order. */
  toJSON(tilesByWs = {}, recent = []) {
    // Until main has resumed the saved sessions (restored), an open workspace keeps
    // its saved tiles, so a save during startup or an early quit never wipes them.
    const workspaces = this.list.map((w) => ({ ...w, tiles: w.putAway ? w.tiles : tilesByWs[w.id] || (this.restored ? [] : w.tiles || []) }));
    const tiles = workspaces.filter((w) => !w.putAway).flatMap((w) => w.tiles);
    return { version: 2, active: this.active, workspaces, tiles, recent };
  }

  /** What the window needs: no tiles, just the counts for put away workspaces. */
  summary() {
    return this.list.map(({ tiles, ...w }) => ({ ...w, saved: w.putAway ? tiles.length : 0 }));
  }
}

module.exports = { Workspaces, migrate, MAIN_ID, NOTIFY };
