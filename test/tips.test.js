const test = require('node:test');
const assert = require('node:assert');
const { due, text } = require('../src/renderer/tips');

const tile = (id, more = {}) => ({ id, kind: 'claude', status: 'idle', tokens: { context: 0, contextSize: 200 }, ...more });

test('tips: nothing is due for one quiet session', () => {
  assert.equal(due([tile('a')], {}), null);
});

test('tips: each shows on the tile it is about', () => {
  assert.deepEqual(due([tile('a'), tile('b', { status: 'needs_input' })], {}), { id: 'waiting', tileId: 'b' });
  assert.deepEqual(due([tile('a', { tokens: { context: 120, contextSize: 200 } })], {}), { id: 'fresh', tileId: 'a' });
  assert.deepEqual(due([tile('a'), tile('b')], {}), { id: 'several', tileId: 'b' });
});

test('tips: a seen tip never comes back', () => {
  assert.equal(due([tile('a', { status: 'needs_input' })], { waiting: true }), null);
  assert.equal(due([tile('a'), tile('b')], { several: true }), null);
});

test('tips: terminals and ended sessions do not count', () => {
  assert.equal(due([tile('a', { kind: 'shell', status: 'needs_input' }), tile('b', { status: 'exited' }), tile('c')], {}), null);
});

test('tips: the shortcut matches the platform', () => {
  assert.ok(text('several', true).includes('⇧⌘A'));
  assert.ok(text('several', false).includes('Ctrl+Shift+A'));
});
