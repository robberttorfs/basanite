// Steady cursor: keeps a repaint's brief cursor hide from reaching the screen.
// TUIs such as Claude Code (and ConPTY on Windows) wrap each repaint in
// ESC[?25l ... ESC[?25h. When one repaint arrives in two pieces, the terminal can
// draw a frame in between with no cursor, and the cursor stutters off-on while typing.
// So when a piece leaves the cursor hidden, later output is held until the matching
// show arrives (written together, never drawn hidden) or a short wait runs out (a real
// hide, as in a full-screen program, then goes through as normal). Data is never changed.
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HangarCursor = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const SEQ = /\x1b\[\?([0-9;]*)([hl])/g;
  const TAIL = 16;          // enough to catch a sequence split across two pieces
  const MAX_HOLD = 1 << 18; // never hold more than this much output

  /** The DECTCEM (?25) state after `s`, or `prev` when `s` has none. Counts only
   *  sequences that end at or after `from` (earlier ones were counted before). */
  function cursorState(s, prev, from = 0) {
    let state = prev;
    SEQ.lastIndex = 0;
    let m;
    while ((m = SEQ.exec(s))) {
      if (m.index + m[0].length <= from) continue;
      if (m[1].split(';').includes('25')) state = m[2] === 'h';
    }
    return state;
  }

  /** write(data, done) is the terminal's own write. Returns { write, flush, dispose }. */
  function steady(write, opts = {}) {
    const waitMs = opts.waitMs ?? 40;
    const timers = opts.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
    let shown = true;
    let tail = '';
    let held = null;  // { parts, cbs, size } while holding
    let timer = null;

    const flush = () => {
      if (timer) { timers.clear(timer); timer = null; }
      if (!held) return;
      const { parts, cbs } = held;
      held = null;
      write(parts.join(''), cbs.length ? () => cbs.forEach((cb) => cb()) : undefined);
    };

    const push = (data, cb) => {
      if (typeof data !== 'string') { flush(); write(data, cb); return; }  // bytes: pass through
      const s = tail + data;
      const before = shown;
      shown = cursorState(s, shown, tail.length);
      tail = s.slice(-TAIL);
      if (held) {
        held.parts.push(data); held.size += data.length;
        if (cb) held.cbs.push(cb);
        if (shown || held.size > MAX_HOLD) flush();
        return;
      }
      if (before && !shown) {
        held = { parts: [data], cbs: cb ? [cb] : [], size: data.length };
        timer = timers.set(flush, waitMs);
        return;
      }
      write(data, cb);
    };

    return { write: push, flush, dispose: flush, get holding() { return !!held; } };
  }

  return { steady, cursorState };
});
