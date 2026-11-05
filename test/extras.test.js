const test = require('node:test');
const assert = require('node:assert');
const { editorFromEnv, inGit } = require('../src/main/shellops');
const path = require('path');

test('shellops: GUI editors from the environment, terminal editors skipped', () => {
  assert.equal(editorFromEnv({ VISUAL: 'code --wait' }), 'code --wait');
  assert.equal(editorFromEnv({ EDITOR: 'vim' }), null);
  assert.equal(editorFromEnv({ VISUAL: 'nvim', EDITOR: 'subl -n' }), 'subl -n');
  assert.equal(editorFromEnv({}), null);
});

test('shellops: editor commands with spaces in the path', () => {
  const { splitCommand } = require('../src/main/shellops');
  const exists = (p) => p === 'C:\\Program Files\\Sublime Text\\subl.exe';
  assert.deepEqual(splitCommand('"C:\\Program Files\\Microsoft VS Code\\Code.exe" --wait', exists), ['C:\\Program Files\\Microsoft VS Code\\Code.exe', '--wait']);
  assert.deepEqual(splitCommand('C:\\Program Files\\Sublime Text\\subl.exe -n', exists), ['C:\\Program Files\\Sublime Text\\subl.exe', '-n']);
  assert.deepEqual(splitCommand('code --wait', exists), ['code', '--wait']);
  assert.equal(editorFromEnv({ EDITOR: '"C:/Program Files/Vim/vim.exe"' }), null, 'terminal editor in a quoted path');
});

test('shellops: editor order is VISUAL, then code / cursor / zed, then EDITOR', async () => {
  const { resolveEditor } = require('../src/main/shellops');
  const none = async () => null;
  const no = () => false;
  const r = (env, o = {}) => resolveEditor({ env, platform: 'win32', onPath: none, exists: no, home: 'C:\\Users\\x', ...o });
  assert.deepEqual(await r({ VISUAL: 'subl -n', EDITOR: 'notepad' }, { onPath: async (b) => (b === 'code' ? 'C:\\c\\code.cmd' : null) }), { argv: ['subl', '-n'], name: 'subl' });
  assert.deepEqual(await r({ EDITOR: 'notepad' }, { onPath: async (b) => (b === 'cursor' ? '/bin/cursor' : null) }), { argv: ['/bin/cursor'], name: 'Cursor' });
  assert.deepEqual(await r({ EDITOR: 'notepad' }), { argv: ['notepad'], name: 'notepad' }, 'EDITOR last');
  assert.equal(await r({ EDITOR: 'vim' }), null);
  // VS Code installed per user on Windows but not on PATH.
  const win = await r({ LOCALAPPDATA: 'C:\\L' }, { exists: (p) => p === path.join('C:\\L', 'Programs/Microsoft VS Code/bin/code.cmd') });
  assert.equal(win.name, 'VS Code');
  // macOS from Finder: the app bundle is enough.
  const mac = await r({}, { platform: 'darwin', home: '/Users/x', exists: (p) => p === path.join('/Applications', 'Zed.app') });
  assert.deepEqual(mac, { argv: ['open', '-a', 'Zed'], name: 'Zed' });
});

test('shellops: a folder below a .git folder is in git, a plain one is not', () => {
  const os = require('os');
  const fs = require('fs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-git-'));
  fs.mkdirSync(path.join(root, 'repo', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repo', 'src', 'deep'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plain'));
  assert.equal(inGit(path.join(root, 'repo', 'src', 'deep')), true);
  assert.equal(inGit(path.join(root, 'plain')), false);
});
