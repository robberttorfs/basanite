// The "doing" line: one short label for what a session is busy with right now,
// built from tool calls the app already sees (hook events, transcript tool_use
// entries). No tokens, no extra reads. The label is debounced so it never flickers.
const path = require('path');

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const TEST_RE = /\b(npm\s+(run\s+)?test|npx\s+(vitest|jest|playwright)|vitest|jest|pytest|cargo\s+test|go\s+test|node\s+--test|dotnet\s+test|mvn\s+test|gradle\s+test|rspec|phpunit)\b/i;
const BUILD_RE = /\b(npm\s+run\s+(build|dist)|cargo\s+build|go\s+build|make|tsc|vite\s+build|webpack|electron-builder|gradle\s+build|mvn\s+(package|compile))\b/i;
const INSTALL_RE = /\b(npm\s+(install|i|ci)|pnpm\s+(install|add)|yarn(\s+add|\s+install)?|pip3?\s+install|cargo\s+add|brew\s+install|apt(-get)?\s+install)\b/i;

function base(p) { return p ? path.basename(String(p).replace(/\\/g, '/')) : ''; }

/** A short label for one tool call, or null when it says nothing useful. */
function labelFor(tool, input) {
  input = input || {};
  switch (tool) {
    case 'Edit': case 'MultiEdit': return `Editing ${base(input.file_path) || 'a file'}`;
    case 'NotebookEdit': return `Editing ${base(input.notebook_path || input.file_path) || 'a notebook'}`;
    case 'Write': return `Writing ${base(input.file_path) || 'a file'}`;
    case 'Read': return `Reading ${base(input.file_path) || 'a file'}`;
    case 'Grep': case 'Glob': return 'Searching the code';
    case 'WebFetch': case 'WebSearch': return 'Searching the web';
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'Planning';
    case 'Agent': case 'Task': return input.description ? `Delegating: ${String(input.description).slice(0, 40)}` : 'Delegating to an agent';
    case 'Bash': case 'PowerShell': {
      const c = String(input.command || '').trim();
      if (TEST_RE.test(c)) return 'Running tests';
      if (INSTALL_RE.test(c)) return 'Installing packages';
      if (BUILD_RE.test(c)) return 'Building';
      if (/^git\b/.test(c)) return 'Using git';
      const w = c.split(/\s+/)[0] || '';
      return w ? `Running ${path.basename(w).slice(0, 24)}` : 'Running a command';
    }
    default:
      if (/^mcp__/.test(tool)) return `Using ${tool.split('__')[1] || 'a tool'}`;
      return tool ? `Using ${tool}` : null;
  }
}

class Doing {
  constructor({ holdMs = 1500, thinkAfterMs = 6000, readWindowMs = 8000 } = {}) {
    this.holdMs = holdMs;
    this.thinkAfterMs = thinkAfterMs;
    this.readWindowMs = readWindowMs;
    this.shown = null;       // { label, since }
    this.pending = null;     // label waiting for the hold to pass
    this.lastToolAt = 0;
    this.reads = [];         // { file, at } recent reads
  }

  /** A tool call was seen. */
  tool(name, input, now = Date.now()) {
    let label;
    if (name === 'Read') {
      this.reads = this.reads.filter((r) => now - r.at < this.readWindowMs);
      const f = (input && input.file_path) || '';
      if (!this.reads.some((r) => r.file === f)) this.reads.push({ file: f, at: now });
      label = this.reads.length > 1 ? `Reading ${this.reads.length} files` : labelFor(name, input);
    } else {
      this.reads = [];
      label = labelFor(name, input);
    }
    if (!label) return;
    this.lastToolAt = now;
    this.set(label, now);
  }

  set(label, now = Date.now()) {
    if (this.shown && this.shown.label === label) { this.pending = null; return; }
    if (!this.shown || now - this.shown.since >= this.holdMs) { this.shown = { label, since: now }; this.pending = null; }
    else this.pending = label;
  }

  /** The turn ended: nothing is going on. */
  clear() { this.shown = null; this.pending = null; this.reads = []; this.lastToolAt = 0; }

  /** The label to show now, or null. Only meaningful while the session is working. */
  get(working, now = Date.now()) {
    if (!working) return null;
    if (this.pending && this.shown && now - this.shown.since >= this.holdMs) { this.shown = { label: this.pending, since: now }; this.pending = null; }
    if (!this.shown) return 'Thinking';
    if (now - this.lastToolAt > this.thinkAfterMs && !this.pending && this.shown.label !== 'Thinking') {
      this.shown = { label: 'Thinking', since: now };
    }
    return this.shown.label;
  }
}

module.exports = { Doing, labelFor, EDIT_TOOLS };
