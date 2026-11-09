// The theme engine, with no Electron or DOM in it, so the app, the main process and the tests share it.
// A theme is { id, name, base: 'dark'|'light', ui: {...}, term: {...} }. It is usually made from a small
// seed (bg, text, accent, and optionally the rest): every other colour is derived, and contrast is
// checked here rather than trusted. Colours are strict #rrggbb, so nothing else can reach the CSS.
(function (root) {
  'use strict';

  const HEX = /^#[0-9a-f]{6}$/i;
  const isHex = (c) => typeof c === 'string' && HEX.test(c);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const hex = (r) => `#${r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  /** a towards b; t = 0 is a, 1 is b. */
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  function lum(c) {
    const [r, g, b] = rgb(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** fg, moved only as far towards white or black as it takes to reach the ratio on bg. */
  function ensure(fg, bg, ratio) {
    if (contrast(fg, bg) >= ratio) return fg;
    const target = contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000';
    for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(fg, target, t); if (contrast(c, bg) >= ratio) return c; }
    return target;
  }

  const UI_KEYS = ['bg', 'panel', 'tile', 'pop', 'line', 'lineSoft', 'hover', 'text', 'muted', 'faint', 'accent', 'working', 'needs', 'done', 'error', 'idle', 'ov', 'ovBg'];
  const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];
  const TERM_KEYS = ['background', 'foreground', 'cursor', 'selectionBackground', ...ANSI];

  const DEFAULT_ANSI = {
    dark: ['#22252c', '#ff7b7b', '#7bd88f', '#f2c66d', '#7aa7ff', '#c49cff', '#6fd4e0', '#c9ccd3', '#6c7280', '#ff9a9a', '#9ae6ab', '#f7d88f', '#9cbfff', '#d7bbff', '#95e3ec', '#f1f2f5'],
    light: ['#1f232b', '#c4352d', '#1d8340', '#946200', '#2b5fc7', '#8448c9', '#0e7b8a', '#5f6672', '#7a818d', '#d8433a', '#239a4c', '#a87300', '#3a70dd', '#9a5ddf', '#118ea0', '#2b2f36'],
  };
  const STATUS = {
    dark: { needs: '#f5b545', done: '#5fd39a', error: '#ff6b6b', ov: '#b49cff' },
    light: { needs: '#a65f00', done: '#1d8340', error: '#c8362e', ov: '#7652d6' },
  };

  const seedHex = (v, fallback) => (isHex(v) ? v.toLowerCase() : fallback);
  const baseOf = (s) => (s.base === 'light' || s.base === 'dark' ? s.base : lum(s.bg) > 0.4 ? 'light' : 'dark');

  /** Every colour from a seed. Only bg, text and accent are needed; bad values fall back. */
  function fromSeed(raw = {}) {
    const firstBg = seedHex(raw.bg, '#0e0f12');
    const base = baseOf({ base: raw.base, bg: firstBg });
    const bg = firstBg;
    const text = ensure(seedHex(raw.text, base === 'dark' ? '#dcdfe5' : '#1f232b'), bg, 7);
    // A seed's surfaces are only used if the text can be read on them.
    const shade = (t) => { const c = mix(bg, text, t); return contrast(text, c) >= 4.5 ? c : bg; };
    const derived = shade(0.035);
    const readable = (c) => (contrast(text, c) >= 4.5 ? c : derived);
    const surface = readable(seedHex(raw.surface, derived));
    const tile = readable(seedHex(raw.tile, surface));
    const st = STATUS[base];
    const accent = ensure(seedHex(raw.accent, base === 'dark' ? '#8ab4ff' : '#2b62c9'), tile, 3);
    const faint = ensure(mix(text, bg, 0.55), bg, 3);
    const ov = ensure(seedHex(raw.ov, st.ov), tile, 3);
    const ui = {
      bg, panel: shade(0.05), tile, pop: shade(0.075),
      line: mix(bg, text, 0.16), lineSoft: mix(bg, text, 0.09), hover: shade(0.1),
      text, muted: ensure(mix(text, bg, 0.35), bg, 4.5), faint, accent,
      working: ensure(seedHex(raw.working, accent), tile, 3),
      needs: ensure(seedHex(raw.needs, st.needs), tile, 3),
      done: ensure(seedHex(raw.done, st.done), tile, 3),
      error: ensure(seedHex(raw.error, st.error), tile, 3),
      idle: faint, ov, ovBg: mix(bg, ov, 0.05),
    };
    const termBg = seedHex(raw.termBg, tile);
    const given = Array.isArray(raw.ansi) && raw.ansi.length === 16 ? raw.ansi : [];
    const term = { background: termBg, foreground: ensure(seedHex(raw.termFg, text), termBg, 7), cursor: ensure(seedHex(raw.cursor, text), termBg, 3), selectionBackground: mix(termBg, accent, 0.3) };
    ANSI.forEach((n, i) => {
      const c = seedHex(given[i], DEFAULT_ANSI[base][i]);
      // Black stays dark on a dark terminal on purpose; the rest must be readable.
      term[n] = i === 0 ? c : ensure(c, termBg, i === 8 ? 2.5 : 3);
    });
    return { name: cleanName(raw.name), base, ui, term };
  }

  function cleanName(n) { return String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'My theme'; }

  /** A stored or imported theme, made safe: unknown fields go, missing colours are derived. */
  function normalise(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const seedSource = raw.ui && typeof raw.ui === 'object' ? { base: raw.base, bg: raw.ui.bg, text: raw.ui.text, accent: raw.ui.accent, surface: raw.ui.tile, needs: raw.ui.needs, done: raw.ui.done, error: raw.ui.error, ov: raw.ui.ov, termBg: raw.term?.background } : raw;
    if (!isHex(seedSource.bg)) return null;
    const t = fromSeed({ ...seedSource, name: raw.name });
    // What was explicitly chosen is kept, exactly: the editor warns about contrast but doesn't overrule it.
    if (raw.ui) for (const k of UI_KEYS) if (isHex(raw.ui[k])) t.ui[k] = raw.ui[k].toLowerCase();
    if (raw.term) for (const k of TERM_KEYS) if (isHex(raw.term[k])) t.term[k] = raw.term[k].toLowerCase();
    t.id = typeof raw.id === 'string' && /^custom-[a-z0-9]{1,24}$/.test(raw.id) ? raw.id : null;
    return t;
  }

  const P = (id, name, seed) => ({ ...fromSeed({ ...seed, name }), id, preset: true });
  const DARK = {
    id: 'dark', name: 'Dark', base: 'dark', preset: true,
    ui: { bg: '#0e0f12', panel: '#14161b', tile: '#121318', pop: '#181a20', line: '#262a33', lineSoft: '#1c1e25', hover: '#1f222a', text: '#dcdfe5', muted: '#8b919c', faint: '#6a707c', accent: '#8ab4ff', working: '#6aa8ff', needs: '#f5b545', done: '#5fd39a', error: '#ff6b6b', idle: '#5f6571', ov: '#b49cff', ovBg: '#16141c' },
    term: { background: '#121318', foreground: '#d3d7df', cursor: '#d8dbe2', selectionBackground: '#33415c', black: '#22252c', red: '#ff7b7b', green: '#7bd88f', yellow: '#f2c66d', blue: '#7aa7ff', magenta: '#c49cff', cyan: '#6fd4e0', white: '#c9ccd3', brightBlack: '#6c7280', brightRed: '#ff9a9a', brightGreen: '#9ae6ab', brightYellow: '#f7d88f', brightBlue: '#9cbfff', brightMagenta: '#d7bbff', brightCyan: '#95e3ec', brightWhite: '#f1f2f5' },
  };
  const LIGHT = {
    id: 'light', name: 'Light', base: 'light', preset: true,
    ui: { bg: '#f6f7f9', panel: '#eef0f3', tile: '#ffffff', pop: '#ffffff', line: '#d8dce3', lineSoft: '#e7e9ee', hover: '#eceef2', text: '#1f232b', muted: '#59606c', faint: '#737a86', accent: '#2b62c9', working: '#2b62c9', needs: '#a65f00', done: '#1d8340', error: '#c8362e', idle: '#9097a3', ov: '#7652d6', ovBg: '#f6f3fc' },
    term: { background: '#ffffff', foreground: '#1f232b', cursor: '#1f232b', selectionBackground: '#cfdcf5', black: '#1f232b', red: '#c4352d', green: '#1d8340', yellow: '#946200', blue: '#2b5fc7', magenta: '#8448c9', cyan: '#0e7b8a', white: '#5f6672', brightBlack: '#7a818d', brightRed: '#d8433a', brightGreen: '#239a4c', brightYellow: '#a87300', brightBlue: '#3a70dd', brightMagenta: '#9a5ddf', brightCyan: '#118ea0', brightWhite: '#2b2f36' },
  };
  const PRESETS = [
    DARK, LIGHT,
    P('basanite', 'Basanite', { base: 'dark', bg: '#0b0c0e', text: '#e8e4da', accent: '#e4b04a', needs: '#f0bf58', working: '#d6c08a', ov: '#c9a8e8', ansi: ['#23241f', '#e06c5a', '#9dbb6e', '#e4b04a', '#83a6c9', '#c49ac9', '#7fb8ae', '#cfcabd', '#6f6c62', '#ee8878', '#b4cf86', '#f2c870', '#a0bddb', '#d7b4da', '#9ad0c6', '#f4f0e6'] }),
    P('paper', 'Paper', { base: 'light', bg: '#f7f3ea', text: '#2d2a24', tile: '#fdfaf3', accent: '#9a5b13', needs: '#b0560a', ov: '#6e4fa8', ansi: ['#2d2a24', '#b43c2c', '#55792a', '#8a6100', '#2f6496', '#86468f', '#23776e', '#6b655a', '#837c6e', '#c84c3a', '#668a35', '#9c7000', '#3a76ad', '#9a56a3', '#2b8a80', '#3a362e'] }),
    P('tokyo-night', 'Tokyo Night', { base: 'dark', bg: '#16161e', tile: '#1a1b26', text: '#c0caf5', accent: '#7aa2f7', needs: '#e0af68', done: '#9ece6a', error: '#f7768e', ov: '#bb9af7', ansi: ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'] }),
    P('catppuccin-mocha', 'Catppuccin Mocha', { base: 'dark', bg: '#181825', tile: '#1e1e2e', text: '#cdd6f4', accent: '#cba6f7', needs: '#f9e2af', done: '#a6e3a1', error: '#f38ba8', ov: '#f5c2e7', ansi: ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de', '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'] }),
    P('catppuccin-latte', 'Catppuccin Latte', { base: 'light', bg: '#e6e9ef', tile: '#eff1f5', text: '#4c4f69', accent: '#8839ef', needs: '#df8e1d', done: '#40a02b', error: '#d20f39', ov: '#ea76cb', ansi: ['#5c5f77', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#acb0be', '#6c6f85', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#bcc0cc'] }),
    P('nord', 'Nord', { base: 'dark', bg: '#2e3440', tile: '#323946', text: '#e5e9f0', accent: '#88c0d0', needs: '#ebcb8b', done: '#a3be8c', error: '#bf616a', ov: '#b48ead', ansi: ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4'] }),
    P('dracula', 'Dracula', { base: 'dark', bg: '#21222c', tile: '#282a36', text: '#f8f8f2', accent: '#bd93f9', needs: '#ffb86c', done: '#50fa7b', error: '#ff5555', ov: '#ff79c6', ansi: ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'] }),
    P('gruvbox', 'Gruvbox', { base: 'dark', bg: '#1d2021', tile: '#282828', text: '#ebdbb2', accent: '#fabd2f', needs: '#fe8019', done: '#b8bb26', error: '#fb4934', ov: '#d3869b', ansi: ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'] }),
    P('solarized-dark', 'Solarized Dark', { base: 'dark', bg: '#002b36', tile: '#073642', text: '#eee8d5', accent: '#268bd2', needs: '#b58900', done: '#859900', error: '#dc322f', ov: '#6c71c4', ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#93a1a1', '#b58900', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'] }),
    P('solarized-light', 'Solarized Light', { base: 'light', bg: '#eee8d5', tile: '#fdf6e3', text: '#073642', accent: '#268bd2', needs: '#b58900', done: '#859900', error: '#dc322f', ov: '#6c71c4', ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#586e75', '#657b83', '#cb4b16', '#586e75', '#7a6000', '#268bd2', '#6c71c4', '#2aa198', '#073642'] }),
  ];

  /** The theme for a settings value. 'system' (and anything unknown) follows the OS. */
  function resolve(id, customs, osLight) {
    if (id && id !== 'system') {
      const t = PRESETS.find((p) => p.id === id) || (customs || []).find((c) => c.id === id);
      if (t) return t;
    }
    return osLight ? LIGHT : DARK;
  }
  const known = (id, customs) => id === 'system' || PRESETS.some((p) => p.id === id) || (customs || []).some((c) => c.id === id);

  const cssName = (k) => `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
  /** CSS variables for a theme. */
  function toVars(t) {
    const v = {};
    for (const k of UI_KEYS) v[cssName(k)] = t.ui[k];
    v['--term-bg'] = t.term.background;
    // Mixed like the stylesheet's own default, then kept readable on the send button behind it.
    v['--accent-text'] = ensure(mix(t.ui.text, t.ui.accent, 0.35), mix(t.ui.panel, t.ui.accent, 0.22), 3);
    return v;
  }
  /** The xterm.js palette. forOverseer gives the overseer's own tint. */
  function toXterm(t, forOverseer) {
    const background = forOverseer ? t.ui.ovBg : t.term.background;
    return { ...t.term, background, cursorAccent: background, selectionInactiveBackground: mix(background, t.term.selectionBackground, 0.65) };
  }

  /** A model's reply: the JSON object inside the text, or null. */
  function parseReply(text) {
    const s = String(text || '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      const j = JSON.parse(s.slice(a, b + 1));
      if (!j || typeof j !== 'object' || !j.theme || !isHex(j.theme.bg)) return null;
      return { say: String(j.say || '').slice(0, 300), theme: fromSeed(j.theme) };
    } catch { return null; }
  }
  /** Names the seed a model needs to see, so a request carries only a few dozen tokens. */
  function toSeed(t) {
    return { name: t.name, base: t.base, bg: t.ui.bg, tile: t.ui.tile, text: t.ui.text, accent: t.ui.accent, needs: t.ui.needs, done: t.ui.done, error: t.ui.error, ov: t.ui.ov, termBg: t.term.background, ansi: ANSI.map((n) => t.term[n]) };
  }

  const api = { PRESETS, UI_KEYS, TERM_KEYS, ANSI, isHex, mix, contrast, ensure, fromSeed, normalise, resolve, known, toVars, toXterm, parseReply, toSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HangarThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
