// Small folder actions for the tile ⋯ menu and the palette (E6, F3):
// reveal a folder, open it in an editor, and tell whether a folder is in a git repo.
// main.js calls register() once.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const isWin = process.platform === 'win32';

/** The command for a GUI editor: $VISUAL, then $EDITOR, then `code` on PATH. Terminal editors are skipped. */
const TERMINAL_EDITORS = /^(vi|vim|nvim|nano|emacs|ed|micro|helix|hx|kak|joe|pico)(\.exe)?$/i;
function editorFromEnv(env = process.env) {
  for (const k of ['VISUAL', 'EDITOR']) {
    const v = String(env[k] || '').trim();
    if (!v) continue;
    const bin = path.basename(v.split(/\s+/)[0]);
    if (!TERMINAL_EDITORS.test(bin)) return v;
  }
  return null;
}
function onPath(cmd) {
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out).split(/\r?\n/)[0].trim() || null));
  });
}
let editorCache;
async function findEditor() {
  if (editorCache !== undefined) return editorCache;
  const env = editorFromEnv();
  if (env) return (editorCache = { cmd: env, name: path.basename(env.split(/\s+/)[0]).replace(/\.(exe|cmd|bat)$/i, '') });
  const code = await onPath('code');
  editorCache = code ? { cmd: 'code', name: 'VS Code' } : null;
  return editorCache;
}

/** Walks up from dir looking for .git (a folder, or a file in worktrees). */
function inGit(dir) {
  let d = path.resolve(String(dir || ''));
  for (let i = 0; i < 40; i++) {
    try { if (fs.existsSync(path.join(d, '.git'))) return true; } catch { return false; }
    const up = path.dirname(d);
    if (up === d) return false;
    d = up;
  }
  return false;
}

function register({ ipcMain, shell }) {
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  ipcMain.handle('folder:reveal', (_e, dir) => (isDir(dir) ? shell.openPath(dir) : 'Not a folder'));
  ipcMain.handle('folder:editor', async () => { const e = await findEditor(); return e ? e.name : null; });
  ipcMain.handle('folder:open-editor', async (_e, dir) => {
    const e = await findEditor();
    if (!e || !isDir(dir)) return false;
    const parts = e.cmd.split(/\s+/);
    const child = spawn(parts[0], [...parts.slice(1), isWin ? `"${dir}"` : dir], { detached: true, stdio: 'ignore', shell: isWin, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  });
  ipcMain.handle('folder:is-git', (_e, dir) => inGit(dir));
}

module.exports = { register, editorFromEnv, inGit };
