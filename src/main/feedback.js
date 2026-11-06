// Feedback and bug reports: nothing is ever sent from here. A menu item opens a GitHub issue form
// in the browser with the system details filled in, and the person reads it before submitting.
// The details are versions only: no paths, project names, prompts or session contents.
const { execFile } = require('child_process');
const brand = require('../shared/brand');

const REPO = () => `https://github.com/${brand.releases.owner}/${brand.releases.repo}`;
const OS_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

/** The text behind "Copy debug info", and what a bug report starts with. */
function debugInfo({ appVersion, platform, osRelease, arch, electron, claude }) {
  return [
    `${brand.name} ${appVersion}`,
    `${OS_NAME[platform] || platform} ${osRelease} (${arch})`,
    `Claude Code ${claude || 'not found'}`,
    `Electron ${electron}`,
  ].join('\n');
}

/** kind: 'bug' or 'idea'. `system` fills the form's field of the same id. */
function issueUrl(kind, info) {
  const url = new URL(`${REPO()}/issues/new`);
  url.searchParams.set('template', kind === 'bug' ? 'bug.yml' : 'idea.yml');
  if (kind === 'bug') url.searchParams.set('system', info);
  return url.toString();
}

/** First line of `claude --version`, only the version-like part, so nothing else can slip in. */
function parseClaudeVersion(out) {
  const m = /\d+\.\d+\.\d+\S*/.exec(String(out || ''));
  return m ? m[0] : null;
}

/** Asks through the user's shell, so PATH matches their terminal. Never throws; null if not found. */
function claudeVersion(env, platform = process.platform) {
  const [file, args] = platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'claude --version']]
    : [env.SHELL || '/bin/zsh', ['-lc', 'claude --version']];
  return new Promise((resolve) => {
    try {
      execFile(file, args, { env, timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? null : parseClaudeVersion(stdout)));
    } catch { resolve(null); }
  });
}

module.exports = { debugInfo, issueUrl, parseClaudeVersion, claudeVersion };
