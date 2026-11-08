/* global HangarCommands, hangar, tiles, ov, termLook, layout, GAP:writable, $ */
// Look and feel: Light / Dark / System theme, high contrast, reduce motion, density,
// the light terminal palette, and one screen-reader line when a session needs you.
// Loaded before app.js (so terminals pick up the right palette); app globals are only
// touched at run time.
'use strict';

(() => {
  const T = HangarThemes;
  const mqLight = matchMedia('(prefers-color-scheme: light)');
  const mqCalm = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = {};
  let hc = false;
  let customs = [];
  let trial = null;   // a theme being tried out from the Studio
  const CACHE = 'basanite.theme';
  const root = document.documentElement;

  // The last theme, before anything else draws, so a restart doesn't flash the wrong colours.
  try {
    const c = JSON.parse(localStorage.getItem(CACHE));
    if (c) { for (const [k, v] of Object.entries(c.vars)) root.style.setProperty(k, v); root.style.colorScheme = c.base; document.body.classList.toggle('light', c.base === 'light'); }
  } catch {}

  const active = () => trial || T.resolve(settings.theme, customs, mqLight.matches);
  const light = () => active().base === 'light';

  function term(out, bg) {
    const t = active();
    const floor = hc ? 7 : t.base === 'light' ? 4.5 : t.id === 'dark' ? 1 : 3;
    return { ...out, minimumContrastRatio: floor, theme: T.toXterm(t, !!bg) };
  }
  // After a palette change, small tiles could stay soft until hidden and shown again. Do that
  // here, inside one frame so nothing flickers, once a run of changes (a colour drag) has ended.
  let repaintTimer = 0;
  function repaintTerms() {
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
      if (typeof tiles === 'undefined') return;
      for (const t of [...tiles.values(), ov].filter(Boolean)) {
        try {
          const box = t.term.element?.parentElement;
          if (box?.offsetParent) { box.style.display = 'none'; void box.offsetHeight; box.style.display = ''; }
          t.term.clearTextureAtlas();
          t.term.refresh(0, t.term.rows - 1);
        } catch {}
      }
    }, 120);
  }
  let reThemeQueued = false;
  function retheme() {
    if (reThemeQueued) return;
    reThemeQueued = true;
    requestAnimationFrame(() => {
      reThemeQueued = false;
      if (typeof tiles === 'undefined') return;
      for (const t of [...tiles.values(), ov].filter(Boolean)) {
        try { Object.assign(t.term.options, termLook(t.bg)); } catch {}
      }
      repaintTerms();
    });
  }
  /** One write of the CSS variables and one palette per terminal: nothing runs per frame. */
  function paint() {
    const t = active();
    const vars = T.toVars(t);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.style.colorScheme = t.base;
    document.body.classList.toggle('light', t.base === 'light');
    if (!trial) try { localStorage.setItem(CACHE, JSON.stringify({ vars, base: t.base })); } catch {}
    retheme();
  }
  /** Show a theme everywhere without saving it; null goes back. */
  function preview(t) { trial = t; paint(); }

  function applyBody() {
    const b = document.body.classList;
    const compact = settings.density === 'compact';
    b.toggle('compact', compact);
    b.toggle('calm', !!settings.reduceMotion || mqCalm.matches);
    b.toggle('hc', hc);
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
    const before = `${settings.density}|${settings.reduceMotion}`, was = settings.theme;
    settings = s.settings || {};
    if (`${settings.density}|${settings.reduceMotion}` !== before) applyBody();
    if (settings.theme !== was) { paint(); C.changed?.(); }
    watchStatus(s);
  });
  hangar.init().then(async (s) => { settings = s.settings || {}; customs = await hangar.themes(); applyBody(); paint(); watchStatus(s); });
  hangar.onThemes((l) => { customs = l; paint(); C.changed?.(); });
  hangar.look?.().then((i) => { hc = !!i?.highContrast; applyBody(); retheme(); }).catch(() => {});
  hangar.onLook?.((i) => { hc = !!i?.highContrast; applyBody(); retheme(); });
  mqLight.addEventListener('change', () => { applyBody(); paint(); });
  mqCalm.addEventListener('change', applyBody);

  // ---------- commands ----------
  const set = (patch) => hangar.setSettings(patch);
  const C = HangarCommands;
  C.provide('themes', () => [{ id: 'system', name: 'System' }, ...T.PRESETS, ...customs].map((t) => ({
    id: `theme.set:${t.id}`, label: t.id === 'system' ? 'System theme' : `${t.name} theme`, short: t.name, group: 'App', aliases: ['theme', 'appearance', 'colour'],
    isTheme: true, themeId: t.id, run: () => set({ theme: t.id }),
  })));
  C.register([
    { id: 'view.density-compact', label: 'Compact density', group: 'App', aliases: ['density', 'small', 'dense'],
      menu: { menu: 'View', section: 'look' }, when: () => settings.density !== 'compact', run: () => set({ density: 'compact' }) },
    { id: 'view.density-comfortable', label: 'Comfortable density', group: 'App', aliases: ['density', 'roomy'],
      menu: { menu: 'View', section: 'look' }, when: () => settings.density === 'compact', run: () => set({ density: 'comfortable' }) },
    { id: 'view.reduce-motion', label: 'Reduce motion', group: 'App', aliases: ['animation', 'calm', 'motion'],
      menu: { menu: 'View', section: 'look' }, run: () => set({ reduceMotion: !settings.reduceMotion }) },
  ]);

  window.HangarLook = { term, light, retheme, watchStatus, preview, active, customs: () => customs, themeById: (id) => T.PRESETS.find((p) => p.id === id) || customs.find((c) => c.id === id), themeId: () => settings.theme || 'system' };
})();
