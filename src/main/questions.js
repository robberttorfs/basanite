// Questions Claude asks with AskUserQuestion, answered from the clean view.
// The PreToolUse hook stays open while the card is on screen; the reply carries
// the answers in updatedInput, so Claude Code never draws its own menu. Letting
// go without an answer (input we can't read, hook timed out) simply lets Claude
// Code draw that menu in the terminal. Once drawn, a menu can't be taken back, so
// the card is used in both views and switching view never touches the question.
'use strict';

const crypto = require('crypto');

const TOOL = 'AskUserQuestion';
const HOLD_SECONDS = 24 * 60 * 60; // past this Claude Code gives up on the hook and shows its menu
const SKIPPED = '(The user skipped this question. Use your own judgement.)';
const MAX_ANSWER = 20000;

/** The questions in a tool input, tidied for the card, or null if they can't be shown safely. */
function parse(input) {
  const list = input?.questions;
  if (!Array.isArray(list) || !list.length || input.answers) return null;
  const seen = new Set();
  const out = [];
  for (const q of list) {
    if (typeof q?.question !== 'string' || !q.question.trim() || seen.has(q.question)) return null;
    if (!Array.isArray(q.options) || !q.options.length) return null;
    seen.add(q.question);
    const labels = new Set();
    const options = [];
    for (const o of q.options) {
      if (typeof o?.label !== 'string' || !o.label || labels.has(o.label)) return null;
      labels.add(o.label);
      options.push({ label: o.label, description: typeof o.description === 'string' ? o.description : '', preview: typeof o.preview === 'string' ? o.preview : '' });
    }
    out.push({ question: q.question, header: typeof q.header === 'string' ? q.header : '', multiSelect: !!q.multiSelect, options });
  }
  return out;
}

/** Should this hook wait for the card? Only Claude's own questions, never a subagent's. */
function shouldHold(hook) {
  return hook?.hook_event_name === 'PreToolUse' && hook.tool_name === TOOL && !hook.agent_id && !!parse(hook.tool_input);
}

/** Turns the card's picks into Claude Code's answers object, or null if any pick is not valid. */
function buildAnswers(questions, picks) {
  if (!Array.isArray(picks) || picks.length !== questions.length) return null;
  const answers = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const p = picks[i] || {};
    if (p.skipped) { answers[q.question] = SKIPPED; continue; }
    const labels = Array.isArray(p.labels) ? p.labels : [];
    const other = typeof p.other === 'string' ? p.other.trim() : '';
    if (labels.some((l) => !q.options.some((o) => o.label === l)) || other.length > MAX_ANSWER) return null;
    if (!q.multiSelect && labels.length + (other ? 1 : 0) !== 1) return null;
    const parts = q.options.filter((o) => labels.includes(o.label)).map((o) => o.label);
    if (other) parts.push(other);
    if (!parts.length) return null;
    answers[q.question] = parts.join(', '); // the format Claude Code documents for several picks
  }
  return answers;
}

/** The hook reply that answers the tool, keeping anything else the hook had to say. */
function replyBody(input, fields, passthrough) {
  const context = passthrough?.hookSpecificOutput?.additionalContext;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { ...input, ...fields },
      ...(context ? { additionalContext: context } : {}),
    },
  };
}

/** Open questions per tile. onChange(tileId, currentOrNull, waiting): waiting = another question is still open. */
class Holds {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.byTile = new Map();
  }

  current(tileId) {
    const e = this.byTile.get(tileId)?.[0];
    return e ? { id: e.id, questions: e.questions } : null;
  }

  /** Adds a question and returns a promise of the hook reply. Call attach() on it once the session has seen the hook. */
  hold(tileId, hook) {
    let entry;
    const reply = new Promise((resolve) => {
      entry = { id: String(hook.tool_use_id || crypto.randomUUID()), input: hook.tool_input, questions: parse(hook.tool_input), passthrough: null, resolve };
    });
    const queue = this.byTile.get(tileId) || [];
    queue.push(entry);
    this.byTile.set(tileId, queue);
    this.onChange(tileId, this.current(tileId), true);
    return { reply, entry };
  }

  finish(tileId, entry, body) {
    const queue = this.byTile.get(tileId);
    const i = queue ? queue.indexOf(entry) : -1;
    if (i < 0) return false;
    queue.splice(i, 1);
    if (!queue.length) this.byTile.delete(tileId);
    entry.resolve(body);
    const now = this.current(tileId);
    this.onChange(tileId, now, !!now);
    return true;
  }

  entry(tileId, id) { return this.byTile.get(tileId)?.find((e) => e.id === id); }

  /** The card's answers. False if the question has gone or the picks are not valid (the card stays). */
  answer(tileId, id, picks) {
    const e = this.entry(tileId, id);
    const answers = e && buildAnswers(e.questions, picks);
    if (!answers) return false;
    return this.finish(tileId, e, replyBody(e.input, { answers }, e.passthrough));
  }

  /** Words instead of picks (hangarctl send, from the overseer): the answer to every open part. */
  respond(tileId, text) {
    const e = this.byTile.get(tileId)?.[0];
    if (!e) return false;
    const answers = Object.fromEntries(e.questions.map((q) => [q.question, String(text)]));
    return this.finish(tileId, e, replyBody(e.input, { answers }, e.passthrough));
  }

  /** Claude Code stopped waiting (Esc, timeout, the session ended). */
  gone(tileId, entry) { this.finish(tileId, entry, null); }
}

/** One record for the chat feed from the transcript's result of the tool. */
function record(questions, result) {
  const answers = result && typeof result === 'object' ? result.answers : null;
  const list = Array.isArray(questions) ? questions : [];
  const qa = [];
  for (const q of list) {
    const a = answers?.[q?.question];
    if (a === undefined || a === null) continue;
    qa.push({ question: String(q.question), skipped: a === SKIPPED, answer: a === SKIPPED ? '' : Array.isArray(a) ? a.join(', ') : String(a) });
  }
  return qa;
}

module.exports = { TOOL, HOLD_SECONDS, SKIPPED, parse, shouldHold, buildAnswers, replyBody, Holds, record };
