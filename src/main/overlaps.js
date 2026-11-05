// Same-file warning: notes which live session edited which file, and says when
// two live sessions touched the same file within the window.
const path = require('path');

const WINDOW_MS = 30 * 60 * 1000;

function norm(file) {
  const p = path.resolve(String(file));
  return process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p;
}

class Overlaps {
  constructor({ windowMs = WINDOW_MS, isLive = () => true } = {}) {
    this.windowMs = windowMs;
    this.isLive = isLive;
    this.edits = new Map();     // id -> Map(normFile -> { file, at })
    this.emitted = new Set();   // "a|b|file", one event per pair and file
  }

  /** A session edited a file. Returns new overlap events [{ file, a, b }]. */
  record(id, file, now = Date.now()) {
    if (!file) return [];
    const key = norm(file);
    if (!this.edits.has(id)) this.edits.set(id, new Map());
    this.edits.get(id).set(key, { file: path.resolve(String(file)), at: now });
    const out = [];
    for (const [other, files] of this.edits) {
      if (other === id || !this.isLive(other)) continue;
      const e = files.get(key);
      if (!e || now - e.at > this.windowMs) continue;
      const pair = [id, other].sort().join('|') + '|' + key;
      if (this.emitted.has(pair)) continue;
      this.emitted.add(pair);
      out.push({ file: path.resolve(String(file)), a: id, b: other });
    }
    return out;
  }

  /** Files this session shares with another live session, edited within the window. */
  forSession(id, now = Date.now()) {
    const mine = this.edits.get(id);
    if (!mine) return [];
    const out = [];
    for (const [other, files] of this.edits) {
      if (other === id || !this.isLive(other)) continue;
      for (const [key, e] of mine) {
        const o = files.get(key);
        if (o && now - e.at <= this.windowMs && now - o.at <= this.windowMs) out.push({ file: e.file, otherId: other });
      }
    }
    return out;
  }

  forget(id) {
    this.edits.delete(id);
    for (const k of [...this.emitted]) if (k.split('|').slice(0, 2).includes(id)) this.emitted.delete(k);
  }
}

module.exports = { Overlaps, WINDOW_MS };
