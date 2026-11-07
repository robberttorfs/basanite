// Turns a Claude Code transcript into a tidy chat for the clean view: your
// messages, Claude's replies, and tool calls as short steps. Read
// incrementally, and only while a clean view is open. The transcript format is
// internal to Claude Code, so every field is treated as optional.
const fs = require('fs');
const path = require('path');
const { unwrapPasted } = require('../shared/pasted');

const MAX_ITEMS = 1500;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const base = (p) => (p ? path.basename(String(p)) : '');
const firstLine = (s) => String(s || '').split('\n')[0];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return '';
}

/** A short, plain title for a tool call. */
function toolTitle(name, i = {}) {
  switch (name) {
    case 'Read': return { verb: 'Read', obj: base(i.file_path) };
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return { verb: 'Edited', obj: base(i.file_path || i.notebook_path) };
    case 'Write': return { verb: 'Wrote', obj: base(i.file_path) };
    case 'Bash': return i.description ? { verb: i.description, obj: '' } : { verb: 'Ran', obj: clip(firstLine(i.command), 80) };
    case 'Grep': return { verb: 'Searched', obj: clip(String(i.pattern || ''), 60) };
    case 'Glob': return { verb: 'Listed', obj: clip(String(i.pattern || ''), 60) };
    case 'Agent': case 'Task': return { verb: 'Agent', obj: i.description || i.subagent_type || '' };
    case 'WebFetch': return { verb: 'Fetched', obj: clip(String(i.url || ''), 70) };
    case 'WebSearch': return { verb: 'Searched the web', obj: clip(String(i.query || ''), 70) };
    case 'TodoWrite': return { verb: 'Updated the plan', obj: '' };
    case 'Skill': return { verb: 'Skill', obj: i.skill || '' };
    default: return { verb: name.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' '), obj: '' };
  }
}

/** The useful part of a tool's input, for the expanded step. */
function toolDetail(name, i = {}) {
  if (name === 'Bash') return String(i.command || '');
  if (name === 'Edit') return `${i.file_path || ''}\n\n- ${clip(String(i.old_string || ''), 800).replace(/\n/g, '\n- ')}\n+ ${clip(String(i.new_string || ''), 800).replace(/\n/g, '\n+ ')}`;
  if (name === 'Write') return `${i.file_path || ''}\n\n${clip(String(i.content || ''), 1500)}`;
  if (name === 'Read') return String(i.file_path || '');
  if (name === 'TodoWrite' && Array.isArray(i.todos)) return i.todos.map((t) => `${t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'} ${t.content}`).join('\n');
  if (name === 'Agent' || name === 'Task') return clip(String(i.prompt || ''), 1500);
  try { return clip(JSON.stringify(i, null, 2), 1500); } catch { return ''; }
}

function resultText(c) {
  const v = c.content;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (x.type === 'text' ? x.text : x.type === 'image' ? '[image]' : '')).join('\n');
  return '';
}

class ChatFeed {
  constructor() {
    this.items = [];
    this.byTool = new Map();   // tool_use_id -> item
    this.seq = 0;
    this.file = null;
    this.offset = 0;
    this.partial = '';
    this.changed = new Map();  // items to send on the next flush
  }

  /** Follows the session to a new transcript (after /clear), keeping what came before. */
  follow(file) {
    if (!file || file === this.file) return;
    if (this.file && this.items.length) this.push({ k: 'divider', text: 'Context cleared' });
    this.file = file;
    this.offset = 0;
    this.partial = '';
  }

  push(item) {
    item.n = ++this.seq;
    this.items.push(item);
    if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
    this.changed.set(item.n, item);
    return item;
  }

  /** Reads new lines. Returns the items that are new or changed since the last call. */
  poll() {
    if (this.file) {
      let st = null;
      try { st = fs.statSync(this.file); } catch {}
      if (st && st.size < this.offset) { this.offset = 0; this.partial = ''; }
      if (st && st.size > this.offset) {
        // A first read of a long transcript starts near its end.
        if (this.offset === 0 && st.size > 4 * 1024 * 1024) { this.offset = st.size - 4 * 1024 * 1024; this.partial = null; }
        const fd = fs.openSync(this.file, 'r');
        try {
          const len = st.size - this.offset;
          const buf = Buffer.alloc(len);
          fs.readSync(fd, buf, 0, len, this.offset);
          this.offset = st.size;
          const lines = ((this.partial ?? '') + buf.toString('utf8')).split('\n');
          if (this.partial === null) lines.shift(); // cut mid-line
          this.partial = lines.pop();
          for (const line of lines) if (line) this.ingest(line);
        } finally { fs.closeSync(fd); }
      }
    }
    const out = [...this.changed.values()];
    this.changed.clear();
    return out;
  }

  ingest(line) {
    let j;
    try { j = JSON.parse(line); } catch { return; }
    if (j.isSidechain || !j.message || (j.type !== 'user' && j.type !== 'assistant')) return;
    const content = j.message.content;
    if (j.type === 'assistant') {
      if (!Array.isArray(content)) return;
      for (const c of content) {
        if (c.type === 'text' && c.text?.trim()) {
          // Streaming can split one reply into several lines with the same message id.
          const last = this.items[this.items.length - 1];
          if (last?.k === 'claude' && last.mid && last.mid === j.message.id) { last.text += `\n\n${c.text.trim()}`; this.changed.set(last.n, last); }
          else this.push({ k: 'claude', text: c.text.trim(), mid: j.message.id });
        } else if (c.type === 'tool_use') {
          const t = toolTitle(c.name || 'Tool', c.input || {});
          const it = this.push({ k: 'tool', name: c.name, verb: t.verb, obj: t.obj, detail: toolDetail(c.name, c.input || {}), done: false });
          if (c.id) this.byTool.set(c.id, it);
        }
      }
      return;
    }
    // user
    if (j.isMeta) return;
    if (Array.isArray(content) && content.some((c) => c.type === 'tool_result')) {
      for (const c of content) {
        if (c.type !== 'tool_result') continue;
        const it = this.byTool.get(c.tool_use_id);
        if (!it) continue;
        it.done = true;
        it.error = !!c.is_error;
        it.result = clip(resultText(c).trim(), 2000);
        this.byTool.delete(c.tool_use_id);
        this.changed.set(it.n, it);
      }
      return;
    }
    let text = unwrapPasted(textOf(content));
    if (!text) return;
    if (/^\[Request interrupted/.test(text)) { this.push({ k: 'note', text: 'Stopped' }); return; }
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(text);
    if (cmd) { const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim(); this.push({ k: 'note', text: `${cmd[1]}${args ? ` ${clip(args, 80)}` : ''}` }); return; }
    if (text.startsWith('<')) return; // local command output, reminders and other plumbing
    text = text.replace(/\n*<system-reminder>[\s\S]*?<\/system-reminder>\n*/g, '').trim();
    if (text) this.push({ k: 'you', text });
  }

  recent(n = 400) {
    return this.items.slice(-n);
  }
}

/** Finds a transcript by session id under ~/.claude/projects, without knowing the folder encoding. */
function findTranscript(claudeDir, sessionId) {
  const root = path.join(claudeDir, 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return null; }
  for (const d of dirs) {
    const f = path.join(root, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

module.exports = { ChatFeed, findTranscript, toolTitle };
