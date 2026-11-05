const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { createUpdater, enabled, releasePage } = require('../src/main/updater');

function fake() {
  const a = new EventEmitter();
  a.feed = null; a.checks = 0; a.installs = 0;
  a.setFeedURL = (f) => { a.feed = f; };
  a.checkForUpdates = () => { a.checks++; return Promise.resolve(); };
  a.quitAndInstall = () => { a.installs++; };
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

test('windows downloads, then offers a restart', () => {
  const a = fake(); const seen = [];
  const u = createUpdater({ autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false, onChange: (s) => seen.push(s.kind) });
  assert.deepEqual(a.feed, { provider: 'github', owner: 'someone', repo: 'releases' });
  assert.equal(a.autoDownload, true);
  u.check();
  assert.equal(a.checks, 1);
  assert.equal(u.menuItem(), null);
  a.emit('update-downloaded', { version: '0.5.0' });
  assert.equal(u.label(), 'Restart to update');
  u.menuItem().click();
  assert.equal(a.installs, 1);
  assert.deepEqual(seen, ['ready']);
});

test('cancelling the still-working question cancels the restart', () => {
  const a = fake(); let ok = false; let asked = 0;
  const u = createUpdater({ autoUpdater: a, feed, platform: 'win32', packaged: true, dev: false, confirmInstall: () => { asked++; return ok; } });
  a.emit('update-downloaded', { version: '0.5.0' });
  u.act();
  assert.equal(a.installs, 0, 'Cancel keeps the app and starts no installer');
  ok = true; u.act();
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
