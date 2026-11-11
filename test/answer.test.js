const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
process.env.HANGAR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-test-'));
const { plan } = require('../src/main/answer');
const { startServer } = require('../src/main/server');

const card = (multi = false) => ({ id: 't1', questions: [{ question: 'Which colour?', multiSelect: multi, options: [{ label: 'Red' }, { label: 'Blue' }] }] });

test('answer: a card takes its option number or label', () => {
  assert.deepEqual(plan(card(), '2'), { picks: [{ labels: ['Blue'], other: '', skipped: false }], text: 'Blue' });
  assert.equal(plan(card(), 'red').text, 'Red');
  assert.throws(() => plan(card(), '3'), /no option 3/);
});

test('answer: other words, or a card with several questions, answer in words', () => {
  assert.deepEqual(plan(card(), 'green please'), { words: 'green please' });
  const two = { id: 't', questions: [card().questions[0], { question: 'Size?', options: [{ label: 'S' }] }] };
  assert.deepEqual(plan(two, '1'), { words: '1' });
});

test('answer: a terminal menu gets one key and never a sentence', () => {
  assert.deepEqual(plan(null, '1'), { key: '1', text: '1' });
  assert.deepEqual(plan(null, 'ESC'), { key: '\x1b', text: 'Esc' });
  assert.throws(() => plan(null, 'yes do it'), /number/);
  assert.throws(() => plan(null, '12'), /number/);
  assert.throws(() => plan(null, ''), /choice/);
});

test('server: answer and focus reach their handlers', async () => {
  const seen = [];
  const s = await startServer({ answer: (b) => { seen.push(['answer', b]); return { text: 'a' }; }, focus: (b) => { seen.push(['focus', b]); return { text: 'f' }; } });
  const post = (cmd, body) => new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: s.port, method: 'POST', path: `/api/${s.token}/${cmd}`, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => resolve(JSON.parse(Buffer.concat(c).toString()))); });
    req.end(data);
  });
  assert.deepEqual(await post('answer', { tile: '2', choice: '1' }), { text: 'a' });
  assert.deepEqual(await post('focus', { tile: 'econ' }), { text: 'f' });
  assert.deepEqual(seen, [['answer', { tile: '2', choice: '1' }], ['focus', { tile: 'econ' }]]);
  s.close();
});
