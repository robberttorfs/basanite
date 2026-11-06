// Mode guards: real limits behind a mode's words. Basanite's PreToolUse hook asks
// check() before a tool runs; a deny comes back to Claude as a one-line reason.
// No guard on, or a tool the guard allows: nothing is returned, so no tokens.
//   'readonly' (Review, Plan): no file edits, no shell commands that clearly write.
//   'risky'    (Careful): no push, deploy, publish or destructive commands.
// Shell checks read the command as words (shellparse.js), so quoted text and the
// arguments of grep, rg, awk and friends never count: only the command in each
// position, its own flags, and redirections to real files do. Code run through
// `python -c` or `node -e` is not looked into; the guard stops commands that
// clearly write, not every possible write.
'use strict';

const { parse } = require('./shellparse');

const GUARDS = ['readonly', 'risky'];
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
// The hook matcher: every tool a guard may stop, plus what session.js already watches.
const MATCHER = 'AskUserQuestion|ExitPlanMode|Agent|Task|Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell';

const NULLISH = /^(\/dev\/(null|stdout|stderr|tty)|\$null|nul|con)$/i;
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'timeout', 'stdbuf',
  'if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'call']);
const WRAP_ARG = { sudo: ['-u', '-g', '-h', '-p', '-C'], nice: ['-n'], timeout: ['-s', '-k', '--signal', '--kill-after'] };
// Commands that change files whatever their arguments.
const WRITE_CMDS = new Set(['rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'ln', 'chmod', 'chown', 'chgrp', 'truncate', 'dd',
  'install', 'unlink', 'shred', 'rsync', 'patch',
  'del', 'erase', 'copy', 'move', 'ren', 'rename', 'md', 'rd', 'xcopy', 'robocopy', 'mklink',
  'set-content', 'add-content', 'out-file', 'new-item', 'remove-item', 'move-item', 'copy-item', 'rename-item',
  'clear-content', 'set-item', 'tee-object', 'ni', 'ri', 'mi', 'cpi', 'rni', 'sc', 'ac', 'clc']);
const GIT_WRITES = new Set(['add', 'commit', 'push', 'reset', 'checkout', 'switch', 'restore', 'merge', 'rebase', 'am',
  'cherry-pick', 'revert', 'clean', 'rm', 'mv', 'pull', 'init', 'clone']);
const GIT_GLOBAL_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
const BRANCH_LIST = /^(-l|--list|-a|--all|-r|--remotes|-v+|--verbose|--contains|--no-contains|--merged|--no-merged|--points-at|--show-current|--sort.*|--format.*|--column.*|--color.*)$/;
const PKG = {
  npm: ['i', 'install', 'add', 'remove', 'uninstall', 'rm', 'r', 'un', 'ci', 'update', 'up', 'upgrade', 'publish', 'link', 'unlink', 'init', 'version', 'prune', 'dedupe'],
  pip: ['install', 'uninstall'],
  poetry: ['add', 'remove', 'install', 'update', 'publish', 'lock'],
  uv: ['add', 'remove', 'sync', 'lock', 'install', 'uninstall', 'publish'],
  cargo: ['install', 'add', 'remove', 'update', 'publish', 'uninstall'],
  go: ['get', 'install'],
  gem: ['install', 'uninstall', 'update', 'push'],
  brew: ['install', 'uninstall', 'remove', 'upgrade', 'update', 'reinstall'],
  apt: ['install', 'remove', 'purge', 'upgrade', 'update', 'autoremove'],
  winget: ['install', 'uninstall', 'upgrade'],
  choco: ['install', 'uninstall', 'upgrade'],
};
for (const k of ['pnpm', 'yarn', 'bun']) PKG[k] = PKG.npm;
PKG.pip3 = PKG.pip; PKG['apt-get'] = PKG.apt;
const DEPLOYERS = new Set(['vercel', 'netlify', 'firebase', 'fly', 'flyctl', 'heroku', 'wrangler', 'railway', 'surge']);
const DB_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'duckdb', 'clickhouse', 'clickhouse-client', 'cockroach', 'mongosh', 'mongo', 'redis-cli']);
const SQL_RISKY = /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b|\bDELETE\s+FROM\b|\bFLUSHALL\b|\bdropDatabase\b/i;

const REASON = {
  readonly: (mode) => `${mode} mode is read-only in Basanite: no file changes. Report instead, or ask the user to switch mode.`,
  risky: (mode) => `${mode} mode blocks pushes, deploys and destructive commands in Basanite. Ask the user to run it themselves.`,
};

function baseName(w) { return String(w).replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase(); }
function positional(args) { return args.filter((a) => !a.startsWith('-')); }
function shortFlags(args) { return args.filter((a) => /^-[^-]/.test(a)).map((a) => a.slice(1)).join(''); }

/** Reads one simple command (its words): { write, risky }. */
function classify(words, seg, flavour, depth) {
  const out = { write: false, risky: false };
  const add = (r) => { out.write = out.write || r.write; out.risky = out.risky || r.risky; };
  let i = 0;
  // Skip VAR=value prefixes and wrappers (sudo, env, nohup, timeout 5, xargs -n 1 ...).
  for (;;) {
    const w = words[i];
    if (w === undefined) return out;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    const b = baseName(w);
    if (b === 'xargs') {
      i++;
      while (words[i] && words[i].startsWith('-')) i += (/^-[IndPLsEa]$/.test(words[i]) ? 2 : 1);
      continue;
    }
    if (!WRAPPERS.has(b)) break;
    i++;
    const takes = WRAP_ARG[b] || [];
    while (words[i] && (words[i].startsWith('-') || (b === 'env' && /^[A-Za-z_]\w*=/.test(words[i])))) i += (takes.includes(words[i]) ? 2 : 1);
    if ((b === 'nice' || b === 'timeout') && words[i] && /^[\d.]+[smhd]?$/.test(words[i])) i++;
  }
  const name = baseName(words[i]);
  const args = words.slice(i + 1);
  const isPs = flavour === 'ps';

  // A command run through another shell, eval or find -exec: read that command too.
  if (SHELLS.has(name) || ['cmd', 'powershell', 'pwsh', 'eval', 'find'].includes(name)) {
    if (depth >= 4) return out;
    if (SHELLS.has(name)) {
      const k = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
      if (k >= 0 && args[k + 1] !== undefined) add(analyse(args[k + 1], 'sh', depth + 1));
    } else if (name === 'cmd') {
      const k = args.findIndex((a) => /^\/[ck]$/i.test(a));
      if (k >= 0) add(analyse(args.slice(k + 1).join(' '), 'ps', depth + 1));
    } else if (name === 'powershell' || name === 'pwsh') {
      const k = args.findIndex((a) => /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a));
      if (k >= 0) add(analyse(args.slice(k + 1).join(' '), 'ps', depth + 1));
    } else if (name === 'eval') {
      add(analyse(args.join(' '), 'sh', depth + 1));
    } else {
      if (args.includes('-delete')) out.write = true;
      args.forEach((a, k) => {
        if (!/^-(exec|execdir|ok|okdir)$/.test(a)) return;
        let e = k + 1;
        while (e < args.length && args[e] !== ';' && args[e] !== '+') e++;
        add(classify(args.slice(k + 1, e), { heredoc: '' }, flavour, depth + 1));
      });
    }
    return out;
  }

  if (WRITE_CMDS.has(name)) out.write = true;
  // rm -rf (and PowerShell's rm/del -Recurse, cmd's rd /s) cannot be undone.
  if (name === 'rm' && !isPs) {
    const f = shortFlags(args);
    if ((/[rR]/.test(f) || args.includes('--recursive')) && (f.includes('f') || args.includes('--force'))) out.risky = true;
  }
  if (['remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir'].includes(name) || (isPs && name === 'rm')) {
    if (args.some((a) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(a))) out.risky = true;
  }
  if ((name === 'rd' || name === 'rmdir') && args.some((a) => /^\/s$/i.test(a))) out.risky = true;
  if (name === 'tee' && positional(args).some((a) => !NULLISH.test(a))) out.write = true;
  if (name === 'sed' && args.some((a) => /^-[nErsuz]*i/.test(a) || a.startsWith('--in-place'))) out.write = true;
  if (name === 'perl' && args.some((a) => /^-[pnlaws0-9]*i/.test(a))) out.write = true;
  if (name === 'curl') {
    const k = args.findIndex((a) => /^(-o|--output|-O|--remote-name)$/.test(a));
    if (k >= 0 && (/^(-O|--remote-name)$/.test(args[k]) || (args[k + 1] !== '-' && !NULLISH.test(args[k + 1] || '')))) out.write = true;
  }
  if (name === 'wget') {
    const k = args.indexOf('-O');
    const toStdout = k >= 0 && (args[k + 1] === '-' || NULLISH.test(args[k + 1] || ''));
    if (!toStdout && !args.includes('--spider') && !args.some((a) => /^-[a-zA-Z]*O-$/.test(a))) out.write = true;
  }
  if (name === 'git') add(gitCheck(args));
  let pkg = name; let pargs = args;
  if (['python', 'python3', 'py'].includes(name) && args[0] === '-m' && args[1]) { pkg = baseName(args[1]); pargs = args.slice(2); }
  if (pkg === 'uv' && pargs[0] === 'pip') pargs = pargs.slice(1);
  if (PKG[pkg]) {
    const sub = positional(pargs)[0];
    if ((sub && PKG[pkg].includes(sub)) || (pkg === 'yarn' && !sub)) out.write = true;
    if (['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'uv', 'poetry'].includes(pkg) && sub === 'publish') out.risky = true;
    if (pkg === 'gem' && sub === 'push') out.risky = true;
  }
  if (name === 'twine' && args[0] === 'upload') out.risky = true;
  if (DEPLOYERS.has(name) && args.some((a) => /^(deploy|--prod|publish|promote)$/.test(a))) out.risky = true;
  if (name === 'docker' && positional(args)[0] === 'push') out.risky = true;
  if (name === 'kubectl' && ['apply', 'delete', 'rollout'].includes(positional(args)[0])) out.risky = true;
  if (name === 'terraform' && ['apply', 'destroy'].includes(positional(args)[0])) out.risky = true;
  if (name === 'gh') {
    const [a, b] = positional(args);
    if ((a === 'pr' && b === 'merge') || (a === 'release' && b === 'create') || (a === 'repo' && b === 'delete')) out.risky = true;
  }
  if (name === 'pkill' || name === 'killall') out.risky = true;
  if (name === 'taskkill' && args.some((a) => /^[/-]im$/i.test(a))) out.risky = true;
  // SQL counts only when it goes to a database client (so `rg "delete from"` is fine).
  if (DB_CLIENTS.has(name) && (SQL_RISKY.test(args.join(' ')) || SQL_RISKY.test(seg.heredoc || ''))) out.risky = true;
  return out;
}

function gitCheck(args) {
  const out = { write: false, risky: false };
  let i = 0;
  while (args[i] && args[i].startsWith('-')) i += (GIT_GLOBAL_ARG.has(args[i]) ? 2 : 1);
  const sub = args[i];
  if (!sub) return out;
  const rest = args.slice(i + 1);
  const pos = positional(rest);
  if (GIT_WRITES.has(sub)) out.write = true;
  if (sub === 'apply' && !rest.some((a) => /^--(check|stat|numstat|summary)$/.test(a))) out.write = true;
  if (sub === 'stash' && !['list', 'show'].includes(pos[0])) out.write = true;
  if (sub === 'tag') {
    const listing = rest.some((a) => /^(-l|--list|-n\d*|--contains|--no-contains|--points-at|--merged|--no-merged)$/.test(a));
    if (rest.some((a) => /^(-d|--delete|-a|-s|-f|--force|-m|-u)$/.test(a)) || (pos.length && !listing)) out.write = true;
  }
  if (sub === 'branch') {
    const listing = rest.some((a) => BRANCH_LIST.test(a));
    if (rest.some((a) => /^(-[dDmMcCfu]|--delete|--move|--copy|--force|--set-upstream-to.*|--unset-upstream|--edit-description)$/.test(a)) || (pos.length && !listing)) out.write = true;
    if (rest.includes('-D') || (rest.includes('--delete') && rest.includes('--force'))) out.risky = true;
  }
  if (sub === 'worktree' && ['add', 'remove', 'move', 'prune', 'repair'].includes(pos[0])) out.write = true;
  if (sub === 'submodule' && ['add', 'update', 'deinit', 'sync', 'init'].includes(pos[0])) out.write = true;
  if (sub === 'push') out.risky = true;
  if (sub === 'reset' && rest.includes('--hard')) out.risky = true;
  if (sub === 'clean' && (/f/.test(shortFlags(rest)) || rest.includes('--force'))) out.risky = true;
  if ((sub === 'checkout' || sub === 'restore') && rest.includes('.')) out.risky = true;
  return out;
}

/** Reads a whole command line: { write, risky }. */
function analyse(cmd, flavour = 'sh', depth = 0) {
  const out = { write: false, risky: false };
  for (const seg of parse(cmd, flavour)) {
    const words = seg.words.map((w) => w.text);
    if (words[0] !== '[[') { // [[ a > b ]] compares strings
      for (const r of seg.redirects) {
        if (r.target == null || NULLISH.test(r.target)) continue;
        if (r.op === '>&' && /^(\d+|-)$/.test(r.target)) continue; // 2>&1 joins streams
        out.write = true;
      }
    }
    const r = classify(words, seg, flavour, depth);
    out.write = out.write || r.write;
    out.risky = out.risky || r.risky;
  }
  return out;
}

function shellWrites(cmd, flavour = 'sh') { return analyse(cmd, flavour).write; }
function shellRisky(cmd, flavour = 'sh') { return analyse(cmd, flavour).risky; }

/** Returns a deny reason for this tool call under the guard, or null to let it run. */
function check(guard, modeName, tool, input = {}) {
  if (!GUARDS.includes(guard) || !tool) return null;
  const cmd = SHELL_TOOLS.has(tool) ? String(input.command || '') : '';
  const a = cmd ? analyse(cmd, tool === 'PowerShell' ? 'ps' : 'sh') : { write: false, risky: false };
  if (guard === 'readonly') {
    if (EDIT_TOOLS.has(tool) || a.write || a.risky) return REASON.readonly(modeName);
  } else if (guard === 'risky') {
    if (a.risky) return REASON.risky(modeName);
  }
  return null;
}

/** The PreToolUse hook body for a deny, as Claude Code expects it. */
function denyBody(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

module.exports = { GUARDS, MATCHER, EDIT_TOOLS, check, denyBody, shellWrites, shellRisky, analyse };
