const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { steps, clamp } = require('../src/renderer/intro');

test('intro: short, one idea per step, every picture ships with the app', () => {
  for (const mac of [true, false]) {
    const list = steps(mac);
    assert.ok(list.length >= 3 && list.length <= 5, 'three to five steps');
    for (const s of list) {
      assert.ok(fs.existsSync(path.join(__dirname, '../src/renderer/intro', s.img)), s.img);
      assert.ok(s.title.length <= 34, s.title);
      assert.ok(s.text.length <= 100, s.text);
      assert.ok(s.alt, 'alt text');
    }
  }
});

test('intro: shortcuts match the platform', () => {
  assert.ok(steps(true).some((s) => s.keys === '⌘K'));
  assert.ok(steps(false).some((s) => s.keys === 'Ctrl+Shift+K'));
});

test('intro: steps stay in range', () => {
  assert.equal(clamp(-1, 4), 0);
  assert.equal(clamp(9, 4), 3);
  assert.equal(clamp(2, 4), 2);
});
