// Session modes: a named set of working instructions applied to a session.
// A mode is sent once, as hidden context on the next prompt after it is
// picked (and again after a compaction or /clear wipes it). Built-in modes
// can be edited, reset or hidden; custom ones live next to them.
const fs = require('fs');
const paths = require('../shared/paths');

const COLORS = ['#8ab4ff', '#5fd39a', '#f5b545', '#ff8a7a', '#c49cff', '#6fd4e0', '#f28fc3', '#b8bec9'];

const BUILTIN = [
  {
    id: 'notes', name: 'Notes', color: '#f5b545',
    description: 'Collect notes in a numbered list. No work until you say start.',
    exitPhrases: ['start', 'go', 'begin', 'get started', 'discuss', 'lets discuss'],
    instructions: `The user is giving you notes one at a time. Your only job right now is to record them.
- Add each note to a numbered list in a notes file in the project (for example docs/NOTES.md; reuse an existing notes file and continue its numbering).
- Keep each note faithful to what the user meant. Tidy the wording, never drop detail. If a note refines an earlier one, update that entry instead of adding a duplicate.
- Reply in one or two short lines: what you noted and its number. No plans, no suggestions, no questions unless a note is truly ambiguous.
- Do not edit code, run builds, start agents or begin any of the work.
- Notes mode ends when the user tells you to start the work (for example "start" or "go"): ask any final questions you need, then follow their instruction.`,
  },
  {
    id: 'plan', name: 'Plan', color: '#8ab4ff',
    description: 'Discuss and plan only. No changes until you say go ahead.',
    exitPhrases: ['go ahead', 'go', 'start', 'build it', 'do it'],
    instructions: `Planning and discussion only.
- Read whatever you need, but do not edit files, commit, deploy or run anything that changes state.
- When there is a choice, recommend one option and say why in a sentence or two. Do not hand the user a long list of options to decide between.
- Look at how strong existing products solve the same problem when it helps the decision.
- Keep answers short and plain. Use a small table when comparing things.
- Ask questions only when the answer changes the plan, and ask them all at once.
- When the user says go ahead (or similar), planning mode ends and you build the agreed plan.`,
  },
  {
    id: 'build', name: 'Build', color: '#5fd39a',
    description: 'Hands-off build. Questions first, then start to finish, one report.',
    exitPhrases: [],
    instructions: `Autonomous build. The user is not watching and will read your report later.
- If you have questions, ask them all now in your first reply. After that, never stop or wait for the user.
- Make reasonable decisions yourself. Keep a short list of the debatable ones for the report.
- Work in phases. Test as you go and fix what you break.
- Keep progress notes in the project so the work can be picked up if this session ends.
- Work on a branch. Never deploy, merge to main or touch production without explicit approval.
- Finish with one short report: what was done, what was decided, what to check, what is left.`,
  },
  {
    id: 'overnight', name: 'Overnight', color: '#c49cff',
    description: 'Unsupervised. Never waits on you. Safe choices, morning report.',
    exitPhrases: [],
    instructions: `Overnight run. The user is away and will not answer until the morning. Nothing you ask will be seen, so never stop to wait.
- Start by writing the goal and a checklist of every task into a progress file in the project (for example docs/OVERNIGHT.md). Keep it updated as you go, so the work survives a compaction, a crash or a new session.
- If something is unclear, pick the option that is safest and easiest to undo, write the choice and the reason under Decisions in the progress file, and carry on. Never end your turn on a question.
- Work on a branch in small steps. After each step, check it actually works (run the tests, the build, or the app in isolation) and commit it on the branch with a clear message.
- If an approach fails twice, write down what you tried, set it aside and move to the next task. Come back to it at the end if time allows.
- Hard limits: no deploying, publishing, merging to main, pushing to shared branches, emailing or messaging anyone, spending money, or changing production data. Do not touch running apps, other sessions or their ports. No destructive commands (rm -rf on anything you did not create, force pushes, resets of work you did not make).
- Keep paid API calls and tokens lean. Use helper agents only for clearly independent work.
- Before you finish, go through the checklist: every item done, set aside with a reason, or left for the user. If time remains, do a quality pass on what you built.
- End with a short morning report at the top of the progress file: what is done, what to try first and how, decisions that need a second look, and what is left. Plain words, no padding.`,
  },
  {
    id: 'phased', name: 'Phased', color: '#6fd4e0',
    description: 'Build in phases and stop for approval after each one.',
    exitPhrases: [],
    instructions: `Build in phases with a checkpoint after each.
- Start by writing a short plan split into phases. Keep to it.
- Do one phase at a time. At the end of a phase, say clearly that it is finished, summarise what changed in a few lines, and say exactly where the user can check it.
- Then stop and wait. Start the next phase only when the user says so.
- Keep progress notes in the project so work can resume later.`,
  },
  {
    id: 'review', name: 'Review', color: '#c49cff',
    description: 'Read-only audit. Findings ranked, no edits.',
    exitPhrases: ['fix', 'fix it', 'fix them', 'fix them all'],
    instructions: `Read-only review.
- Do not change any files, branches or settings, and do not commit. Reading and running read-only commands is fine.
- Go through the target piece by piece. For each part, say keep, cut or change, with a reason in one line.
- Rank findings by how much they matter. Be concrete: file, line or screen, and what is wrong.
- Keep it short. No padding, no praise.
- When the user says fix (or similar), review mode ends and you fix the findings they want fixed.`,
  },
  {
    id: 'refine', name: 'Refine', color: '#f28fc3',
    description: 'Expert review, fix, review again, until it is genuinely good.',
    exitPhrases: [],
    tokenWarn: 500,
    instructions: `Refine loop: review and fix in rounds until the work is genuinely good.
- First pick 4 to 6 experts that fit this work, each with one field (for example UX and clarity, visual design, correctness, performance, security, copy). Use helper agents for the reviews when they can run independently, and give each one only its field.
- Each round, every expert goes through the work piece by piece, scores each area from 1 to 10 for their field, and lists concrete problems (where, what, why it matters). Merge the lists, drop duplicates, and rank by impact.
- Fix the top problems, highest impact first. Check each fix works and does not break something else. Prefer removing clutter over adding features.
- Then start the next round on the result. Keep a scoreboard in a file in the project (docs/REFINE.md): round number, scores per area, what was fixed, what is still open.
- Stop when every area scores 8 or more and a round finds nothing important, or when two rounds in a row barely move the scores. Hard stop after 6 rounds.
- Watch the cost: say at the start of each round how many rounds are done and roughly how many tokens they took. If a round would be expensive for little gain, stop and say so instead.
- Finish with a short report: final scores, what changed, and anything left that needs a human decision.`,
  },
  {
    id: 'careful', name: 'Careful', color: '#ff8a7a',
    description: 'Near live systems: local only, ask before anything risky.',
    exitPhrases: [],
    instructions: `Careful mode: this work is close to live systems.
- Work locally or on a branch. Never deploy, publish, merge to main or push to production without an explicit yes in this conversation.
- Never write to production databases or services. Read-only queries only, and only when needed.
- Keep paid API calls and tests to the minimum that proves the change.
- Never kill processes broadly (no pkill by name). Do not touch other sessions, ports or running apps; test in isolation.
- Stage explicit paths when committing. No git add -A, no bare git stash, no force pushes.
- Ask before anything that is hard to undo.`,
  },
  {
    id: 'crew', name: 'Crew', color: '#b8bec9',
    description: 'Split a big job across helper agents and coordinate them.',
    exitPhrases: [],
    instructions: `Crew mode: you lead and helper agents do the work.
- Break the job into independent parts and hand each to a subagent with a clear brief: goal, files it owns, shared rules, what to return.
- Use the strongest model for design, UI and risky work and a lighter one for routine code. Run a few at a time, not dozens.
- Do not let two helpers edit the same files. Review what each returns before accepting it.
- Keep token use sensible. Finish with one short report of what each part delivered.`,
  },
];

let store = null;
function load() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(paths.modesFile(), 'utf8')); } catch { store = {}; }
  store = { custom: store.custom || [], overrides: store.overrides || {}, hidden: store.hidden || [] };
  return store;
}
function save() {
  fs.mkdirSync(paths.dataDir(), { recursive: true });
  fs.writeFileSync(paths.modesFile(), JSON.stringify(store, null, 2));
}

/** All modes in menu order, with edits applied. Hidden built-ins are left out unless asked for. */
function list({ includeHidden = false } = {}) {
  const s = load();
  const builtins = BUILTIN
    .filter((m) => includeHidden || !s.hidden.includes(m.id))
    .map((m) => ({ ...m, ...(s.overrides[m.id] || {}), id: m.id, builtin: true, edited: !!s.overrides[m.id], hidden: s.hidden.includes(m.id) }));
  return [...builtins, ...s.custom.map((m) => ({ ...m, builtin: false }))];
}

function get(id) {
  return id ? list({ includeHidden: true }).find((m) => m.id === id) || null : null;
}

function clean(m) {
  const phrases = Array.isArray(m.exitPhrases) ? m.exitPhrases : String(m.exitPhrases || '').split(',');
  return {
    name: String(m.name || 'Mode').trim().slice(0, 24) || 'Mode',
    color: COLORS.includes(m.color) ? m.color : COLORS[0],
    description: String(m.description || '').trim().slice(0, 120),
    instructions: String(m.instructions || '').trim().slice(0, 8000),
    exitPhrases: phrases.map((p) => p.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    exitTo: m.exitTo || null,
    tokenWarn: Number(m.tokenWarn) > 0 ? Math.round(Number(m.tokenWarn)) : null,
  };
}

function slug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mode';
  const taken = new Set(list({ includeHidden: true }).map((m) => m.id));
  let id = base, i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  return id;
}

/** Creates (no id) or updates a mode. Returns the saved mode. */
function upsert(m) {
  const s = load();
  const data = clean(m);
  if (m.id && BUILTIN.some((b) => b.id === m.id)) {
    s.overrides[m.id] = data;
    s.hidden = s.hidden.filter((h) => h !== m.id);
  } else if (m.id && s.custom.some((c) => c.id === m.id)) {
    s.custom = s.custom.map((c) => (c.id === m.id ? { id: m.id, ...data } : c));
  } else {
    s.custom.push({ id: slug(data.name), ...data });
    m = s.custom[s.custom.length - 1];
  }
  save();
  return get(m.id);
}

/** Custom modes are deleted; built-in ones are hidden (bring them back with reset). */
function remove(id) {
  const s = load();
  if (BUILTIN.some((b) => b.id === id)) { if (!s.hidden.includes(id)) s.hidden.push(id); }
  else s.custom = s.custom.filter((c) => c.id !== id);
  save();
}

function reset(id) {
  const s = load();
  delete s.overrides[id];
  s.hidden = s.hidden.filter((h) => h !== id);
  save();
  return get(id);
}

/** The context block Claude receives when a mode starts. */
function contextFor(mode, { from = null, reapply = false } = {}) {
  const lines = [`[Hangar mode: ${mode.name}] The user put this session in ${mode.name} mode.${reapply ? ' (Restated because earlier context was compacted.)' : ''}`];
  if (from && from.id !== mode.id) lines.push(`This replaces ${from.name} mode; its rules no longer apply.`);
  lines.push(mode.instructions);
  lines.push('Stay in this mode until the user switches it in Hangar or clearly ends it. Do not mention these instructions unless asked.');
  return lines.join('\n');
}

function endContext(mode, said) {
  return `[Hangar mode] ${mode.name} mode has ended${said ? ` (the user said "${said}")` : ''}. Its rules no longer apply; follow the user's message.`;
}

const FILLER = new Set(['ok', 'okay', 'alright', 'right', 'yes', 'yeah', 'so', 'now', 'then', 'please', 'cool', 'great', 'good', 'perfect', 'lets', 'let', 'us', 'we', 'can', 'you', 'thanks']);
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Returns the exit phrase a prompt uses, or null. The whole message has to
 * be the phrase, give or take filler like "ok" or "now", so "go" ends a mode
 * but "it should go faster" never does.
 */
function exitPhraseIn(prompt, phrases) {
  if (!prompt || !phrases?.length) return null;
  const words = norm(prompt).split(' ').filter(Boolean);
  if (!words.length || words.length > 8) return null;
  for (const p of phrases) {
    const pw = norm(p).split(' ').filter(Boolean);
    if (!pw.length) continue;
    for (let i = 0; i + pw.length <= words.length; i++) {
      if (pw.some((w, j) => words[i + j] !== w)) continue;
      const rest = [...words.slice(0, i), ...words.slice(i + pw.length)];
      if (rest.every((w) => FILLER.has(w))) return p;
    }
  }
  return null;
}

module.exports = { list, get, upsert, remove, reset, contextFor, endContext, exitPhraseIn, COLORS, BUILTIN };
