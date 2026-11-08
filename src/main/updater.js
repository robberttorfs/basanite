// Updates from GitHub Releases through electron-updater. Nothing is sent anywhere
// except the request to GitHub for the release feed.
//
//  - Off in dev (HANGAR_DEV, unpackaged) and while brand.releases has no owner/repo.
//  - Windows: downloads quietly, then offers "Restart to update". The app closes its
//    sessions first, then the installer runs silently (no wizard to click through)
//    and opens the new version. build/installer.nsh makes any in-app update silent,
//    including ones started by older versions.
//  - macOS: unsigned builds cannot install themselves, so it only offers
//    "Download update", which opens the release page.
//
// State sent to the window and the menu: { kind: 'none' | 'available' | 'ready', version, url }.

const fs = require('fs');
const path = require('path');
const brand = require('../shared/brand');

const CHECK_FIRST_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** A small log of update steps in the data folder, so a failed update can be looked into. */
function fileLog(file, maxBytes = 200 * 1024) {
  return (msg) => {
    try {
      try { if (fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.old`); } catch {}
      fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
    } catch {}
  };
}

function releasePage(feed, version) {
  return `https://github.com/${feed.owner}/${feed.repo}/releases/tag/v${version}`;
}

/** True when updates should run at all. */
function enabled({ feed, packaged, dev }) {
  return !!(feed && feed.owner && feed.repo) && !!packaged && !dev;
}

/**
 * Wires an autoUpdater (injected so tests can fake it). Returns the controller.
 * opts: { autoUpdater, feed, platform, packaged, dev, onChange(state), openUrl(url), timers,
 *         confirmInstall() -> false to keep running (asked before the installer starts),
 *         prepareInstall() -> promise, closes sessions before the installer starts,
 *         log(msg), exit() -> ends the app if it is still running after the installer started }
 */
function createUpdater(opts) {
  const { autoUpdater, feed, platform, onChange } = opts;
  const openUrl = opts.openUrl || ((u) => require('electron').shell.openExternal(u));
  const on = enabled(opts);
  const isMac = platform === 'darwin';
  let state = { kind: 'none' };
  let timers = [];

  const log = opts.log || (() => {});
  let installing = false;
  let installError = false;
  const set = (next) => { state = next; try { onChange && onChange(state); } catch {} };

  if (on) {
    // feedUrl (HANGAR_UPDATE_URL) points at a plain folder of release files, for testing updates locally.
    autoUpdater.setFeedURL(opts.feedUrl ? { provider: 'generic', url: opts.feedUrl } : { provider: 'github', owner: feed.owner, repo: feed.repo });
    autoUpdater.autoDownload = !isMac;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('update-available', (info) => {
      log(`available ${info.version}`);
      if (isMac) set({ kind: 'available', version: info.version, url: releasePage(feed, info.version) });
    });
    autoUpdater.on('update-downloaded', (info) => { log(`downloaded ${info.version}`); set({ kind: 'ready', version: info.version }); });
    // A failed check is silent in the app (the next one retries); it goes to the log.
    autoUpdater.on('error', (e) => { if (installing) installError = true; log(`error ${String((e && e.message) || e).split('\n')[0].slice(0, 300)}`); });
  }

  function check() {
    if (!on || state.kind !== 'none') return;
    log('check');
    try { Promise.resolve(autoUpdater.checkForUpdates()).catch(() => {}); } catch {}
  }

  /**
   * Ask about busy sessions, close them, then start the installer silently. The
   * installer closes anything of ours still running, so sessions are closed first,
   * the way quitting does, rather than killed by it.
   */
  async function install() {
    if (installing) return;
    if (opts.confirmInstall && !opts.confirmInstall()) return;
    installing = true;
    log(`install ${state.version}`);
    set({ kind: 'installing', version: state.version });
    try { if (opts.prepareInstall) await opts.prepareInstall(); } catch (e) { log(`prepare failed ${e && e.message}`); }
    log('sessions closed');
    try {
      log('starting installer');
      autoUpdater.quitAndInstall(true, true);   // silent, then open the new version
      if (installError) throw new Error('could not start');
      log('installer started');
    } catch (e) {
      // Sessions are already closed and saved: reopen the app so they come back.
      log(`installer failed ${e && e.message}`);
      if (opts.relaunch) opts.relaunch();
      return;
    }
    // electron-updater quits the app itself; if anything holds it open, end it so
    // the installer never waits on us.
    const t = setTimeout(() => { log('forced exit'); opts.exit && opts.exit(); }, opts.exitAfterMs ?? 4000);
    t.unref && t.unref();
  }

  return {
    get enabled() { return on; },
    get state() { return state; },
    check,
    start() {
      if (!on) return;
      timers.push(setTimeout(check, opts.firstMs ?? CHECK_FIRST_MS));
      timers.push(setInterval(check, opts.everyMs ?? CHECK_EVERY_MS));
      timers.forEach((t) => t.unref && t.unref());
    },
    stop() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; },
    /** The one action for the current state: restart into the new version, or open the page. */
    act() {
      if (state.kind === 'ready') return install();
      if (state.kind === 'available' && state.url) openUrl(state.url);
      return undefined;
    },
    label() {
      if (state.kind === 'ready') return 'Restart to update';
      if (state.kind === 'available') return 'Download update';
      return null;
    },
    /** A menu item, or null when there is nothing to offer. */
    menuItem() {
      const label = this.label();
      return label ? { label, click: () => this.act() } : null;
    },
  };
}

/** Real wiring for main.js. */
function init({ app, onChange, confirmInstall, prepareInstall, dataDir }) {
  let autoUpdater = null;
  const packaged = app.isPackaged;
  const dev = !!process.env.HANGAR_DEV;
  if (enabled({ feed: brand.releases, packaged, dev })) {
    try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }
  }
  const u = createUpdater({
    autoUpdater: autoUpdater || { on() {}, setFeedURL() {}, checkForUpdates() {} },
    feed: autoUpdater ? brand.releases : null,
    platform: process.platform, packaged, dev, onChange, confirmInstall, prepareInstall,
    feedUrl: process.env.HANGAR_UPDATE_URL || null,
    log: dataDir ? fileLog(path.join(dataDir, 'update.log')) : null,
    exit: () => app.exit(0),
    relaunch: () => { app.relaunch(); app.exit(0); },
  });
  u.start();
  return u;
}

module.exports = { createUpdater, enabled, releasePage, init, fileLog };
