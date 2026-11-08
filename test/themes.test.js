const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/shared/themes');

test('themes: every preset has every colour, as strict hex', () => {
  for (const t of T.PRESETS) {
    for (const k of T.UI_KEYS) assert.ok(T.isHex(t.ui[k]), `${t.id} ui.${k}`);
    for (const k of T.TERM_KEYS) assert.ok(T.isHex(t.term[k]), `${t.id} term.${k}`);
  }
});
test('themes: every preset is readable', () => {
  for (const t of T.PRESETS) {
    assert.ok(T.contrast(t.ui.text, t.ui.bg) >= 7, `${t.id} text`);
    assert.ok(T.contrast(t.term.foreground, t.term.background) >= 4.5, `${t.id} terminal`);
    assert.ok(T.contrast(t.ui.needs, t.ui.tile) >= 3, `${t.id} needs`);
  }
});
test('themes: a seed with bad contrast is repaired', () => {
  const t = T.fromSeed({ bg: '#101010', text: '#151515', accent: '#121212', needs: '#111111' });
  assert.ok(T.contrast(t.ui.text, t.ui.bg) >= 7);
  assert.ok(T.contrast(t.ui.accent, t.ui.tile) >= 3);
  assert.ok(T.contrast(t.ui.needs, t.ui.tile) >= 3);
});
test('themes: nothing but hex reaches a theme', () => {
  const t = T.normalise({ name: '<b>x</b>', base: 'dark', ui: { bg: '#000000', text: 'red; background:url(x)', accent: 'url(evil)' }, term: { red: 'expression(1)' } });
  assert.ok(T.isHex(t.ui.text)); assert.ok(T.isHex(t.ui.accent)); assert.ok(T.isHex(t.term.red));
  assert.ok(!/[<>]/.test(t.name));
  assert.equal(T.normalise({ ui: { bg: 'nope' } }), null);
  assert.equal(T.normalise(null), null);
});
test('themes: an edited colour is kept exactly', () => {
  const t = T.normalise({ name: 'a', base: 'dark', ui: { bg: '#000000', text: '#111111' }, term: {} });
  assert.equal(t.ui.text, '#111111');
});
test('themes: only custom ids survive', () => {
  assert.equal(T.normalise({ id: '../x', ui: { bg: '#000000' } }).id, null);
  assert.equal(T.normalise({ id: 'custom-ab12', ui: { bg: '#000000' } }).id, 'custom-ab12');
});
test('themes: resolve follows the OS for system and unknown ids', () => {
  assert.equal(T.resolve('system', [], true).id, 'light');
  assert.equal(T.resolve('system', [], false).id, 'dark');
  assert.equal(T.resolve('gone', [], false).id, 'dark');
  assert.equal(T.resolve('nord', [], true).id, 'nord');
});
test('themes: reply parsing survives wrapping and rejects junk', () => {
  const r = T.parseReply('Sure!\n{"say":"ok","theme":{"name":"A","bg":"#101820","text":"#f0f0f0","accent":"#44ccaa"}}\nthanks');
  assert.equal(r.say, 'ok'); assert.equal(r.theme.ui.bg, '#101820');
  assert.equal(T.parseReply('no json'), null);
  assert.equal(T.parseReply('{"say":"x"}'), null);
  assert.equal(T.parseReply('{"theme":{"bg":"blue"}}'), null);
});
test('themes: a request carries only a small seed', () => {
  assert.ok(JSON.stringify(T.toSeed(T.PRESETS[0])).length < 400);
});
