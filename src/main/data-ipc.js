// The data side of the tile features: doing line, git chip, changes, same-file
// warning, history, fork, worktree, usage. main.js calls register() once.
//
// Snapshot fields added to every tile (see session.js and below):
//   doing: string|null            current step while working ("Editing routes.ts")
//   git: { branch, dirty }|null   null for non-git folders or before the first read
//   overlaps: [{ file, otherId }] files another live session also edited in the last 30 min
//   cacheCold: bool, cacheTtlMin: 5|60, lastResponseAt: ms|null
// IPC (renderer -> main, all ipcRenderer.invoke):
//   git:changes(tileId)              -> { git, root, branch, files:[{path,status}], fileCount, diff, truncated }
//   history:list(cwd)                -> [{ sessionId, firstPrompt, lastActivity, messageCount, size }]
//   history:search(cwd, query)       -> [{ sessionId, role, snippet, at }]
//   history:open(cwd, sessionId)     -> new tile id (resumes that conversation)
//   tile:fork(tileId)                -> new tile id | null  (claude --resume <id> --fork-session)
//   tile:worktree(cwd, name?)        -> { id, dir, branch } | { error }
//   usage:history(days)              -> { days:[{day,input,output,cacheRead,cacheWrite,costUSD,messages}], projects:[...], total, estimate }
// Event (main -> renderer): 'tile:overlap' { file, a, b }  once per pair and file.
const fs = require('fs');
const { GitInfo } = require('./git');
const { Overlaps } = require('./overlaps');
const { Usage } = require('./usage');
const history = require('./history');
const { services } = require('./session');

function register({ ipcMain, sessions, find, addSession, uniqueName, send, broadcast, defaultWs, hasConversation = (s) => !!s.transcriptPath }) {
  const git = new GitInfo();
  const usage = new Usage();
  const overlaps = new Overlaps({ isLive: (id) => { const s = find(id); return !!s && s.status !== 'exited' && !(s.kind === 'shell' && !s.hosted); } });

  services.onEdit = (s, file) => {
    for (const ev of overlaps.record(s.id, file)) send('tile:overlap', ev);
    git.refresh(s.cwd, true).then((changed) => { if (changed) broadcast(); });
    broadcast();
  };
  services.onStop = (s) => { git.refresh(s.cwd, true).then((changed) => { if (changed) broadcast(); }); };
  services.enrich = (s, snap, now) => {
    snap.git = git.peek(s.cwd);
    snap.overlaps = overlaps.forSession(s.id, now);
  };

  ipcMain.handle('git:changes', (_e, id) => { const s = find(id); return s ? git.changes(s.cwd) : { git: false, files: [], fileCount: 0, diff: '', truncated: false }; });
  ipcMain.handle('history:list', (_e, cwd) => history.list(cwd));
  ipcMain.handle('history:search', (_e, cwd, q) => history.search(cwd, q));
  ipcMain.handle('history:open', (_e, cwd, sessionId) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(sessionId))) return null;
    try { if (!fs.statSync(cwd).isDirectory()) return null; } catch { return null; }
    // Already open in a tile: go there, never run two claude --resume on one transcript.
    const open = sessions.find((x) => x.sessionId === sessionId && x.status !== 'exited');
    if (open) return open.id;
    return addSession({ cwd, sessionId, ws: defaultWs() }, 'resume').id;
  });
  ipcMain.handle('tile:fork', (_e, id) => {
    const s = find(id);
    if (!s || !s.sessionId || (s.kind === 'shell' && !s.hosted) || !hasConversation(s)) return null;
    // The fork's history already holds the mode and add-on text, so they count as sent.
    return addSession({ ...forkOpts(s), name: uniqueName(`${s.name} fork`) }, 'fork').id;
  });
  ipcMain.handle('tile:worktree', async (_e, cwd, name) => {
    const r = await git.createWorktree(cwd, name);
    if (r.error) return r;
    return { id: addSession({ cwd: r.dir, ws: defaultWs() }, 'new').id, dir: r.dir, branch: r.branch };
  });
  ipcMain.handle('usage:history', (_e, days) => usage.history(days));

  return { git, overlaps, usage, forget: (id) => overlaps.forget(id) };
}

/** What a fork carries over from its source tile. */
function forkOpts(s) {
  return { cwd: s.cwd, forkOf: s.sessionId, ws: s.ws, mode: s.mode, modeApplied: s.modeApplied, addons: [...(s.addons || [])], addonsApplied: [...(s.addonsApplied || [])] };
}

module.exports = { register, forkOpts };
