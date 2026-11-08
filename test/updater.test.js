const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { createUpdater, enabled, releasePage, fileLog } = require('../src/main/updater');

function fake() {
  const a = new EventEmitter();
  a.feed = null; a.checks = 0; a.installs = 0;
  a.setFeedURL = (f) => { a.feed = f; };
  a.checkForUpdates = () => { a.checks++; return Promise.resolve(); };
  a.quitAndInstall = (silent, runAfter) => { a.installs++; a.lastInstall = [silent, runAfter]; };
  return a;
}
const feed = { owner: 'someone', repo: 'releases' };

test('off without a feed, in dev, or unpackaged', () => {
  assert.equal(enabled({ feed: { owner: '', repo: '' }, packaged: true, dev: false }), false);
  assert.equal(enabled({ feed, packaged: true, dev: true }), false);
  assert.equal(enabled({ feed, packaged: false, dev: false }), false);
  assert.equal(enabled({ feed, packaged: true, dev: false }), true);
  const a = fake();
  const u = createUpdater({ autoUpdater: a, feed: { owner: '', repo: '' }, platform: 'win32', packaged: true, dev: false });
  u.check();
  assert.equal(a.checks, 0);
  assert.equal(u.menuItem(), null);
});

test('windows downloads, then offers a restart', async () => {
  const a = fake(); const seen = [];
  const u = createUpdater({ autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false, onChange: (s) => seen.push(s.kind) });
  assert.deepEqual(a.feed, { provider: 'github', owner: 'someone', repo: 'releases' });
  assert.equal(a.autoDownload, true);
  u.check();
  assert.equal(a.checks, 1);
  assert.equal(u.menuItem(), null);
  a.emit('update-downloaded', { version: '0.5.0' });
  assert.equal(u.label(), 'Restart to update');
  await u.act();
  assert.equal(a.installs, 1);
  assert.deepEqual(a.lastInstall, [true, true], 'silent install, then the new version opens');
  assert.deepEqual(seen, ['ready', 'installing']);
  await u.act();
  assert.equal(a.installs, 1, 'a second press starts no second installer');
});

test('cancelling the still-working question cancels the restart', async () => {
  const a = fake(); let ok = false; let asked = 0;
  const u = createUpdater({ autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false, confirmInstall: () => { asked++; return ok; } });
  a.emit('update-downloaded', { version: '0.5.0' });
  await u.act();
  assert.equal(a.installs, 0, 'Cancel keeps the app and starts no installer');
  ok = true; await u.act();
  assert.equal(a.installs, 1);
  assert.equal(asked, 2);
});

test('mac only offers the download page', () => {
  const a = fake(); const opened = [];
  const u = createUpdater({ autoUpdater: a, feed, platform: 'darwin', packaged: true, dev: false, openUrl: (x) => opened.push(x) });
  assert.equal(a.autoDownload, false);
  a.emit('update-available', { version: '0.5.0' });
  assert.equal(u.label(), 'Download update');
  u.act();
  assert.deepEqual(opened, [releasePage(feed, '0.5.0')]);
  assert.equal(a.installs, 0);
});

test('no more checks once an update is waiting; errors are silent', () => {
  const a = fake();
  const u = createUpdater({ autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false });
  a.emit('error', new Error('offline'));
  a.emit('update-downloaded', { version: '0.5.0' });
  u.check();
  assert.equal(a.checks, 0);
});

test('sessions close before the installer starts; a stuck app is ended', async () => {
  const a = fake(); const steps = []; let exited = 0;
  a.quitAndInstall = () => steps.push('installer');
  const u = createUpdater({
    autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false, exitAfterMs: 10,
    prepareInstall: () => new Promise((r) => setTimeout(() => { steps.push('closed'); r(); }, 20)),
    exit: () => { exited++; }, log: (m) => steps.push(`log:${m.split(' ')[0]}`),
  });
  a.emit('update-downloaded', { version: '0.5.0' });
  await u.act();
  assert.deepEqual(steps.filter((x) => !x.startsWith('log:')), ['closed', 'installer']);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(exited, 1);
  assert.ok(steps.includes('log:install') && steps.includes('log:forced'));
});

test('update log keeps going and rolls over when large', () => {
  const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const file = path.join(dir, 'update.log');
  const log = fileLog(file, 50);
  log('first line that is long enough to pass the limit');
  log('second');
  assert.ok(fs.existsSync(`${file}.old`));
  assert.match(fs.readFileSync(file, 'utf8'), /second/);
  fs.rmSync(dir, { recursive: true, force: true });
});
