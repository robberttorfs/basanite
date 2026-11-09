'use strict';
// Every theme, built in or generated, has to stay readable wherever the app puts text.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../src/shared/themes.js');

const { mix, contrast } = T;

/** The pairs the app draws, with the CSS color-mix roles worked out the same way. */
function problems(t) {
  const u = t.ui;
  const soft2 = mix(u.panel, u.accent, 0.22);
  const accentText = T.toVars(t)['--accent-text'];
  const ovSoft = mix(u.tile, u.ov, 0.07);
  const pairs = [
    ['text/bg', u.text, u.bg, 4.5], ['text/tile', u.text, u.tile, 4.5], ['text/panel', u.text, u.panel, 4.5],
    ['text/pop (input box)', u.text, u.pop, 4.5], ['text/hover', u.text, u.hover, 4.5],
    ['text/overseer input', u.text, ovSoft, 4], ['send icon', accentText, soft2, 2.9],
    ['placeholder/pop', u.faint, u.pop, 2.2], ['muted/pop', u.muted, u.pop, 3],
    ['tick on accent', u.tile, u.accent, 2.9],
    ['terminal', t.term.foreground, t.term.background, 4.5], ['cursor', t.term.cursor, t.term.background, 3],
  ];
  return pairs.filter(([, a, b, r]) => contrast(a, b) < r).map(([n, a, b]) => `${n} ${a} on ${b} = ${contrast(a, b).toFixed(2)}`);
}

for (const p of T.PRESETS) test(`preset ${p.id} is readable`, () => assert.deepStrictEqual(problems(p), []));

test('generated themes are readable whatever the seed', () => {
  let seed = 12345;
  const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const c = () => `#${Array.from({ length: 3 }, () => Math.floor(r() * 256).toString(16).padStart(2, '0')).join('')}`;
  for (let i = 0; i < 5000; i++) {
    const s = { name: 'x', bg: c(), text: c(), accent: c() };
    if (r() < 0.6) s.tile = c();
    if (r() < 0.4) s.surface = c();
    if (r() < 0.4) s.termBg = c();
    if (r() < 0.4) s.cursor = c();
    if (r() < 0.3) s.base = r() < 0.5 ? 'light' : 'dark';
    assert.deepStrictEqual(problems(T.fromSeed(s)), [], JSON.stringify(s));
  }
});

test('the stylesheets paint surfaces from theme roles', () => {
  const dir = path.join(__dirname, '../src/renderer');
  // Fixed on purpose: the html viewer's white page, the remove button over a picture, the dimming behind dialogs.
  const allowed = /\.vframe\.page iframe|\.att \.x|#layer\.open/;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/:root\s*\{[\s\S]*?\n\}/, '');
    for (const line of css.split('\n')) {
      if (allowed.test(line)) continue;
      assert.ok(!/background(-color)?:\s*(#[0-9a-f]{3,8}\b|rgba?\(\s*\d|white\b|black\b)/i.test(line), `${f}: ${line.trim().slice(0, 120)}`);
    }
  }
});
