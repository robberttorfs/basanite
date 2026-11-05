const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { Doing, labelFor } = require('../src/main/doing');
const { Overlaps } = require('../src/main/overlaps');
const { GitInfo, parseStatus } = require('../src/main/git');
const history = require('../src/main/history');
const { Usage, costOf, ingest } = require('../src/main/usage');
const { TranscriptReader } = require('../src/main/transcript');
const { Session } = require('../src/main/session');

const FIX = path.join(__dirname, 'fixtures', 'projects');
const FIX_FILE = path.join(FIX, 'E--demo-app', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.jsonl');

// ---- E1 doing

test('labelFor names the step', () => {
  assert.equal(labelFor('Edit', { file_path: '/a/b/routes.ts' }), 'Editing routes.ts');
  assert.equal(labelFor('Write', { file_path: 'C:\\x\\new.js' }), 'Writing new.js');
  assert.equal(labelFor('Bash', { command: 'npm test -- --watch' }), 'Running tests');
  assert.equal(labelFor('Bash', { command: 'node --test test/*.js' }), 'Running tests');
  assert.equal(labelFor('Bash', { command: 'git status' }), 'Using git');
  assert.equal(labelFor('Bash', { command: 'ls -la' }), 'Running ls');
  assert.equal(labelFor('Grep', {}), 'Searching the code');
  assert.equal(labelFor('mcp__trello__read', {}), 'Using trello');
});

test('Doing groups reads, holds a label, and falls back to Thinking', () => {
  const d = new Doing({ holdMs: 1000, thinkAfterMs: 5000 });
  assert.equal(d.get(false, 0), null);
  assert.equal(d.get(true, 0), 'Thinking');
  d.tool('Read', { file_path: 'a.js' }, 100);
  assert.equal(d.get(true, 100), 'Reading a.js');
  d.tool('Read', { file_path: 'b.js' }, 300);
  d.tool('Read', { file_path: 'c.js' }, 500);
  assert.equal(d.get(true, 500), 'Reading a.js');          // held, no flicker
  assert.equal(d.get(true, 1200), 'Reading 3 files');       // hold passed
  d.tool('Edit', { file_path: 'x/routes.ts' }, 1300);
  assert.equal(d.get(true, 1400), 'Reading 3 files');
  assert.equal(d.get(true, 2300), 'Editing routes.ts');
  assert.equal(d.get(true, 9000), 'Thinking');
  d.clear();
  assert.equal(d.get(true, 9100), 'Thinking');
});

test('transcript reader exposes tool_use entries, cache lifetime and last response', () => {
  const r = new TranscriptReader(FIX_FILE);
  r.poll();
  const tools = r.drainTools();
  assert.equal(tools[0].name, 'Read');
  assert.deepEqual(r.drainTools(), []);
  assert.equal(r.cacheTtlMs, 60 * 60 * 1000);
  assert.equal(r.lastAssistantAt, Date.parse('2026-11-01T10:00:06.000Z'));
});

test('session snapshot: doing while working, cacheCold after the cache lifetime', () => {
  const s = new Session({ id: 't1', name: 'x', cwd: __dirname });
  s.setStatus('working');
  s.onHook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(__dirname, 'routes.ts') } });
  assert.equal(s.snapshot().doing, 'Editing routes.ts');
  s.onHook({ hook_event_name: 'Stop' });
  assert.equal(s.snapshot().doing, null);
  s.reader = new TranscriptReader('nope');
  s.reader.contextTokens = 5000;
  s.reader.lastAssistantAt = Date.now() - 6 * 60 * 1000;
  assert.equal(s.snapshot().cacheCold, true);                // 5 min cache
  s.reader.cacheTtlMs = 60 * 60 * 1000;
  assert.equal(s.snapshot().cacheCold, false);               // 1 h cache
  s.reader.cacheTtlMs = 5 * 60 * 1000;
  s.reader.lastAssistantAt = Date.now() - 1000;
  assert.equal(s.snapshot().cacheCold, false);
});

// ---- E4 overlaps

test('Overlaps: one event per pair and file, only live sessions, 30 minute window', () => {
  const live = new Set(['a', 'b', 'c']);
  const o = new Overlaps({ isLive: (id) => live.has(id) });
  const f = path.resolve('/repo/src/app.js');
  assert.deepEqual(o.record('a', f, 0), []);
  const ev = o.record('b', f, 1000);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].file, f);
  assert.deepEqual(o.record('b', f, 2000), []);              // deduped
  assert.deepEqual(o.record('a', f, 3000), []);              // same pair, same file
  assert.deepEqual(o.forSession('a', 4000), [{ file: f, otherId: 'b' }]);
  assert.equal(o.record('c', f, 5000).length, 2);            // c overlaps with a and b
  live.delete('b');
  assert.deepEqual(o.forSession('a', 6000).map((x) => x.otherId), ['c']);
  assert.deepEqual(o.forSession('a', 40 * 60 * 1000), []);   // too old
  const o2 = new Overlaps();
  o2.record('a', f, 0);
  assert.deepEqual(o2.record('b', f, 31 * 60 * 1000), []);   // outside the window
});

// ---- E2 / E3 git

test('parseStatus reads branch and files', () => {
  const r = parseStatus('## main...origin/main [ahead 1]\n M src/a.js\n?? new.txt\nR  old.js -> moved.js\n');
  assert.equal(r.branch, 'main');
  assert.deepEqual(r.files.map((f) => f.path), ['src/a.js', 'new.txt', 'moved.js']);
  assert.equal(parseStatus('## HEAD (no branch)\n').branch, 'detached');
  assert.equal(parseStatus('## No commits yet on dev\n').branch, 'dev');
  assert.equal(parseStatus('## main\n').files.length, 0);
});

test('GitInfo: non-git folder is null; real repo gives branch, dirty, changes and a worktree', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-git-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'trunk');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  try {
    const g = new GitInfo();
    assert.equal(await g.refresh(repo), true);
    assert.deepEqual(g.peek(repo), { branch: 'trunk', dirty: false });
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n');
    fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n');
    const g2 = new GitInfo();
    await g2.refresh(repo);
    assert.deepEqual(g2.peek(repo), { branch: 'trunk', dirty: true });
    const c = await g2.changes(repo);
    assert.equal(c.git, true);
    assert.deepEqual(c.files.map((f) => [f.path, f.status]).sort(), [['a.txt', 'M'], ['b.txt', '??']]);
    assert.match(c.diff, /\+two/);
    const small = await g2.changes(repo, { diffCap: 10 });
    assert.equal(small.truncated, true);
    assert.equal(small.diff.length, 10);
    const wt = await g2.createWorktree(repo, 'try it');
    assert.equal(wt.branch, 'hangar/try-it');
    assert.ok(fs.existsSync(path.join(wt.dir, 'a.txt')));
    assert.ok(wt.dir.includes('.worktrees'));
    const again = await g2.createWorktree(repo, 'try it');
    assert.ok(again.error);
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-nogit-'));
    const g3 = new GitInfo({ runner: async () => null });
    assert.equal(g3.peek(plain), null);
    assert.equal(await g3.refresh(plain), false);
    assert.equal(g3.peek(plain), null);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('GitInfo shares one status call per repo and throttles refreshes', async () => {
  let calls = 0;
  let t = 0;
  const runner = async (args) => {
    if (args[0] === 'rev-parse') return path.resolve('/r') + '\n';
    calls++;
    return '## main\n M f\n';
  };
  const g = new GitInfo({ runner, now: () => t });
  await Promise.all([g.refresh('/r/a'), g.refresh('/r/b')]);
  assert.equal(calls, 1);
  t = 1000; await g.refresh('/r/a', true);
  assert.equal(calls, 1);                                   // forced, but under the minimum gap
  t = 3000; await g.refresh('/r/a', true);
  assert.equal(calls, 2);
  t = 30000; await g.refresh('/r/a');
  assert.equal(calls, 2);                                   // routine refresh waits 60 s
  t = 70000; await g.refresh('/r/a');
  assert.equal(calls, 3);
});

// ---- F1 history

test('history.list skips meta and command lines and counts messages', async () => {
  const l = await history.list('E:\\demo\\app', { root: FIX });
  assert.equal(l.length, 2);
  const a = l.find((x) => x.sessionId.startsWith('aaaaaaaa'));
  assert.equal(a.firstPrompt, 'Add a dark mode toggle to the settings page');
  assert.equal(a.messageCount, 4);                         // 2 prompts + 2 assistant lines (tool results do not count)
  assert.ok(a.size > 100);
  assert.deepEqual(await history.list('E:\\nothing', { root: FIX }), []);
  assert.equal(history.slugFor('D:\\.ROBBERT\\.Dubai College'), 'D---ROBBERT--Dubai-College');
});

test('history.search finds text with a snippet and respects caps', async () => {
  const r = await history.search('E:\\demo\\app', 'PURPLE elephant', { root: FIX });
  assert.equal(r.length, 1);
  assert.match(r[0].snippet, /purple elephant/);
  assert.equal(r[0].role, 'user');
  assert.deepEqual(await history.search('E:\\demo\\app', 'no such words', { root: FIX }), []);
  assert.deepEqual(await history.search('E:\\demo\\app', 'a', { root: FIX }), []);   // too short
  const capped = await history.search('E:\\demo\\app', 'the', { root: FIX, caps: { results: 1 } });
  assert.equal(capped.length, 1);
});

// ---- H usage

test('costOf prices tokens by model family', () => {
  const c = costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 } });
  assert.ok(Math.abs(c.costUSD - (3 + 15 + 0.3 + 6)) < 1e-9);
  assert.equal(c.cacheWrite, 1e6);
});

test('ingest keeps the last line of a repeated message id, also across reads', () => {
  const rec = { days: {}, lastId: null, last: null };
  const line = (out) => JSON.stringify({ type: 'assistant', timestamp: '2026-11-01T10:00:00.000Z', message: { id: 'x', model: 'haiku', usage: { input_tokens: 1, output_tokens: out } } });
  ingest(rec, [line(5), line(9)]);
  const day = Object.keys(rec.days)[0];
  assert.equal(rec.days[day].output, 9);
  ingest(rec, [line(12)]);
  assert.equal(rec.days[day].output, 12);
  assert.equal(rec.days[day].messages, 1);
});

test('Usage.history aggregates per day and project, and reads only new bytes after the first scan', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-usage-'));
  try {
    const root = path.join(tmp, 'projects');
    fs.cpSync(FIX, root, { recursive: true });
    const u = new Usage({ root, cacheFile: path.join(tmp, 'cache.json') });
    const h = await u.history(365);
    const days = h.days.filter((d) => d.messages > 0);
    assert.equal(days.length, 2);
    assert.equal(h.total.messages, 2);
    assert.equal(h.total.output, 50 + 200);                // last usage line of m1, plus m2
    assert.equal(h.projects.length, 1);
    assert.equal(h.projects[0].name, 'app');
    assert.ok(h.total.costUSD > 0);
    assert.equal(h.estimate, true);
    // Append a new message to one file; a fresh Usage with the saved cache sees it without a rescan of old bytes.
    const f = path.join(root, 'E--demo-app', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.jsonl');
    const before = JSON.parse(fs.readFileSync(path.join(tmp, 'cache.json'), 'utf8')).files[f].offset;
    fs.appendFileSync(f, JSON.stringify({ type: 'assistant', timestamp: '2026-11-03T09:00:00.000Z', message: { id: 'm3', model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1000 } } }) + '\n');
    const u2 = new Usage({ root, cacheFile: path.join(tmp, 'cache.json') });
    const h2 = await u2.history(365);
    assert.equal(h2.total.messages, 3);
    assert.equal(h2.total.output, 1250);
    assert.ok(u2.files[f].offset > before);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
