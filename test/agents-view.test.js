const test = require('node:test');
const assert = require('node:assert');
const { plan } = require('../src/renderer/agents');

const on = (desc) => ({ running: true, desc });
const off = (desc) => ({ running: false, desc });

test('agents strip: only running agents get chips, finished ones become a count', () => {
  const p = plan([on('a'), off('b'), off('c')], 'working', 900);
  assert.deepEqual(p.chips.map((a) => a.desc), ['a']);
  assert.equal(p.done, 2);
  assert.equal(p.more, 0);
});

test('agents strip: what does not fit folds into +N, with at least one chip', () => {
  const list = [on('a'), on('b'), on('c'), on('d')];
  assert.equal(plan(list, 'working', 420).chips.length, 2);
  assert.equal(plan(list, 'working', 420).more, 2);
  assert.equal(plan(list, 'working', 100).chips.length, 1);
});

test('agents strip: gone once the turn is over, unless something still runs', () => {
  assert.equal(plan([off('a')], 'working', 600).show, true);
  assert.equal(plan([off('a')], 'needs_input', 600).show, true);
  assert.equal(plan([off('a')], 'done', 600).show, false);
  assert.equal(plan([on('a')], 'done', 600).show, true);
  assert.equal(plan([], 'working', 600).show, false);
});
