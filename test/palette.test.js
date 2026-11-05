const test = require('node:test');
const assert = require('node:assert');
const { PALETTE, migrate } = require('../src/shared/palette');

const STATUS = ['#f5b545', '#5fd39a', '#ff6b6b', '#ff8a7a', '#b49cff', '#c49cff'];

test('no status colour can be picked', () => {
  for (const c of STATUS) assert.ok(!PALETTE.includes(c), c);
});

test('old status-like picks move to an allowed colour', () => {
  for (const c of ['#f5b545', '#5fd39a', '#ff8a7a', '#c49cff', '#F5B545']) assert.ok(PALETTE.includes(migrate(c)), c);
  assert.equal(migrate('#8ab4ff'), '#8ab4ff');
  assert.equal(migrate(null), null);
  assert.equal(migrate('#123456', PALETTE[0]), PALETTE[0]);
});

test('built-in modes use only allowed colours', () => {
  const modes = require('../src/main/modes');
  for (const m of modes.BUILTIN) assert.ok(PALETTE.includes(m.color), `${m.id} ${m.color}`);
});
