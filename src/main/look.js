// Theme for the native side: the window background, the Windows title-bar buttons, and telling
// the page about high contrast. The active theme comes from themes.js; 'system' follows the OS.
const { nativeTheme, ipcMain } = require('electron');
const T = require('../shared/themes');
const store = require('./themes');

const themeOf = (settings) => (T.known(settings?.theme, store.list()) ? settings.theme : 'system');
const dark = () => nativeTheme.shouldUseDarkColors;
const info = () => ({ dark: dark(), highContrast: nativeTheme.shouldUseHighContrastColors });
let current = () => ({});
const active = () => T.resolve(themeOf(current()), store.list(), !dark());
const background = () => active().ui.bg;
/** Options for new BrowserWindow(): the right colours before the page paints. */
const overlay = (height = 40) => ({ color: background(), symbolColor: active().ui.muted, height });
/** What Electron and the OS should treat the app as. */
const source = (settings) => { const id = themeOf(settings); return id === 'system' ? 'system' : T.resolve(id, store.list(), false).base; };

let getWin = () => null;
function apply(settings) {
  const want = source(settings);
  if (nativeTheme.themeSource !== want) nativeTheme.themeSource = want;
  paint();
}
function paint() {
  const win = getWin();
  if (!win || win.isDestroyed()) return;
  try { win.setBackgroundColor(background()); } catch {}
  if (process.platform === 'win32' && win.setTitleBarOverlay) {
    try { win.setTitleBarOverlay(overlay()); } catch {}
  }
}

/** Call once at startup, before the window exists. */
function init({ settings, win, send }) {
  getWin = win;
  current = settings;
  nativeTheme.themeSource = source(settings());
  nativeTheme.on('updated', () => { paint(); send('look', info()); });
  ipcMain.handle('look', () => info());
}

module.exports = { init, apply, paint, background, overlay, themeOf, info };
