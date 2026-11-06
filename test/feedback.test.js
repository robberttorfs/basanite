const test = require('node:test');
const assert = require('node:assert');
const { debugInfo, issueUrl, parseClaudeVersion } = require('../src/main/feedback');

const INFO = { appVersion: '0.4.1', platform: 'win32', osRelease: '10.0.26200', arch: 'x64', electron: '33.0.0', claude: '2.1.318' };

test('feedback: debug info is versions only', () => {
  assert.equal(debugInfo(INFO), 'Basanite 0.4.1\nWindows 10.0.26200 (x64)\nClaude Code 2.1.318\nElectron 33.0.0');
  assert.match(debugInfo({ ...INFO, claude: null }), /Claude Code not found/);
});

test('feedback: a bug report opens the form with the details filled in', () => {
  const u = new URL(issueUrl('bug', 'Basanite 0.4.1\nWindows'));
  assert.equal(u.origin + u.pathname, 'https://github.com/robberttorfs/basanite/issues/new');
  assert.equal(u.searchParams.get('template'), 'bug.yml');
  assert.equal(u.searchParams.get('system'), 'Basanite 0.4.1\nWindows');
});

test('feedback: an idea opens its form and carries no details', () => {
  const u = new URL(issueUrl('idea', 'Basanite 0.4.1'));
  assert.equal(u.searchParams.get('template'), 'idea.yml');
  assert.equal(u.searchParams.get('system'), null);
});

test('feedback: only the version is taken from claude --version', () => {
  assert.equal(parseClaudeVersion('2.1.318 (Claude Code)\n'), '2.1.318');
  assert.equal(parseClaudeVersion('C:\\Users\\someone\\secret not a version'), null);
  assert.equal(parseClaudeVersion(''), null);
});
