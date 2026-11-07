/* global hangar, tiles, tileNotice, esc, isMac */
// Three one-time tips, each shown the first time it means something, on the tile it is about.
// New installs only (main sets settings.tips on the first launch), so nobody who already knows
// the app gets them. A tip stays until closed, like every notice, and never comes back.
'use strict';

(function (root) {
  // ---------- which tip is due (pure, tested in test/tips.test.js) ----------

  const contextPct = (t) => {
    const c = t.tokens;
    return c && c.contextSize ? (c.context / c.contextSize) * 100 : 0;
  };
  const text = (id, mac) => {
    const overview = mac ? '⇧⌘A' : 'Ctrl+Shift+A';
    return {
      waiting: `This session is waiting for you. Answer here, or from the Overview (${overview}).`,
      fresh: 'Context is getting full. Fresh start clears it and carries on.',
      several: `The Overview (${overview}) lists all your sessions in one place.`,
    }[id];
  };
  /** The tip to show now as { id, tileId }, or null. list: the sessions on screen. */
  const due = (list, seen) => {
    const live = list.filter((t) => t.kind !== 'shell' && t.status !== 'exited');
    const pick = (id, t) => (t && !seen[id] ? { id, tileId: t.id } : null);
    return pick('waiting', live.find((t) => t.status === 'needs_input'))
      || pick('fresh', live.find((t) => contextPct(t) >= 60))
      || (live.length >= 2 ? pick('several', live[live.length - 1]) : null);
  };
  const pure = { due, text };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- showing them ----------

  const shown = {};  // settings come back a moment later; this stops a tip showing twice meanwhile
  hangar.onState((s) => {
    if (!s.settings.tips) return;
    const seen = { ...s.settings.tips, ...shown };
    const here = s.tiles.filter((t) => !t.ws || t.ws === s.activeWs);
    const tip = due(here, seen);
    const t = tip && tiles.get(tip.tileId);
    // A notice already on that tile matters more; the tip waits for the next update.
    if (!t || t.el.querySelector(':scope > .toast')) return;
    shown[tip.id] = true;
    tileNotice(tip.tileId, esc(text(tip.id, isMac)));
    hangar.setSettings({ tips: { ...seen, [tip.id]: true } });
  });
  root.HangarTips = pure;
})(typeof window !== 'undefined' ? window : globalThis);
