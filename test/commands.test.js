const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/renderer/commands');

function setup() {
  C._reset();
  C.setPlatform(false);
  const ran = [];
  C.register([
    { id: 'session.rename', label: 'Rename and colour…', group: 'Actions', shortcut: 'CmdOrCtrl+Shift+R', menu: { menu: 'Session', section: 'edit' }, run: () => ran.push('rename') },
    { id: 'session.timer', label: 'Time budget…', group: 'Actions', aliases: ['timer', 'clock'], shortcut: { mac: 'Cmd+T', win: 'Ctrl+Shift+T' }, menu: { menu: 'Session', section: 'edit' }, run: () => ran.push('timer') },
    { id: 'session.reopen', label: 'Reopen closed session', group: 'Start', menu: { menu: 'Session', section: 'close' }, run: () => ran.push('reopen') },
    { id: 'app.usage', label: 'Usage', group: 'App', menu: { menu: 'View' }, run: () => ran.push('usage') },
    { id: 'hidden', label: 'Session 1', group: 'Sessions', palette: false, menu: { menu: 'Window' }, run: () => {} },
    { id: 'never', label: 'Rarely', group: 'App', when: () => false, run: () => ran.push('never') },
  ]);
  return ran;
}

test('commands: prefix beats initials beats fuzzy, and ties keep table order', () => {
  setup();
  assert.equal(C.search('ren')[0].id, 'session.rename', 'prefix');
  assert.equal(C.search('rc')[0].id, 'session.rename', 'initials: Rename and Colour');
  assert.equal(C.search('clock')[0].id, 'session.timer', 'alias');
  assert.equal(C.search('rcls')[0].id, 'session.reopen', 'fuzzy subsequence');
  assert.ok(!C.search('').some((c) => c.id === 'hidden'), 'palette:false is never listed');
  assert.ok(!C.search('rarely').length, 'when() false hides it');
  const all = C.search('').map((c) => c.id);
  assert.deepEqual(all, ['session.rename', 'session.timer', 'session.reopen', 'app.usage']);
});

test('commands: frecency lifts a used command, run() records it', () => {
  const ran = setup();
  assert.equal(C.run('app.usage'), true);
  assert.deepEqual(ran, ['usage']);
  assert.equal(C.recent(5)[0].id, 'app.usage');
  assert.equal(C.run('never'), false, 'a command whose when() is false does not run');
  assert.ok(C.frecency('app.usage') > C.frecency('session.rename'));
});

test('commands: shortcut labels per platform', () => {
  setup();
  assert.equal(C.keyLabel('CmdOrCtrl+Shift+R', true), '⇧⌘R');
  assert.equal(C.keyLabel('CmdOrCtrl+Shift+R', false), 'Ctrl+Shift+R');
  assert.equal(C.keyLabel('Alt+Cmd+N', true), '⌥⌘N');
  assert.equal(C.keyLabel('CmdOrCtrl+Shift+Enter', true), '⇧⌘↩');
  assert.equal(C.accel(C.get('session.timer'), true), 'Cmd+T');
  assert.equal(C.accel(C.get('session.timer'), false), 'Ctrl+Shift+T');
});

test('commands: menu spec groups by menu, with separators between sections', () => {
  setup();
  const spec = C.menuSpec(false);
  assert.deepEqual(spec.map((m) => m.label), ['Session', 'View', 'Window']);
  const session = spec[0].items;
  assert.deepEqual(session.map((i) => i.sep ? '-' : i.id), ['session.rename', 'session.timer', '-', 'session.reopen']);
  assert.equal(session[1].accel, 'Ctrl+Shift+T');
});

test('commands: providers add dynamic commands and onChange only fires on real changes', () => {
  setup();
  let modes = ['Notes'];
  C.provide('modes', () => modes.map((n) => ({ id: `mode.set:${n}`, label: `Mode: ${n}`, group: 'Modes', menu: { menu: 'Modes', label: n }, run: () => {} })));
  let calls = 0;
  C.onChange(() => calls++);
  assert.equal(calls, 1);
  C.changed();
  assert.equal(calls, 1, 'same menu, no rebuild');
  modes = ['Notes', 'Build'];
  C.changed();
  assert.equal(calls, 2);
  assert.equal(C.menuSpec(false).find((m) => m.label === 'Modes').items[1].label, 'Build');
});

test('commands: scope aims actions at another session', () => {
  setup();
  C.setContext((scope) => ({ id: scope || 'focused' }));
  let got = null;
  C.register({ id: 'x', label: 'X', group: 'Actions', run: (cx) => { got = cx.id; } });
  C.run('x');
  assert.equal(got, 'focused');
  C.setScope('other');
  C.run('x');
  assert.equal(got, 'other');
  C.setScope(null);
});
