// Custom themes on disk (themes.json), import and export, and asking Claude for a theme.
// One `claude -p` per message: no tools, no MCP servers, no settings, nothing saved, a short
// system prompt, and only the last few turns. A reply costs very few tokens.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../shared/paths');
const T = require('../shared/themes');

const file = () => path.join(paths.dataDir(), 'themes.json');
let cache = null;

function list() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')).map(T.normalise).filter((t) => t && t.id); } catch { cache = []; }
  return cache;
}
function write() {
  fs.mkdirSync(paths.dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 1));
}
function save(raw) {
  const t = T.normalise(raw);
  if (!t) throw new Error('That theme has no valid colours.');
  t.id = t.id || `custom-${crypto.randomBytes(5).toString('hex')}`;
  const all = list();
  const i = all.findIndex((x) => x.id === t.id);
  if (i >= 0) all[i] = t; else all.push(t);
  write();
  return t;
}
function remove(id) {
  cache = list().filter((t) => t.id !== id);
  write();
}
function active(settings, osLight) { return T.resolve(settings?.theme, list(), osLight); }

const SYSTEM_PROMPT = `You design colour themes for a desktop app that shows terminal sessions in tiles.
Reply with only one JSON object, no markdown:
{"say":"one short sentence to the user","theme":{"name":"Short name","base":"dark or light","bg":"#rrggbb","tile":"#rrggbb","text":"#rrggbb","accent":"#rrggbb","needs":"#rrggbb","done":"#rrggbb","error":"#rrggbb","ov":"#rrggbb","termBg":"#rrggbb","ansi":["16 #rrggbb: black red green yellow blue magenta cyan white, then the bright versions"]}}
bg is the window, tile is each session panel, close to bg. termBg is the terminal, usually equal to tile. needs marks a session waiting for the user and must stand out from everything else. done is success, error is failure, ov is a secondary accent. Text must be easy to read. ANSI colours must look good on termBg and be clearly different from each other. Keep the look cohesive and restrained unless asked otherwise. Change only what the request implies.`;

const MODELS = ['haiku', 'sonnet'];

/** The prompt for one message: the current colours, then the last few turns. */
function buildPrompt({ current, history, message }) {
  const turns = (history || []).slice(-4).map((m) => `${m.role === 'you' ? 'User' : 'You'}: ${String(m.text).slice(0, 300)}`).join('\n');
  return `Current theme: ${JSON.stringify(current)}\n${turns ? `Earlier:\n${turns}\n` : ''}Request: ${String(message).slice(0, 800)}`;
}

/** Arguments for the one-shot call; the prompt and system file are passed in. */
function claudeArgs({ prompt, systemFile, model }) {
  return ['-p', prompt, '--model', MODELS.includes(model) ? model : MODELS[0], '--output-format', 'json', '--no-session-persistence',
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--system-prompt-file', systemFile];
}

/** run(args, dir) resolves with the CLI's stdout. Returns { say, theme, tokens, costUsd } or throws a plain message. */
async function generate({ current, history, message, model }, run) {
  const dir = path.join(paths.dataDir(), 'theme-studio');
  fs.mkdirSync(dir, { recursive: true });
  const systemFile = path.join(dir, 'system.txt');
  fs.writeFileSync(systemFile, SYSTEM_PROMPT);
  const out = await run(claudeArgs({ prompt: buildPrompt({ current, history, message }), systemFile, model }), dir);
  let j;
  try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { throw new Error('Claude Code gave an answer that could not be read. Try again.'); }
  if (j.is_error) throw new Error(String(j.result || 'Claude Code reported an error.').slice(0, 240));
  const parsed = T.parseReply(j.result);
  if (!parsed) throw new Error('Claude did not send back a usable theme. Try saying it another way.');
  const u = j.usage || {};
  return { ...parsed, tokens: (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), costUsd: j.total_cost_usd || 0 };
}

module.exports = { list, save, remove, active, generate, buildPrompt, claudeArgs, SYSTEM_PROMPT, MODELS, _reset: () => { cache = null; } };
