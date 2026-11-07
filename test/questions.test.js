// The question card's main-process side: which questions get held, what goes back to Claude Code.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const q = require('../src/main/questions');
const { Session, hookSettings } = require('../src/main/session');
const { ChatFeed } = require('../src/main/chat');

const input = {
  questions: [
    { question: 'Which one?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: 'first' }, { label: 'B', description: 'second' }] },
    { question: 'Which ones?', header: 'Many', multiSelect: true, options: [{ label: 'X', description: '' }, { label: 'Y', description: '' }] },
  ],
};
const hook = (extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'tu1', tool_input: input, ...extra });

test('shouldHold: only readable questions from the main conversation', () => {
  assert.equal(q.shouldHold(hook()), true);
  assert.equal(q.shouldHold(hook({ agent_id: 'a1' })), false, 'a subagent');
  assert.equal(q.shouldHold(hook({ tool_name: 'Bash' })), false);
  assert.equal(q.shouldHold(hook({ hook_event_name: 'PostToolUse' })), false);
  assert.equal(q.shouldHold(hook({ tool_input: { questions: [] } })), false);
  assert.equal(q.shouldHold(hook({ tool_input: { ...input, answers: {} } })), false, 'already answered');
  const twin = { question: 'Same', options: [{ label: 'A' }] };
  assert.equal(q.shouldHold(hook({ tool_input: { questions: [twin, twin] } })), false, 'answers are keyed by question text');
  assert.equal(q.shouldHold(hook({ tool_input: { questions: [{ question: 'Q', options: [{ label: 'A' }, { label: 'A' }] }] } })), false);
});

test('buildAnswers: one choice, several, other and skipped', () => {
  const qs = q.parse(input);
  assert.deepEqual(q.buildAnswers(qs, [{ labels: ['B'] }, { labels: ['Y', 'X'], other: ' and Z ' }]), { 'Which one?': 'B', 'Which ones?': 'X, Y, and Z' });
  assert.deepEqual(q.buildAnswers(qs, [{ other: 'my own' }, { skipped: true }]), { 'Which one?': 'my own', 'Which ones?': q.SKIPPED });
});

test('buildAnswers: refuses what could not be a real answer', () => {
  const qs = q.parse(input);
  const ok = { labels: ['X'] };
  assert.equal(q.buildAnswers(qs, [{ labels: ['C'] }, ok]), null, 'unknown label');
  assert.equal(q.buildAnswers(qs, [{ labels: ['A', 'B'] }, ok]), null, 'two picks on a one-choice question');
  assert.equal(q.buildAnswers(qs, [{ labels: ['A'], other: 'x' }, ok]), null, 'a pick and a typed answer on a one-choice question');
  assert.equal(q.buildAnswers(qs, [{}, ok]), null, 'nothing chosen');
  assert.equal(q.buildAnswers(qs, [ok]), null, 'too few');
  assert.equal(q.buildAnswers(qs, 'nope'), null);
});

test('Holds: an answer replies with allow, the questions and the answers', async () => {
  const seen = [];
  const h = new q.Holds((id, cur, waiting) => seen.push([id, cur?.id ?? null, waiting]));
  const { reply, entry } = h.hold('t', hook());
  entry.passthrough = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'note' } };
  assert.equal(h.current('t').id, 'tu1');
  assert.equal(h.answer('t', 'tu1', [{ labels: ['Z'] }, { skipped: true }]), false, 'a bad pick leaves it open');
  assert.equal(h.current('t').id, 'tu1');
  assert.equal(h.answer('t', 'old', [{ labels: ['A'] }, { skipped: true }]), false, 'another question id');
  assert.equal(h.answer('t', 'tu1', [{ labels: ['A'] }, { skipped: true }]), true);
  const out = (await reply).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'allow');
  assert.deepEqual(out.updatedInput.questions, input.questions);
  assert.equal(out.updatedInput.answers['Which one?'], 'A');
  assert.equal(out.additionalContext, 'note');
  assert.equal(h.current('t'), null);
  assert.deepEqual(seen, [['t', 'tu1', true], ['t', null, false]]);
  assert.equal(h.answer('t', 'tu1', [{ labels: ['A'] }, { skipped: true }]), false, 'only once');
});

test('Holds: release hands back to the terminal, gone drops it, questions queue', async () => {
  const seen = [];
  const h = new q.Holds((id, cur, waiting) => seen.push([cur?.id ?? null, waiting]));
  const a = h.hold('t', hook({ tool_use_id: 'a' }));
  const b = h.hold('t', hook({ tool_use_id: 'b' }));
  assert.equal(h.current('t').id, 'a');
  a.entry.passthrough = { keep: 1 };
  h.release('t');
  assert.deepEqual(await a.reply, { keep: 1 }, 'an empty or original reply lets Claude Code show its menu');
  assert.equal(await b.reply, null);
  assert.deepEqual(seen.at(-1), [null, true], 'Claude Code still needs an answer');
  const c = h.hold('t', hook({ tool_use_id: 'c' }));
  h.gone('t', c.entry);
  assert.equal(await c.reply, null);
  assert.deepEqual(seen.at(-1), [null, false], 'Esc: nothing is waiting any more');
});

test('Holds: words from the overseer answer every part of the question', async () => {
  const h = new q.Holds();
  assert.equal(h.respond('t', 'hi'), false, 'nothing open');
  const { reply } = h.hold('t', hook());
  assert.equal(h.respond('t', 'use B'), true);
  assert.deepEqual((await reply).hookSpecificOutput.updatedInput.answers, { 'Which one?': 'use B', 'Which ones?': 'use B' });
});

test('session: a held question stays needs-you through other reports, then carries on', () => {
  const s = new Session({ id: 't', name: 'x', cwd: '.' });
  s.setQuestion({ id: 'tu1', questions: [] }, true);
  s.onHook(hook());
  assert.equal(s.status, 'needs_input');
  s.onHook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} });
  assert.equal(s.status, 'needs_input', 'a report from elsewhere does not clear it');
  assert.equal(s.snapshot().question.id, 'tu1');
  s.setQuestion(null, true);
  assert.equal(s.status, 'needs_input', 'handed to the terminal: the menu still needs you');
  s.setQuestion(null, false);
  assert.equal(s.status, 'working');
  assert.equal(s.snapshot().question, null);
});

test('hook settings: questions get their own long hook, other tools stay short', () => {
  const [tools, asks] = hookSettings('t', { port: 1, token: 'k' }, 'ctl', 'win32').hooks.PreToolUse;
  assert.ok(!tools.matcher.split('|').includes('AskUserQuestion'), 'one hook per question');
  assert.equal(tools.hooks[0].timeout, 5);
  assert.equal(asks.matcher, 'AskUserQuestion');
  assert.equal(asks.hooks[0].timeout, q.HOLD_SECONDS);
});

test('feed: a question is hidden until answered, then shows what was said', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ask-')), 't.jsonl');
  const line = (o) => fs.appendFileSync(file, `${JSON.stringify(o)}\n`);
  const f = new ChatFeed();
  f.follow(file);
  line({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 'u1', name: 'AskUserQuestion', input }] } });
  const [open] = f.poll();
  assert.equal(open.k, 'ask');
  assert.equal(open.done, false);
  line({ type: 'user', toolUseResult: { questions: input.questions, answers: { 'Which one?': 'A', 'Which ones?': q.SKIPPED } }, message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'ok' }] } });
  const [done] = f.poll();
  assert.equal(done.done, true);
  assert.deepEqual(done.qa, [{ question: 'Which one?', skipped: false, answer: 'A' }, { question: 'Which ones?', skipped: true, answer: '' }]);
});
