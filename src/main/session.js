// One Claude Code session shown as a tile. Status comes from hooks; tokens
// come from the transcript and the statusline. Nothing here adds to the
// model's context except timer notes (see timer.js) and the session's mode
// (see modes.js), each sent only when it starts or needs restating.
const fs = require('fs');
const path = require('path');
const { TranscriptReader } = require('./transcript');
const timer = require('./timer');
const modes = require('./modes');
const guards = require('./guards');
const paths = require('../shared/paths');
const { migrate: migrateColor } = require('../shared/palette');
const { Doing, EDIT_TOOLS } = require('./doing');

// Set by main.js: { onEdit(session, absFile), enrich(session, snapshot) }.
const services = { onEdit: null, onStop: null, enrich: null };

const NEEDS_INPUT_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);
const ASKS_USER = new Set(['AskUserQuestion', 'ExitPlanMode']);

class Session {
  constructor({ id, name, cwd, sessionId = null, pinned = false, timer: t = null, mode = null, modeApplied = false, addons = [], addonsApplied = [], color = null, lock = null, kind = 'claude' }) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.sessionId = sessionId;
    this.pinned = pinned;
    this.timer = t;
    this.mode = mode;               // mode id or null
    this.modeApplied = modeApplied; // its instructions have reached Claude
    this.modeFrom = null;           // the applied mode being replaced, until the next prompt says so
    this.addons = [...addons];      // add-on ids, stacked on top of the mode
    this.addonsApplied = addonsApplied.filter((a) => this.addons.includes(a)); // reached Claude
    this.addonsOff = [];            // names turned off since the last prompt, so Claude is told once
    this.color = migrateColor(color); // old amber/green/red/purple picks move to an allowed colour
    this.lock = lock;               // { w, h } as fractions of the stage, set by dragging an edge
    this.kind = kind;               // 'claude' or 'shell' (a plain terminal)
    this.hosted = false;            // a shell tile with Claude Code running inside it
    this.handover = null;           // fresh start in progress: { stage, file, at }
    this.status = 'starting';
    this.booting = true;
    this.statusSince = Date.now();
    this.waitingOn = null;          // 'main' or an agent id
    this.lastPrompt = null;
    this.lastEventAt = 0;
    this.turnStartedAt = null;
    this.transcriptPath = null;
    this.reader = null;
    this.agents = new Map();        // agent id -> { type, desc, startedAt, endedAt, running, reader }
    this.pendingDescs = [];
    this.statusline = null;
    this.claudeIdleSince = null;
    this.error = null;
    this.doing = new Doing();
    this.forkOf = null;             // session id to fork from on the next launch
    this.onChange = () => {};
  }

  setStatus(s) {
    // Booting until Claude Code's prompt is up (first statusline or hook), even
    // while a startup dialog such as folder trust shows "needs you".
    if (s === 'starting') this.booting = true;
    if (s === this.status) return;
    const prev = this.status;
    this.status = s;
    this.statusSince = Date.now();
    this.onChange({ type: 'status', prev, next: s });
  }

  setTranscript(p) {
    if (!p || p === this.transcriptPath) return;
    this.transcriptPath = p;
    this.reader = new TranscriptReader(p);
    this.reader.poll();
    this.reader.drainTools();       // history, not current work
  }

  get subagentDir() {
    return this.transcriptPath ? path.join(this.transcriptPath.replace(/\.jsonl$/, ''), 'subagents') : null;
  }

  runningAgents() { return [...this.agents.values()].filter((a) => a.running); }

  /** Switches mode. Claude hears about it with the next prompt. */
  setMode(id) {
    id = id || null;
    if (id === this.mode) return;
    const cur = modes.get(this.mode);
    if (cur && this.modeApplied) this.modeFrom = { id: cur.id, name: cur.name };
    this.mode = id;
    this.modeApplied = false;
    if (this.modeFrom?.id === id) { this.modeApplied = true; this.modeFrom = null; }
    this.onChange({ type: 'mode' });
  }

  /** Turns an add-on on or off. Claude hears about it with the next prompt. */
  setAddon(id, on) {
    const a = modes.get(id);
    if (on && (!a || !modes.isAddon(a) || this.addons.includes(id))) return;
    if (!on && !this.addons.includes(id)) return;
    if (on) {
      this.addons.push(id);
      this.addonsOff = this.addonsOff.filter((n) => n !== a.name);
      // Turned off and on again before Claude heard either: nothing to say.
      if (this.addonsWasApplied?.has(id)) { this.addonsApplied.push(id); this.addonsWasApplied.delete(id); }
    } else {
      this.addons = this.addons.filter((x) => x !== id);
      if (this.addonsApplied.includes(id) && a) {
        this.addonsOff.push(a.name);
        (this.addonsWasApplied ||= new Set()).add(id);
      }
      this.addonsApplied = this.addonsApplied.filter((x) => x !== id);
    }
    this.onChange({ type: 'mode' });
  }

  /** Context for add-ons on this prompt: the ones just turned on, and a note for the ones turned off. */
  addonContext() {
    const out = [];
    this.addons = this.addons.filter((id) => modes.isAddon(modes.get(id)));
    const fresh = this.addons.filter((id) => !this.addonsApplied.includes(id)).map((id) => modes.get(id));
    const off = modes.addonEndContext(this.addonsOff);
    if (off) out.push(off);
    const on = modes.addonContext(fresh);
    if (on) out.push(on);
    this.addonsWasApplied?.clear();
    if (fresh.length || this.addonsOff.length) {
      this.addonsApplied = [...this.addons];
      this.addonsOff = [];
      this.onChange({ type: 'mode' });
    }
    return out;
  }

  /** The guard of the current mode (see guards.js), or null. */
  guard() { return modes.get(this.mode)?.guard || null; }

  /** Context for the mode on this prompt: start, switch, end or exit phrase. */
  modeContext(prompt) {
    const out = [];
    let mode = modes.get(this.mode);
    if (this.mode && !mode) { this.mode = null; this.modeApplied = false; out.push('[Hangar mode] The session\'s mode was deleted. Its rules no longer apply.'); }
    if (mode && this.modeApplied) {
      const said = modes.exitPhraseIn(prompt, mode.exitPhrases);
      if (said) {
        out.push(modes.endContext(mode, said));
        const next = modes.get(mode.exitTo);
        this.mode = next?.id || null;
        this.modeApplied = false;
        this.onChange({ type: 'mode', ended: { id: mode.id, name: mode.name, said } });
        mode = next;
      }
    }
    if (mode && !this.modeApplied) {
      out.push(modes.contextFor(mode, { from: this.modeFrom }));
      this.modeApplied = true;
      this.onChange({ type: 'mode' });
    } else if (!mode && this.modeFrom) {
      out.push(modes.endContext(this.modeFrom));
    }
    this.modeFrom = null;
    return out;
  }

  /** A terminal tile started Claude Code: from now on it is a full session. */
  attach() {
    if (this.kind !== 'shell' || this.hosted) return;
    this.resetClaude();
    this.hosted = true;
    this.onChange({ type: 'kind' });
  }

  /** Claude Code inside a terminal tile exited: back to a plain terminal. */
  detach() {
    if (!this.hosted) return;
    this.hosted = false;
    this.resetClaude();
    this.handover = null;
    this.timer = null;
    if (this.status !== 'exited') this.setStatus('idle');
    this.onChange({ type: 'kind' });
  }

  resetClaude() {
    this.sessionId = null;
    this.transcriptPath = null;
    this.reader = null;
    this.agents.clear();
    this.pendingDescs = [];
    this.statusline = null;
    this.waitingOn = null;
    this.lastPrompt = null;
    this.error = null;
    this.modeApplied = false;
    this.modeFrom = null;
    this.addonsApplied = [];
    this.addonsOff = [];
  }

  /** Handles a hook event. Returns the JSON body to send back to Claude Code, or null. */
  onHook(hook) {
    const event = hook.hook_event_name;
    if (this.kind === 'shell') {
      if (event === 'SessionEnd' && !this.hosted) return null;
      this.attach();
    }
    this.booting = false;
    const agent = hook.agent_id || null;
    const source = agent || 'main';
    this.lastEventAt = Date.now();
    if (hook.session_id && !agent) this.sessionId = hook.session_id;
    if (hook.transcript_path && !agent) this.setTranscript(hook.transcript_path);

    const context = [];
    switch (event) {
      case 'SessionStart': {
        if (hook.source === 'clear') { this.agents.clear(); this.pendingDescs = []; }
        this.onChange({ type: 'session-start', source: hook.source });
        const mode = modes.get(this.mode);
        // Any fresh context (new conversation, /clear, compaction) needs the mode again.
        // A resumed conversation already has it in its history.
        if (mode && hook.source !== 'resume') {
          context.push(modes.contextFor(mode, { from: this.modeApplied ? null : this.modeFrom, reapply: hook.source === 'compact' }));
          this.modeFrom = null;
          if (!this.modeApplied) { this.modeApplied = true; this.onChange({ type: 'mode' }); }
        }
        if (hook.source !== 'resume') {
          const on = modes.addonContext(this.addons.map((id) => modes.get(id)).filter(modes.isAddon), { reapply: hook.source === 'compact' });
          if (on) context.push(on);
          this.addonsApplied = [...this.addons];
          this.addonsOff = [];
        }
        break;
      }
      case 'UserPromptSubmit':
        // Agent hand-backs and other system turns also arrive as prompts; keep the human one.
        if (typeof hook.prompt === 'string' && !hook.prompt.trimStart().startsWith('<')) this.lastPrompt = hook.prompt.slice(0, 200);
        if (typeof hook.prompt === 'string') context.push(...this.modeContext(hook.prompt), ...this.addonContext());
        this.turnStartedAt = Date.now();
        this.doing.clear();
        this.waitingOn = null;
        this.error = null;
        this.setStatus('working');
        break;
      case 'PreToolUse': {
        // A guard mode stops the tool for real. Nothing is returned otherwise, so no tokens.
        const reason = guards.check(this.guard(), modes.get(this.mode)?.name, hook.tool_name, hook.tool_input || {});
        if (reason) { this.onChange({ type: 'guard', tool: hook.tool_name }); return guards.denyBody(reason); }
        if (ASKS_USER.has(hook.tool_name)) {
          this.waitingOn = source;
          this.setStatus('needs_input');
        } else {
          // Only agent launches name a subagent; Bash also carries a description.
          if ((hook.tool_name === 'Agent' || hook.tool_name === 'Task') && hook.tool_input?.description) this.pendingDescs.push(String(hook.tool_input.description).slice(0, 80));
          this.clearWaitIf(source);
        }
        break;
      }
      case 'PermissionRequest':
        this.waitingOn = source;
        this.setStatus('needs_input');
        break;
      case 'Notification':
        if (NEEDS_INPUT_NOTIFICATIONS.has(hook.notification_type)) {
          this.waitingOn = source;
          this.setStatus('needs_input');
        }
        break;
      case 'PostToolUse':
      case 'PostToolUseFailure':
        this.clearWaitIf(source);
        if (hook.tool_name) this.doing.tool(hook.tool_name, hook.tool_input);
        if (event === 'PostToolUse' && EDIT_TOOLS.has(hook.tool_name) && services.onEdit) {
          const f = hook.tool_input && (hook.tool_input.file_path || hook.tool_input.notebook_path);
          if (f) services.onEdit(this, path.resolve(this.cwd, String(f)));
        }
        break;
      case 'SubagentStart': {
        const a = this.agents.get(agent) || { type: hook.agent_type, desc: null, startedAt: Date.now(), reader: null };
        a.running = true;
        a.endedAt = null;
        if (!a.desc) a.desc = this.pendingDescs.shift() || null;
        this.agents.set(agent, a);
        if (this.status !== 'needs_input') this.setStatus('working');
        this.onChange({ type: 'agents' });
        break;
      }
      case 'SubagentStop': {
        const a = this.agents.get(agent);
        if (a) { a.running = false; a.endedAt = Date.now(); }
        if (hook.agent_transcript_path && a && !a.reader) a.reader = new TranscriptReader(hook.agent_transcript_path);
        if (this.waitingOn === agent) this.waitingOn = null;
        this.onChange({ type: 'agents' });
        break;
      }
      case 'Stop':
        this.waitingOn = null;
        if (!this.runningAgents().length) this.doing.clear();
        if (services.onStop) services.onStop(this);
        this.setStatus(this.runningAgents().length ? 'working' : 'done');
        break;
      case 'StopFailure':
        this.error = hook.error || hook.message || 'Request failed';
        this.setStatus('error');
        break;
      case 'SessionEnd':
        if (hook.reason === 'clear' || hook.reason === 'resume') break;
        if (this.kind === 'shell') { this.detach(); return null; }
        this.setStatus('exited');
        break;
    }

    // Timer notes. Only timed sessions ever get any output.
    if (this.timer) {
      const { timer: t, out } = timer.nudge(this.timer, event, hook);
      if (t !== this.timer) { this.timer = t; this.onChange({ type: 'timer' }); }
      if (out?.context) context.push(out.context);
      if (out?.block) return { decision: 'block', reason: out.block };
    }
    if (context.length) return { hookSpecificOutput: { hookEventName: event, additionalContext: context.join('\n\n') } };
    return null;
  }

  /** A Claude Code dialog appeared or went away at the bottom of the terminal. */
  onDialog(open) {
    if (open && (this.status === 'idle' || this.status === 'done' || this.status === 'starting')) {
      this.waitingOn = 'dialog';
      this.setStatus('needs_input');
    } else if (!open && this.status === 'needs_input' && this.waitingOn === 'dialog') {
      this.waitingOn = null;
      this.setStatus('idle');
    }
  }

  clearWaitIf(source) {
    if (this.status === 'needs_input' && (this.waitingOn === null || this.waitingOn === source || this.waitingOn === 'dialog')) {
      this.waitingOn = null;
      this.setStatus('working');
    } else if (this.status !== 'needs_input' && this.status !== 'working' && source === 'main') {
      this.setStatus('working');
    }
  }

  onStatusline(j) {
    // The first statusline render means Claude Code is up and waiting.
    this.booting = false;
    if (this.status === 'starting') this.setStatus('idle');
    if (process.env.HANGAR_DEV && !Session.sampled) {
      Session.sampled = true;
      try { fs.writeFileSync(path.join(paths.dataDir(), 'statusline-sample.json'), JSON.stringify(j, null, 2)); } catch {}
    }
    this.statusline = {
      costUSD: j?.cost?.total_cost_usd ?? null,
      ctxPct: j?.context_window?.used_percentage ?? null,
      ctxSize: j?.context_window?.context_window_size ?? null,
      model: j?.model?.display_name ?? null,
      rateLimits: j?.rate_limits ?? null,
    };
    if (j?.session_id && !this.sessionId) this.sessionId = j.session_id;
    if (j?.transcript_path) this.setTranscript(j.transcript_path);
  }

  /** Called about once a second. Returns true if anything visible changed. */
  poll(claudeSessions) {
    let changed = false;
    if (this.reader && this.reader.poll()) changed = true;
    if (this.reader) {
      const tools = this.reader.drainTools();
      if (this.status === 'working') for (const t of tools) this.doing.tool(t.name, t.input);
    }

    // Subagents: pick up ones started before Hangar saw them, read their tokens.
    const dir = this.subagentDir;
    if (dir) {
      let files = [];
      try { files = fs.readdirSync(dir); } catch {}
      for (const f of files) {
        const m = /^agent-(.+)\.jsonl$/.exec(f);
        if (!m) continue;
        let a = this.agents.get(m[1]);
        const file = path.join(dir, f);
        if (!a) {
          let mtime = 0;
          try { mtime = fs.statSync(file).mtimeMs; } catch {}
          a = { type: null, desc: null, startedAt: mtime, endedAt: mtime, running: Date.now() - mtime < 15000, reader: null };
          this.agents.set(m[1], a);
          changed = true;
        }
        if (!a.reader) a.reader = new TranscriptReader(file);
        if (!a.desc || !a.type) {
          try {
            const meta = JSON.parse(fs.readFileSync(path.join(dir, `agent-${m[1]}.meta.json`), 'utf8'));
            a.desc = a.desc || meta.description || null;
            a.type = a.type || meta.agentType || null;
          } catch {}
        }
        if (a.reader.poll()) changed = true;
      }
    }

    // Esc interrupts fire no Stop hook. Fall back to the transcript marker and
    // Claude Code's own busy/idle flag, only after a quiet spell.
    const cs = this.sessionId && claudeSessions.get(this.sessionId);
    if (cs && cs.status === 'idle') this.claudeIdleSince = this.claudeIdleSince || Date.now();
    else this.claudeIdleSince = null;
    if (this.status === 'working' && !this.runningAgents().length && Date.now() - this.lastEventAt > 4000) {
      const idleLong = this.claudeIdleSince && Date.now() - this.claudeIdleSince > 4000;
      if (this.reader?.interrupted) { this.setStatus('idle'); changed = true; }
      else if (idleLong) { this.setStatus('done'); changed = true; }
    }
    return changed;
  }

  tokens() {
    let agentOut = 0;
    for (const a of this.agents.values()) agentOut += a.reader?.outputTokens || 0;
    const model = this.reader?.model || '';
    const size = this.statusline?.ctxSize || (/\[1m\]|1m/i.test(model) ? 1000000 : 200000);
    return {
      context: this.reader?.contextTokens || 0,
      contextSize: size,
      output: this.reader?.outputTokens || 0,
      agentOutput: agentOut,
      costUSD: this.statusline?.costUSD ?? null,
    };
  }

  snapshot() {
    const now = Date.now();
    const agents = [...this.agents.entries()]
      .filter(([, a]) => a.running || (a.endedAt && now - a.endedAt < 10 * 60000))
      .sort((x, y) => (y[1].running - x[1].running) || (y[1].startedAt - x[1].startedAt))
      .map(([id, a]) => ({
        id, type: a.type, desc: a.desc, running: a.running,
        startedAt: a.startedAt, endedAt: a.endedAt,
        context: a.reader?.contextTokens || 0, output: a.reader?.outputTokens || 0,
      }));
    const snap = {
      id: this.id, name: this.name, cwd: this.cwd, sessionId: this.sessionId,
      pinned: this.pinned, status: this.status, statusSince: this.statusSince, booting: !!this.booting,
      color: this.color, lock: this.lock, mode: this.modeSnapshot(),
      kind: this.kind === 'shell' && !this.hosted ? 'shell' : 'claude', inShell: this.kind === 'shell',
      handover: this.handover ? this.handover.stage : null,
      lastPrompt: this.lastPrompt, lastText: this.reader?.lastText || null,
      model: this.statusline?.model || this.reader?.model || null,
      tokens: this.tokens(), agents, error: this.error,
      doing: this.doing.get(this.status === 'working', now),
      ...this.cacheSnapshot(now),
      timer: this.timer && {
        minutes: this.timer.minutes, startedAt: this.timer.startedAt, finished: this.timer.finished,
        remaining: timer.remaining(this.timer, now),
      },
    };
    if (services.enrich) services.enrich(this, snap, now);
    return snap;
  }

  /** Prompt-cache state from the transcript: the next message costs more once the cache expired. */
  cacheSnapshot(now) {
    const r = this.reader;
    const at = r && r.lastAssistantAt;
    const idle = this.status !== 'working' && this.status !== 'starting' && this.status !== 'exited';
    const cold = !!(at && idle && r.contextTokens > 0 && now - at > r.cacheTtlMs);
    return { cacheCold: cold, cacheTtlMin: r ? Math.round(r.cacheTtlMs / 60000) : 5, lastResponseAt: at || null };
  }

  modeSnapshot() {
    const m = modes.get(this.mode);
    const addons = this.addons.map((id) => modes.get(id)).filter(modes.isAddon)
      .map((a) => ({ id: a.id, name: a.name, color: a.color, icon: a.icon, applied: this.addonsApplied.includes(a.id) }));
    if (!m && !addons.length) return null;
    return m ? { id: m.id, name: m.name, color: m.color, icon: m.icon, guard: m.guard || null, goal: !!m.goal, applied: this.modeApplied, addons }
      : { id: null, addons };
  }

  persisted() {
    return {
      id: this.id, name: this.name, cwd: this.cwd, sessionId: this.sessionId, pinned: this.pinned,
      mode: this.mode, modeApplied: this.modeApplied, addons: this.addons, addonsApplied: this.addonsApplied, color: this.color, lock: this.lock, kind: this.kind,
    };
  }
}

/** Text for Claude Code's own status line: model and context. */
function statuslineText(j) {
  const parts = [];
  if (j?.model?.display_name) parts.push(j.model.display_name);
  if (j?.context_window?.used_percentage != null) parts.push(`ctx ${Math.round(j.context_window.used_percentage)}%`);
  return parts.join('  ');
}

/**
 * Per-tile Claude Code settings: HTTP hooks into Hangar plus the statusline.
 * The statusline refreshes often while Claude works, so on Mac and Linux it
 * is a curl call (a few ms) instead of starting the bundled Node each time.
 */
function hookSettings(tileId, server, ctlCommand, platform = process.platform) {
  const url = `http://127.0.0.1:${server.port}/hook/${server.token}/${tileId}`;
  const statusUrl = `http://127.0.0.1:${server.port}/statusline/${server.token}/${tileId}`;
  const http = (timeout = 5) => [{ hooks: [{ type: 'http', url, timeout }] }];
  return {
    hooks: {
      // A command hook, so it works for every SessionStart source; it restates the mode after a compaction.
      SessionStart: [{ hooks: [{ type: 'command', command: `${ctlCommand} hook`, timeout: 5 }] }],
      UserPromptSubmit: http(),
      // Edit and shell tools too, so guard modes can deny them; with no guard on the reply is empty.
      PreToolUse: [{ matcher: guards.MATCHER, hooks: [{ type: 'http', url, timeout: 5 }] }],
      PermissionRequest: http(),
      PostToolUse: http(),
      PostToolUseFailure: http(),
      Notification: http(),
      SubagentStart: http(),
      SubagentStop: http(),
      Stop: http(),
      StopFailure: http(),
      SessionEnd: http(2),
    },
    statusLine: {
      type: 'command', padding: 0,
      command: platform === 'win32' ? `${ctlCommand} statusline`
        : `curl -s -m 2 -H 'Content-Type: application/json' --data-binary @- '${statusUrl}' || true`,
    },
  };
}

/** CLI flags for the permission mode chosen in Hangar's settings. */
const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'];
function permissionArgs(mode) {
  if (mode === 'bypassPermissions') return ['--dangerously-skip-permissions'];
  if (PERMISSION_MODES.includes(mode) && mode !== 'default') return ['--permission-mode', mode];
  return [];
}

function writeHookSettings(tileId, server, ctlCommand) {
  const dir = paths.tileDir(tileId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(hookSettings(tileId, server, ctlCommand), null, 2));
  return file;
}

module.exports = { services, Session, statuslineText, hookSettings, writeHookSettings, permissionArgs, PERMISSION_MODES };
