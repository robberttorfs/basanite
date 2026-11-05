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
