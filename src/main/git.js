// Git facts for session folders, read with the git CLI and short timeouts.
// Results are shared per repo root, so ten sessions in one repo cost one call.
const { execFile } = require('child_process');
const path = require('path');
const fsp = require('fs/promises');

const MAX_AGE_MS = 60 * 1000;      // routine refresh, at most this often per repo
const MIN_GAP_MS = 2000;           // forced refreshes still wait this long
const DIFF_CAP = 200 * 1024;

function run(args, cwd, opts) {
  const { timeout = 4000, maxBuffer = 4 * 1024 * 1024 } = opts || {};
  return new Promise((resolve) => {
    // --no-optional-locks: background reads never take index.lock, so they cannot
    // collide with Claude's own git add / commit.
    execFile('git', ['--no-optional-locks', '-c', 'core.quotepath=off', ...args], { cwd, timeout, maxBuffer, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => resolve(err && !stdout ? null : String(stdout)));
  });
}

/** Parses `git status --porcelain=v1 -b -z` (NUL separated, paths never quoted); plain lines also work. */
function parseStatus(text) {
  const raw = String(text || '');
  const z = raw.includes('\0');
  const lines = raw.split(z ? '\0' : '\n').filter(Boolean);
  let branch = null;
  const files = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## ')) {
      const h = l.slice(3);
      if (/^HEAD \(no branch\)/.test(h)) branch = 'detached';
      else if (/^No commits yet on /.test(h)) branch = h.replace(/^No commits yet on /, '');
      else if (/^Initial commit on /.test(h)) branch = h.replace(/^Initial commit on /, '');
      else branch = h.split('...')[0].split(' ')[0];
    } else {
      const status = l.slice(0, 2);
      let p = l.slice(3);
      if (status[0] === 'R' || status[0] === 'C') { if (z) i++; else p = p.split(' -> ').pop(); } // -z: the old path follows
      files.push({ path: p, status: status.trim() || '?' });
    }
  }
  return { branch, files };
}

/**
 * `git diff` leaves out untracked files, so the changes peek had nothing to show
 * for them. Build a "new file" section for each: its contents as added lines,
 * capped per file and in total; binary or unreadable files are named as such.
 */
async function untrackedDiff(root, files, budget) {
  const PER_FILE = 64 * 1024;
  let out = '';
  for (const f of files.filter((x) => x.status === '??').slice(0, 50)) {
    if (out.length >= budget) break;
    let body;
    try {
      const fh = await fsp.open(path.join(root, f.path), 'r');
      try {
        const buf = Buffer.alloc(PER_FILE);
        const { bytesRead } = await fh.read(buf, 0, PER_FILE, 0);
        const size = (await fh.stat()).size;
        const chunk = buf.subarray(0, bytesRead);
        if (chunk.includes(0)) body = ['@@ new file @@', ' Binary file'];
        else {
          const lines = chunk.toString('utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
          body = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => '+' + l)];
          if (size > PER_FILE) body.push(' (file continues)');
        }
      } finally { await fh.close(); }
    } catch { body = ['@@ new file @@', ' Could not read this file']; }
    out += [`diff --git a/${f.path} b/${f.path}`, 'new file', ...body].join('\n') + '\n';
  }
  return out;
}

/** Where a new worktree goes: beside the repo, never inside it: <parent>/.<repo>-worktrees/<name>. */
function worktreeDir(root, slug) {
  return path.join(path.dirname(root), `.${path.basename(root)}-worktrees`, slug);
}

class GitInfo {
  constructor(o) {
    const { runner = run, now = () => Date.now() } = o || {};
    this.run = runner;
    this.now = now;
    this.roots = new Map();     // cwd -> { root|null, at }
    this.repos = new Map();     // root -> { branch, dirty, at, busy }
  }

  async rootOf(cwd) {
    const c = this.roots.get(cwd);
    if (c && this.now() - c.at < 5 * 60 * 1000) return c.root;
    const out = await this.run(['rev-parse', '--show-toplevel'], cwd, { timeout: 3000 });
    const root = out ? path.resolve(out.trim()) : null;
    this.roots.set(cwd, { root, at: this.now() });
    return root;
  }

  /** Cached { branch, dirty } for a folder, or null (not git, or not read yet). Never blocks. */
  peek(cwd) {
    const c = this.roots.get(cwd);
    if (!c) { this.refresh(cwd); return null; }
    if (!c.root) return null;
    const r = this.repos.get(c.root);
    if (!r || r.branch === undefined) { this.refresh(cwd); return null; }
    if (this.now() - r.at > MAX_AGE_MS) this.refresh(cwd);
    return { branch: r.branch, dirty: r.dirty };
  }

  /** Re-reads the repo of a folder. force = after an edit or a finished turn. Resolves to true if values changed. */
  async refresh(cwd, force = false) {
    const root = await this.rootOf(cwd);
    if (!root) return false;
    let r = this.repos.get(root);
    if (!r) { r = { branch: undefined, dirty: false, at: -Infinity, busy: false }; this.repos.set(root, r); }
    const age = this.now() - r.at;
    if (r.busy || age < (force ? MIN_GAP_MS : MAX_AGE_MS)) return false;
    r.busy = true;
    try {
      const out = await this.run(['status', '--porcelain=v1', '-b', '-z'], root, { timeout: 4000 });
      r.at = this.now();
      if (out == null) return false;
      const st = parseStatus(out);
      const dirty = st.files.length > 0;
      const changed = r.branch !== st.branch || r.dirty !== dirty;
      r.branch = st.branch;
      r.dirty = dirty;
      return changed;
    } finally { r.busy = false; }
  }

  /** Makes a worktree on a new branch for a parallel session (F3). Returns { dir, branch } or { error }. */
  async createWorktree(cwd, name) {
    const root = await this.rootOf(cwd);
    if (!root) return { error: 'Not a git folder.' };
    const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      || 'wt-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const dir = worktreeDir(root, slug);
    const branch = `hangar/${slug}`;
    const out = await this.run(['worktree', 'add', '-b', branch, dir], root, { timeout: 30000 });
    if (out == null) return { error: 'Could not create the worktree (the branch or folder may already exist).' };
    return { dir, branch };
  }

  /** Changed files and a unified diff for the repo of a folder (E3). Read-only. */
  async changes(cwd, o) {
    const diffCap = (o && o.diffCap) || DIFF_CAP;
    const root = await this.rootOf(cwd);
    if (!root) return { git: false, files: [], fileCount: 0, diff: '', truncated: false };
    const st = parseStatus(await this.run(['status', '--porcelain=v1', '-b', '-z', '-uall'], root, { timeout: 6000 }) || '');
    let diff = await this.run(['diff', 'HEAD', '--no-color', '--no-ext-diff'], root, { timeout: 8000, maxBuffer: Math.max(diffCap * 4, 1024 * 1024) });
    if (diff == null) diff = await this.run(['diff', '--no-color', '--no-ext-diff'], root, { timeout: 8000, maxBuffer: Math.max(diffCap * 4, 1024 * 1024) });
    diff = diff || '';
    if (diff.length < diffCap) diff += await untrackedDiff(root, st.files, diffCap - diff.length);
    const truncated = diff.length > diffCap;
    if (truncated) diff = diff.slice(0, diffCap);
    return { git: true, root, branch: st.branch, files: st.files.slice(0, 500), fileCount: st.files.length, diff, truncated };
  }
}

module.exports = { GitInfo, parseStatus, worktreeDir };
