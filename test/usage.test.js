// Usage scan: chunked reads keep UTF-8 whole and byte offsets right; subagent transcripts count.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readNew, transcriptFiles, Usage } = require('../src/main/usage');

const line = (id, text) => JSON.stringify({ type: 'assistant', timestamp: '2026-11-05T10:00:00Z', cwd: '/p', message: { id, model: 'claude-sonnet', usage: { input_tokens: 10, output_tokens: 5 }, content: text } });

test('usage: reads past 2 MB chunks with multibyte text on the edges, offsets in bytes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-usage-'));
  try {
    const file = path.join(dir, 'a.jsonl');
    const big = 'é'.repeat(1.2 * 1024 * 1024); // 2.4 MB of two-byte characters
    const body = [line('m1', big), line('m2', 'ü€'), line('m3', big)].join('\n') + '\n' + '{"half":';
    fs.writeFileSync(file, body);
    const rec = { size: 0, offset: 0, project: 'p', cwd: null, days: {}, lastId: null, last: null };
    const size = fs.statSync(file).size;
    assert.equal(await readNew(file, size, rec), true);
    assert.equal(rec.offset, Buffer.byteLength(body) - Buffer.byteLength('{"half":'), 'stops before the half line, counted in bytes');
    assert.equal(rec.days['2026-11-05'].messages, 3);
    assert.equal(await readNew(file, size, rec), false, 'nothing new');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('usage: subagent transcripts under <session>/subagents are scanned', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-usage-root-'));
  try {
    const proj = path.join(root, 'C--p');
    fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'sess1.jsonl'), line('a', 'x') + '\n');
    fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-1.jsonl'), line('b', 'y') + '\n');
    fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-1.meta.json'), '{}');
    assert.equal(transcriptFiles(proj).length, 2);
    const u = new Usage({ root, cacheFile: path.join(root, 'cache.json') });
    await u.scan(0);
    const r = u.report(1, new Date('2026-11-05T00:00:00'));
    assert.equal(r.total.messages, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('limits: a session that is behind never pulls the number back', () => {
  const { mergeLimits } = require('../src/main/usage');
  const w = (p, at = 2000000000) => ({ seven_day: { used_percentage: p, resets_at: at } });
  let cur = mergeLimits(null, w(69.4));
  for (const p of [70.1, 69.4, 70.1, 69.4]) cur = mergeLimits(cur, w(p));
  assert.equal(cur.seven_day.used_percentage, 70.1);
});

test('limits: a new window starts over, and an old one cannot come back', () => {
  const { mergeLimits } = require('../src/main/usage');
  const w = (p, at) => ({ seven_day: { used_percentage: p, resets_at: at } });
  let cur = mergeLimits(w(90, 2000000000), w(3, 2000604800));
  assert.equal(cur.seven_day.used_percentage, 3);
  cur = mergeLimits(cur, w(90, 2000000000));
  assert.equal(cur.seven_day.used_percentage, 3);
});

test('limits: a report with only one window keeps the other', () => {
  const { mergeLimits } = require('../src/main/usage');
  const prev = { five_hour: { used_percentage: 20, resets_at: 2000000000 }, seven_day: { used_percentage: 70, resets_at: 2000000000 } };
  const cur = mergeLimits(prev, { five_hour: { used_percentage: 21, resets_at: 2000000000 } });
  assert.equal(cur.five_hour.used_percentage, 21);
  assert.equal(cur.seven_day.used_percentage, 70);
});
