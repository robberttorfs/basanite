const test = require('node:test');
const assert = require('node:assert');
const { track, killPty, shutdownPtys, impl } = require('../src/main/lifecycle');
impl.terminate = (p) => p.kill();   // never run taskkill from the tests

function fakePty({ exitsOnKill = true } = {}) {
  const handlers = [];
  const p = {
    kills: 0,
    onExit(fn) { handlers.push(fn); },
    kill() { p.kills++; if (exitsOnKill) setTimeout(() => handlers.forEach((h) => h({ exitCode: 0 })), 5); },
    fire() { handlers.forEach((h) => h({ exitCode: 0 })); },
  };
  return p;
}

test('killPty kills once and never an exited pty', () => {
  const a = track(fakePty({ exitsOnKill: false }));
  assert.equal(killPty(a), true);
  assert.equal(killPty(a), false);
  assert.equal(a.kills, 1);
  const b = track(fakePty());
  b.fire();
  assert.equal(killPty(b), false);
  assert.equal(b.kills, 0);
});

test('shutdownPtys waits for exits', async () => {
  const list = [track(fakePty()), track(fakePty())];
  const n = await shutdownPtys(list, 1000, 10);
  assert.equal(n, 2);
  assert.deepEqual(list.map((p) => p.kills), [1, 1]);
});

test('shutdownPtys gives up after the timeout', async () => {
  const p = track(fakePty({ exitsOnKill: false }));
  const t = Date.now();
  await shutdownPtys([p], 60, 10);
  assert.ok(Date.now() - t < 500);
  assert.equal(p.kills, 1);
});

test('shutdownPtys with nothing alive resolves at once', async () => {
  assert.equal(await shutdownPtys([]), 0);
});
