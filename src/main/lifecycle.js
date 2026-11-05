// Clean shutdown of the pty children.
//
// node-pty on Windows (ConPTY) closes the pseudo console natively and reports the
// exit from a native thread. Killing every pty and exiting the app in the same tick
// lets those native callbacks fire into a half-torn-down process, and killing a pty
// that has already exited closes a handle that is already gone. Both end in a null
// dereference inside Hangar.exe. So: kill each pty once, wait for its exit (bounded),
// then let the app exit.

const { execFile } = require('child_process');

const alive = new WeakSet();

/**
 * Ends the pty's process. On Windows that is a taskkill of the whole tree, which the
 * pty sees as a normal exit. node-pty's own kill() forks a helper (a second copy of
 * the app) that attaches to the console to list its processes, and closes the
 * pseudo console by hand, the two native paths behind the null dereference.
 */
const impl = {
  terminate(p) {
    if (process.platform === 'win32' && p.pid) {
      execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {});
      return;
    }
    p.kill();
  },
};

/** Call when a pty is created; it is marked dead when it exits. */
function track(p) {
  alive.add(p);
  try { p.onExit(() => alive.delete(p)); } catch {}
  return p;
}

/** Kills one pty, once, and never one that already exited. */
function killPty(p) {
  if (!p || !alive.has(p)) return false;
  alive.delete(p);
  try { impl.terminate(p); return true; } catch { return false; }
}

/**
 * Kills every pty in the list and resolves when each reported its exit,
 * or after timeoutMs, then waits a short moment for the native side to settle.
 */
function shutdownPtys(list, timeoutMs = 2500, settleMs = 150) {
  const live = [...list].filter((p) => p && alive.has(p));
  if (!live.length) return Promise.resolve(0);
  return new Promise((resolve) => {
    let left = live.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      setTimeout(() => resolve(live.length - left), settleMs);
    };
    const timer = setTimeout(finish, timeoutMs);
    for (const p of live) {
      let counted = false;
      const hit = () => { if (counted) return; counted = true; if (--left <= 0) finish(); };
      try { p.onExit(hit); } catch { hit(); continue; }
      if (!killPty(p)) hit();
    }
  });
}

module.exports = { track, killPty, shutdownPtys, impl };
