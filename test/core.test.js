const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Modes are stored in Hangar's data folder; keep tests away from the real one.
process.env.HANGAR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-test-'));
const timer = require('../src/main/timer');
const modes = require('../src/main/modes');
const { TranscriptReader } = require('../src/main/transcript');
const { computeLayout, weightFor, maxShift } = require('../src/renderer/layout');
const { Session, hookSettings, permissionArgs } = require('../src/main/session');
const { readLog } = require('../src/main/log');

const MIN = 60000;

test('timer: armed timer starts on the next prompt and sends one start note', () => {
  let t = { minutes: 30, startedAt: null, sent: [], finished: false };
  const now = 1_000_000;
  let r = timer.nudge(t, 'UserPromptSubmit', {}, now);
  assert.equal(r.timer.startedAt, now);
  assert.match(r.out.context, /Time budget for this task: 30 min/);
  r = timer.nudge(r.timer, 'PostToolUse', {}, now + MIN);
  assert.equal(r.out, null, 'no output mid-way, so no extra tokens');
});

test('timer: wrap-up at 80% and stop at 100%, once each', () => {
  let t = { minutes: 10, startedAt: 0, sent: ['start'], finished: false };
  let r = timer.nudge(t, 'PostToolUse', {}, 8.1 * MIN);
  assert.match(r.out.context, /Start wrapping up/);
  r = timer.nudge(r.timer, 'PostToolUse', {}, 8.5 * MIN);
  assert.equal(r.out, null);
  r = timer.nudge(r.timer, 'PostToolUse', {}, 10.2 * MIN);
  assert.match(r.out.context, /Time budget reached/);
  r = timer.nudge(r.timer, 'PostToolUse', {}, 11 * MIN);
  assert.equal(r.out, null);
});

test('timer: subagents get their own short wrap note', () => {
  const t = { minutes: 10, startedAt: 0, sent: ['start', 'wrap:main'], finished: false };
  const r = timer.nudge(t, 'PostToolUse', { agent_id: 'a1' }, 9 * MIN);
  assert.match(r.out.context, /report back soon/);
  assert.ok(r.timer.sent.includes('wrap:a1'));
});

test('timer: early stop is blocked once, never in a loop', () => {
  const t = { minutes: 30, startedAt: 0, sent: ['start'], finished: false };
  let r = timer.nudge(t, 'Stop', { stop_hook_active: false }, 5 * MIN);
  assert.ok(r.out.block);
  r = timer.nudge(r.timer, 'Stop', { stop_hook_active: true }, 6 * MIN);
  assert.equal(r.out, null);
  assert.equal(r.timer.finished, true);
});

test('timer: late stop just finishes', () => {
  const t = { minutes: 30, startedAt: 0, sent: ['start'], finished: false };
  const r = timer.nudge(t, 'Stop', {}, 25 * MIN);
  assert.equal(r.out, null);
  assert.equal(r.timer.finished, true);
});

test('timer: set mid-task gets the start note on the next tool call', () => {
  const t = { minutes: 20, startedAt: 0, sent: [], finished: false };
  const r = timer.nudge(t, 'PostToolUse', {}, 0.5 * MIN);
  assert.match(r.out.context, /Time budget for this task: 20 min/);
});

function tmpFile(lines) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-')), 't.jsonl');
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return f;
}

test('transcript: dedupes usage per message and tracks context', () => {
  const usage = { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 40 };
  const f = tmpFile([
    { type: 'user', message: { role: 'user', content: 'hi' } },
    { type: 'assistant', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'thinking' }] } },
    { type: 'assistant', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'text', text: 'Hello' }] } },
    { type: 'assistant', message: { id: 'm2', usage: { ...usage, output_tokens: 10, cache_read_input_tokens: 2000 }, content: [] } },
  ]);
  const r = new TranscriptReader(f);
  r.poll();
  assert.equal(r.outputTokens, 50);
  assert.equal(r.contextTokens, 2502);
  assert.equal(r.lastText, 'Hello');
  assert.equal(r.model, 'claude-opus-5-5');
  fs.appendFileSync(f, JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } }) + '\n');
  assert.equal(r.poll(), true);
  assert.equal(r.interrupted, true);
  assert.equal(r.poll(), false, 'no change, no work');
});

test('transcript: partial last line is held until complete', () => {
  const f = tmpFile([]);
  fs.writeFileSync(f, '{"type":"assistant","message":{"id":"x","usage":{"output_tokens":7}');
  const r = new TranscriptReader(f);
  r.poll();
  assert.equal(r.outputTokens, 0);
  fs.appendFileSync(f, '}}\n');
  r.poll();
  assert.equal(r.outputTokens, 7);
});

test('log: only human and Claude text, newest last', () => {
  const f = tmpFile([
    { type: 'user', message: { content: 'Fix the login bug' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagent noise' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed it.' }] } },
  ]);
  assert.equal(readLog(f, 4), 'USER: Fix the login bug\n\nCLAUDE: Fixed it.');
});

test('layout: fills the stage without overlap', () => {
  for (let n = 1; n <= 7; n++) {
    const tiles = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, weight: weightFor(i === 1 ? 'needs_input' : 'working'), pinned: false }));
    const r = computeLayout(tiles, 1600, 900, 8);
    const rects = Object.values(r);
    assert.equal(rects.length, n);
    for (const a of rects) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 1601 && a.y + a.h <= 901, `in bounds n=${n}`);
      for (const b of rects) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        assert.ok(!overlap, `no overlap n=${n}`);
      }
    }
  }
});

test('layout: needs-you tile gets more room, pinned tile takes the left', () => {
  const r = computeLayout([
    { id: 'a', weight: weightFor('working') }, { id: 'b', weight: weightFor('needs_input') },
  ], 1600, 900);
  assert.ok(r.b.w > r.a.w);
  const p = computeLayout([
    { id: 'a', weight: 1 }, { id: 'b', weight: 1, pinned: true }, { id: 'c', weight: 1 },
  ], 1600, 900);
  assert.equal(p.b.x, 0);
  assert.ok(p.b.w > 800);
});

function assertTiled(r, W, H, label) {
  const rects = Object.values(r);
  for (const a of rects) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= W + 1 && a.y + a.h <= H + 1, `in bounds ${label}`);
    for (const b of rects) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      assert.ok(!overlap, `no overlap ${label}`);
    }
  }
}

test('layout: the anchored (selected) tile keeps its rect while others change status', () => {
  const tiles = (st) => ['a', 'b', 'c', 'd'].map((id, i) => ({ id, weight: weightFor(st[i]) }));
  const first = computeLayout(tiles(['idle', 'idle', 'idle', 'idle']), 1600, 900);
  const anchor = first.b;
  for (const st of [['needs_input', 'idle', 'working', 'done'], ['working', 'needs_input', 'needs_input', 'idle'], ['done', 'working', 'idle', 'needs_input']]) {
    const t = tiles(st);
    t[1].anchor = anchor;
    const r = computeLayout(t, 1600, 900);
    assert.deepEqual(r.b, anchor, `anchored tile unchanged for ${st}`);
    assertTiled(r, 1600, 900, String(st));
  }
});

test('layout: a locked width holds and the rest share the remainder', () => {
  const r = computeLayout([{ id: 'a', weight: 1, lock: { w: 500 } }, { id: 'b', weight: 1.9 }, { id: 'c', weight: 0.85 }], 1600, 400);
  assert.equal(r.a.w, 500);
  assert.ok(r.b.w > r.c.w);
  assertTiled(r, 1600, 400, 'lock');
});

test('layout: impossible locks shrink to fit instead of overflowing', () => {
  const r = computeLayout([{ id: 'a', weight: 1, lock: { w: 1500 } }, { id: 'b', weight: 1, lock: { w: 1500 } }], 1600, 600);
  assertTiled(r, 1600, 600, 'overlock');
  assert.ok(Math.abs(r.a.w + r.b.w + 8 - 1600) <= 2, 'still fills the row');
});

test('layout: maxShift spots tiny moves', () => {
  assert.equal(maxShift({ a: { x: 0, y: 0, w: 100, h: 100 } }, { a: { x: 0, y: 0, w: 110, h: 100 } }), 10);
});

test('session: status follows hooks, permission wait clears on the same source', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp' });
  s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  assert.equal(s.status, 'working');
  s.onHook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' });
  assert.equal(s.status, 'needs_input');
  s.onHook({ hook_event_name: 'PostToolUse', agent_id: 'other' });
  assert.equal(s.status, 'needs_input', 'a background agent does not clear the main wait');
  s.onHook({ hook_event_name: 'PostToolUse' });
  assert.equal(s.status, 'working');
  s.onHook({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' });
  s.onHook({ hook_event_name: 'Stop' });
  assert.equal(s.status, 'working', 'agents still running');
  s.onHook({ hook_event_name: 'SubagentStop', agent_id: 'a1' });
  s.onHook({ hook_event_name: 'Stop' });
  assert.equal(s.status, 'done');
});

test('session: untimed sessions never get hook output', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp' });
  for (const e of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop']) {
    assert.equal(s.onHook({ hook_event_name: e }), null, e);
  }
});

test('hook settings: http hooks, SessionStart through the command helper, statusline', () => {
  const j = hookSettings('abc', { port: 1234, token: 'tok' }, 'ctl', 'darwin');
  assert.equal(j.hooks.Stop[0].hooks[0].url, 'http://127.0.0.1:1234/hook/tok/abc');
  assert.match(j.statusLine.command, /^curl .*\/statusline\/tok\/abc' \|\| true$/, 'Mac and Linux use curl, not a Node start per refresh');
  assert.equal(hookSettings('abc', { port: 1234, token: 'tok' }, 'ctl', 'win32').statusLine.command, 'ctl statusline');
  assert.equal(j.hooks.SessionStart[0].hooks[0].type, 'command', 'SessionStart does not support http hooks');
  assert.equal(j.hooks.SessionStart[0].hooks[0].command, 'ctl hook');
});

const ctxOf = (r) => r?.hookSpecificOutput?.additionalContext || '';

test('modes: sent once with the next prompt, not again', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp' });
  assert.equal(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }), null, 'no mode, no output');
  s.setMode('notes');
  assert.match(ctxOf(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'the header is too tall' })), /Hangar mode: Notes/);
  assert.equal(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'and the font is small' }), null);
  assert.equal(s.snapshot().mode.applied, true);
});

test('modes: switching says what it replaces; compaction restates it', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp', mode: 'plan', modeApplied: true });
  s.setMode('review');
  const c = ctxOf(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'look at auth' }));
  assert.match(c, /Hangar mode: Review/);
  assert.match(c, /replaces Plan mode/);
  assert.match(ctxOf(s.onHook({ hook_event_name: 'SessionStart', source: 'compact' })), /Review.*Restated/s);
  assert.equal(s.onHook({ hook_event_name: 'SessionStart', source: 'resume' }), null);
});

test('modes: a fresh conversation in a restored tile gets its mode again', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp', mode: 'plan', modeApplied: true });
  assert.match(ctxOf(s.onHook({ hook_event_name: 'SessionStart', source: 'startup' })), /Hangar mode: Plan/);
});

test('modes: an exit phrase ends the mode and the chip follows', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp', mode: 'notes', modeApplied: true });
  assert.equal(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'the timer should start later' }), null, 'a note mentioning start is still a note');
  assert.equal(s.mode, 'notes');
  assert.equal(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'ok do research and planning then begin' }), null, 'a sentence is not an exit');
  assert.match(ctxOf(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'ok begin now' })), /Notes mode has ended/);
  assert.equal(s.mode, null);
});

test('modes: picking none after an applied mode tells Claude it ended', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp', mode: 'review', modeApplied: true });
  s.setMode(null);
  assert.match(ctxOf(s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'thanks' })), /Review mode has ended/);
});

test('modes: exit phrases only count when they are the whole message', () => {
  const p = ['start', 'go', 'lets discuss'];
  assert.equal(modes.exitPhraseIn('ok start', p), 'start');
  assert.equal(modes.exitPhraseIn('lets discuss now', p), 'lets discuss');
  assert.equal(modes.exitPhraseIn('Go!', p), 'go');
  assert.equal(modes.exitPhraseIn('it should go faster', p), null);
  assert.equal(modes.exitPhraseIn('start ' + 'word '.repeat(20), p), null);
  assert.equal(modes.exitPhraseIn('make it start', p), null);
  assert.equal(modes.exitPhraseIn('the button should go', p), null);
  assert.equal(modes.exitPhraseIn('ok go', p), 'go');
});

test('modes: edit, reset and hide built-ins; custom modes get their own id', () => {
  modes.upsert({ id: 'notes', name: 'Notes', instructions: 'Just list them.' });
  assert.equal(modes.get('notes').instructions, 'Just list them.');
  assert.ok(modes.get('notes').edited);
  modes.reset('notes');
  assert.match(modes.get('notes').instructions, /numbered list/);
  modes.remove('crew');
  assert.ok(!modes.list().some((m) => m.id === 'crew'));
  modes.reset('crew');
  const c = modes.upsert({ name: 'Quick Fix', instructions: '- be brief', exitPhrases: 'done, thanks' });
  assert.equal(c.id, 'quick-fix');
  assert.deepEqual(c.exitPhrases, ['done', 'thanks']);
  assert.equal(modes.get('refine').tokenWarn, 500, 'Refine warns about token use by default');
  assert.equal(modes.upsert({ name: 'Cheap', instructions: '-', tokenWarn: '0' }).tokenWarn, null);
});

test('session: a dialog on a quiet tile means it needs you', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp' });
  s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  s.onDialog(true);
  assert.equal(s.status, 'working', 'ignored while working');
  s.onHook({ hook_event_name: 'Stop' });
  s.onDialog(true);
  assert.equal(s.status, 'needs_input');
  s.onDialog(false);
  assert.equal(s.status, 'idle');
});

test('permission mode: maps to claude flags, unknown falls back to asking', () => {
  assert.deepEqual(permissionArgs('default'), []);
  assert.deepEqual(permissionArgs('acceptEdits'), ['--permission-mode', 'acceptEdits']);
  assert.deepEqual(permissionArgs('bypassPermissions'), ['--dangerously-skip-permissions']);
  assert.deepEqual(permissionArgs('nonsense'), []);
  assert.deepEqual(permissionArgs(undefined), []);
});

test('chat feed: messages, folded tool steps with results, plumbing skipped', () => {
  const { ChatFeed } = require('../src/main/chat');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-chat-')), 't.jsonl');
  const line = (o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
  line({ type: 'user', message: { content: 'Fix the bug' } });
  line({ type: 'user', isMeta: true, message: { content: 'meta stuff' } });
  line({ type: 'user', message: { content: '<local-command-stdout>x</local-command-stdout>' } });
  line({ type: 'assistant', message: { id: 'a1', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Looking.' }] } });
  line({ type: 'assistant', message: { id: 'a1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }] } });
  const feed = new ChatFeed();
  feed.follow(f);
  let items = feed.poll();
  assert.deepEqual(items.map((i) => i.k), ['you', 'claude', 'tool']);
  assert.equal(items[2].verb, 'Run tests');
  assert.equal(items[2].done, false);
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'all good' }] } });
  line({ type: 'user', isSidechain: true, message: { content: 'agent chatter' } });
  line({ type: 'user', message: { content: '<command-name>/clear</command-name><command-args></command-args>' } });
  items = feed.poll();
  assert.equal(items.length, 2);
  assert.equal(items[0].k, 'tool');
  assert.equal(items[0].done, true);
  assert.equal(items[0].result, 'all good');
  assert.equal(items[1].text, '/clear');
  assert.equal(feed.poll().length, 0);
});

test('session: a startup dialog (folder trust) needs you, but the session stays booting until its prompt is up', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '/tmp' });
  assert.equal(s.status, 'starting');
  s.onDialog(true);
  assert.equal(s.status, 'needs_input');
  assert.equal(s.snapshot().booting, true, 'queued clean-view messages must not go into the trust menu');
  s.onDialog(false);
  s.onStatusline({ model: { display_name: 'Opus' } });
  assert.equal(s.snapshot().booting, false);
});
