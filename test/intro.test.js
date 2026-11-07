const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { welcome, features } = require('../src/renderer/intro');

test('intro: one screen with three short steps, and its picture ships with the app', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../src/renderer/intro', welcome.img)), welcome.img);
  assert.ok(welcome.alt);
  assert.equal(welcome.steps.length, 3);
  for (const s of welcome.steps) assert.ok(s.length <= 90, s);
});

test('intro: the features page stays one short line each', () => {
  for (const mac of [true, false]) {
    const list = features(mac);
    assert.ok(list.length <= 7);
    for (const f of list) { assert.ok(f.text.length <= 90, f.text); assert.ok(f.icon, f.name); }
  }
});

test('intro: shortcuts match the platform', () => {
  assert.ok(features(true).some((f) => f.keys === '⌘K'));
  assert.ok(features(false).some((f) => f.keys === 'Ctrl+Shift+K'));
});
