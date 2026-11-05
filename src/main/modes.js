// Session modes: a named set of working instructions applied to a session.
// A mode is sent once, as hidden context on the next prompt after it is
// picked (and again after a compaction or /clear wipes it). Built-in modes
// can be edited, reset or hidden; custom ones live next to them.
// Add-ons (kind 'addon') stack on top of any mode and are sent the same way:
// once when turned on, restated after a compaction, never per message.
const fs = require('fs');
const paths = require('../shared/paths');

const { PALETTE: COLORS, migrate: migrateColor } = require('../shared/palette');

// cost: token cost dots on the card (0 to 3). guard: a real limit enforced by Hangar's
// PreToolUse hook (see guards.js). shelf: the first 7 in the library, in this order.
// Our own text; methods credited: Test first, Debug and Verify at end follow Superpowers
// (MIT, github.com/obra/superpowers); Spec first follows Spec Kit (MIT, github.com/github/spec-kit);
// Until done wraps Claude Code's own /goal.
const BUILTIN = [
  {
    id: 'notes', name: 'Notes', color: '#b3907a', icon: 'list', cost: 0, shelf: 1,
    description: 'Collect notes in a numbered list. No work until you say start.',
    exitPhrases: ['start', 'go', 'begin', 'get started', 'discuss', 'lets discuss'],
    instructions: `The user is giving you notes one at a time. Only record them.
- Add each note to a numbered list in a notes file in the project (reuse an existing one, for example docs/NOTES.md, and continue its numbering).
- Keep every detail the user meant; tidy the wording only. If a note refines an earlier one, update that entry.
- Reply in one or two short lines: what you noted and its number.
- Do not edit code, run builds, start agents or begin the work.
- When the user says start (or similar), ask any final questions at once, then do what they say.`,
  },
  {
    id: 'plan', name: 'Plan', color: '#8ab4ff', icon: 'map', cost: 0, shelf: 2, guard: 'readonly',
    description: 'Discuss and plan only. No changes until you say go ahead.',
    exitPhrases: ['go ahead', 'go', 'start', 'build it', 'do it'],
    instructions: `Planning and discussion only. File changes are blocked until the user says go ahead.
- Read whatever you need. Do not change files or state.
- When there is a choice, recommend one option and say why in a sentence.
- Keep answers short and plain. Use a small table to compare.
- Ask questions only when the answer changes the plan, all at once.
- When the user says go ahead, build the agreed plan.`,
  },
  {
    id: 'build', name: 'Build', color: '#b9d36c', icon: 'hammer', cost: 1, shelf: 3,
    description: 'Hands-off build. Questions first, then start to finish, one report.',
    exitPhrases: [],
    instructions: `Autonomous build. The user will read your report later.
- Ask all your questions in your first reply. After that, never stop to wait.
- Decide reasonable things yourself; keep a short list of the debatable ones.
- Work in phases, test as you go, fix what you break.
- Keep progress notes in the project so the work can resume.
- Work on a branch. Never deploy, merge to main or touch production without approval.
- End with one short report: done, decided, what to check, what is left.`,
  },
  {
    id: 'overnight', name: 'Overnight', color: '#8ab4ff', icon: 'moon', cost: 2, shelf: 4,
    description: 'Unsupervised. Never waits on you. Safe choices, morning report.',
    exitPhrases: [], tokenWarn: 1000,
    instructions: `Overnight run. Nobody will answer until morning, so never end a turn on a question.
- First write the goal and a checklist into a progress file (for example docs/OVERNIGHT.md) and keep it current.
- When unsure, take the safest, most reversible option, note it under Decisions, carry on.
- Work on a branch in small steps. Prove each step works (tests, build or the app in isolation), then commit it.
- If an approach fails twice, note what you tried, move on, return at the end if time allows.
- Hard limits: no deploying, publishing, merging to main, pushing shared branches, messaging anyone, spending money, touching production data, other sessions or their ports. No destructive commands on work you did not create.
- Keep tokens and paid calls lean. Helper agents only for clearly independent work.
- Finish with a short morning report at the top of the progress file: done, what to try first, decisions to check, what is left.`,
  },
  {
    id: 'review', name: 'Review', color: '#6fd4e0', icon: 'search', cost: 1, shelf: 5, guard: 'readonly',
    description: 'Read-only audit. Findings ranked, no edits.',
    exitPhrases: ['fix', 'fix it', 'fix them', 'fix them all', 'now fix it'],
    instructions: `Read-only review. File changes are blocked; read-only commands are fine.
- Go through the target piece by piece: keep, cut or change, one line of reason each.
- Rank findings by impact. Be concrete: file and line or screen, and what is wrong.
- No padding, no praise.
- When the user says fix, fix the findings they choose.`,
  },
  {
    id: 'careful', name: 'Careful', color: '#f28fc3', icon: 'shield', cost: 0, shelf: 6, guard: 'risky',
    description: 'Near live systems. Local only; pushes and deploys are blocked.',
    exitPhrases: [],
    instructions: `Careful mode: this work is close to live systems. Pushes, deploys and destructive commands are blocked.
- Work locally or on a branch. Never deploy, publish, merge to main or push without an explicit yes here.
- Production databases and services: read-only queries only, when needed.
- Keep paid API calls and tests to the minimum that proves the change.
- Never kill processes broadly. Do not touch other sessions, ports or running apps; test in isolation.
- Commit with explicit paths. No git add -A, bare git stash or force pushes.
- Ask before anything hard to undo.`,
  },
  {
    id: 'until-done', name: 'Until done', color: '#6fd4e0', icon: 'target', cost: 2, shelf: 7, goal: true,
    description: 'Keeps going turn after turn until a check you name passes.',
    exitPhrases: [], tokenWarn: 500,
    instructions: `Until done: work toward the goal the user set with /goal until it is met.
- Each turn, make real progress, then show the evidence the goal asks for (test output, exit code, a count), so the check can judge it.
- Say each turn how far you are against the turn limit.
- If the goal cannot be met (missing access, a decision only the user can make), say so in one line and stop.
- If no /goal is set, treat the user's next message as the goal and keep working until it is verifiably met; stop after 20 tool steps without progress.`,
  },
  {
    id: 'test-first', name: 'Test first', color: '#b9d36c', icon: 'flask', cost: 1,
    description: 'Failing test first, then the smallest code that passes.',
    exitPhrases: [],
    instructions: `Test first, for every change:
- Write a test for the behaviour and run it. It must fail, for the right reason. Never skip this.
- Write the smallest code that makes it pass. Run the tests again.
- Tidy with the tests green. Add no behaviour that no test asks for.
- A bug fix starts with a test that reproduces the bug.
- Report the tests you added and the final run.`,
  },
  {
    id: 'debug', name: 'Debug', color: '#f28fc3', icon: 'bug', cost: 1,
    description: 'Reproduce, isolate, fix the cause, prove it.',
    exitPhrases: [],
    instructions: `Debug: find the root cause before changing anything.
- Reproduce it first: the smallest reliable steps or a failing test.
- Isolate: one hypothesis at a time, checked with evidence (logs, bisect, a probe). No guessing edits.
- Fix the cause, not the symptom, in as few lines as possible.
- Prove it: the repro passes, a regression test is added, the wider tests pass.
- If three fixes fail, stop and question the approach instead of piling on.
- Report: cause, fix, proof.`,
  },
  {
    id: 'spec-first', name: 'Spec first', color: '#8ab4ff', icon: 'doc', cost: 1,
    description: 'Spec, plan and task list in files, then build task by task.',
    exitPhrases: [],
    instructions: `Spec first.
- Write docs/spec/SPEC.md: what and why, behaviour, acceptance checks, out of scope. Ask open questions all at once and wait.
- Then docs/spec/PLAN.md (approach, files, risks) and docs/spec/TASKS.md (small numbered tasks, each with its check).
- Build one task at a time, tick it off, run its check.
- If building shows the spec is wrong, fix the spec first, then the code.
- End with every acceptance check and its result.`,
  },
  {
    id: 'phased', name: 'Phased', color: '#6fd4e0', icon: 'steps', cost: 1,
    description: 'Build in phases and stop for approval after each one.',
    exitPhrases: [],
    instructions: `Build in phases with a checkpoint after each.
- Start with a short plan split into phases. Keep to it.
- One phase at a time. At its end, say it is finished, what changed in a few lines, and where to check it.
- Then stop and wait until the user says next.
- Keep progress notes in the project so work can resume.`,
  },
  {
    id: 'refine', name: 'Refine', color: '#f28fc3', icon: 'loop', cost: 3,
    description: 'Expert review, fix, review again, until it is genuinely good.',
    exitPhrases: [], tokenWarn: 500,
    instructions: `Refine loop: review and fix in rounds until the work is genuinely good.
- Pick 4 to 6 experts that fit the work, one field each (for example UX, visual design, correctness, performance, security, copy). Run independent reviews as helper agents, each given only its field.
- Each round, every expert scores each area 1 to 10 and lists concrete problems (where, what, why). Merge, drop duplicates, rank by impact.
- Fix the top problems first and check each fix. Prefer removing clutter to adding features.
- Keep a scoreboard in docs/REFINE.md: round, scores per area, fixed, open.
- Stop when every area scores 8 or more and a round finds nothing important, or two rounds barely move. Hard stop after 6 rounds.
- Start each round with rounds done and rough tokens used. Stop early if a round would cost a lot for little gain.
- End with final scores, what changed, and what needs a human decision.`,
  },
  {
    id: 'crew', name: 'Crew', color: '#b8bec9', icon: 'crew', cost: 3,
    description: 'Split a big job across helper agents and coordinate them.',
    exitPhrases: [],
    instructions: `Crew mode: you lead, helper agents do the work.
- Split the job into independent parts. Brief each subagent: goal, files it owns, shared rules, what to return.
- Strongest model for design, UI and risky work; a lighter one for routine code. A few at a time.
- Never let two helpers edit the same files. Review what each returns before accepting it.
- Keep tokens sensible. End with one short report per part.`,
  },
  // Add-ons: stack on top of any mode, sent the same way.
  {
    id: 'verify', kind: 'addon', name: 'Verify at end', color: '#b9d36c', icon: 'check', cost: 1,
    description: 'Prove it works before saying done.',
    instructions: 'Before you say a task is done, run the real check (tests, build, or the app itself) and show the result in a line or two. Say plainly what you could not verify.',
  },
  {
    id: 'commits', kind: 'addon', name: 'Tidy commits', color: '#b3907a', icon: 'commit', cost: 0,
    description: 'Small commits, explicit paths, never main.',
    instructions: 'Commit each working step on its own: explicit paths (never git add -A), a clear one-line message, no secrets, never on main or a shared branch.',
  },
  {
    id: 'quiet', kind: 'addon', name: 'Quiet', color: '#b8bec9', icon: 'quiet', cost: 0,
    description: 'Short replies. Result first, no recap.',
    instructions: 'Keep replies short: the result first, no preamble, no recap of what you did unless asked.',
  },
];

let store = null;
function load() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(paths.modesFile(), 'utf8')); } catch { store = {}; }
  store = { custom: store.custom || [], overrides: store.overrides || {}, hidden: store.hidden || [], projects: store.projects || {} };
  // Colours saved before the status colours left the palette move to the nearest allowed one.
  for (const m of [...store.custom, ...Object.values(store.overrides)]) if (m && m.color) m.color = migrateColor(m.color, COLORS[0]);
  return store;
}
function save() {
  fs.mkdirSync(paths.dataDir(), { recursive: true });
  fs.writeFileSync(paths.modesFile(), JSON.stringify(store, null, 2));
}
/** Tests only: forget the cached store so the next call reads the file again. */
function _reload() { store = null; }

const GUARDS = ['readonly', 'risky'];
const isAddon = (m) => m?.kind === 'addon';

/** All modes and add-ons in library order, with edits applied. Hidden built-ins are left out unless asked for. */
function list({ includeHidden = false } = {}) {
  const s = load();
  const builtins = BUILTIN
    .filter((m) => includeHidden || !s.hidden.includes(m.id))
    .map((m) => ({
      ...m, ...(s.overrides[m.id] || {}),
      id: m.id, kind: m.kind || 'mode', icon: (s.overrides[m.id] || {}).icon || m.icon, goal: !!m.goal, shelf: m.shelf || 0,
      builtin: true, edited: !!s.overrides[m.id], hidden: s.hidden.includes(m.id),
    }));
  return [...builtins, ...s.custom.map((m) => ({ ...m, kind: m.kind || 'mode', builtin: false }))];
}
const listModes = (o) => list(o).filter((m) => !isAddon(m));
const listAddons = (o) => list(o).filter(isAddon);

function get(id) {
  return id ? list({ includeHidden: true }).find((m) => m.id === id) || null : null;
}

function clean(m) {
  const phrases = Array.isArray(m.exitPhrases) ? m.exitPhrases : String(m.exitPhrases || '').split(',');
  const cost = Number(m.cost);
  return {
    kind: isAddon(m) ? 'addon' : 'mode',
    name: String(m.name || 'Mode').trim().slice(0, 24) || 'Mode',
    color: migrateColor(m.color, COLORS[0]),
    icon: /^[a-z]{2,12}$/.test(m.icon || '') ? m.icon : null,
    cost: Number.isFinite(cost) ? Math.max(0, Math.min(3, Math.round(cost))) : 1,
    guard: GUARDS.includes(m.guard) ? m.guard : null,
    description: String(m.description || '').trim().slice(0, 120),
    instructions: String(m.instructions || '').trim().slice(0, 8000),
    exitPhrases: isAddon(m) ? [] : phrases.map((p) => String(p).trim().toLowerCase()).filter(Boolean).slice(0, 12),
    exitTo: isAddon(m) ? null : m.exitTo || null,
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

/** Creates (no id) or updates a mode or add-on. Returns the saved one. */
function upsert(m) {
  const s = load();
  const builtin = m.id && BUILTIN.find((b) => b.id === m.id);
  const data = clean(builtin ? { ...m, kind: builtin.kind } : m);
  if (builtin) {
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

// ---------- per-project default ----------
// A folder remembers the last mode picked for a session in it; new sessions there start in it.
const projectKey = (dir) => String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
function projectDefault(dir) {
  const id = load().projects[projectKey(dir)];
  const m = get(id);
  return m && !isAddon(m) && !m.hidden && !m.goal ? m.id : null;
}
function setProjectDefault(dir, id) {
  const s = load();
  const key = projectKey(dir);
  if (!key) return;
  const m = get(id);
  if (m?.goal) return; // Until done is never a folder default; the folder keeps its last pick
  if (m && !isAddon(m)) s.projects[key] = m.id; else delete s.projects[key];
  save();
}

// ---------- sharing as a file ----------
const FILE_EXT = '.hangar-mode.json';
const FILE_FIELDS = ['kind', 'name', 'color', 'icon', 'cost', 'guard', 'description', 'instructions', 'exitPhrases', 'tokenWarn'];

/** A mode as the plain JSON written to a .hangar-mode.json file. */
function toFile(m) {
  const c = clean(m);
  const out = { hangarMode: 1 };
  for (const k of FILE_FIELDS) if (c[k] != null && !(Array.isArray(c[k]) && !c[k].length)) out[k] = c[k];
  return out;
}

/** Reads a .hangar-mode.json body (string or object). Throws on anything that is not one. */
function fromFile(body) {
  let j = body;
  if (typeof body === 'string') { try { j = JSON.parse(body); } catch { throw new Error('Not a mode file.'); } }
  if (!j || typeof j !== 'object' || j.hangarMode !== 1) throw new Error('Not a mode file.');
  if (!String(j.instructions || '').trim()) throw new Error('This mode has no instructions.');
  const picked = {};
  for (const k of FILE_FIELDS) if (j[k] != null) picked[k] = j[k];
  return clean(picked);
}

/** Imports a mode file as a new custom mode (never overwrites one). */
function importFile(body) {
  const data = fromFile(body);
  return upsert({ ...data, id: null });
}

/** Rough size of what Claude receives, in tokens (chars / 4). */
const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

// ---------- what Claude receives ----------

/** The context block Claude receives when a mode starts. */
function contextFor(mode, { from = null, reapply = false } = {}) {
  const lines = [`[Hangar mode: ${mode.name}] The user put this session in ${mode.name} mode.${reapply ? ' (Restated because earlier context was compacted.)' : ''}`];
  if (from && from.id !== mode.id) lines.push(`This replaces ${from.name} mode; its rules no longer apply.`);
  lines.push(mode.instructions);
  lines.push('Stay in this mode until the user switches it in Hangar or clearly ends it. Do not mention these instructions unless asked.');
  return lines.join('\n');
}

/** One block for the add-ons starting now (or restated after a compaction). */
function addonContext(list, { reapply = false } = {}) {
  if (!list.length) return null;
  const head = `[Hangar add-on${list.length > 1 ? 's' : ''}] On top of any mode, until the user turns ${list.length > 1 ? 'them' : 'it'} off in Hangar${reapply ? ' (restated after compaction)' : ''}:`;
  return [head, ...list.map((a) => `${a.name}: ${a.instructions}`)].join('\n');
}

function addonEndContext(names) {
  return names.length ? `[Hangar add-on] Turned off: ${names.join(', ')}. ${names.length > 1 ? 'Those rules no' : 'That rule no'} longer apply.` : null;
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

module.exports = {
  list, listModes, listAddons, get, upsert, remove, reset, isAddon,
  contextFor, addonContext, addonEndContext, endContext, exitPhraseIn,
  projectDefault, setProjectDefault, toFile, fromFile, importFile, estimateTokens,
  COLORS, BUILTIN, GUARDS, FILE_EXT, _reload,
};
