// Small folder actions for the tile ⋯ menu and the palette (E6, F3):
// reveal a folder, open it in an editor, and tell whether a folder is in a git repo.
// main.js calls register() once.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const TERMINAL_EDITORS = /^(vi|vim|nvim|nano|emacs|ed|micro|helix|hx|kak|joe|pico)(\.exe)?$/i;
// GUI editors looked for between VISUAL and EDITOR (EDITOR is often notepad or vim).
const KNOWN = [
  { bin: 'code', name: 'VS Code', mac: 'Visual Studio Code', win: ['Programs/Microsoft VS Code/bin/code.cmd'] },
  { bin: 'cursor', name: 'Cursor', mac: 'Cursor', win: ['Programs/cursor/resources/app/bin/cursor.cmd'] },
  { bin: 'zed', name: 'Zed', mac: 'Zed', win: ['Programs/Zed/bin/zed.exe'] },
];

/**
 * Splits an editor command into program and arguments. Quotes group words, and an
 * unquoted path with spaces (C:\Program Files\...\code.exe --wait) is found by
 * trying the longest leading part that exists as a file.
 */
function splitCommand(cmd, exists = fs.existsSync) {
  const s = String(cmd || '').trim();
  if (!s) return [];
  if (!/^["']/.test(s)) {
    const words = s.split(/\s+/);
    for (let k = words.length; k > 1; k--) {
      const head = words.slice(0, k).join(' ');
      if (/[\\/]/.test(head) && exists(head)) return [head, ...words.slice(k)];
    }
  }
  const out = [];
  let cur = ''; let q = null; let had = false;
  for (const c of s) {
    if (q) { if (c === q) q = null; else cur += c; } else if (c === '"' || c === "'") { q = c; had = true; } else if (/\s/.test(c)) { if (cur || had) out.push(cur); cur = ''; had = false; } else cur += c;
  }
  if (cur || had) out.push(cur);
  return out;
}

/** The first GUI editor command among the given variables (terminal editors are skipped), as a string. */
function editorFromEnv(env = process.env, keys = ['VISUAL', 'EDITOR'], exists) {
  for (const k of keys) {
    const v = String(env[k] || '').trim();
    if (!v) continue;
    const parts = splitCommand(v, exists);
    if (parts.length && !TERMINAL_EDITORS.test(path.basename(parts[0]))) return v;
  }
  return null;
}

const nameOf = (bin) => path.basename(bin).replace(/\.(exe|cmd|bat)$/i, '');

/**
 * Picks the editor: VISUAL, then VS Code / Cursor / Zed (PATH, then their usual
 * install places), then EDITOR. Returns { argv: [program, ...args], name } or null.
 * deps: { env, platform, onPath(bin) -> path|null, exists(path) -> bool, home }
 */
async function resolveEditor(deps) {
  const { env = process.env, platform = process.platform, onPath: which = onPath, exists = fs.existsSync, home = os.homedir() } = deps || {};
  const fromVar = (key) => {
    const v = editorFromEnv(env, [key], exists);
    if (!v) return null;
    const argv = splitCommand(v, exists);
    return { argv, name: nameOf(argv[0]) };
  };
  const visual = fromVar('VISUAL');
  if (visual) return visual;
  for (const k of KNOWN) {
    const p = await which(k.bin);
    if (p) return { argv: [p], name: k.name };
    if (platform === 'darwin') {
      for (const dir of ['/Applications', path.join(home, 'Applications')]) {
        if (exists(path.join(dir, `${k.mac}.app`))) return { argv: ['open', '-a', k.mac], name: k.name };
      }
    }
    if (platform === 'win32') {
      const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      for (const rel of k.win) { const f = path.join(local, rel); if (exists(f)) return { argv: [f], name: k.name }; }
    }
  }
  return fromVar('EDITOR');
}

function onPath(cmd) {
  // Started from Finder, the app has no login-shell PATH: add the usual bin folders.
  const env = isMac ? { ...process.env, PATH: `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin` } : process.env;
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { timeout: 3000, windowsHide: true, env }, (err, out) => resolve(err ? null : String(out).split(/\r?\n/)[0].trim() || null));
  });
}
let editorCache;
async function findEditor() {
  if (editorCache === undefined) editorCache = await resolveEditor();
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
    const [prog, ...args] = e.argv;
    // .cmd launchers need the Windows shell; quote every part there so spaces survive.
    const winShell = isWin && /\.(cmd|bat)$/i.test(prog) || (isWin && !/[\\/]/.test(prog));
    const q = (a) => (winShell && /[\s&()^]/.test(a) ? `"${a}"` : a);
    const child = spawn(q(prog), [...args, dir].map(q), { detached: true, stdio: 'ignore', shell: winShell, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  });
  ipcMain.handle('folder:is-git', (_e, dir) => inGit(dir));
}

module.exports = { register, editorFromEnv, inGit, splitCommand, resolveEditor };
