// Theme for the native side: Light, Dark or System (the default), the window background,
// the Windows title-bar buttons, and telling the page about high contrast.
// The page itself follows prefers-color-scheme, which nativeTheme.themeSource drives.
const { nativeTheme, ipcMain } = require('electron');

const BG = { dark: '#0e0f12', light: '#f6f7f9' };
const SYMBOL = { dark: '#9aa0aa', light: '#4f5663' };
const THEMES = ['system', 'light', 'dark'];

const themeOf = (settings) => (THEMES.includes(settings?.theme) ? settings.theme : 'system');
const dark = () => nativeTheme.shouldUseDarkColors;
const info = () => ({ dark: dark(), highContrast: nativeTheme.shouldUseHighContrastColors });
const background = () => BG[dark() ? 'dark' : 'light'];
/** Options for new BrowserWindow(): the right colours before the page paints. */
const overlay = (height = 40) => ({ color: background(), symbolColor: SYMBOL[dark() ? 'dark' : 'light'], height });

let getWin = () => null;
function apply(settings) {
  const want = themeOf(settings);
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
  nativeTheme.themeSource = themeOf(settings());
  nativeTheme.on('updated', () => { paint(); send('look', info()); });
  ipcMain.handle('look', () => info());
}

module.exports = { init, apply, paint, background, overlay, themeOf, info };
