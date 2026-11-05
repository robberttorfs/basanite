// Updates from GitHub Releases through electron-updater. Nothing is sent anywhere
// except the request to GitHub for the release feed.
//
//  - Off in dev (HANGAR_DEV, unpackaged) and while brand.releases has no owner/repo.
//  - Windows: downloads quietly, then offers "Restart to update".
//  - macOS: unsigned builds cannot install themselves, so it only offers
//    "Download update", which opens the release page.
//
// State sent to the window and the menu: { kind: 'none' | 'available' | 'ready', version, url }.

const { shell } = require('electron');
const brand = require('../shared/brand');

const CHECK_FIRST_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

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
 *         confirmInstall() -> false to keep running (asked before the installer starts) }
 */
function createUpdater(opts) {
  const { autoUpdater, feed, platform, onChange } = opts;
  const openUrl = opts.openUrl || ((u) => shell.openExternal(u));
  const on = enabled(opts);
  const isMac = platform === 'darwin';
  let state = { kind: 'none' };
  let timers = [];

  const set = (next) => { state = next; try { onChange && onChange(state); } catch {} };

  if (on) {
    autoUpdater.setFeedURL({ provider: 'github', owner: feed.owner, repo: feed.repo });
    autoUpdater.autoDownload = !isMac;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('update-available', (info) => {
      if (isMac) set({ kind: 'available', version: info.version, url: releasePage(feed, info.version) });
    });
    autoUpdater.on('update-downloaded', (info) => set({ kind: 'ready', version: info.version }));
    autoUpdater.on('error', () => {});   // a failed check is silent; the next one retries
  }

  function check() {
    if (!on || state.kind !== 'none') return;
    try { Promise.resolve(autoUpdater.checkForUpdates()).catch(() => {}); } catch {}
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
      if (state.kind === 'ready') {
        // Ask about busy sessions before the installer starts, not after: a Cancel
        // at the quit dialog would leave the installer running against a live app.
        if (opts.confirmInstall && !opts.confirmInstall()) return;
        autoUpdater.quitAndInstall(false, true);
      }
      else if (state.kind === 'available' && state.url) openUrl(state.url);
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
function init({ app, onChange, confirmInstall }) {
  let autoUpdater = null;
  const packaged = app.isPackaged;
  const dev = !!process.env.HANGAR_DEV;
  if (enabled({ feed: brand.releases, packaged, dev })) {
    try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }
  }
  const u = createUpdater({
    autoUpdater: autoUpdater || { on() {}, setFeedURL() {}, checkForUpdates() {} },
    feed: autoUpdater ? brand.releases : null,
    platform: process.platform, packaged, dev, onChange, confirmInstall,
  });
  u.start();
  return u;
}

module.exports = { createUpdater, enabled, releasePage, init };
