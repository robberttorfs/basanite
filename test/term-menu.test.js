const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/term-menu');

const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const pick = () => ({ labels: new Set(), other: '', skipped: false });
const one = { question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: 'Warm one', preview: '' }, { label: 'Blue', description: 'Cool one', preview: '' }] };
const many = { question: 'Which sizes?', header: 'Sizes', multiSelect: true, options: [{ label: 'Small', description: 'Tiny', preview: '' }, { label: 'Large', description: 'Big', preview: '' }] };
const model = (qs) => M.newModel(qs, qs.map(pick));
const DOWN = '\x1b[B', UP = '\x1b[A', RIGHT = '\x1b[C';
const text = (m) => M.frame(m, 80, 'w').lines.map(plain);

// The expected lines are Claude Code 2.1.319's own menu, copied from a real terminal.
test('frame: two questions, first tab, as Claude Code draws it', () => {
  assert.deepEqual(text(model([one, many])).slice(1), [
    '←  ☐ Colour  ☐ Sizes  ✔ Submit  →', '', 'Which colour?', '',
    '❯ 1. Red', '     Warm one', '  2. Blue', '     Cool one', '  3. Type something.',
    '─'.repeat(80), '  4. Chat about this', '',
    'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
    `${'─'.repeat(76)} w ─`,
  ]);
});

test('frame: colours of the first rows match Claude Code', () => {
  const lines = M.frame(model([one, many]), 80, 'w').lines;
  assert.match(lines[5], /38;2;177;185;249m❯/);
  assert.match(lines[3], /1;38;2;255;255;255mWhich colour/);
  assert.match(lines[1], /38;2;0;0;0;48;2;177;185;249m ☐ Colour /);
});

test('frame: many choices, ticks, Next and Submit rows', () => {
  const m = model([one, many]);
  M.press(m, '\t');
  M.press(m, ' ');
  const t = text(m);
  assert.equal(t[1], '←  ☐ Colour  ☒ Sizes  ✔ Submit  →');
  assert.deepEqual(t.slice(5, 11), ['❯ 1. [✔] Small', '         Tiny', '  2. [ ] Large', '         Big', '  3. [ ] Type something', '     Submit']);
  assert.equal(text(model([many, one]))[10], '     Next');
});

test('frame: one question has no arrows or Submit tab', () => {
  const t = text(model([one]));
  assert.equal(t[1], ' ☐ Colour ');
  assert.equal(t.at(-2), 'Enter to select · ↑/↓ to navigate · Esc to cancel');
});

test('frame: preview box beside the options', () => {
  const q = { question: 'Pick a layout', header: 'Layout', multiSelect: false, options: [{ label: 'Grid', description: '', preview: 'a b\nc d' }, { label: 'List', description: '', preview: 'a' }] };
  const t = text(model([q]));
  assert.equal(t[5], `❯ 1. Grid${' '.repeat(25)}┌${'─'.repeat(42)}┐`);
  assert.equal(t[6], `  2. List${' '.repeat(25)}│ a b${' '.repeat(38)}│`);
  assert.equal(t[10], `${' '.repeat(34)}Notes: press n to add notes`);
  assert.equal(t[13], '  Chat about this');
});

test('frame: review page, with the warning when something is open', () => {
  const m = model([one, many]);
  M.press(m, '1');
  M.press(m, '\t');
  const t = text(m);
  assert.deepEqual(t.slice(3, 14), ['Review your answers', '', '⚠ You have not answered all questions', '', ' ● Which colour?', '   → Red', '', 'Ready to submit your answers?', '', '❯ 1. Submit answers', '  2. Cancel']);
});

test('keys: arrows follow the real menu at its edges', () => {
  const m = model([one, many]);
  M.press(m, UP);
  assert.equal(M.rowsOf(one)[m.rows[0]], 'type', 'up from the top goes to the last list row');
  M.press(m, DOWN);
  M.press(m, DOWN);
  assert.equal(M.rowsOf(one)[m.rows[0]], 'chat', 'and down stops at the bottom');
  M.press(m, UP);
  M.press(m, UP);
  M.press(m, UP);
  assert.equal(m.rows[0], 0);
  M.press(m, '\x1b[D');
  assert.equal(m.tab, 0, 'left stops at the first tab');
  M.press(m, RIGHT);
  assert.equal(m.tab, 1);
  M.press(m, '\t');
  M.press(m, '\t');
  assert.equal(m.tab, 2, 'tab stops at Submit');
});

test('keys: one choice picks and moves on, one question sends', () => {
  const m = model([one, many]);
  assert.equal(M.press(m, '2'), 'draw');
  assert.deepEqual([...m.picks[0].labels], ['Blue']);
  assert.equal(m.tab, 1);
  const s = model([one]);
  assert.equal(M.press(s, '\r'), 'send');
  assert.deepEqual([...s.picks[0].labels], ['Red']);
});

test('keys: many choices tick without moving', () => {
  const m = model([many]);
  M.press(m, '2');
  M.press(m, '1');
  assert.deepEqual([...m.picks[0].labels].sort(), ['Large', 'Small']);
  assert.equal(m.rows[0], 0);
  M.press(m, '1');
  assert.deepEqual([...m.picks[0].labels], ['Large']);
});

test('keys: typing counts only after Enter, digits stay text', () => {
  const m = model([one, many]);
  M.press(m, DOWN);
  M.press(m, DOWN);
  for (const c of 'a1') M.press(m, c);
  assert.equal(m.drafts[0], 'a1');
  assert.equal(m.picks[0].other, '');
  M.press(m, RIGHT);
  assert.equal(m.tab, 0, 'arrows move inside the text');
  M.press(m, '\x7f');
  assert.equal(m.drafts[0], 'a');
  M.press(m, '\r');
  assert.equal(m.picks[0].other, 'a');
  assert.equal(m.tab, 1);
});

test('keys: Tab stays put on the Chat row and in typed text', () => {
  const m = model([one, many]);
  M.press(m, UP);
  M.press(m, 'h');
  M.press(m, '\t');
  assert.equal(m.tab, 0);
  M.press(m, DOWN);
  M.press(m, '\t');
  M.press(m, RIGHT);
  assert.equal(m.tab, 0);
});

test('keys: stray keys do nothing until the menu has settled', () => {
  const m = model([one]);
  assert.equal(M.press(m, '\r', false), '');
  assert.equal(M.press(m, '1', false), '');
  assert.equal(m.picks[0].labels.size, 0);
});

test('keys: submit skips what is open, cancel and Esc stop, chat answers in words', () => {
  const m = model([one, many]);
  M.press(m, '1');
  M.press(m, '\t');
  assert.equal(M.press(m, '\r'), 'send');
  assert.equal(m.picks[1].skipped, true);
  const c = model([one, many]);
  M.press(c, '\t'); M.press(c, '\t');
  M.press(c, DOWN);
  assert.equal(M.press(c, '\r'), 'stop');
  assert.equal(M.press(model([one]), '\x1b'), 'stop');
  const t = model([one]);
  assert.equal(M.press(t, '4'), 'send');
  assert.match(t.picks[0].other, /talk about this/);
});

test('keys: pasted text lands on one line in the box', () => {
  const m = model([one]);
  M.press(m, DOWN); M.press(m, DOWN);
  M.press(m, '\x1b[200~one\ntwo\x1b[201~');
  assert.equal(m.drafts[0], 'one two');
});
