/* global HangarCommands, hangar, tiles, ov, termLook, layout, GAP:writable, $ */
// Look and feel: Light / Dark / System theme, high contrast, reduce motion, density,
// the light terminal palette, and one screen-reader line when a session needs you.
// Loaded before app.js (so terminals pick up the right palette); app globals are only
// touched at run time.
'use strict';

(() => {
  // Light terminal. Claude Code paints some text in its own colours; xterm's minimum
  // contrast ratio keeps those readable on a light background.
  const LIGHT_TERM = {
    background: '#ffffff', foreground: '#1f232b', cursor: '#1f232b', cursorAccent: '#ffffff',
    selectionBackground: '#cfdcf5', selectionInactiveBackground: '#e2e7f0',
    black: '#1f232b', red: '#c4352d', green: '#1d8340', yellow: '#946200', blue: '#2b5fc7',
    magenta: '#8448c9', cyan: '#0e7b8a', white: '#5f6672',
    brightBlack: '#7a818d', brightRed: '#d8433a', brightGreen: '#239a4c', brightYellow: '#a87300',
    brightBlue: '#3a70dd', brightMagenta: '#9a5ddf', brightCyan: '#118ea0', brightWhite: '#2b2f36',
  };
  const BG_LIGHT = { '#16141c': '#f6f3fc' }; // the overseer keeps its own tint

  const mqLight = matchMedia('(prefers-color-scheme: light)');
  const mqCalm = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = {};
  let hc = false;
  const light = () => mqLight.matches;

  function term(out, bg) {
    if (!light()) return { ...out, minimumContrastRatio: hc ? 7 : 1 };
    const b = (bg && BG_LIGHT[bg]) || LIGHT_TERM.background;
    return { ...out, minimumContrastRatio: hc ? 7 : 4.5, theme: { ...LIGHT_TERM, background: b, cursorAccent: b } };
  }
  function retheme() {
    if (typeof tiles === 'undefined') return;
    for (const t of [...tiles.values(), ov].filter(Boolean)) {
      try { t.term.options.minimumContrastRatio = 1; Object.assign(t.term.options, termLook(t.bg)); } catch {}
    }
  }

  function applyBody() {
    const b = document.body.classList;
    const compact = settings.density === 'compact';
    b.toggle('compact', compact);
    b.toggle('calm', !!settings.reduceMotion || mqCalm.matches);
    b.toggle('hc', hc);
    b.toggle('light', light());
    const gap = compact ? 4 : 8;
    if (typeof layout === 'function' && GAP !== gap) { GAP = gap; if (tiles.size) layout(true); }
  }

  // ---------- one live line for screen readers ----------
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  let seen = null;
  let pending = [];
  let liveTimer = null;
  function watchStatus(s) {
    const list = (s.allTiles || s.tiles || []).filter((t) => t.kind !== 'shell');
    const now = new Map(list.map((t) => [t.id, t.status]));
    if (seen) {
      for (const t of list) if (t.status === 'needs_input' && seen.get(t.id) !== 'needs_input') pending.push(t.name);
    }
    seen = now;
    if (!pending.length) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const names = [...new Set(pending)];
      pending = [];
      const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      live.textContent = '';
      setTimeout(() => { live.textContent = `${who} need${names.length > 1 ? '' : 's'} you`; }, 60);
    }, 800);
  }

  hangar.onState((s) => {
    const before = `${settings.theme}|${settings.density}|${settings.reduceMotion}`;
    settings = s.settings || {};
    if (`${settings.theme}|${settings.density}|${settings.reduceMotion}` !== before) applyBody();
    watchStatus(s);
  });
  hangar.init().then((s) => { settings = s.settings || {}; applyBody(); watchStatus(s); });
  hangar.look?.().then((i) => { hc = !!i?.highContrast; applyBody(); retheme(); }).catch(() => {});
  hangar.onLook?.((i) => { hc = !!i?.highContrast; applyBody(); retheme(); });
  mqLight.addEventListener('change', () => { applyBody(); retheme(); });
  mqCalm.addEventListener('change', applyBody);

  // ---------- settings rows and commands ----------
  const set = (patch) => hangar.setSettings(patch);
  function settingsRows(el) {
    const s = settings;
    const theme = s.theme || 'system';
    const html = `<h3>Appearance</h3>
      <label class="opt">Theme<select data-look="theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]
        .map(([v, l]) => `<option value="${v}" ${theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="opt">Density<select data-look="density">${[['comfortable', 'Comfortable'], ['compact', 'Compact']]
        .map(([v, l]) => `<option value="${v}" ${(s.density || 'comfortable') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="opt">Reduce motion<input type="checkbox" data-look-calm ${s.reduceMotion ? 'checked' : ''}></label>
      <div class="sep"></div>`;
    el.insertAdjacentHTML('afterbegin', html);
    el.querySelectorAll('select[data-look]').forEach((c) => { c.onchange = () => set({ [c.dataset.look]: c.value }); });
    el.querySelector('[data-look-calm]').onchange = (e) => set({ reduceMotion: e.target.checked });
  }

  const C = HangarCommands;
  const themeIs = (t) => (settings.theme || 'system') === t;
  C.register([
    { id: 'view.theme-system', label: 'System theme', group: 'App', aliases: ['theme', 'auto', 'appearance'],
      menu: { menu: 'View', section: 'look' }, when: () => !themeIs('system'), run: () => set({ theme: 'system' }) },
    { id: 'view.theme-light', label: 'Light theme', group: 'App', aliases: ['theme', 'appearance', 'bright'],
      menu: { menu: 'View', section: 'look' }, when: () => !themeIs('light'), run: () => set({ theme: 'light' }) },
    { id: 'view.theme-dark', label: 'Dark theme', group: 'App', aliases: ['theme', 'appearance', 'night'],
      menu: { menu: 'View', section: 'look' }, when: () => !themeIs('dark'), run: () => set({ theme: 'dark' }) },
    { id: 'view.density-compact', label: 'Compact density', group: 'App', aliases: ['density', 'small', 'dense'],
      menu: { menu: 'View', section: 'look' }, when: () => settings.density !== 'compact', run: () => set({ density: 'compact' }) },
    { id: 'view.density-comfortable', label: 'Comfortable density', group: 'App', aliases: ['density', 'roomy'],
      menu: { menu: 'View', section: 'look' }, when: () => settings.density === 'compact', run: () => set({ density: 'comfortable' }) },
    { id: 'view.reduce-motion', label: 'Reduce motion', group: 'App', aliases: ['animation', 'calm', 'motion'],
      menu: { menu: 'View', section: 'look' }, run: () => set({ reduceMotion: !settings.reduceMotion }) },
  ]);

  window.HangarLook = { term, light, settingsRows, retheme, watchStatus };
})();
