const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/renderer/cursor-steady');

// Fake timers: the test fires the wait by hand.
function rig() {
  const out = [];
  let fire = null;
  const timers = { set: (fn) => { fire = fn; return 1; }, clear: () => { fire = null; } };
  const s = C.steady((d, cb) => { out.push(d); cb?.(); }, { timers });
  return { s, out, fire: () => { const f = fire; fire = null; f?.(); } };
}

test('cursor: plain output and typed echo pass straight through', () => {
  const { s, out } = rig();
  s.write('\x1b[?2026h\x1b[?2026l'); s.write('h'); s.write('e');
  assert.deepEqual(out, ['\x1b[?2026h\x1b[?2026l', 'h', 'e']);
});

test('cursor: a hide and show in one piece is written as is', () => {
  const { s, out } = rig();
  s.write('\x1b[?25l\x1b[20;1H*\x1b[23;20H\x1b[?25h');
  assert.equal(out.length, 1);
  assert.equal(s.holding, false);
});

test('cursor: a repaint split in two is written as one piece', () => {
  const { s, out } = rig();
  let done = 0;
  s.write('\x1b[?25l\x1b[9;3Hmenu', () => done++);
  s.write(' more', () => done++);
  assert.deepEqual(out, []);
  s.write('\x1b[7;3H\x1b[?25h', () => done++);
  assert.deepEqual(out, ['\x1b[?25l\x1b[9;3Hmenu more\x1b[7;3H\x1b[?25h']);
  assert.equal(done, 3, 'every write callback still runs');
});

test('cursor: a sequence cut between two pieces is still seen', () => {
  const { s, out } = rig();
  s.write('\x1b[?2'); s.write('5lpaint');
  assert.equal(s.holding, true);
  s.write('\x1b[?2'); assert.equal(s.holding, true);
  s.write('5h');
  assert.deepEqual(out, ['\x1b[?2', '5lpaint\x1b[?25h']);
});

test('cursor: a real hide goes through after the short wait', () => {
  const { s, out, fire } = rig();
  s.write('\x1b[?1049h\x1b[?25l'); s.write('full screen');
  assert.deepEqual(out, []);
  fire();
  assert.deepEqual(out, ['\x1b[?1049h\x1b[?25lfull screen']);
  s.write('more'); // still hidden, but nothing waits for a show any more
  assert.deepEqual(out.at(-1), 'more');
  s.write('\x1b[?25h'); assert.equal(s.holding, false);
});

test('cursor: combined modes like ?1049;25l count', () => {
  assert.equal(C.cursorState('\x1b[?1049;25l', true), false);
  assert.equal(C.cursorState('\x1b[?1049h', true), true);
  assert.equal(C.cursorState('\x1b[?25l x \x1b[?25h', false), true);
});

test('cursor: flush on dispose writes anything held', () => {
  const { s, out } = rig();
  s.write('\x1b[?25lx'); s.dispose();
  assert.deepEqual(out, ['\x1b[?25lx']);
});

test('cursor: the default timers work (real setTimeout, not called on an object)', async () => {
  const out = [];
  const s = C.steady((d) => out.push(d), { waitMs: 5 });
  s.write('\x1b[?25lx');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(out, ['\x1b[?25lx']);
});
