const test = require('node:test');
const assert = require('node:assert');
const { Workspaces, migrate, MAIN_ID } = require('../src/main/workspaces');
const { nextWaiting, pillPlan } = require('../src/renderer/workspaces');

const tile = (id, extra = {}) => ({ id, name: id, cwd: `/p/${id}`, sessionId: null, pinned: false, mode: null, kind: 'claude', ...extra });

test('workspaces: an old file loads as one Main workspace with its tiles', () => {
  const old = { tiles: [tile('a', { pinned: true, mode: 'build' }), tile('b')], recent: ['/p/a'] };
  const ws = migrate(old);
  assert.equal(ws.list.length, 1);
  assert.equal(ws.active, MAIN_ID);
  assert.equal(ws.current().name, 'Main');
  assert.deepEqual(ws.current().tiles.map((t) => t.id), ['a', 'b']);
  assert.equal(ws.current().tiles[0].mode, 'build');
  assert.equal(ws.current().notify, 'all');
});

test('workspaces: missing, empty or broken files give one empty Main', () => {
  for (const raw of [undefined, null, {}, { tiles: 'x' }, { workspaces: [] }]) {
    const ws = migrate(raw);
    assert.equal(ws.list.length, 1);
    assert.equal(ws.current().id, MAIN_ID);
    assert.deepEqual(ws.current().tiles, []);
  }
});

test('workspaces: saving and loading again round-trips, and older apps still find the open tiles', () => {
  const ws = migrate({ tiles: [tile('a')] });
  const school = ws.create('School');
  ws.update(school.id, { color: '#6fd4e0', notify: 'needs', defaultMode: 'build' });
  const away = ws.create('Old');
  ws.putAway(away.id, [tile('z')]);
  ws.switchTo(school.id);
  const file = ws.toJSON({ [MAIN_ID]: [tile('a')], [school.id]: [tile('b'), tile('c')] }, ['/p/a']);
  assert.equal(file.version, 2);
  assert.deepEqual(file.tiles.map((t) => t.id), ['a', 'b', 'c'], 'top-level tiles = open workspaces only');
  const back = migrate(JSON.parse(JSON.stringify(file)));
  assert.equal(back.active, school.id);
  assert.deepEqual(back.list.map((w) => w.name), ['Main', 'Old', 'School']);
  assert.equal(back.get(school.id).notify, 'needs');
  assert.equal(back.get(school.id).defaultMode, 'build');
  assert.equal(back.get(school.id).color, '#6fd4e0');
  assert.equal(back.get(away.id).putAway, true);
  assert.deepEqual(back.get(away.id).tiles.map((t) => t.id), ['z']);
});

test('workspaces: names stay unique, new ones go after the active one', () => {
  const ws = new Workspaces();
  const a = ws.create('School');
  const b = ws.create('school');
  assert.equal(b.name, 'school 2');
  ws.switchTo(MAIN_ID);
  const c = ws.create();
  assert.deepEqual(ws.list.map((w) => w.id), [MAIN_ID, c.id, b.id, a.id]);
  ws.update(a.id, { name: 'school 2' });
  assert.equal(a.name, 'school 2 2');
  ws.update(a.id, { notify: 'loud' });
  assert.equal(a.notify, 'all', 'bad values are ignored');
});

test('workspaces: switching, stepping and numbers only see open workspaces', () => {
  const ws = new Workspaces();
  const a = ws.create('A');
  ws.switchTo(a.id);
  const b = ws.create('B');
  assert.deepEqual(ws.open().map((w) => w.name), ['Main', 'A', 'B']);
  ws.switchTo(MAIN_ID);
  assert.equal(ws.adjacent(-1), b.id, 'wraps round');
  assert.equal(ws.adjacent(1), a.id);
  ws.putAway(a.id, []);
  assert.equal(ws.adjacent(1), b.id);
  assert.equal(ws.byIndex(1), b.id);
  assert.equal(ws.switchTo(a.id), false, 'a put away workspace cannot be switched to');
});

test('workspaces: put away keeps tiles, reopen hands them back, the last open one stays', () => {
  const ws = new Workspaces();
  const a = ws.create('A');
  ws.switchTo(a.id);
  assert.equal(ws.putAway(a.id, [tile('x'), tile('y')]), true);
  assert.equal(ws.active, MAIN_ID, 'the active one moves on');
  assert.equal(ws.putAway(MAIN_ID, []), false, 'the only open workspace cannot be put away');
  assert.equal(ws.summary().find((w) => w.id === a.id).saved, 2);
  const back = ws.reopen(a.id);
  assert.deepEqual(back.map((t) => t.id), ['x', 'y']);
  assert.equal(ws.active, a.id);
  assert.deepEqual(ws.get(a.id).tiles, []);
});

test('workspaces: close and undo, reorder pills', () => {
  const ws = new Workspaces();
  const a = ws.create('A');
  ws.switchTo(a.id);
  const b = ws.create('B');
  const gone = ws.remove(a.id, [tile('q')]);
  assert.equal(ws.get(a.id), null);
  assert.notEqual(ws.active, a.id);
  ws.restore(gone);
  assert.equal(ws.get(a.id).putAway, true);
  assert.deepEqual(ws.reopen(a.id).map((t) => t.id), ['q']);
  assert.deepEqual(ws.list.map((w) => w.name), ['Main', 'A', 'B']);
  ws.move(b.id, 0);
  assert.deepEqual(ws.list.map((w) => w.name), ['B', 'Main', 'A']);
  ws.move(b.id, 9);
  assert.deepEqual(ws.list.map((w) => w.name), ['Main', 'A', 'B']);
  assert.equal(ws.remove(MAIN_ID) && ws.remove(a.id) && ws.remove(b.id), null, 'never removes the last open one');
  assert.equal(ws.open().length, 1);
});

test('workspaces: notification levels', () => {
  const ws = new Workspaces();
  ws.update(MAIN_ID, { notify: 'needs' });
  assert.equal(ws.allows(MAIN_ID, 'needs'), true);
  assert.equal(ws.allows(MAIN_ID, 'other'), false);
  ws.update(MAIN_ID, { notify: 'none' });
  assert.equal(ws.allows(MAIN_ID, 'needs'), false);
});

test('workspaces: next that needs you hops workspaces, starting from the active one', () => {
  const order = ['m', 'a', 'b'];
  const tiles = [
    { id: 'm1', ws: 'm', status: 'needs_input' },
    { id: 'm2', ws: 'm', status: 'idle' },
    { id: 'a1', ws: 'a', status: 'needs_input' },
    { id: 'b1', ws: 'b', status: 'error' },
  ];
  assert.equal(nextWaiting(tiles, order, 'a', null), 'a1', 'the active workspace comes first');
  assert.equal(nextWaiting(tiles, order, 'a', 'a1'), 'b1');
  assert.equal(nextWaiting(tiles, order, 'b', 'b1'), 'm1', 'wraps round');
  assert.equal(nextWaiting(tiles.filter((t) => t.status === 'idle'), order, 'm', null), null);
});

test('workspaces: pills fold into the menu past six, the active one always shows', () => {
  const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
  let p = pillPlan(ids, '2', 6);
  assert.deepEqual(p.shown, ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(p.folded, ['7', '8']);
  p = pillPlan(ids, '8', 6);
  assert.deepEqual(p.shown, ['1', '2', '3', '4', '5', '8']);
  assert.deepEqual(p.folded, ['6', '7']);
  assert.deepEqual(pillPlan(['1', '2'], '1', 6).folded, []);
});

test('workspaces: a save before the saved sessions are resumed keeps them', () => {
  const ws = migrate({ tiles: [tile('a'), tile('b')] });
  // Startup: nothing running yet, e.g. a quit or a settings change during load.
  assert.deepEqual(ws.toJSON({}).workspaces[0].tiles.map((t) => t.id), ['a', 'b']);
  ws.current().tiles = [];
  ws.restored = true;
  assert.deepEqual(ws.toJSON({}).workspaces[0].tiles, [], 'after restore, no running tiles means none');
  assert.deepEqual(ws.toJSON({ [MAIN_ID]: [tile('c')] }).workspaces[0].tiles.map((t) => t.id), ['c']);
});
