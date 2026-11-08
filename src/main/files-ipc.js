// The file viewer's side of the main process: resolving paths sessions print,
// a session's recent files, text for the viewer, live reload, open and reveal.
'use strict';

const files = require('./files');

/** Adds the viewer's url to a file's info, and lets the viewer load it. */
function withUrl(i) {
  if (!i) return null;
  files.allow(i);
  return { ...i, url: files.urlFor(i.path, i.mtime) };
}

function register({ ipcMain, shell, protocol, find, send }) {
  files.handleScheme(protocol);

  // A path as a session printed it, against the session's folder. Null when it is not a file.
  ipcMain.handle('file:resolve', (_e, raw, cwd) => {
    const p = files.clean(raw, cwd);
    return p ? withUrl(files.info(p)) : null;
  });
  // Several at once (a terminal line, a reply): raw -> info or null.
  ipcMain.handle('file:resolve-many', (_e, list, cwd, tileId) => {
    const known = find(tileId)?.files;
    const out = {};
    for (const raw of (Array.isArray(list) ? list : []).slice(0, 40)) {
      const p = files.clean(raw, cwd);
      // A bare name the session worked on somewhere below its start folder.
      out[raw] = withUrl((p && files.info(p)) || (known && known.match(raw)) || null);
    }
    return out;
  });
  ipcMain.handle('file:read', (_e, p) => (files.allowed(String(p)) ? files.readText(String(p)) : null));
  ipcMain.handle('files:list', (_e, id) => (find(id)?.files?.list() || []).map(withUrl));
  ipcMain.on('file:watch', (_e, p) => {
    if (!p || !files.allowed(String(p))) { files.unwatch(); return; }
    files.watch(String(p), (i) => send('file:changed', { path: String(p), info: withUrl(i) }));
  });
  ipcMain.handle('file:open', (_e, p) => (files.allowed(String(p)) ? shell.openPath(String(p)) : 'Not allowed'));
  ipcMain.handle('file:reveal', (_e, p) => { if (files.allowed(String(p))) shell.showItemInFolder(String(p)); });
}

module.exports = { register, withUrl };
