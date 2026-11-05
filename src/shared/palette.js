// The colours a user can pick for a session, a workspace or a mode. None of them
// may look like a status colour: amber is "needs you", green is done, red is an
// error and purple is the overseer, so all four stay out. Old saved colours from
// those families move to the nearest allowed one.
(function (root) {
  'use strict';

  const PALETTE = ['#8ab4ff', '#6fd4e0', '#f28fc3', '#b8bec9', '#b9d36c', '#b3907a'];
  //               blue       teal       pink       slate      lime       brown

  const OLD = {
    '#f5b545': '#b3907a',  // amber -> brown
    '#5fd39a': '#b9d36c',  // green -> lime
    '#ff8a7a': '#f28fc3',  // red -> pink
    '#c49cff': '#8ab4ff',  // purple -> blue
  };

  /** A saved colour made safe: allowed ones pass, old status-like ones move, anything else -> fallback. */
  function migrate(c, fallback = null) {
    if (typeof c !== 'string' || !c) return fallback;
    const k = c.toLowerCase();
    if (PALETTE.includes(k)) return k;
    return OLD[k] || fallback;
  }

  const api = { PALETTE, migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HangarPalette = api;
})(typeof window !== 'undefined' ? window : globalThis);
