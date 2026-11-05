// Fork and History open rules in the data IPC.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.HANGAR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-dataipc-'));
const dataIpc = require('../src/main/data-ipc');

function rig(sessions, hasConversation) {
  const handlers = {}; const added = [];
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; }, on() {} };
  dataIpc.register({
    ipcMain, sessions, find: (id) => sessions.find((s) => s.id === id), uniqueName: (n) => n,
    addSession: (o, how) => { added.push({ o, how }); return { id: 'new' }; }, send() {}, broadcast() {}, defaultWs: () => 'main', hasConversation,
  });
  return { call: (ch, ...a) => handlers[ch]({}, ...a), added };
}

test('fork: carries mode and add-ons as already sent, and needs a conversation', () => {
  const src = { id: 'a', name: 'x', cwd: os.tmpdir(), sessionId: 's1', kind: 'claude', ws: 'main', mode: 'review', modeApplied: true, addons: ['quiet'], addonsApplied: ['quiet'] };
  const none = rig([src], () => false);
  assert.equal(none.call('tile:fork', 'a'), null, 'no transcript yet: nothing to fork');
  const r = rig([src], () => true);
  assert.equal(r.call('tile:fork', 'a'), 'new');
  const { o, how } = r.added[0];
  assert.equal(how, 'fork');
  assert.equal(o.forkOf, 's1');
  assert.equal(o.mode, 'review');
  assert.equal(o.modeApplied, true);
  assert.deepEqual(o.addons, ['quiet']);
  assert.deepEqual(o.addonsApplied, ['quiet']);
});

test('history open: a conversation already in a tile is focused, not resumed twice', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const r = rig([{ id: 't1', sessionId: id, status: 'idle', cwd: os.tmpdir() }]);
  assert.equal(r.call('history:open', os.tmpdir(), id), 't1');
  assert.equal(r.added.length, 0);
  const other = '22345678-1234-1234-1234-123456789abc';
  assert.equal(r.call('history:open', os.tmpdir(), other), 'new');
});
