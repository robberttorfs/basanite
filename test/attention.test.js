const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/shared/attention');

const MIN = 60000;

test('attention: a 30 min snooze holds, then runs out', () => {
  const sn = A.snooze('needs_input', 'time', 0);
  assert.equal(A.isSnoozed(sn, 'needs_input', 29 * MIN), true);
  assert.equal(A.isSnoozed(sn, 'needs_input', 30 * MIN), false);
});

test('attention: "until it changes" holds until any new status', () => {
  let sn = A.snooze('needs_input', 'change', 0);
  assert.equal(A.isSnoozed(sn, 'needs_input', 10 * 24 * 60 * MIN), true);
  assert.equal(A.afterStatus(sn, 'needs_input'), sn, 'the same status keeps it');
  sn = A.afterStatus(sn, 'working');
  assert.equal(sn, null);
  assert.equal(A.isSnoozed(sn, 'needs_input', 0), false, 'needing you again glows again');
  assert.equal(A.snooze('working', 'off'), null);
});

test('attention: a snooze never covers a different status', () => {
  const sn = A.snooze('done', 'time', 0);
  assert.equal(A.isSnoozed(sn, 'needs_input', 1), false);
});

test('attention: seen turns Done into Idle and leaves the rest', () => {
  assert.equal(A.seen('done'), 'idle');
  for (const s of ['working', 'needs_input', 'idle', 'error', 'exited']) assert.equal(A.seen(s), s);
});

test('attention: counts skip snoozed and terminals', () => {
  const c = A.counts([
    { status: 'needs_input' }, { status: 'needs_input', snoozed: true }, { status: 'working' },
    { status: 'done' }, { status: 'done', kind: 'shell' }, { status: 'idle' },
  ]);
  assert.deepEqual(c, { needs_input: 1, working: 1, done: 1, idle: 1 });
});

test('attention: overview sections', () => {
  assert.equal(A.section({ status: 'error' }), 'needs');
  assert.equal(A.section({ status: 'starting' }), 'working');
  assert.equal(A.section({ status: 'done' }), 'done');
  assert.equal(A.section({ status: 'exited' }), 'idle');
});

test('attention: notifications respect level, snooze and what is on screen', () => {
  assert.equal(A.mayNotify({ kind: 'needs' }), true);
  assert.equal(A.mayNotify({ kind: 'other', level: 'needs' }), false);
  assert.equal(A.mayNotify({ kind: 'needs', level: 'needs' }), true);
  assert.equal(A.mayNotify({ kind: 'needs', level: 'none' }), false);
  assert.equal(A.mayNotify({ kind: 'needs', snoozed: true }), false);
  assert.equal(A.mayNotify({ kind: 'needs', onScreen: true }), false);
});
