const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// look.js talks to Electron's nativeTheme; a small stand-in is enough here.
const fakeTheme = { themeSource: 'system', shouldUseDarkColors: false, shouldUseHighContrastColors: false, on() {} };
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return { nativeTheme: fakeTheme, ipcMain: { handle() {} } };
  return load.call(this, req, ...rest);
};
const look = require('../src/main/look');
Module._load = load;

test('look: theme setting defaults to System and drives nativeTheme', () => {
  assert.equal(look.themeOf({}), 'system');
  assert.equal(look.themeOf({ theme: 'nonsense' }), 'system');
  assert.equal(look.themeOf({ theme: 'light' }), 'light');
  look.apply({ theme: 'dark' });
  assert.equal(fakeTheme.themeSource, 'dark');
  look.apply({});
  assert.equal(fakeTheme.themeSource, 'system');
});

test('look: window and title-bar colours follow the theme', () => {
  fakeTheme.shouldUseDarkColors = true;
  assert.equal(look.background(), '#0e0f12');
  assert.equal(look.overlay(40).color, '#0e0f12');
  fakeTheme.shouldUseDarkColors = false;
  assert.equal(look.background(), '#f6f7f9');
  assert.notEqual(look.overlay(40).symbolColor, '#9aa0aa');
  assert.deepEqual(look.info(), { dark: false, highContrast: false });
});
