const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.HANGAR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-modes-'));
const modes = require('../src/main/modes');
const guards = require('../src/main/guards');
const { Session, hookSettings } = require('../src/main/session');
const { goalCommand, startMode } = require('../src/main/modes-ipc');

const prompt = (s, text) => s.onHook({ hook_event_name: 'UserPromptSubmit', prompt: text });
const ctxOf = (r) => r?.hookSpecificOutput?.additionalContext || '';

test('library: 7 on the shelf in order, add-ons apart, every built-in short with cost dots', () => {
  const shelf = modes.listModes().filter((m) => m.shelf).sort((a, b) => a.shelf - b.shelf).map((m) => m.name);
  assert.deepEqual(shelf, ['Notes', 'Plan', 'Build', 'Overnight', 'Review', 'Careful', 'Until done']);
  for (const n of ['Test first', 'Debug', 'Spec first', 'Phased', 'Refine', 'Crew']) assert.ok(modes.listModes().some((m) => m.name === n), n);
  assert.deepEqual(modes.listAddons().map((a) => a.name), ['Verify at end', 'Tidy commits', 'Quiet']);
  for (const m of modes.list()) {
    assert.ok(m.cost >= 0 && m.cost <= 3, `${m.name} cost`);
    assert.ok(m.icon, `${m.name} icon`);
    assert.ok(modes.estimateTokens(m.instructions) < 350, `${m.name} is ${modes.estimateTokens(m.instructions)} tokens`);
    assert.ok(!/skill/i.test(m.name + m.description), `${m.name} says skill`);
  }
});

test('add-ons: stack on any mode, sent once, restated after compaction, never per message', () => {
  const s = new Session({ id: 't1', name: 'x', cwd: '/p', mode: 'build' });
  s.setAddon('verify', true);
  s.setAddon('quiet', true);
  s.setAddon('build', true); // a mode is not an add-on
  assert.deepEqual(s.addons, ['verify', 'quiet']);
  let c = ctxOf(prompt(s, 'make the thing'));
  assert.match(c, /\[Basanite mode: Build\]/);
  assert.match(c, /Verify at end: /);
  assert.match(c, /Quiet: /);
  assert.equal(prompt(s, 'next thing'), null, 'nothing on later prompts');
  // Switching mode keeps the add-ons and does not resend them.
  s.setMode('debug');
  c = ctxOf(prompt(s, 'why'));
  assert.match(c, /Debug/);
  assert.doesNotMatch(c, /Verify at end/);
  // Compaction restates mode and add-ons.
  c = ctxOf(s.onHook({ hook_event_name: 'SessionStart', source: 'compact' }));
  assert.match(c, /Debug/);
  assert.match(c, /restated after compaction/);
  assert.match(c, /Verify at end/);
  // Resume restates nothing.
  assert.equal(s.onHook({ hook_event_name: 'SessionStart', source: 'resume' }), null);
});

test('add-ons: turning one off tells Claude once; on and off before a prompt says nothing', () => {
  const s = new Session({ id: 't2', name: 'x', cwd: '/p' });
  s.setAddon('commits', true);
  s.setAddon('commits', false);
  assert.equal(prompt(s, 'hi'), null);
  s.setAddon('commits', true);
  assert.match(ctxOf(prompt(s, 'hi')), /Tidy commits/);
  s.setAddon('commits', false);
  s.setAddon('commits', true);
  assert.equal(prompt(s, 'hi'), null, 'off and on again before Claude heard: no note');
  s.setAddon('commits', false);
  assert.match(ctxOf(prompt(s, 'hi')), /Turned off: Tidy commits/);
  assert.equal(prompt(s, 'hi'), null);
  assert.equal(s.modeSnapshot(), null);
});

test('add-ons survive a restart through persisted()', () => {
  const s = new Session({ id: 't3', name: 'x', cwd: '/p' });
  s.setAddon('quiet', true);
  prompt(s, 'hi');
  const back = new Session(s.persisted());
  assert.deepEqual(back.addons, ['quiet']);
  assert.equal(prompt(back, 'hi'), null, 'already applied');
  assert.deepEqual(back.modeSnapshot().addons.map((a) => a.id), ['quiet']);
});

test('guards: Review and Plan deny edits and writing commands, Careful denies risky ones', () => {
  const pre = (s, tool, input) => s.onHook({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input });
  const deny = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';
  const review = new Session({ id: 'g1', name: 'x', cwd: '/p', mode: 'review' });
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.ok(deny(pre(review, t, { file_path: 'a' })), t);
  const r = pre(review, 'Write', { file_path: 'a' });
  assert.equal(r.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /^Review mode is read-only/);
  assert.ok(!r.hookSpecificOutput.permissionDecisionReason.includes('\n'), 'one line');
  for (const c of ['echo x > a.txt', 'rm a', 'git commit -m x', 'npm install left-pad', 'sed -i s/a/b/ f', 'Set-Content a b']) assert.ok(deny(pre(review, 'Bash', { command: c })), c);
  for (const c of ['ls -la', 'git status', 'git diff', 'npm test', 'cat x 2>/dev/null', 'grep -r install .', 'node -e "a=>1"']) assert.equal(pre(review, 'Bash', { command: c }), null, c);
  assert.equal(pre(review, 'Read', { file_path: 'a' }), null);
  assert.ok(deny(pre(new Session({ id: 'g2', name: 'x', cwd: '/p', mode: 'plan' }), 'Edit', {})));

  const careful = new Session({ id: 'g3', name: 'x', cwd: '/p', mode: 'careful' });
  assert.equal(pre(careful, 'Edit', { file_path: 'a' }), null, 'Careful still edits locally');
  for (const c of ['git push origin main', 'git push --force', 'vercel deploy --prod', 'rm -rf build', 'npm publish', 'git reset --hard HEAD~1']) assert.ok(deny(pre(careful, 'Bash', { command: c })), c);
  assert.equal(pre(careful, 'Bash', { command: 'git commit -m ok' }), null);
});

test('guards: no guard mode means an empty reply (zero tokens)', () => {
  for (const mode of [null, 'build', 'notes', 'overnight']) {
    const s = new Session({ id: 'z', name: 'x', cwd: '/p', mode });
    s.modeApplied = true;
    assert.equal(s.onHook({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'a' } }), null, String(mode));
    assert.equal(s.onHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' } }), null, String(mode));
  }
  assert.equal(guards.check(null, 'X', 'Write', {}), null);
});

test('hook settings: PreToolUse matcher covers the guarded tools', () => {
  const st = hookSettings('t', { port: 1, token: 'k' }, 'ctl', 'win32');
  const m = st.hooks.PreToolUse[0].matcher.split('|');
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'AskUserQuestion', 'ExitPlanMode']) assert.ok(m.includes(t), t);
});

test('mode files: export then import gives an equal new custom mode, bad files are refused', () => {
  const src = modes.get('debug');
  const file = modes.toFile(src);
  assert.equal(file.hangarMode, 1);
  assert.ok(!('id' in file) && !('builtin' in file));
  const back = modes.importFile(JSON.stringify(file));
  assert.notEqual(back.id, 'debug');
  assert.equal(back.builtin, false);
  for (const k of ['name', 'color', 'icon', 'cost', 'description', 'instructions']) assert.deepEqual(back[k], src[k], k);
  const addon = modes.importFile(modes.toFile(modes.get('quiet')));
  assert.equal(addon.kind, 'addon');
  assert.throws(() => modes.fromFile('{"name":"x"}'), /Not a mode file/);
  assert.throws(() => modes.fromFile('nope'), /Not a mode file/);
  assert.throws(() => modes.fromFile({ hangarMode: 1, name: 'x', instructions: ' ' }), /no instructions/);
  const odd = modes.fromFile({ hangarMode: 1, name: 'x'.repeat(99), instructions: 'y', color: 'red', cost: 9, guard: 'root', icon: '<svg>' });
  assert.equal(odd.name.length, 24);
  assert.equal(odd.cost, 3);
  assert.equal(odd.guard, null);
  assert.equal(odd.icon, null);
  assert.ok(modes.COLORS.includes(odd.color));
});

test('per-project default: a folder remembers its mode; workspace default applies when it has none', () => {
  modes.setProjectDefault('C:\\Work\\App\\', 'review');
  assert.equal(modes.projectDefault('c:/work/app'), 'review');
  assert.equal(startMode(undefined, 'c:/work/app', 'build'), 'review');
  assert.equal(startMode('default:plan', 'c:/work/app', 'build'), 'review');
  assert.equal(startMode('notes', 'c:/work/app', 'build'), 'notes', 'an explicit pick wins');
  assert.equal(startMode('none', 'c:/work/app', 'build'), null);
  assert.equal(startMode(undefined, '/other', 'build'), 'build');
  assert.equal(startMode('default:none', '/other', 'build'), null);
  assert.equal(startMode('default:plan', '/other', 'build'), 'plan');
  modes.setProjectDefault('c:/work/app', 'quiet'); // add-ons are never a folder default
  assert.equal(modes.projectDefault('c:/work/app'), null);
});

test('Until done: types /goal with the turn cap in the condition', () => {
  assert.equal(goalCommand('npm test passes', 15), '/goal npm test passes, or stop after 15 turns');
  assert.equal(goalCommand('  a\n b ', 0), '/goal a b, or stop after 20 turns');
  assert.equal(goalCommand('', 5), null);
});

test('PreToolUse for Bash does not take its description as a subagent name', () => {
  const s = new Session({ id: 'd', name: 'x', cwd: '/p' });
  s.onHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls', description: 'List files' } });
  assert.deepEqual(s.pendingDescs, []);
  s.onHook({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'Find the bug' } });
  assert.deepEqual(s.pendingDescs, ['Find the bug']);
});

test('Until done: /goal clear is sent however the mode ends, and goalSet is saved', () => {
  const typed = [];
  const mk = (extra = {}) => { const s = new Session({ id: 'u', name: 'x', cwd: '/p', ...extra }); s.onChange = () => {}; s.typeCommand = (t) => typed.push(t); return s; };
  const s = mk();
  s.setMode('until-done'); s.goalSet = true;
  assert.equal(s.persisted().goalSet, true);
  s.setMode('build');
  assert.deepEqual(typed, ['/goal clear'], 'switching mode');
  s.setMode(null);
  assert.equal(typed.length, 1, 'only once');
  // After a restart (goalSet persisted), turning the mode off still clears it.
  const back = mk({ mode: 'until-done', modeApplied: true, goalSet: true });
  back.setMode(null);
  assert.equal(typed.length, 2);
  // Exit phrase.
  modes.upsert({ ...modes.get('until-done'), exitPhrases: ['stop now'] });
  assert.ok(modes.get('until-done').goal);
  try {
    const e = mk({ mode: 'until-done', modeApplied: true, goalSet: true });
    e.modeContext('ok stop now');
    assert.equal(e.mode, null);
    assert.equal(typed.length, 3);
    assert.equal(e.goalSet, false);
  } finally { modes.reset('until-done'); }
  // A new conversation has no /goal.
  const r = mk({ mode: 'until-done', goalSet: true });
  r.resetClaude();
  assert.equal(r.goalSet, false);
});

test('Until done is never a folder or workspace default', () => {
  modes.setProjectDefault('c:/work/goal', 'review');
  modes.setProjectDefault('c:/work/goal', 'until-done');
  assert.equal(modes.projectDefault('c:/work/goal'), 'review', 'the folder keeps its last real pick');
  assert.equal(startMode(undefined, '/nowhere', 'until-done'), null);
  assert.equal(startMode('default:until-done', '/nowhere', null), null);
  assert.equal(startMode('until-done', '/nowhere', null), 'until-done', 'an explicit pick in New still works');
});
