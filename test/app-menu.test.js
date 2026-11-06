const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/renderer/commands');
const M = require('../src/renderer/app-menu');

function setup() {
  C._reset();
  C.setPlatform(false);
  const S = (id, label, menu, extra = {}) => ({ id, label, group: 'App', menu: { menu }, run: () => {}, ...extra });
  C.register([
    S('session.new', 'New session…', 'Session', { shortcut: { mac: 'Cmd+N', win: 'Ctrl+Shift+N' } }),
    S('session.new-terminal', 'New terminal', 'Session'),
    S('session.rename', 'Rename and colour…', 'Session', { shortcut: 'CmdOrCtrl+Shift+R' }),
    S('view.overview', 'Overview', 'View', { shortcut: 'CmdOrCtrl+Shift+A' }),
    S('app.palette', 'Command palette', 'View', { palette: false }),
    S('app.usage', 'Usage', 'View'),
    S('app.overseer', 'Overseer', 'View'),
    S('app.settings', 'Settings…', 'App'),
    S('app.shortcuts', 'Keyboard shortcuts', 'Help'),
    S('view.reset-sizes', 'Reset tile sizes', 'View'),
    S('mode.choose', 'Choose mode…', 'Modes'),
    S('mode.set:notes', 'Notes', 'Modes', { isMode: true }),
    S('workspace.new', 'New workspace', 'Workspace'),
    S('workspace.go.main', 'Switch to Main', 'Workspace', { menu: { menu: 'Workspace', label: 'Main' } }),
    S('window.session-1', 'Session 1', 'Window', { palette: false }),
    S('session.next-waiting', 'Next session that needs you', 'Window'),
  ]);
}

test('app menu: top level is the most-used commands, straight from the registry', () => {
  setup();
  const m = M.model(C, { appName: 'Basanite' });
  const ids = m.top.map((g) => g.map((c) => c.id));
  assert.deepEqual(ids, [
    ['session.new', 'session.new-terminal'],
    ['view.overview', 'app.palette', '@workspaces'],
    ['app.usage', 'app.overseer', 'app.settings'],
    ['@more'],
  ]);
  // The very same objects, so labels and shortcuts can't drift.
  assert.equal(m.top[0][0], C.get('session.new'));
  assert.equal(C.shortcutLabel(m.top[0][0]), 'Ctrl+Shift+N');
  assert.deepEqual(m.foot.map((c) => c.label), ['Keyboard shortcuts', 'About Basanite']);
  assert.equal(M.model(C, { update: 'Restart to update' }).foot.length, 3);
});

test('app menu: everything else is in More or Workspaces, nothing is lost', () => {
  setup();
  const m = M.model(C);
  const more = m.more.flatMap((s) => s.items.map((c) => c.id));
  assert.deepEqual(m.more.map((s) => s.name), ['Session', 'Modes', 'View', 'Window']);
  for (const id of ['session.rename', 'view.reset-sizes', 'mode.choose', 'session.next-waiting', '@fullscreen', '@minimize']) assert.ok(more.includes(id), id);
  for (const id of ['session.new', 'view.overview', 'mode.set:notes', 'window.session-1', 'workspace.new']) assert.ok(!more.includes(id), id);
  assert.deepEqual(m.workspaces.map((c) => c.id), ['workspace.new', 'workspace.go.main']);
  // Every native-menu command is somewhere in the menu or its filter, except Session 1-9.
  const reach = new Set(m.all.map((c) => c.id));
  for (const c of C.all()) if (c.menu && !/^window\.session-/.test(c.id)) assert.ok(reach.has(c.id), c.id);
});

test('app menu: typing filters across every level, palette-only flags ignored', () => {
  setup();
  const m = M.model(C);
  assert.equal(M.filter(C, m.all, 'pal')[0].id, 'app.palette');
  assert.equal(M.filter(C, m.all, 'notes')[0].id, 'mode.set:notes');
  assert.equal(M.filter(C, m.all, 'full')[0].id, '@fullscreen');
  assert.equal(M.filter(C, m.all, 'main')[0].id, 'workspace.go.main');
  assert.deepEqual(M.filter(C, m.all, ''), []);
});
