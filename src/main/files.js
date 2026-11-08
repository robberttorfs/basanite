// Files for the viewer: turning a path a session printed into a real file, what
// kind it is, reading text, and serving it to the viewer through basanite-file://.
//
// Only files the app itself resolved (and, for an HTML page, the folder it sits
// in) are served, so a page shown in the viewer cannot reach the rest of the disk.
// Electron is only needed for the protocol and the watcher; the rest is plain Node
// so tests can use it.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const SCHEME = 'basanite-file';
const TEXT_MAX = 2 * 1024 * 1024;

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg'],
  markdown: ['md', 'markdown', 'mdx'],
  html: ['html', 'htm'],
  pdf: ['pdf'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus'],
  text: ['txt', 'log', 'json', 'jsonl', 'csv', 'tsv', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'diff', 'patch',
    'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs',
    'css', 'scss', 'less', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'lua', 'php', 'vue', 'svelte', 'r', 'dart', 'gradle', 'tex'],
};
const BY_EXT = new Map(Object.entries(KINDS).flatMap(([k, list]) => list.map((e) => [e, k])));
const extOf = (p) => path.extname(String(p)).slice(1).toLowerCase();
/** The viewer's kind for a file name, or null when only the text sniff can tell. */
const kindOf = (p) => BY_EXT.get(extOf(p)) || null;

/** True when the first few KB hold no NUL bytes, so it reads as text. */
function looksText(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return !buf.subarray(0, n).includes(0);
  } catch { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

/**
 * Cleans what a session printed into a path: quotes, trailing punctuation,
 * line numbers (file.js:12:3, #L12), file:// links, ~, Git Bash /c/... and WSL
 * /mnt/c/... on Windows. Relative paths resolve against the session's folder.
 */
function clean(raw, cwd, platform = process.platform) {
  let p = String(raw || '').trim();
  if (!p || p.length > 1024) return null;
  p = p.replace(/^[`'"<(\[]+/, '').replace(/[`'">)\],;.!?]+$/, '');
  if (/^file:\/\//i.test(p)) { try { p = fileURLToPath(p); } catch { return null; } }
  p = p.replace(/#L\d+(-L?\d+)?$/i, '').replace(/(\.[A-Za-z0-9]+):\d+(:\d+)?$/, '$1');
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  if (platform === 'win32') {
    const m = /^\/(?:mnt\/)?([a-zA-Z])(\/.*)?$/.exec(p);
    if (m) p = `${m[1].toUpperCase()}:${(m[2] || '/').replace(/\//g, '\\')}`;
  }
  const abs = platform === 'win32' ? path.win32.isAbsolute(p) : path.isAbsolute(p);
  if (!abs) { if (!cwd) return null; p = path.resolve(cwd, p); }
  return path.normalize(p);
}

/** What the viewer needs to know about a path, or null when it is not a file. */
function info(file) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  let kind = kindOf(file);
  if (!kind) kind = st.size <= TEXT_MAX && looksText(file) ? 'text' : 'other';
  return { path: file, name: path.basename(file), dir: path.dirname(file), ext: extOf(file), kind, size: st.size, mtime: st.mtimeMs };
}

/** Reads a text file for the viewer, up to TEXT_MAX. */
function readText(file) {
  let fd;
  try {
    const st = fs.statSync(file);
    fd = fs.openSync(file, 'r');
    const len = Math.min(st.size, TEXT_MAX);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    return { text: buf.toString('utf8'), cut: st.size > TEXT_MAX };
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// ---------- access for basanite-file:// ----------

const allowedFiles = new Set();
const allowedDirs = new Set();
const key = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/** Lets the viewer load this file (an HTML page also gets its folder, for its pictures and styles). */
function allow(i) {
  if (!i) return;
  allowedFiles.add(key(i.path));
  if (i.kind === 'html') allowedDirs.add(key(i.dir + path.sep));
}
function allowed(file) {
  const k = key(file);
  if (allowedFiles.has(k)) return true;
  for (const d of allowedDirs) if (k.startsWith(d)) return true;
  return false;
}

/** basanite-file://local/C:/dir/file.png (Windows) or basanite-file://local/Users/x/file.png */
function urlFor(file, v) {
  const u = pathToFileURL(file).href.replace(/^file:\/\/\//, `${SCHEME}://local/`).replace(/^file:\/\//, `${SCHEME}://local/`);
  return v ? `${u}?v=${Math.round(v)}` : u;
}
function fileFor(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== `${SCHEME}:`) return null;
    return path.normalize(fileURLToPath(`file:///${u.pathname.replace(/^\/+/, '')}`));
  } catch { return null; }
}

/** Call before the app is ready. */
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
}

/** Call once the app is ready: serves allowed files, with byte ranges so video can seek. */
function handleScheme(protocol) {
  protocol.handle(SCHEME, (req) => {
    const file = fileFor(req.url);
    if (!file || !allowed(file)) return new Response('Not found', { status: 404 });
    let st;
    try { st = fs.statSync(file); } catch { return new Response('Not found', { status: 404 }); }
    if (!st.isFile()) return new Response('Not found', { status: 404 });
    const type = MIME[extOf(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    if (m && st.size > 0) {
      let start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
      let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : st.size - 1;
      end = Math.min(end, st.size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
      return new Response(stream(file, start, end), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${st.size}` } });
    }
    return new Response(stream(file, 0, st.size - 1), { status: 200, headers: { ...headers, 'Content-Length': String(st.size) } });
  });
}
function stream(file, start, end) {
  const { Readable } = require('stream');
  if (end < start) return '';
  return Readable.toWeb(fs.createReadStream(file, { start, end }));
}
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
  avif: 'image/avif', svg: 'image/svg+xml', pdf: 'application/pdf', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac',
  opus: 'audio/ogg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm',
};

// ---------- what a session made or mentioned ----------

const LIST_MAX = 40;
const VERB = { Write: 'Wrote', Edit: 'Edited', MultiEdit: 'Edited', NotebookEdit: 'Edited' };
// Files Claude only read are listed when they are pictures or PDFs (screenshots it looked at).
const READ_KINDS = new Set(['image', 'pdf']);

/** A session's recent files, newest first, one entry per path. */
class FileList {
  constructor() { this.items = []; }
  add(file, verb, at = Date.now()) {
    if (!file) return false;
    const k = key(file);
    const old = this.items.findIndex((x) => key(x.path) === k);
    if (old >= 0) this.items.splice(old, 1);
    this.items.unshift({ path: file, verb, at });
    if (this.items.length > LIST_MAX) this.items.length = LIST_MAX;
    return true;
  }
  /** From transcript tool calls ({ name, input, at }). */
  fromTools(tools) {
    let changed = false;
    for (const t of tools) {
      const i = t.input || {};
      const f = i.file_path || i.notebook_path;
      if (!f || typeof f !== 'string') continue;
      if (VERB[t.name]) changed = this.add(f, VERB[t.name], t.at) || changed;
      else if (t.name === 'Read' && READ_KINDS.has(kindOf(f))) changed = this.add(f, 'Read', t.at) || changed;
    }
    return changed;
  }
  /** From paths in Claude's replies ({ path, at }); only ones that exist. */
  fromMentions(list) {
    let changed = false;
    for (const m of list) if (info(m.path)) changed = this.add(m.path, 'Mentioned', m.at) || changed;
    return changed;
  }
  /** The newest listed file whose path ends with this relative name, or null. */
  match(raw) {
    const tail = String(raw).replace(/:\d+(:\d+)?$/, '').replace(/^\.[\\/]/, '').replace(/\\/g, '/').toLowerCase();
    if (!tail || /^([a-z]:)?\//.test(tail)) return null;
    const hit = this.items.find((x) => { const p = x.path.replace(/\\/g, '/').toLowerCase(); return p === tail || p.endsWith(`/${tail}`); });
    return hit ? info(hit.path) : null;
  }
  /** For the viewer: what still exists, with its kind. */
  list() {
    return this.items.map((x) => { const i = info(x.path); return i && { ...i, verb: x.verb, at: x.at }; }).filter(Boolean);
  }
  get size() { return this.items.length; }
}

// Absolute paths with a known file kind, as Claude writes them in a reply.
const WIN_PATH = /[A-Za-z]:[\\/](?:[^\s"'`<>|*?\\/]+[\\/])*[^\s"'`<>|*?\\/]+\.[A-Za-z0-9]{1,8}/g;
const POSIX_PATH = /(?:^|[\s(`'"])((?:~|\/)(?:[^\s"'`<>|*?/]+\/)*[^\s"'`<>|*?/]+\.[A-Za-z0-9]{1,8})/g;
/** Absolute file paths in a piece of text that the viewer can show. */
function pathsIn(text, platform = process.platform) {
  const out = new Set();
  const s = String(text || '');
  if (s.length > 200000) return [];
  if (platform === 'win32') for (const m of s.matchAll(WIN_PATH)) out.add(m[0]);
  for (const m of s.matchAll(POSIX_PATH)) {
    if (platform === 'win32' && !/^\/(mnt\/)?[a-z]\//i.test(m[1]) && !m[1].startsWith('~')) continue;
    out.add(m[1]);
  }
  return [...out].map((p) => p.replace(/[.,;:!?)\]]+$/, '')).filter((p) => kindOf(p) && kindOf(p) !== 'text');
}

// ---------- live reload ----------

let watched = null;
/** Watches one file (the open one) and calls onChange(info) when it changes. */
function watch(file, onChange) {
  unwatch();
  if (!file) return;
  const fn = (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) onChange(info(file)); };
  fs.watchFile(file, { interval: 700 }, fn);
  watched = { file, fn };
}
function unwatch() {
  if (watched) { fs.unwatchFile(watched.file, watched.fn); watched = null; }
}

module.exports = {
  SCHEME, TEXT_MAX, KINDS, kindOf, clean, info, readText, allow, allowed, urlFor, fileFor,
  registerScheme, handleScheme, FileList, pathsIn, watch, unwatch,
};
