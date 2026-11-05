// Mode guards: real limits behind a mode's words. Hangar's PreToolUse hook asks
// check() before a tool runs; a deny comes back to Claude as a one-line reason.
// No guard on, or a tool the guard allows: nothing is returned, so no tokens.
//   'readonly' (Review, Plan): no file edits, no shell commands that clearly write.
//   'risky'    (Careful): no push, deploy, publish or destructive commands.
'use strict';

const GUARDS = ['readonly', 'risky'];
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
// The hook matcher: every tool a guard may stop, plus what session.js already watches.
const MATCHER = 'AskUserQuestion|ExitPlanMode|Agent|Task|Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell';

// Commands that change files, the repo or installed packages.
const WRITES = [
  /(^|[;&|(`]|\$\()\s*(sudo\s+|xargs\s+(-\S+\s+)*)?(rm|rmdir|mv|cp|mkdir|touch|ln|chmod|chown|truncate|dd|install|unlink|shred)(\s|$)/,
  /\bsed\s+(-[a-z]*i|--in-place)/, /\bperl\s+-[a-z]*i/, /\btee\b/,
  /\bgit\s+(add|commit|push|reset|checkout|switch|restore|merge|rebase|stash|apply|am|cherry-pick|revert|clean|rm|mv|tag|branch\s+-[dDmM]|worktree\s+(add|remove)|pull|init|clone)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|rm|ci|update|up|upgrade|publish|link|init|version)\b/,
  /\b(pip3?|uv|poetry|cargo|go|gem|brew|apt|apt-get|winget|choco)\s+(install|add|remove|uninstall|update|upgrade|get|publish)\b/,
  /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item|Clear-Content)\b/i,
  /(^|[;&|])\s*(del|erase|copy|move|ren|rename|md|mkdir)\s/i,
  /(^|[^0-9&>=\-])>{1,2}\s*(?!\s*(\/dev\/null|\$null|nul\b|&))[^\s&|;]/i,
];

// Commands that reach live systems or cannot be undone.
const RISKY = [
  /\bgit\s+push\b/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-[a-z]*f/, /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/,
  /\bgit\s+branch\s+-D\b/, /--force(-with-lease)?\b/, /\bpush\s+-f\b/,
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/, /\bRemove-Item\b.*-Recurse/i, /\brd\s+\/s\b/i,
  /\b(vercel|netlify|firebase|fly|heroku|wrangler|railway|surge)\b.*\b(deploy|--prod|publish|promote)\b/,
  /\b(npm|pnpm|yarn)\s+publish\b/, /\b(twine|cargo|gem)\s+(upload|publish|push)\b/,
  /\bkubectl\s+(apply|delete|rollout)\b/, /\bterraform\s+(apply|destroy)\b/, /\bdocker\s+push\b/,
  /\bgh\s+(pr\s+merge|release\s+create|repo\s+delete)\b/,
  /\b(pkill|killall)\b/, /\btaskkill\b.*\/im\b/i,
  /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i, /\bDELETE\s+FROM\b/i,
];

const REASON = {
  readonly: (mode) => `${mode} mode is read-only in Hangar: no file changes. Report instead, or ask the user to switch mode.`,
  risky: (mode) => `${mode} mode blocks pushes, deploys and destructive commands in Hangar. Ask the user to run it themselves.`,
};

function shellWrites(cmd) { return WRITES.some((re) => re.test(cmd)); }
function shellRisky(cmd) { return RISKY.some((re) => re.test(cmd)); }

/** Returns a deny reason for this tool call under the guard, or null to let it run. */
function check(guard, modeName, tool, input = {}) {
  if (!GUARDS.includes(guard) || !tool) return null;
  const cmd = SHELL_TOOLS.has(tool) ? String(input.command || '') : '';
  if (guard === 'readonly') {
    if (EDIT_TOOLS.has(tool) || (cmd && (shellWrites(cmd) || shellRisky(cmd)))) return REASON.readonly(modeName);
  } else if (guard === 'risky') {
    if (cmd && shellRisky(cmd)) return REASON.risky(modeName);
  }
  return null;
}

/** The PreToolUse hook body for a deny, as Claude Code expects it. */
function denyBody(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

module.exports = { GUARDS, MATCHER, EDIT_TOOLS, check, denyBody, shellWrites, shellRisky };
