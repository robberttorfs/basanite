const test = require('node:test');
const assert = require('node:assert');
const { GUIDE, install } = require('../src/renderer/claude-check');

test('claude check: each system gets its own install command and the official guide', () => {
  assert.match(install('win').command, /^irm https:\/\/claude\.ai\/install\.ps1 \| iex$/);
  assert.match(install('win').where, /PowerShell/);
  assert.match(install('unix').command, /^curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash$/);
  assert.ok(GUIDE.startsWith('https://code.claude.com/'));
});
