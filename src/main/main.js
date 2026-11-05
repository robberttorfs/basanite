const { app, BrowserWindow, ipcMain, dialog, Notification, Menu, shell, nativeTheme } = require('electron');
const look = require('./look');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pty = require('node-pty');
const paths = require('../shared/paths');
const { Session, writeHookSettings, permissionArgs, statuslineText } = require('./session');
const { startServer } = require('./server');
const { readLog } = require('./log');
const modes = require('./modes');
const { ChatFeed, findTranscript } = require('./chat');
const { migrate: loadWorkspaces } = require('./workspaces');
const lifecycle = require('./lifecycle');
const updaterMod = require('./updater');
const dataIpc = require('./data-ipc');
let data = null;
let updater = null;

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

app.setName('Hangar');
app.setPath('userData', paths.dataDir());
if (isWin) app.setAppUserModelId('com.robberttorfs.hangar');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let server = null;
let ctlCommand = null;
const sessions = [];          // display order
const ptys = new Map();       // tile id -> pty
let overseer = null;          // { pty, sessionId, transcript }
const chats = new Map();      // tile id or 'overseer' -> ChatFeed, only while a clean view is open
let focusedTile = null;
let rateLimits = null;
let claudeSessions = new Map();
const notified = new Map();   // dedupe keys -> time

const DEFAULT_SETTINGS = {
  notify: { needsInput: true, done: true, contextPct: 80, usagePct: 80 },
  overseerModel: 'sonnet',
  permissionMode: 'default',
  fontSize: 13,
  uiZoom: 1,
};
let settings = loadJSON(paths.settingsFile(), DEFAULT_SETTINGS);
settings = { ...DEFAULT_SETTINGS, ...settings, notify: { ...DEFAULT_SETTINGS.notify, ...(settings.notify || {}) } };

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// ---------- helper scripts ----------

/** Path to a file that must live outside app.asar so plain Node can run it. */
function unpacked(...p) {
  return path.join(__dirname, '..', '..', ...p).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function installHelpers() {
  const bin = paths.binDir();
  fs.mkdirSync(bin, { recursive: true });
  const exe = process.execPath;
  const ctl = unpacked('src', 'cli', 'hangarctl.js');
  const fwd = (p) => p.replace(/\\/g, '/');
  // POSIX shell wrapper (macOS, Linux, and Git Bash on Windows).
  fs.writeFileSync(path.join(bin, 'hangarctl'),
    `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${fwd(exe)}" "${fwd(ctl)}" "$@"\n`, { mode: 0o755 });
  if (isWin) {
    fs.writeFileSync(path.join(bin, 'hangarctl.cmd'),
      `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" "${ctl}" %*\r\n`);
    ctlCommand = `"${fwd(path.join(bin, 'hangarctl.cmd'))}"`;
  } else {
    ctlCommand = `'${path.join(bin, 'hangarctl').replace(/'/g, `'\\''`)}'`;
  }
}

// ---------- launching claude ----------

function shQuote(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
function psQuote(s) { return `'${String(s).replace(/'/g, "''")}'`; }

function cleanEnv(extra) {
  const env = { ...process.env, ...extra, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Hangar' };
  // Markers a parent Claude Code session leaves behind (e.g. when Hangar is
  // started from a terminal running claude) would make children think they
  // are subprocesses and switch off transcripts.
  const inherited = ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'AI_AGENT',
    'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_EXECPATH'];
  for (const k of inherited) delete env[k];
  if (!env.LANG) env.LANG = 'en_US.UTF-8';
  return env;
}

/** Spawns `claude <args>` through the user's login shell so PATH matches their terminal. */
function spawnClaude(claudeArgs, cwd, env, cols = 100, rows = 30) {
  if (isWin) {
    const cmd = `& claude ${claudeArgs.map(psQuote).join(' ')}`;
    return pty.spawn('powershell.exe', ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { name: 'xterm-256color', cols, rows, cwd, env, useConpty: true });
  }
  const shell = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
  const cmd = `exec claude ${claudeArgs.map(shQuote).join(' ')}`;
  return pty.spawn(shell, ['-l', '-i', '-c', cmd], { name: 'xterm-256color', cols, rows, cwd, env });
}

/**
 * A plain interactive login shell, for terminal tiles. PowerShell, zsh and bash
 * also load a small `claude` wrapper (src/shell) so Claude Code started there
 * reports to Hangar and the tile becomes a full session while it runs.
 */
function spawnShell(cwd, env, cols, rows) {
  const dir = unpacked('src', 'shell');
  env = { ...env, HANGAR_SHELL_DIR: dir };
  if (isWin) {
    const args = ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', `. ${psQuote(path.join(dir, 'hangar.ps1'))}`];
    return pty.spawn('powershell.exe', args, { name: 'xterm-256color', cols, rows, cwd, env, useConpty: true });
  }
  const shell = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
  const base = path.basename(shell);
  let args = ['-l'];
  if (base === 'zsh') {
    if (process.env.ZDOTDIR) env.HANGAR_USER_ZDOTDIR = process.env.ZDOTDIR;
    env.ZDOTDIR = path.join(dir, 'zsh');
  } else if (base === 'bash') {
    args = ['--init-file', path.join(dir, 'bash-init.sh'), '-i'];
  }
  return pty.spawn(shell, args, { name: 'xterm-256color', cols, rows, cwd, env });
}

function transcriptExists(s) {
  if (!s.sessionId) return false;
  const projects = path.join(paths.claudeDir(), 'projects');
  const slug = s.cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (fs.existsSync(path.join(projects, slug, `${s.sessionId}.jsonl`))) return true;
  try {
    return fs.readdirSync(projects).some((d) => fs.existsSync(path.join(projects, d, `${s.sessionId}.jsonl`)));
  } catch { return false; }
}

/** mode: 'new' | 'continue' | 'resume' */
function launch(s, mode, waited = false) {
  // Start only once the tile has told us its real size. A TUI drawn at a
  // guessed size and then resized leaves broken lines on screen. A tile in
  // clean view has no visible terminal to measure, so after a short wait it
  // starts at a default size (it refits when the terminal is shown).
  if (!s.lastSize && !s.sizeWait && !waited) {
    s.sizeWait = { mode, timer: setTimeout(() => { const w = s.sizeWait; s.sizeWait = null; if (w && find(s.id)) launch(s, w.mode, true); }, 1500) };
    s.setStatus('starting');
    return;
  }
  if (s.kind === 'shell') return launchShell(s);
  const settingsFile = writeHookSettings(s.id, server, ctlCommand);
  let args;
  if (mode === 'resume' && s.sessionId) args = ['--resume', s.sessionId];
  else if (mode === 'fork' && s.forkOf) { args = ['--resume', s.forkOf, '--fork-session', '-n', s.name]; s.forkOf = null; }
  else if (mode === 'continue') args = ['--continue'];
  else { s.sessionId = crypto.randomUUID(); args = ['--session-id', s.sessionId, '-n', s.name]; }
  args.push('--settings', settingsFile, ...permissionArgs(settings.permissionMode));
  if (process.env.HANGAR_DEV_CLAUDE_ARGS) args.push(...process.env.HANGAR_DEV_CLAUDE_ARGS.split(' '));

  const size = s.lastSize || { cols: 100, rows: 30 };
  let p;
  try {
    p = spawnClaude(args, s.cwd, cleanEnv({ HANGAR_TILE: s.id }), size.cols, size.rows);
  } catch (e) {
    send('tile:data', { id: s.id, data: `\r\n\x1b[31mCould not start claude: ${e.message}\x1b[0m\r\n` });
    s.setStatus('exited');
    return;
  }
  ptys.set(s.id, lifecycle.track(p));
  s.setStatus('starting');
  p.onData((data) => send('tile:data', { id: s.id, data }));
  p.onExit(({ exitCode }) => {
    if (ptys.get(s.id) !== p) return;
    ptys.delete(s.id);
    if (exitCode === 127) {
      send('tile:data', { id: s.id, data: '\r\n\x1b[33mclaude was not found on your PATH. Install Claude Code, then press Restart.\x1b[0m\r\n' });
    }
    s.setStatus('exited');
    broadcast();
  });
  saveWorkspace();
}

function launchShell(s) {
  const size = s.lastSize || { cols: 100, rows: 30 };
  let p;
  try {
    // The tile refits right after start; without this zsh marks the redrawn prompt with a stray %.
    const settingsFile = writeHookSettings(s.id, server, ctlCommand);
    const detachUrl = `http://127.0.0.1:${server.port}/api/${server.token}/detach?tile=${s.id}`;
    p = spawnShell(s.cwd, cleanEnv({ HANGAR_TILE: s.id, PROMPT_EOL_MARK: '', HANGAR_SETTINGS: settingsFile, HANGAR_DETACH_URL: detachUrl }), size.cols, size.rows);
  } catch (e) {
    send('tile:data', { id: s.id, data: `\r\n\x1b[31mCould not start a shell: ${e.message}\x1b[0m\r\n` });
    s.setStatus('exited');
    return;
  }
  ptys.set(s.id, lifecycle.track(p));
  s.setStatus('idle');
  p.onData((data) => send('tile:data', { id: s.id, data }));
  p.onExit(() => {
    if (ptys.get(s.id) !== p) return;
    ptys.delete(s.id);
    s.detach();
    s.setStatus('exited');
    broadcast();
  });
  saveWorkspace();
}

// ---------- sessions ----------

function uniqueName(base) {
  const names = new Set(sessions.map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function addSession(opts, mode) {
  const s = new Session({
    id: opts.id || crypto.randomBytes(4).toString('hex'),
    name: opts.name || uniqueName(path.basename(opts.cwd) || opts.cwd),
    cwd: opts.cwd, sessionId: opts.sessionId || null, pinned: !!opts.pinned,
    mode: opts.mode || null, modeApplied: !!opts.modeApplied, color: opts.color || null, lock: opts.lock || null,
    kind: opts.kind === 'shell' ? 'shell' : 'claude',
  });
  s.forkOf = opts.forkOf || null;
  s.onChange = (ev) => onSessionChange(s, ev);
  const w = workspaces.get(opts.ws);
  s.ws = w && !w.putAway ? w.id : workspaces.active;  // new sessions land in the current workspace
  sessions.push(s);
  rememberFolder(s.cwd);
  if (mode === 'restore') mode = s.kind !== 'shell' && transcriptExists(s) ? 'resume' : 'new';
  launch(s, mode);
  broadcast();
  return s;
}

function find(id) { return sessions.find((s) => s.id === id); }

/** Resolves a tile given by number, id or part of the name (for hangarctl). */
function resolveTile(key) {
  if (!key) throw new Error('No tile given. Run hangarctl list.');
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= sessions.length) return sessions[n - 1];
  const k = String(key).toLowerCase();
  const exact = sessions.find((s) => s.id === key || s.name.toLowerCase() === k);
  if (exact) return exact;
  const m = sessions.filter((s) => s.name.toLowerCase().includes(k));
  if (m.length === 1) return m[0];
  throw new Error(m.length ? `"${key}" matches several sessions, use the number.` : `No session matches "${key}". Run hangarctl list.`);
}

let lastClosed = null;   // for Reopen Closed Session
// ---------- fresh start ----------
//
// Hand a session over to a fresh context without losing anything: Claude
// writes a handover file, Hangar checks it exists, runs /clear in the same
// tile, then tells the new context to read the handover and carry on.

const HANDOVER_TIMEOUT = 20 * 60000;

function typeInto(s, text) {
  const p = ptys.get(s.id);
  if (!p) return false;
  p.write(text);
  setTimeout(() => p.write('\r'), 150);
  return true;
}

function handoverPath(cwd) {
  const docs = path.join(cwd, 'docs');
  try { if (fs.statSync(docs).isDirectory()) return path.join(docs, 'HANDOVER.md'); } catch {}
  return path.join(cwd, 'HANDOVER.md');
}

function freshStart(s) {
  if (!s || (s.kind === 'shell' && !s.hosted) || !ptys.get(s.id) || s.handover) return;
  if (s.status === 'working' || s.status === 'starting') {
    s.handover = { stage: 'queued' };
    broadcast();
    return;
  }
  const file = handoverPath(s.cwd);
  s.handover = { stage: 'writing', file, at: Date.now() };
  typeInto(s, `[Hangar fresh start] Wrap up so a fresh session can continue exactly from here. Stop the current task at a safe point (no half-made edits). ` +
    `Write a handover to ${file} (replace any older one): the goal, current state, what is done, what is in progress, the exact next steps, ` +
    `decisions made and why, hard rules and how the user likes to work, key files and commands. Update any progress notes or memory this project uses. ` +
    'Keep it complete but tight. When it is written, reply with one short line.');
  broadcast();
  setTimeout(() => { if (s.handover?.at && Date.now() - s.handover.at >= HANDOVER_TIMEOUT && s.handover.stage !== 'continuing') failHandover(s, 'It took too long.'); }, HANDOVER_TIMEOUT + 1000);
}

function failHandover(s, why) {
  s.handover = null;
  send('tile:notice', { id: s.id, text: `Fresh start stopped. ${why}` });
  broadcast();
}

/** Moves a fresh start along as the session reports back. */
function stepHandover(s, ev) {
  const h = s.handover;
  if (!h) return;
  if (h.stage === 'queued' && ev.type === 'status' && (ev.next === 'done' || ev.next === 'idle')) {
    s.handover = null;
    setTimeout(() => freshStart(s), 600);
    return;
  }
  if (h.stage === 'writing' && ev.type === 'status' && ev.next === 'done') {
    let written = false;
    try { written = fs.statSync(h.file).mtimeMs >= h.at - 2000; } catch {}
    if (!written) return failHandover(s, 'No handover file was written, so nothing was cleared.');
    h.stage = 'clearing';
    typeInto(s, '/clear');
    setTimeout(() => { if (s.handover === h && h.stage === 'clearing') failHandover(s, 'The /clear did not go through. The handover is saved.'); }, 30000);
    broadcast();
  }
  if (h.stage === 'clearing' && ev.type === 'session-start' && ev.source === 'clear') {
    h.stage = 'continuing';
    setTimeout(() => {
      typeInto(s, `[Hangar fresh start] Read ${h.file} and continue the work from where it stopped. Follow its rules and next steps.`);
      s.handover = null;
      send('tile:notice', { id: s.id, text: 'Fresh start done. Continuing from the handover.' });
      broadcast();
    }, 1200);
  }
}

function closeSession(id) {
  const s = find(id);
  if (!s) return;
  lastClosed = { ...s.persisted(), index: sessions.indexOf(s), ws: s.ws };
  const p = ptys.get(id);
  ptys.delete(id);
  lifecycle.killPty(p);
  sessions.splice(sessions.indexOf(s), 1);
  if (focusedTile === id) focusedTile = null;
  chats.delete(id);
  data?.forget(id);
  saveWorkspace();
  broadcast();
}

function saveWorkspace() {
  const byWs = {};
  for (const s of sessions) (byWs[s.ws] ||= []).push(s.persisted());
  saveJSON(paths.workspaceFile(), workspaces.toJSON(byWs, recentFolders.slice(0, 20)));
}

let recentFolders = loadJSON(paths.workspaceFile(), {}).recent || [];
// Old files ({ tiles, recent }) load as one "Main" workspace.
const workspaces = loadWorkspaces(loadJSON(paths.workspaceFile(), {}));
function rememberFolder(dir) {
  if (isHangarInternal(dir) || dir === os.homedir()) return;
  recentFolders = [dir, ...recentFolders.filter((d) => d !== dir)].slice(0, 20);
}

/** Recent project folders from Hangar and from Claude Code's own prompt history. */
function recentProjects() {
  const out = [...recentFolders];
  try {
    const file = path.join(paths.claudeDir(), 'history.jsonl');
    const st = fs.statSync(file);
    const len = Math.min(st.size, 512 * 1024);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const l of lines) {
      try { const p = JSON.parse(l).project; if (p && !out.includes(p)) out.push(p); } catch {}
      if (out.length >= 12) break;
    }
  } catch {}
  const skip = new Set([path.parse(os.homedir()).root, os.homedir()]);
  return out.filter((d) => {
    if (skip.has(d) || isHangarInternal(d)) return false;
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  }).slice(0, 12);
}

/** Hangar's own folders (the overseer's home) never show up as projects, from this or any other Hangar data folder. */
function isHangarInternal(dir) {
  const rel = path.relative(paths.dataDir(), dir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  return path.basename(dir) === 'overseer' && fs.existsSync(path.join(dir, 'hangar-settings.json'));
}

// ---------- notifications ----------

function notify(key, title, body, tileId) {
  // Each workspace can ask for all notifications, only "needs you", or none.
  const ws = tileId && find(tileId)?.ws;
  if (ws && !workspaces.allows(ws, key.startsWith('input:') ? 'needs' : 'other')) return;
  const last = notified.get(key) || 0;
  if (Date.now() - last < 30000) return;
  notified.set(key, Date.now());
  // Off-screen test copies log notifications instead of showing them.
  if (process.env.HANGAR_DEV_OFFSCREEN) { console.log(`[notify] ${title}: ${body}`); return; }
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    if (tileId) send('tile:focus', { id: tileId });
  });
  n.show();
}

function userIsLookingAt(s) {
  return win && win.isFocused() && focusedTile === s.id;
}

function onSessionChange(s, ev) {
  stepHandover(s, ev);
  if (ev.type === 'status') {
    const { prev, next } = ev;
    if (next === 'needs_input' && settings.notify.needsInput && !userIsLookingAt(s)) {
      notify(`input:${s.id}`, `${s.name} needs you`, s.lastPrompt ? `Waiting on you while working on: ${s.lastPrompt.slice(0, 80)}` : 'Waiting for your answer', s.id);
    }
    if (next === 'done' && prev === 'working' && settings.notify.done && !userIsLookingAt(s)) {
      const took = s.turnStartedAt ? Date.now() - s.turnStartedAt : 0;
      if (took > 20000) notify(`done:${s.id}:${s.turnStartedAt}`, `${s.name} finished`, s.reader?.lastText?.slice(0, 120) || 'Ready for you', s.id);
    }
    if (next === 'error') notify(`err:${s.id}`, `${s.name} hit an error`, s.error || 'The request failed', s.id);
    if (next === 'done' && userIsLookingAt(s)) setTimeout(() => { if (s.status === 'done' && userIsLookingAt(s)) s.setStatus('idle'); }, 1500);
  }
  if (ev.type === 'mode') saveWorkspace();
  if (ev.type === 'mode' && ev.ended) send('tile:mode-ended', { id: s.id, mode: ev.ended });
  if (ev.type === 'timer' && s.timer?.finished === false && s.timer.sent.includes('end:main')) {
    notify(`timer:${s.id}:${s.timer.startedAt}`, `${s.name}: time is up`, `The ${s.timer.minutes} min budget is used. Claude is wrapping up.`, s.id);
  }
  scheduleBroadcast();
}

function checkThresholds(s, snap) {
  // A mode can ask for a heads-up once a session has used a lot of tokens (e.g. Refine).
  const mode = modes.get(s.mode);
  if (mode?.tokenWarn) {
    const used = snap.tokens.output + snap.tokens.agentOutput;
    const step = mode.tokenWarn * 1000;
    const n = Math.floor(used / step);
    const key = `tok:${s.id}:${n}`;
    if (n >= 1 && !notified.has(key)) {
      notify(key, `${s.name} has used ${Math.round(used / 1000)}k tokens`, `${mode.name} mode is still going. Check it or switch mode to stop it.`, s.id);
      notified.set(key, Infinity);
    }
  }
  const pct = snap.tokens.contextSize ? (snap.tokens.context / snap.tokens.contextSize) * 100 : 0;
  if (settings.notify.contextPct && pct >= settings.notify.contextPct) {
    notify(`ctx:${s.id}:${settings.notify.contextPct}`, `${s.name} context is ${Math.round(pct)}% full`, 'Fresh start (in the tile menu) hands over and continues with an empty context.', s.id);
    notified.set(`ctx:${s.id}:${settings.notify.contextPct}`, Infinity);
  }
}

function checkUsage() {
  if (!rateLimits || !settings.notify.usagePct) return;
  for (const [key, label] of [['five_hour', '5-hour'], ['seven_day', 'weekly']]) {
    const r = rateLimits[key];
    if (r?.used_percentage >= settings.notify.usagePct) {
      const k = `usage:${key}:${r.resets_at}`;
      if (!notified.has(k)) {
        notify(k, `${Math.round(r.used_percentage)}% of your ${label} limit used`, 'Across all Claude Code sessions.');
        notified.set(k, Infinity);
      }
    }
  }
}

// ---------- state to the window ----------

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function state() {
  const tiles = sessions.map((s) => ({ ...s.snapshot(), ws: s.ws }));
  return { tiles, workspaces: workspaces.summary(), activeWs: workspaces.active, rateLimits, focusedTile, overseerRunning: !!overseer, settings, platform: process.platform, modes: modes.list({ includeHidden: true }) };
}

let broadcastTimer = null;
function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => { broadcastTimer = null; broadcast(); }, 120);
}
// The window only hears about changes. While something is ticking (a working
// session's clock, a timer) it still gets one update a second.
let lastSent = '';
function broadcast() {
  const st = state();
  const json = JSON.stringify(st);
  const ticking = sessions.some((s) => s.status === 'working' || s.status === 'starting' || (s.timer && !s.timer.finished && s.timer.startedAt));
  if (json === lastSent && !ticking) return;
  lastSent = json;
  send('state', st);
  if (isMac) app.setBadgeCount(sessions.filter((s) => s.status === 'needs_input').length);
}

function readClaudeSessions() {
  const dir = path.join(paths.claudeDir(), 'sessions');
  const m = new Map();
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (j.sessionId) m.set(j.sessionId, j);
      } catch {}
    }
  } catch {}
  claudeSessions = m;
}

let tick = 0;
function pollLoop() {
  tick++;
  if (tick % 2 === 0) readClaudeSessions();
  for (const s of sessions) {
    s.poll(claudeSessions);
    checkThresholds(s, s.snapshot());
  }
  checkUsage();
  broadcast();
}

// ---------- overseer ----------

const OVERSEER_MD = `# Hangar overseer

You are the overseer inside Hangar, an app that shows the user's Claude Code sessions as tiles. You do not do project work yourself. You answer questions about the sessions and, when asked, type into them.

Use these commands through Bash. They read live data from the app.

- \`hangarctl list\` - one line per session: number, name, status, tokens, running agents, timer, last prompt, folder. Cheap. Run it first.
- \`hangarctl log <n> [k]\` - last k user/Claude messages of session n (default 4). Use it to learn what a session concluded or is doing.
- \`hangarctl screen <n> [lines]\` - what its terminal shows right now (default 30). Use it to see a question or permission prompt that is waiting.
- \`hangarctl send <n> "text"\` - types the text into session n and presses Enter.
- \`hangarctl modes [--full]\` - the modes a session can be in (Notes, Plan, Build, Review and the user's own). --full shows each mode's instructions.
- \`hangarctl mode <n> <mode>\` - puts session n in a mode, or \`none\`. Claude in that session gets the mode's instructions with its next prompt.
- \`hangarctl mode-save --name "Name" --description "one line" --exit "start, go" --instructions "..."\` - creates a mode (add \`--id <id>\` to update an existing one; \`--color\` takes one of ${modes.COLORS.join(' ')}). Instructions are written to Claude, as short concrete rules, one per line starting with "- ". \`--exit\` lists phrases that end the mode (optional).

Statuses: working, needs_input (waiting on the user), done (finished a turn, not yet looked at), idle, error, exited, starting.

Rules:
- Keep token use low. Start with \`list\`. Only pull \`log\` or \`screen\` for the sessions the question is about, with small counts. Do not re-read what you already have in this conversation unless time has passed and it may have changed.
- Never guess. If \`list\` does not answer it, check \`log\` or \`screen\` before saying anything. If something is unclear, say so.
- Only \`send\` when the user asks you to or clearly approves. Text goes to whatever is on that screen: check \`screen\` first, because a permission menu expects a choice like 1 or 2, not a sentence. Do not send to a session that is working unless the user insists; it would queue up.
- After sending, check \`screen <n> 15\` to confirm it landed, and report briefly.
- Modes: when asked to create or change one, draft it, show the user the draft in a few lines, and save it once they agree. When asked to make a mode from a session, read that session's \`log\` (8 to 12 messages) and capture how the user told it to work, not the task itself.
- Keep answers short.
`;

function startOverseer() {
  if (overseer) return;
  const dir = paths.overseerDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), OVERSEER_MD);
  const settingsFile = path.join(dir, 'hangar-settings.json');
  saveJSON(settingsFile, { permissions: { allow: ['Bash(hangarctl:*)', 'Bash(hangarctl *)'] } });
  // Put hangarctl on PATH. Windows spells the key "Path", so reuse whatever key exists.
  const env = cleanEnv({ HANGAR_OVERSEER: '1' });
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = `${paths.binDir()}${path.delimiter}${env[pathKey] || ''}`;
  // Lean session: Bash only, no MCP servers, no plugins or skills, a mid-size model.
  const args = ['--model', settings.overseerModel || 'sonnet', '--tools', 'Bash', '--strict-mcp-config',
    '--setting-sources', 'project', '--disable-slash-commands', '--settings', settingsFile, '-n', 'hangar-overseer'];
  // A known session id, so the clean view can find its transcript.
  const sessionId = crypto.randomUUID();
  args.push('--session-id', sessionId);
  let p;
  try { p = spawnClaude(args, dir, env, 60, 30); } catch (e) {
    send('overseer:data', `\r\nCould not start the overseer: ${e.message}\r\n`);
    return;
  }
  overseer = { pty: lifecycle.track(p), sessionId, transcript: null };
  // Ready once Claude Code has drawn its prompt and gone quiet for a moment.
  // Typing earlier can lose the Enter (seen on Windows).
  overseer.ready = new Promise((resolve) => {
    let prompted = false;
    let quiet = null;
    const sub = p.onData((d) => {
      if (d.includes('❯')) prompted = true;
      if (!prompted) return;
      clearTimeout(quiet);
      quiet = setTimeout(() => { sub.dispose(); resolve(); }, 1200);
    });
    p.onExit(() => { clearTimeout(quiet); resolve(); });
  });
  if (chats.has('overseer')) { chats.set('overseer', new ChatFeed()); send('chat:items', { id: 'overseer', reset: true, items: [] }); }
  p.onData((d) => send('overseer:data', d));
  p.onExit(() => { if (overseer?.pty === p) { overseer = null; send('overseer:data', '\r\n\x1b[2m[overseer ended, open the panel again to restart]\x1b[0m\r\n'); broadcast(); } });
  broadcast();
}

// ---------- pasted images ----------

const imagesDir = () => path.join(os.tmpdir(), 'hangar-images');

/** Pasted images are read by Claude Code when sent; a week later they are only clutter. */
function pruneImages() {
  const dir = imagesDir();
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  const old = Date.now() - 7 * 24 * 3600 * 1000;
  for (const n of names) {
    const f = path.join(dir, n);
    try { if (fs.statSync(f).mtimeMs < old) fs.unlinkSync(f); } catch {}
  }
}

// ---------- clean view ----------

function chatFile(id) {
  if (id !== 'overseer') return find(id)?.transcriptPath || null;
  if (!overseer) return null;
  if (!overseer.transcript) overseer.transcript = findTranscript(paths.claudeDir(), overseer.sessionId);
  return overseer.transcript;
}

/** Sends new chat lines to open clean views. Costs nothing while none is open. */
function pollChats() {
  for (const [id, feed] of chats) {
    feed.follow(chatFile(id));
    const items = feed.poll();
    if (items.length) send('chat:items', { id, items });
  }
}

// ---------- window ----------

function createWindow() {
  const saved = loadJSON(path.join(paths.dataDir(), 'window.json'), {});
  // Automated checks (tools/dev.sh) run the app off screen at a fixed size, so it never shows up or takes focus.
  const offscreen = !!process.env.HANGAR_DEV_OFFSCREEN;
  if (offscreen) Object.assign(saved, { x: -4000, y: 0, width: 1400, height: 900, maximized: false, fullscreen: false });
  win = new BrowserWindow({
    width: saved.width || 1400, height: saved.height || 900, x: saved.x, y: saved.y,
    minWidth: 720, minHeight: 480,
    backgroundColor: look.background(),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isWin ? look.overlay(40) : undefined,
    trafficLightPosition: { x: 14, y: 13 },
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (saved.maximized !== false) win.maximize();
    if (saved.fullscreen) win.setFullScreen(true);
    // Dev copies open behind other windows so they never take the keyboard from the real Hangar.
    if (process.env.HANGAR_DEV) win.showInactive(); else win.show();
  });
  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    saveJSON(path.join(paths.dataDir(), 'window.json'), { ...win.getNormalBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  };
  win.on('close', saveBounds);
  win.on('focus', () => { const s = find(focusedTile); if (s && s.status === 'done') s.setStatus('idle'); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// The menu bar holds everything, so the window itself can stay quiet.
// Its items come from the renderer's command registry (src/renderer/commands.js), so the
// menu, the command palette and the shortcuts share one list. Main adds only the roles.
let menuSpec = null;
function buildMenu() {
  const items = (name) => {
    const m = menuSpec?.find((x) => x.label === name);
    return m ? m.items.map((it) => (it.sep ? { type: 'separator' } : {
      label: it.label, accelerator: it.accel || undefined, click: () => send('cmd:run', it.id),
    })) : [];
  };
  const withSep = (list) => (list.length ? [...list, { type: 'separator' }] : []);
  const known = ['App', 'Session', 'Workspace', 'Modes', 'View', 'Window', 'Help'];
  const others = (menuSpec || []).filter((m) => !known.includes(m.label)).map((m) => ({ label: m.label, submenu: items(m.label) }));
  const sub = (label, list) => (list.length ? [{ label, submenu: list }] : []);
  const template = [
    ...(isMac ? [{ label: 'Hangar', submenu: [
      { role: 'about' }, ...(updater?.menuItem() ? [updater.menuItem()] : []), { type: 'separator' },
      ...withSep(items('App')),
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] }] : []),
    ...sub('Session', items('Session')),
    ...sub('Workspace', items('Workspace')),
    ...sub('Modes', items('Modes')),
    // On Windows and Linux the edit keys must reach the page itself (terminals, picture paste),
    // so the Edit menu shows them without grabbing them.
    isMac ? { role: 'editMenu' } : { label: 'Edit', submenu: [
      { role: 'undo', registerAccelerator: false }, { role: 'redo', registerAccelerator: false }, { type: 'separator' },
      { role: 'cut', registerAccelerator: false }, { role: 'copy', registerAccelerator: false },
      { role: 'paste', registerAccelerator: false }, { role: 'selectAll', registerAccelerator: false },
    ] },
    { label: 'View', submenu: [
      ...withSep(items('View')),
      ...(isMac ? [] : withSep(items('App'))),
      { role: 'togglefullscreen' },
      ...(process.env.HANGAR_DEV ? [{ role: 'toggleDevTools' }] : []),
    ] },
    ...others,
    { label: 'Window', submenu: [
      ...withSep(items('Window')),
      { role: 'minimize' }, ...(isMac ? [{ role: 'zoom', label: 'Fill Screen' }] : [{ label: 'Maximize', click: () => (win.isMaximized() ? win.unmaximize() : win.maximize()) }]),
    ] },
    ...(items('Help').length ? [{ role: 'help', submenu: items('Help') }] : []),
  ];
  // A quiet item appears only when an update is waiting.
  if (!isMac && updater?.menuItem()) template.push(updater.menuItem());
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Whole-window UI size (Ctrl/Cmd + scroll, View menu). Terminals refit by themselves.
const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];
function applyZoom() {
  if (!win || win.isDestroyed()) return;
  const z = settings.uiZoom || 1;
  win.webContents.setZoomFactor(z);
  // The Windows caption buttons are native, so keep their strip as tall as the scaled top bar.
  if (isWin) { try { win.setTitleBarOverlay({ height: Math.round(40 * z) }); } catch {} }
}
function setZoom(dir) {
  const cur = settings.uiZoom || 1;
  let next = 1;
  if (dir > 0) next = ZOOM_STEPS.find((z) => z > cur + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  else if (dir < 0) next = [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001) ?? ZOOM_STEPS[0];
  if (next === cur) return;
  settings.uiZoom = next;
  saveJSON(paths.settingsFile(), settings);
  applyZoom();
  broadcast();
}

function setFont(d) {
  settings.fontSize = Math.max(9, Math.min(22, (settings.fontSize || 13) + d));
  saveJSON(paths.settingsFile(), settings);
  broadcast();
}

// ---------- workspaces ----------
// Background workspaces keep running; switching only changes what the window draws.

const closedWorkspaces = new Map();  // id -> removed workspace, for Undo
function workspacesChanged() { saveWorkspace(); broadcast(); }

/** Stops a workspace's sessions the way quitting does, and returns them to resume later. */
function stopSessions(wsId) {
  const out = [];
  for (const s of sessions.filter((x) => x.ws === wsId)) {
    out.push(s.persisted());
    if (s.sizeWait) { clearTimeout(s.sizeWait.timer); s.sizeWait = null; }
    const p = ptys.get(s.id);
    ptys.delete(s.id);
    lifecycle.killPty(p);
    sessions.splice(sessions.indexOf(s), 1);
    if (focusedTile === s.id) focusedTile = null;
    chats.delete(s.id);
  }
  return out;
}
function resumeSessions(wsId, saved) {
  for (const t of saved || []) {
    if (!t || !fs.existsSync(t.cwd)) continue;
    addSession({ ...t, ws: wsId }, 'restore');
  }
}

function wireWorkspaces() {
  ipcMain.on('ws:switch', (_e, id) => { if (workspaces.switchTo(id)) workspacesChanged(); });
  ipcMain.handle('ws:create', (_e, name) => {
    const w = workspaces.create(name);
    workspaces.switchTo(w.id);
    workspacesChanged();
    return w.id;
  });
  ipcMain.on('ws:update', (_e, { id, patch }) => { if (workspaces.update(id, patch)) workspacesChanged(); });
  ipcMain.on('ws:move', (_e, { id, to }) => { workspaces.move(id, Number(to) || 0); workspacesChanged(); });
  ipcMain.on('ws:put-away', (_e, id) => {
    const w = workspaces.get(id);
    if (!w || w.putAway || workspaces.open().length < 2) return;
    workspaces.putAway(id, stopSessions(id));
    workspacesChanged();
  });
  ipcMain.on('ws:reopen', (_e, id) => {
    const saved = workspaces.reopen(id);
    if (!saved) return;
    resumeSessions(id, saved);
    workspacesChanged();
  });
  ipcMain.on('ws:close', (_e, id) => {
    const w = workspaces.get(id);
    if (!w || (!w.putAway && workspaces.open().length < 2)) return;
    const rec = workspaces.remove(id, w.putAway ? null : stopSessions(id));
    if (rec) closedWorkspaces.set(id, rec);
    workspacesChanged();
  });
  ipcMain.on('ws:undo-close', (_e, id) => {
    const rec = closedWorkspaces.get(id);
    closedWorkspaces.delete(id);
    if (!rec || !workspaces.restore(rec)) return;
    resumeSessions(id, workspaces.reopen(id));
    workspacesChanged();
  });
  // A tile header dropped on a pill: the session moves there and keeps running.
  ipcMain.on('tile:to-ws', (_e, { id, ws }) => {
    const s = find(id);
    const w = workspaces.get(ws);
    if (!s || !w || w.putAway || s.ws === ws) return;
    s.ws = ws;
    if (sessions.some((x) => x !== s && x.ws === ws && x.pinned)) s.pinned = false;
    sessions.splice(sessions.indexOf(s), 1);
    sessions.push(s);
    workspacesChanged();
  });
}

// ---------- IPC ----------

const screenRequests = new Map();
let screenSeq = 0;
function askScreen(id, lines) {
  return new Promise((resolve) => {
    const req = ++screenSeq;
    screenRequests.set(req, resolve);
    send('screen:request', { req, id, lines });
    setTimeout(() => { if (screenRequests.delete(req)) resolve(null); }, 2000);
  });
}

function wireIpc() {
  wireWorkspaces();
  ipcMain.handle('init', () => state());
  ipcMain.handle('recent', () => recentProjects());
  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('tile:create', (_e, { cwd, mode, sessionMode, ws }) => {
    // A session starts in the given workspace (a folder dropped on its pill), else the current one,
    // in that workspace's default mode unless the New dialog said 'none'.
    const target = workspaces.get(ws) && !workspaces.get(ws).putAway ? ws : workspaces.active;
    const smode = sessionMode === 'none' ? null : sessionMode || workspaces.get(target)?.defaultMode || null;
    // A plain terminal needs no folder: it opens in the home folder.
    if (mode === 'shell' && !cwd) return addSession({ cwd: os.homedir(), kind: 'shell', name: uniqueName('Terminal'), ws: target }, 'new').id;
    try { if (!fs.statSync(cwd).isDirectory()) return null; } catch { return null; }
    if (mode === 'shell') return addSession({ cwd, kind: 'shell', ws: target }, 'new').id;
    return addSession({ cwd, mode: smode, ws: target }, mode || 'new').id;
  });
  ipcMain.on('tile:mode', (_e, { id, mode }) => find(id)?.setMode(mode));
  ipcMain.on('tile:fresh', (_e, id) => freshStart(find(id)));
  ipcMain.on('tile:color', (_e, { id, color }) => {
    const s = find(id);
    if (s) { s.color = color || null; saveWorkspace(); broadcast(); }
  });
  ipcMain.on('tile:lock', (_e, { id, lock }) => {
    const s = find(id);
    if (!s) return;
    s.lock = lock && (lock.w != null || lock.h != null) ? lock : null;
    saveWorkspace(); broadcast();
  });
  ipcMain.handle('modes:save', (_e, m) => { const r = modes.upsert(m); buildMenu(); broadcast(); return r; });
  ipcMain.on('modes:delete', (_e, id) => {
    // Custom modes disappear for good: end them in their sessions first, so Claude is told.
    if (!modes.BUILTIN.some((b) => b.id === id)) for (const s of sessions) if (s.mode === id) s.setMode(null);
    modes.remove(id);
    buildMenu();
    broadcast();
  });
  ipcMain.handle('modes:reset', (_e, id) => { const r = modes.reset(id); buildMenu(); broadcast(); return r; });
  ipcMain.on('tile:input', (_e, { id, data }) => ptys.get(id)?.write(data));
  // A pasted picture has no file of its own: save it so Claude Code can attach it by path.
  ipcMain.handle('image:save', (_e, { bytes, type }) => {
    const dir = imagesDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = { 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type] || 'png';
    const file = path.join(dir, `pasted-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return file;
  });
  ipcMain.on('tile:resize', (_e, { id, cols, rows }) => {
    const s = find(id);
    if (!s) return;
    s.lastSize = { cols, rows };
    if (s.sizeWait) {
      const { mode, timer } = s.sizeWait;
      clearTimeout(timer);
      s.sizeWait = null;
      return launch(s, mode);
    }
    try { ptys.get(id)?.resize(cols, rows); } catch {}
  });
  ipcMain.on('tile:close', (_e, id) => closeSession(id));
  ipcMain.on('tile:reopen', () => {
    if (!lastClosed || !fs.existsSync(lastClosed.cwd)) return;
    const { index, ...t } = lastClosed;
    lastClosed = null;
    const s = addSession(t, 'restore');
    if (sessions.some((x) => x !== s && x.pinned && x.ws === s.ws)) s.pinned = false;
    sessions.splice(sessions.indexOf(s), 1);
    sessions.splice(Math.min(index, sessions.length), 0, s);
    saveWorkspace(); broadcast();
    send('tile:focus', { id: s.id });
  });
  ipcMain.on('tile:restart', (_e, id) => {
    const s = find(id);
    if (!s || ptys.get(id)) return;
    send('tile:clear', { id });
    launch(s, s.kind !== 'shell' && transcriptExists(s) ? 'resume' : 'new');
  });
  ipcMain.on('tile:rename', (_e, { id, name }) => {
    const s = find(id);
    if (s && name.trim()) { s.name = name.trim().slice(0, 40); saveWorkspace(); broadcast(); }
  });
  ipcMain.on('tile:pin', (_e, id) => {
    const ws = find(id)?.ws;
    for (const s of sessions) if (s.ws === ws) s.pinned = s.id === id ? !s.pinned : false;
    saveWorkspace(); broadcast();
  });
  ipcMain.on('tile:move', (_e, { id, to }) => {
    const s = find(id);
    if (!s) return;
    // `to` is a place among the tiles of the session's own workspace.
    const sibs = sessions.filter((x) => x.ws === s.ws && x !== s);
    const before = sibs[Math.max(0, to)];
    sessions.splice(sessions.indexOf(s), 1);
    if (before) sessions.splice(sessions.indexOf(before), 0, s); else sessions.push(s);
    saveWorkspace(); broadcast();
  });
  ipcMain.on('tile:timer', (_e, { id, minutes }) => {
    const s = find(id);
    if (!s) return;
    if (!minutes) s.timer = null;
    else s.timer = { minutes, startedAt: s.status === 'working' || s.status === 'needs_input' ? Date.now() : null, sent: [], finished: false };
    broadcast();
  });
  ipcMain.on('tile:focus', (_e, id) => {
    focusedTile = id;
    const s = find(id);
    const w = s && workspaces.get(s.ws);
    if (w) w.focused = id;  // remembered per workspace
    if (s && s.status === 'done') s.setStatus('idle');
  });
  ipcMain.on('tile:dialog', (_e, { id, open }) => find(id)?.onDialog(open));
  ipcMain.on('screen:reply', (_e, { req, text }) => {
    const r = screenRequests.get(req);
    if (r) { screenRequests.delete(req); r(text); }
  });
  ipcMain.on('overseer:start', () => startOverseer());
  ipcMain.handle('chat:open', (_e, id) => {
    let feed = chats.get(id);
    if (!feed) { feed = new ChatFeed(); chats.set(id, feed); }
    feed.follow(chatFile(id));
    feed.poll();
    return feed.recent();
  });
  ipcMain.on('chat:close', (_e, id) => chats.delete(id));
  // Asks the overseer something on the user's behalf (e.g. "make a mode from session 2").
  ipcMain.on('overseer:ask', (_e, text) => {
    // Typed in rather than passed on the command line, which mangles quotes on Windows.
    if (!overseer) startOverseer();
    const o = overseer;
    if (!o) return;
    o.ready.then(() => {
      if (overseer !== o) return;
      o.pty.write(text);
      // If Claude does not start working, the Enter was lost: press it again (twice at most).
      let started = false;
      const watch = o.pty.onData((x) => { if (/esc to interrupt/i.test(x)) started = true; });
      let tries = 0;
      const enter = () => {
        if (started || overseer !== o || tries++ > 2) { watch.dispose(); return; }
        o.pty.write('\r');
        setTimeout(enter, tries === 1 ? 2500 : 3000);
      };
      setTimeout(enter, 120);
    });
  });
  // Held until the overseer's prompt is up, so an early message keeps its Enter.
  ipcMain.on('overseer:input', (_e, d) => { const o = overseer; o?.ready.then(() => { if (overseer === o) o.pty.write(d); }); });
  ipcMain.on('overseer:resize', (_e, { cols, rows }) => { try { overseer?.pty.resize(cols, rows); } catch {} });
  ipcMain.on('overseer:restart', () => {
    if (overseer) { const p = overseer.pty; overseer = null; lifecycle.killPty(p); }
    send('overseer:clear');
    startOverseer();
  });
  ipcMain.on('ui:zoom', (_e, dir) => setZoom(Math.sign(Number(dir) || 0)));
  ipcMain.on('ui:font', (_e, dir) => setFont(Math.sign(Number(dir) || 0)));
  ipcMain.on('menu:set', (_e, spec) => { if (Array.isArray(spec)) { menuSpec = spec; buildMenu(); } });
  // Windows and Linux hide the menu bar with the title bar, so the top bar has a button that opens it.
  ipcMain.on('menu:popup', (_e, { x, y } = {}) => {
    const z = settings.uiZoom || 1;
    Menu.getApplicationMenu()?.popup({ window: win, x: Math.round((x || 0) * z), y: Math.round((y || 0) * z) });
  });
  ipcMain.on('settings:set', (_e, patch) => {
    settings = { ...settings, ...patch, notify: { ...settings.notify, ...(patch.notify || {}) } };
    saveJSON(paths.settingsFile(), settings);
    if ('theme' in patch) look.apply(settings);
    broadcast();
  });
}

const serverHandlers = {
  hook: (tileId, body) => find(tileId)?.onHook(body) ?? null,
  // A terminal tile's `claude` wrapper calls this when Claude Code exits.
  detach: (tileId) => { find(tileId)?.detach(); return { ok: true }; },
  statusline: (tileId, body) => {
    const s = find(tileId);
    if (!s) return;
    s.onStatusline(body);
    if (body?.rate_limits) rateLimits = body.rate_limits;
    scheduleBroadcast();
    return statuslineText(body);
  },
  list: () => ({
    tiles: sessions.map((s) => {
      const snap = s.snapshot();
      const age = Math.round((Date.now() - s.statusSince) / 1000);
      snap.statusAge = age < 90 ? `${age}s` : `${Math.round(age / 60)}m`;
      return snap;
    }),
  }),
  screen: async (key, lines) => {
    const s = resolveTile(key);
    const text = await askScreen(s.id, Math.min(lines, 200));
    if (text == null) throw new Error('Could not read the screen.');
    return { text: `[${s.name} | ${s.status}]\n${text}` };
  },
  log: (key, n) => {
    const s = resolveTile(key);
    if (!s.transcriptPath) throw new Error(`No transcript for ${s.name} yet.`);
    return { text: readLog(s.transcriptPath, Math.min(n, 20)) || '(no messages yet)' };
  },
  // Dev only (HANGAR_DEV=1): window screenshot and opening a folder, for automated checks.
  shot: async (file) => {
    if (!process.env.HANGAR_DEV) throw new Error('not available');
    const img = await win.webContents.capturePage();
    fs.writeFileSync(file, img.toPNG());
    return { text: file };
  },
  // Dev only: a real key press through Chromium and the menu, e.g. key=C&mods=control.
  key: async (keyCode, mods) => {
    if (!process.env.HANGAR_DEV) throw new Error('not available');
    const modifiers = String(mods || '').split(',').filter(Boolean);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    return { text: 'ok' };
  },
  // Dev only: the native menu as text, or accel=Ctrl+Shift+K clicks the item with that shortcut
  // (sendInputEvent skips menu accelerators on Windows, so this checks them instead).
  menu: async (acc) => {
    if (!process.env.HANGAR_DEV) throw new Error('not available');
    const out = [];
    const walk = (items, path) => { for (const it of items) {
      if (it.submenu) walk(it.submenu.items, `${path}${it.label} > `);
      else if (it.type !== 'separator') {
        const a = it.accelerator ? String(it.accelerator).replace(/CmdOrCtrl|CommandOrControl/, isMac ? 'Cmd' : 'Ctrl') : '';
        if (acc && a === acc) { it.click(); return out.push(`clicked ${path}${it.label}`); }
        out.push(`${path}${it.label}${a ? ` [${a}]` : ''}`);
      }
    } };
    walk(Menu.getApplicationMenu()?.items || [], '');
    return { text: acc ? (out.find((l) => l.startsWith('clicked')) || `no item for ${acc}`) : out.join('\n') };
  },
  js: async (code) => {
    if (!process.env.HANGAR_DEV) throw new Error('not available');
    return { text: String(await win.webContents.executeJavaScript(code)) };
  },
  open: (dir, minutes) => {
    if (!process.env.HANGAR_DEV) throw new Error('not available');
    const s = addSession({ cwd: dir }, 'new');
    if (minutes) s.timer = { minutes: Number(minutes), startedAt: null, sent: [], finished: false };
    return { text: s.id };
  },
  modes: () => ({ modes: modes.list() }),
  mode: ({ tile, mode }) => {
    const s = resolveTile(tile);
    const key = String(mode || '').trim().toLowerCase();
    if (!key || key === 'none' || key === 'off') { s.setMode(null); return { text: `${s.name} is in no mode now.` }; }
    const m = modes.list().find((x) => x.id === key || x.name.toLowerCase() === key);
    if (!m) throw new Error(`No mode "${mode}". Run hangarctl modes.`);
    s.setMode(m.id);
    return { text: `${s.name} is in ${m.name} mode. Claude gets it with the next prompt.` };
  },
  modeSave: (m) => {
    if (!m.instructions || !String(m.instructions).trim()) throw new Error('A mode needs instructions.');
    if (m.id && !modes.get(m.id)) throw new Error(`No mode with id "${m.id}". Run hangarctl modes.`);
    const saved = modes.upsert({ ...(m.id ? modes.get(m.id) : {}), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) });
    buildMenu();
    broadcast();
    return { text: `Saved mode "${saved.name}" (id ${saved.id}). It is now in every tile's mode menu.` };
  },
  send: (key, text) => {
    const s = resolveTile(key);
    const p = ptys.get(s.id);
    if (!p) throw new Error(`${s.name} is not running.`);
    if (!text) throw new Error('Nothing to send.');
    p.write(text);
    // A separate Enter, so Claude Code does not treat it as part of a paste.
    setTimeout(() => p.write('\r'), 120);
    return { text: `Sent to ${s.name}. Check it landed with: hangarctl screen ${sessions.indexOf(s) + 1} 15` };
  },
};

// ---------- lifecycle ----------

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  look.init({ settings: () => settings, win: () => win, send });
  server = await startServer(serverHandlers);
  installHelpers();
  wireIpc();
  ipcMain.on('update:action', () => updater?.act());
  data = dataIpc.register({ ipcMain, sessions, find, addSession, uniqueName, send, broadcast, defaultWs: () => workspaces.active });
  updater = updaterMod.init({ app, onChange: (st) => { buildMenu(); send('update:state', st); } });
  pruneImages();
  buildMenu();
  createWindow();
  win.on('session-end', onSessionEnd);
  win.webContents.on('did-finish-load', applyZoom);
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  win.webContents.on('did-finish-load', () => { if (updater?.state.kind !== 'none') send('update:state', updater.state); });
  win.webContents.once('did-finish-load', () => {
    // Every open workspace's sessions come back; put away ones wait until reopened.
    for (const w of workspaces.open()) { const saved = w.tiles; w.tiles = []; resumeSessions(w.id, saved); }
    broadcast();
  });
  setInterval(pollLoop, 1000);
  setInterval(() => { if (chats.size) pollChats(); }, 400);
});

let quitting = false;
let ptysClosed = false;
app.on('before-quit', (e) => {
  if (ptysClosed) return;
  if (quitting) { e.preventDefault(); return; }
  const busy = sessions.filter((s) => s.status === 'working' || s.status === 'needs_input');
  if (busy.length && win) {
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Quit', 'Cancel'], defaultId: 1, cancelId: 1,
      message: `${busy.length} session${busy.length > 1 ? 's are' : ' is'} still working.`,
      detail: 'Quitting stops them. They can be resumed next time you open Hangar.',
    });
    if (r === 1) { e.preventDefault(); return; }
  }
  quitting = true;
  saveWorkspace();
  try { fs.unlinkSync(paths.serverFile()); } catch {}
  // Kill each pty once and wait for its exit before the app goes, so the native
  // ConPTY teardown never runs inside a dying process (the 5 Nov crash).
  e.preventDefault();
  const all = [...ptys.values()];
  if (overseer) all.push(overseer.pty);
  ptys.clear();
  lifecycle.shutdownPtys(all).finally(() => { ptysClosed = true; app.quit(); });
});

// Windows logoff or shutdown: the system ends the process within seconds, so only
// save. Closing ConPTY handles now would race the system's own teardown.
function onSessionEnd() {
  if (ptysClosed) return;
  ptysClosed = true;
  quitting = true;
  saveWorkspace();
  try { fs.unlinkSync(paths.serverFile()); } catch {}
}

app.on('window-all-closed', () => app.quit());
