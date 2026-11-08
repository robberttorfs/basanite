// Usage history: tokens and an estimated cost per day and per project, summed
// from the assistant messages in Claude Code's transcripts. Scans are incremental
// (each file is read once, then only its new bytes) and cached on disk.
// Cost is an estimate from public per-token prices; the transcripts carry no cost.
const fs = require('fs');
const path = require('path');
const paths = require('../shared/paths');

// USD per million tokens: input, output. Cache reads cost 0.1x input, cache writes 1.25x (5 min) or 2x (1 h).
const PRICES = [
  [/opus/i, 5, 25],
  [/sonnet/i, 3, 15],
  [/haiku/i, 1, 5],
];
const DEFAULT_PRICE = [3, 15];

function priceFor(model) {
  for (const [re, i, o] of PRICES) if (re.test(model || '')) return [i, o];
  return DEFAULT_PRICE;
}

/** Tokens and cost of one assistant usage object. */
function costOf(model, u) {
  const [pi, po] = priceFor(model);
  const cc = u.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cost = (input * pi + output * po + cacheRead * pi * 0.1 + w5m * pi * 1.25 + w1h * pi * 2) / 1e6;
  return { input, output, cacheRead, cacheWrite: w5m + w1h, costUSD: cost };
}

function dayOf(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ZERO = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUSD: 0, messages: 0 });
function addTo(a, b, sign = 1) {
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'costUSD', 'messages']) a[k] += sign * (b[k] || 0);
}

/**
 * Parses new transcript text into the per-file record: { days: {day: totals}, lastId, last }.
 * One assistant message appears on several lines with growing usage; the last line of an id wins,
 * also across incremental reads (the previous last entry is taken back first when its id repeats).
 */
function ingest(rec, lines) {
  const byId = new Map();
  const order = [];
  for (const line of lines) {
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const m = j.message;
    if (!m || !m.usage || m.model === '<synthetic>') continue;
    if (j.cwd && !rec.cwd) rec.cwd = j.cwd;
    const id = m.id || j.requestId || j.uuid;
    const day = dayOf(j.timestamp);
    if (!day) continue;
    if (!byId.has(id)) order.push(id);
    byId.set(id, { day, ...costOf(m.model, m.usage), messages: 1 });
  }
  for (const id of order) {
    const e = byId.get(id);
    if (rec.lastId === id && rec.last) {
      const d = rec.days[rec.last.day];
      if (d) addTo(d, rec.last, -1);
    }
    const d = (rec.days[e.day] ||= ZERO());
    addTo(d, e);
    rec.lastId = id;
    rec.last = e;
  }
}

class Usage {
  constructor(o) {
    const { root, cacheFile } = o || {};
    this.root = root || path.join(paths.claudeDir(), 'projects');
    this.cacheFile = cacheFile || path.join(paths.dataDir(), 'usage-cache.json');
    this.files = null;     // path -> { size, offset, project, cwd, days, lastId, last }
    this.running = null;
  }

  load() {
    if (this.files) return;
    try { this.files = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')).files || {}; } catch { this.files = {}; }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify({ v: 1, files: this.files }));
    } catch {}
  }

  /** Reads what is new in every transcript touched since `sinceMs`. Awaits between files so the app stays responsive. */
  async scan(sinceMs) {
    this.load();
    let projects = [];
    try { projects = fs.readdirSync(this.root); } catch { return; }
    let dirty = false;
    for (const proj of projects) {
      const dir = path.join(this.root, proj);
      for (const file of transcriptFiles(dir)) {
        let st;
        try { st = fs.statSync(file); } catch { continue; }
        let rec = this.files[file];
        if (!rec && st.mtimeMs < sinceMs) continue;
        if (!rec || st.size < rec.offset) rec = this.files[file] = { size: 0, offset: 0, project: proj, cwd: null, days: {}, lastId: null, last: null };
        if (st.size === rec.offset) continue;
        if (await readNew(file, st.size, rec)) dirty = true;
      }
    }
    if (dirty) this.save();
  }

  /** usage.history(days): per-day and per-project totals for the last `days` days (including today). */
  async history(days) {
    days = Math.max(1, Math.min(365, Number(days) || 30));
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    if (!this.running) this.running = this.scan(cutoff.getTime()).finally(() => { this.running = null; });
    await this.running;
    return this.report(days, cutoff);
  }

  report(days, cutoff) {
    this.load();
    const first = dayOf(cutoff);
    const perDay = new Map();
    const perProject = new Map();
    const total = ZERO();
    for (const [file, rec] of Object.entries(this.files)) {
      for (const [day, t] of Object.entries(rec.days)) {
        if (day < first) continue;
        if (!perDay.has(day)) perDay.set(day, ZERO());
        addTo(perDay.get(day), t);
        const key = rec.cwd || rec.project;
        if (!perProject.has(key)) perProject.set(key, { project: key, name: path.basename(String(key).replace(/\\/g, '/')) || key, ...ZERO() });
        addTo(perProject.get(key), t);
        addTo(total, t);
      }
    }
    const list = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(cutoff);
      d.setDate(d.getDate() + i);
      const k = dayOf(d);
      list.push({ day: k, ...(perDay.get(k) || ZERO()) });
    }
    return {
      days: list,
      projects: [...perProject.values()].sort((a, b) => b.costUSD - a.costUSD),
      total, estimate: true,
    };
  }
}

/** A project folder's transcripts, plus its sessions' subagent transcripts (<session>/subagents/*.jsonl). */
function transcriptFiles(dir) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(dir, e.name));
    else if (e.isDirectory()) {
      const sub = path.join(dir, e.name, 'subagents');
      try { for (const f of fs.readdirSync(sub)) if (f.endsWith('.jsonl')) out.push(path.join(sub, f)); } catch {}
    }
  }
  return out;
}

const CHUNK = 2 * 1024 * 1024;
/**
 * Reads a file's new bytes in chunks, ingesting whole lines only (a half-written
 * last line waits for the next scan). Offsets are counted in bytes, so a UTF-8
 * character split across chunks is never mangled. Returns true if anything was read.
 */
async function readNew(file, size, rec) {
  const fd = await fs.promises.open(file, 'r');
  const start = rec.offset;
  try {
    let pos = rec.offset;
    let carry = Buffer.alloc(0);
    while (pos < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - pos));
      const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      const end = data.lastIndexOf(0x0a);
      if (end < 0) { carry = data; continue; }
      ingest(rec, data.toString('utf8', 0, end).split('\n'));
      rec.offset += end + 1;
      carry = data.subarray(end + 1);
    }
    rec.size = size;
  } finally { await fd.close(); }
  return rec.offset !== start;
}

/**
 * Sessions each report the limits from their own last request, so one can be a little behind
 * another. Usage only rises within a window: keep the highest, and start over when a window resets.
 */
function mergeLimits(prev, next, now = Date.now()) {
  if (!prev) return next;
  const HOUR = 3600000;
  const at = (r) => (r?.resets_at ? r.resets_at * (r.resets_at < 1e12 ? 1000 : 1) : 0);
  const out = { ...prev };
  for (const [key, b] of Object.entries(next || {})) {
    const a = prev[key];
    if (b?.used_percentage == null) continue;
    const ta = at(a), tb = at(b);
    if (a?.used_percentage == null) out[key] = b;
    else if (tb > ta + HOUR && ta) out[key] = b;              // a new window
    else if (ta && tb && tb < ta - HOUR) continue;            // a session still on the old one
    else if (ta && !tb && ta <= now) out[key] = b;            // the window is over and this one has no date
    else if (b.used_percentage >= a.used_percentage) out[key] = b;
  }
  return out;
}

module.exports = { mergeLimits, Usage, costOf, ingest, dayOf, readNew, transcriptFiles };
