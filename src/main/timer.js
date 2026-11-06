// Time budgets. A timer is armed when set while the session is idle and
// starts at the next prompt. The model only ever sees a handful of one-line
// notes: start, a wrap-up warning at 80%, time up at 100%, and at most one
// "you still have time" nudge if it stops very early.
//
// timer = { minutes, startedAt: ms|null, sent: [], finished: bool }

const WRAP_AT = 0.8;
const EARLY_STOP_BEFORE = 0.7;

function mins(m) { return String(Math.max(0, Math.round(m))); }
function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function remaining(timer, now) {
  if (timer.startedAt == null) return timer.minutes;
  return (timer.startedAt + timer.minutes * 60000 - now) / 60000;
}

function fraction(timer, now) {
  if (timer.startedAt == null) return 0;
  return Math.max(0, now - timer.startedAt) / (timer.minutes * 60000);
}

function startNote(timer) {
  return `[Basanite] Time budget for this task: ${mins(timer.minutes)} min (until ${clock(timer.startedAt + timer.minutes * 60000)}). ` +
    'Plan the work to fit and aim to finish with solid, checked work by then. You will get a note when it is time to wrap up.';
}

/**
 * Decides whether a hook event should carry a timer note.
 * Returns { timer, out } where out is null, { context: text } or { block: reason }.
 * The returned timer is a new object; the input is not mutated.
 */
function nudge(input, event, hook, now = Date.now()) {
  if (!input || input.finished) return { timer: input, out: null };
  const t = { ...input, sent: [...input.sent] };
  const agent = hook.agent_id || null;
  const who = agent || 'main';
  let out = null;

  if (event === 'UserPromptSubmit' && !agent) {
    if (t.startedAt == null) { t.startedAt = now; t.sent = []; }
    if (!t.sent.includes('start')) {
      t.sent.push('start');
      out = { context: startNote(t) };
    } else if (remaining(t, now) > 0 && !String(hook.prompt || '').trimStart().startsWith('<')) {
      out = { context: `[Basanite] ${mins(remaining(t, now))} min left of the ${mins(t.minutes)} min budget.` };
    }
  } else if (event === 'PostToolUse') {
    if (t.startedAt == null) return { timer: input, out: null };
    const f = fraction(t, now);
    const r = remaining(t, now);
    if (!agent && !t.sent.includes('start')) {
      // Timer was set while Claude was already working.
      t.sent.push('start');
      out = { context: startNote(t) };
    } else if (f >= 1 && !t.sent.includes(`end:${who}`)) {
      t.sent.push(`end:${who}`, `wrap:${who}`);
      out = { context: agent
        ? '[Basanite] The task\'s time budget is used up. Stop now and report what you have.'
        : '[Basanite] Time budget reached. Finish only the current step, leave everything in a working state, give a short summary of what is done and what is left, then stop.' };
    } else if (f >= WRAP_AT && !t.sent.includes(`wrap:${who}`)) {
      t.sent.push(`wrap:${who}`);
      out = { context: agent
        ? `[Basanite] The task's time budget is nearly used (about ${mins(r)} min left). Wrap up and report back soon.`
        : `[Basanite] About ${mins(r)} min left of ${mins(t.minutes)}. Start wrapping up: finish the piece you are on, check it works, and do not start anything big.` };
    }
  } else if (event === 'Stop' && !agent) {
    if (t.startedAt == null) return { timer: input, out: null };
    const f = fraction(t, now);
    if (f < EARLY_STOP_BEFORE && !hook.stop_hook_active && !t.sent.includes('early')) {
      t.sent.push('early');
      out = { block: `[Basanite] ${mins(remaining(t, now))} of ${mins(t.minutes)} min remain. If worthwhile work toward the task is left (checks, tests, the obvious next part of what was asked), keep going. If the task is fully done, stop and say so. Do not invent extra scope.` };
    } else {
      t.finished = true;
    }
  } else {
    return { timer: input, out: null };
  }
  return { timer: t, out };
}

module.exports = { nudge, remaining, fraction, WRAP_AT };
