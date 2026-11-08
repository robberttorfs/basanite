// Incremental reader for Claude Code transcript JSONL files. Only new bytes
// are read on each poll. The format is internal to Claude Code, so every
// field is treated as optional and unknown lines are skipped.
const fs = require('fs');
const { pathsIn } = require('./files');

class TranscriptReader {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.partial = '';
    this.seen = new Set();      // message ids already counted
    this.outputTokens = 0;
    this.contextTokens = 0;     // input side of the latest request
    this.model = null;
    this.lastText = null;       // latest assistant text, short
    this.interrupted = false;   // last user entry was an interrupt marker
    this.lastActivity = 0;
    this.lastAssistantAt = 0;   // timestamp of the latest assistant entry
    this.cacheTtlMs = 5 * 60 * 1000;  // prompt-cache lifetime seen in the latest usage
    this.tools = [];            // tool_use entries since the last drainTools(): { name, input, at }
    this.mentions = [];         // file paths in Claude's replies since the last drainMentions(): { path, at }
  }

  drainTools() { const t = this.tools; this.tools = []; return t; }
  drainMentions() { const m = this.mentions; this.mentions = []; return m; }

  poll() {
    let st;
    try { st = fs.statSync(this.file); } catch { return false; }
    if (st.size < this.offset) { this.reset(); }
    if (st.size === this.offset) return false;
    const fd = fs.openSync(this.file, 'r');
    try {
      const len = st.size - this.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this.offset);
      this.offset = st.size;
      const text = this.partial + buf.toString('utf8');
      const lines = text.split('\n');
      this.partial = lines.pop();
      for (const line of lines) if (line) this.ingest(line);
    } finally { fs.closeSync(fd); }
    this.lastActivity = st.mtimeMs;
    return true;
  }

  reset() {
    Object.assign(this, new TranscriptReader(this.file));
  }

  ingest(line) {
    let j;
    try { j = JSON.parse(line); } catch { return; }
    const m = j.message;
    if (j.type === 'assistant' && m && m.usage) {
      const id = m.id || j.requestId || j.uuid;
      const u = m.usage;
      this.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (m.model && m.model !== '<synthetic>') this.model = m.model;
      if (!this.seen.has(id)) {
        this.seen.add(id);
        this.outputTokens += u.output_tokens || 0;
      }
      const at = Date.parse(j.timestamp);
      if (at) this.lastAssistantAt = at;
      const cc = u.cache_creation;
      if (cc && cc.ephemeral_1h_input_tokens > 0) this.cacheTtlMs = 60 * 60 * 1000;
      else if (cc && cc.ephemeral_5m_input_tokens > 0) this.cacheTtlMs = 5 * 60 * 1000;
      if (Array.isArray(m.content)) {
        for (const c of m.content) if (c && c.type === 'tool_use' && c.name && this.tools.length < 200) this.tools.push({ name: c.name, input: c.input || {}, at: at || Date.now() });
        const t = m.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
        if (t) this.lastText = t.slice(0, 300);
        if (t && this.mentions.length < 200) for (const p of pathsIn(t)) this.mentions.push({ path: p, at: at || Date.now() });
      }
      this.interrupted = false;
    } else if (j.type === 'user' && m) {
      const c = typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : '';
      this.interrupted = /\[Request interrupted by user/.test(c);
    }
  }
}

module.exports = { TranscriptReader };
