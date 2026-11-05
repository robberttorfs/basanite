// Attention rules shared by the main process and the window: snooze, "seen",
// what counts as needing you, and when a notification may ping.
(function (root) {
  'use strict';

  const SNOOZE_MS = 30 * 60000;

  /** A snooze for a session in `status`: how = 'time' (30 min), 'change' (until the status changes) or 'off'. */
  function snooze(status, how, now = Date.now()) {
    if (how === 'off' || !how) return null;
    return { status, until: how === 'time' ? now + SNOOZE_MS : null };
  }

  /** Whether a snooze still holds: same status as when it was set, and not timed out. */
  function isSnoozed(sn, status, now = Date.now()) {
    return !!sn && sn.status === status && (sn.until == null || now < sn.until);
  }

  /** Any new status ends a snooze. */
  function afterStatus(sn, next) {
    return sn && sn.status === next ? sn : null;
  }

  /** Looking at a session (focus or the overview) turns a finished turn into Idle. */
  function seen(status) {
    return status === 'done' ? 'idle' : status;
  }

  /** Counts for the top bar: snoozed sessions do not glow, so they do not count as needing you. */
  function counts(tiles) {
    const c = { needs_input: 0, working: 0, done: 0, idle: 0 };
    for (const t of tiles) {
      if (t.kind === 'shell') continue;
      if (t.status === 'needs_input') { if (!t.snoozed) c.needs_input++; } else if (t.status in c) c[t.status]++;
    }
    return c;
  }

  /** Which overview section a session belongs in. */
  function section(t) {
    if (t.status === 'needs_input' || t.status === 'error') return 'needs';
    if (t.status === 'working' || t.status === 'starting') return 'working';
    if (t.status === 'done') return 'done';
    return 'idle';
  }

  /**
   * Whether a notification may show.
   * kind: 'needs' (waiting on you) or 'other'; level: the workspace's 'all' | 'needs' | 'none';
   * onScreen: the window is focused and the session's workspace is the one showing.
   */
  function mayNotify({ kind, level = 'all', snoozed = false, onScreen = false }) {
    if (level === 'none' || (level === 'needs' && kind !== 'needs')) return false;
    if (snoozed || onScreen) return false;
    return true;
  }

  const api = { SNOOZE_MS, snooze, isSnoozed, afterStatus, seen, counts, section, mayNotify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HangarAttention = api;
})(typeof window !== 'undefined' ? window : globalThis);
