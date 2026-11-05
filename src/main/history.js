// Past conversations of a folder, read from Claude Code's transcripts on disk
// (<claude dir>/projects/<slug>/*.jsonl). The format is internal to Claude Code,
// so every field is optional and unknown lines are skipped. Nothing is written.
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const paths = require('../shared/paths');

/** Claude Code's folder name for a working directory: every non-alphanumeric becomes "-". */
function slugFor(cwd) {
  return String(cwd).replace(/[^a-zA-Z0-9]/g, '-');
}

function projectDir(cwd, root) {
  return path.join(root || path.join(paths.claudeDir(), 'projects'), slugFor(cwd));
}

/** The visible text of a user entry, or '' for tool results and non-text. */
function userText(j) {
  const c = j && j.message && j.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text').map((x) => x.text).join(' ');
  return '';
}

/** True for a prompt a person typed: not meta, not a side chain, not a system or command wrapper. */
function isRealPrompt(j) {
  if (!j || j.type !== 'user' || j.isMeta || j.isSidechain) return false;
  const t = userText(j).trim();
  if (!t) return false;
  if (t.startsWith('<') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted')) return false;
  return true;
}

function clean(t, n) { return t.replace(/\s+/g, ' ').trim().slice(0, n); }

const COUNT_RE = /"type":"(?:user|assistant)"|"tool_result"|"isMeta":true|"content":"<(?:command-|local-command)/g;

/** Counts messages by scanning the text (no line splitting) and finds the first real prompt in the head. */
async function summarize(file, st) {
  let first = null;
  let cwd = null;
  let count = 0;
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let pos = 0;
    let carry = '';
    let head = true;
    const dec = new StringDecoder('utf8'); // keeps a character split across chunks whole
    while (pos < st.size) {
      const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const text = carry + dec.write(buf.subarray(0, bytesRead));
      const cut = text.lastIndexOf('\n');
      const body = cut < 0 ? text : text.slice(0, cut);
      carry = cut < 0 ? '' : text.slice(cut + 1);
      if (head && !first) {
        for (const line of body.split('\n')) {
          if (!line.includes('"type":"user"')) continue;
          try {
            const j = JSON.parse(line);
            if (!cwd && j.cwd) cwd = j.cwd;
            if (isRealPrompt(j)) { first = clean(userText(j), 200); break; }
          } catch {}
        }
      }
      head = false;
      // user + assistant entries, minus tool results, meta and command wrappers
      for (const m of body.matchAll(COUNT_RE)) {
        if (m[0].startsWith('"type"')) count++;
        else count--;
      }
    }
  } finally { await fd.close(); }
  return { first, count: Math.max(0, count), cwd };
}

const cache = new Map();   // file -> { mtimeMs, size, summary }

/** Past conversations for a folder, newest first. opts.root overrides the projects folder (tests). */
async function list(cwd, opts) {
  const dir = projectDir(cwd, opts && opts.root);
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { return []; }
  const out = [];
  for (const f of names) {
    const file = path.join(dir, f);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    let c = cache.get(file);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      try { c = { mtimeMs: st.mtimeMs, size: st.size, summary: await summarize(file, st) }; } catch { continue; }
      cache.set(file, c);
    }
    if (!c.summary.first && !c.summary.count) continue;
    out.push({
      sessionId: f.replace(/\.jsonl$/, ''), firstPrompt: c.summary.first, lastActivity: st.mtimeMs,
      messageCount: c.summary.count, size: st.size,
    });
  }
  out.sort((a, b) => b.lastActivity - a.lastActivity);
  return out;
}

const SEARCH_CAPS = { results: 60, perFile: 3, maxFileBytes: 200 * 1024 * 1024, ms: 4000 };

/**
 * Text search across a folder's transcripts. Streams each file, looks only at
 * user and assistant text, and stops at the caps. Returns
 * [{ sessionId, role, snippet, at }], newest conversations first.
 */
async function search(cwd, query, opts) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const caps = { ...SEARCH_CAPS, ...(opts && opts.caps) };
  const dir = projectDir(cwd, opts && opts.root);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => {
      const file = path.join(dir, f);
      const st = fs.statSync(file);
      return { f, file, st };
    });
  } catch { return []; }
  files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const deadline = Date.now() + caps.ms;
  const out = [];
  const needle = JSON.stringify(q).slice(1, -1);     // as it appears inside a JSON string
  for (const { f, file, st } of files) {
    if (out.length >= caps.results || Date.now() > deadline) break;
    if (st.size > caps.maxFileBytes) continue;
    let perFile = 0;
    const fd = await fs.promises.open(file, 'r');
    try {
      const buf = Buffer.alloc(512 * 1024);
      let pos = 0;
      let carry = '';
      const dec = new StringDecoder('utf8');
      outer: while (pos < st.size) {
        const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const text = carry + dec.write(buf.subarray(0, bytesRead));
        const cut = text.lastIndexOf('\n');
        carry = cut < 0 ? '' : text.slice(cut + 1);
        const body = cut < 0 ? text : text.slice(0, cut);
        const lower = body.toLowerCase();
        if (!lower.includes(needle) && !lower.includes(q)) continue;
        const lines = body.split('\n');
        for (const line of lines) {
          if (!line.toLowerCase().includes(needle) && !line.toLowerCase().includes(q)) continue;
          if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
          let j;
          try { j = JSON.parse(line); } catch { continue; }
          if (j.isSidechain || j.isMeta) continue;
          const c = j.message && j.message.content;
          const text = typeof c === 'string' ? c
            : Array.isArray(c) ? c.filter((x) => x && x.type === 'text').map((x) => x.text).join(' ') : '';
          const i = text.toLowerCase().indexOf(q);
          if (i < 0) continue;
          const from = Math.max(0, i - 50);
          out.push({
            sessionId: f.replace(/\.jsonl$/, ''), role: j.type,
            snippet: (from ? '…' : '') + clean(text.slice(from, i + q.length + 90), 160), at: Date.parse(j.timestamp) || st.mtimeMs,
          });
          if (++perFile >= caps.perFile || out.length >= caps.results) break outer;
        }
        if (Date.now() > deadline) break;
      }
    } finally { await fd.close(); }
  }
  return out;
}

module.exports = { slugFor, projectDir, isRealPrompt, userText, list, search };
