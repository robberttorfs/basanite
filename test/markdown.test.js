const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/renderer/chat.js'), 'utf8');
const { md } = new Function(`${src}; return HangarChat;`)();

test('markdown: bold can hold a code span, at either end or alone', () => {
  assert.equal(md('**`E:\\WSL\\Ubuntu`**'), '<p><b><code>E:\\WSL\\Ubuntu</code></b></p>');
  assert.equal(md('Nothing yet. **WSL cannot move to `E:`.** It stays.'), '<p>Nothing yet. <b>WSL cannot move to <code>E:</code>.</b> It stays.</p>');
  assert.equal(md('so also on **`a b`**'), '<p>so also on <b><code>a b</code></b></p>');
});

test('markdown: no asterisks left behind in table cells', () => {
  const html = md('| What | Where |\n|---|---|\n| **Ubuntu** | **`E:\\WSL`** |');
  assert.ok(!html.includes('**'), html);
  assert.ok(html.includes('<td><b>Ubuntu</b></td><td><b><code>E:\\WSL</code></b></td>'), html);
});

test('markdown: code stays literal', () => {
  assert.equal(md('`**not bold**`'), '<p><code>**not bold**</code></p>');
  assert.equal(md('``a ` b``'), '<p><code>a ` b</code></p>');
});

test('markdown: other emphasis', () => {
  assert.equal(md('***both***'), '<p><b><i>both</i></b></p>');
  assert.equal(md('**a *b* c**'), '<p><b>a <i>b</i> c</b></p>');
  assert.equal(md('~~gone~~ and __bold__ and _it_'), '<p><s>gone</s> and <b>bold</b> and <i>it</i></p>');
  assert.equal(md('2 * 3 * 4 and snake_case_name'), '<p>2 * 3 * 4 and snake_case_name</p>');
  assert.equal(md('\\*\\*literal\\*\\*'), '<p>**literal**</p>');
});

test('markdown: text is still escaped', () => {
  assert.equal(md('**<img src=x>**'), '<p><b>&lt;img src=x&gt;</b></p>');
  assert.equal(md('`<b>`'), '<p><code>&lt;b&gt;</code></p>');
});

test('markdown: tables without outer pipes, and a pipe inside code', () => {
  const html = md('a | b\n---|---\n`x|y` | z');
  assert.ok(html.includes('<td><code>x|y</code></td><td>z</td>'), html);
  assert.ok(html.includes('<th>a</th><th>b</th>'), html);
  assert.ok(!md('one | two, just a sentence').includes('<table'));
});

test('markdown: lists keep their number and show task boxes', () => {
  assert.ok(md('3. c\n4. d').startsWith('<ol start="3">'));
  assert.ok(md('- [x] done\n- [ ] todo').includes('<li>☑ done</li><li>☐ todo</li>'));
});
