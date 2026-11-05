// Modes 2.0 wiring in the main process: add-ons, per-project defaults, Until done
// (Claude Code's /goal), mode files and one-click review commands. Kept out of
// main.js so the shared file only gains a line or two.
'use strict';
const fs = require('fs');
const path = require('path');
const modes = require('./modes');

/** The text Hangar types for Until done. The turn cap is part of the condition, as the /goal docs advise. */
function goalCommand(condition, turns) {
  const cond = String(condition || '').replace(/\s+/g, ' ').trim().slice(0, 3800);
  if (!cond) return null;
  const n = Math.max(1, Math.min(200, Math.round(Number(turns) || 20)));
  return `/goal ${cond}, or stop after ${n} turns`;
}

// Claude Code's own bundled commands, typed into the session as if the user typed them.
const RUN_COMMANDS = { review: '/code-review', simplify: '/simplify' };

/** Which mode a new session starts in: the New dialog's explicit pick, else the folder's, else the workspace's. */
function startMode(sessionMode, cwd, wsDefault) {
  const s = String(sessionMode || '');
  if (s === 'none') return null;
  if (s && !s.startsWith('default')) return s;
  // Left alone ('default:<what it showed>') or not asked at all: the folder's own mode wins.
  const folder = modes.projectDefault(cwd);
  if (folder) return folder;
  if (s.startsWith('default:')) { const shown = s.slice(8); return shown && shown !== 'none' ? shown : null; }
  return wsDefault || null;
}

function wire({ ipcMain, dialog, getWin, find, typeInto, changed }) {
  const leaveGoal = (s, next) => {
    // Leaving Until done clears the /goal Hangar set, so the loop stops with the mode.
    if (s.goalSet && !modes.get(next)?.goal) { typeInto(s, '/goal clear'); s.goalSet = false; }
  };

  ipcMain.on('tile:mode', (_e, { id, mode }) => {
    const s = find(id);
    if (!s) return;
    leaveGoal(s, mode);
    s.setMode(mode);
    if (s.kind !== 'shell') modes.setProjectDefault(s.cwd, mode);
  });
  ipcMain.on('tile:addon', (_e, { id, addon, on }) => find(id)?.setAddon(addon, !!on));
  ipcMain.handle('tile:goal', (_e, { id, condition, turns }) => {
    const s = find(id);
    const text = goalCommand(condition, turns);
    const goal = modes.list().find((m) => m.goal);
    if (!s || !text || !goal) return false;
    s.setMode(goal.id);
    modes.setProjectDefault(s.cwd, goal.id);
    s.goalSet = true;
    return typeInto(s, text);
  });
  ipcMain.handle('tile:run-command', (_e, { id, which }) => {
    const s = find(id);
    const cmd = RUN_COMMANDS[which];
    return !!(s && cmd && s.kind !== 'shell' && typeInto(s, cmd));
  });

  ipcMain.handle('modes:export', async (_e, id) => {
    const m = modes.get(id);
    if (!m) return null;
    const name = `${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mode'}${modes.FILE_EXT}`;
    const r = await dialog.showSaveDialog(getWin(), { defaultPath: name, filters: [{ name: 'Hangar mode', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, `${JSON.stringify(modes.toFile(m), null, 2)}\n`);
    return r.filePath;
  });
  const importPath = (file) => {
    if (!file || !String(file).toLowerCase().endsWith('.json')) throw new Error('Not a mode file.');
    const st = fs.statSync(file);
    if (st.size > 64 * 1024) throw new Error('Not a mode file.');
    const m = modes.importFile(fs.readFileSync(file, 'utf8'));
    changed();
    return m;
  };
  ipcMain.handle('modes:import', async (_e, file) => {
    try {
      if (!file) {
        const r = await dialog.showOpenDialog(getWin(), { properties: ['openFile'], filters: [{ name: 'Hangar mode', extensions: ['json'] }] });
        if (r.canceled || !r.filePaths[0]) return null;
        file = r.filePaths[0];
      }
      return { mode: importPath(path.resolve(file)) };
    } catch (err) { return { error: err.message }; }
  });
}

module.exports = { wire, goalCommand, startMode, RUN_COMMANDS };
