/* global HangarCommands, HangarPalette, hangar, state, tiles, focused, isMac, ICON, STATUS_LABEL, folderName, esc, h, $,
   openNew, start, openFresh, openRename, openTimer, openModePicker, openUsage, openSettings, toggleOverseer,
   toggleZoom, closeTile, resetSizes, nextWaiting, setFocus, setView, setOvView, ov, ovChatOn, modeById, openPop, closePop */
// Basanite's own commands. The native menu, the command palette, the shortcut sheet and
// the tile menus all read this one list (see commands.js for the fields).
'use strict';

(() => {
  const C = HangarCommands;
  C.setPlatform(isMac);
  C.setContext((scopeId) => {
    const id = scopeId && tiles.has(scopeId) ? scopeId : focused;
    const snap = id ? state.tiles.find((t) => t.id === id) : null;
    return { id: snap ? id : null, snap, focused, state };
  });
  const any = (cx) => !!cx.snap;
  const claude = (cx) => !!cx.snap && cx.snap.kind !== 'shell';

  C.register([
    // Start
    { id: 'session.new', label: 'New session…', group: 'Start', icon: 'spark', aliases: ['open', 'folder', 'project'],
      shortcut: { mac: 'Cmd+N', win: 'Ctrl+Shift+N' }, menu: { menu: 'Session', section: 'new' }, run: () => openNew() },
    { id: 'session.new-terminal', label: 'New terminal', group: 'Start', icon: 'term', aliases: ['shell'],
      shortcut: { mac: 'Alt+Cmd+N', win: 'Ctrl+Alt+N' }, menu: { menu: 'Session', section: 'new' }, run: () => start(null, 'shell') },
    { id: 'session.choose-folder', label: 'Choose folder…', group: 'Start', icon: 'spark', aliases: ['browse'],
      run: async (cx, o) => { const dir = await hangar.pickFolder(); if (dir) start(dir, o.shift ? 'continue' : 'new'); } },

    // Actions on the focused session (or the palette's scope)
    { id: 'session.fresh', label: 'Fresh start…', group: 'Actions', aliases: ['clear', 'handover', 'reset'],
      menu: { menu: 'Session', section: 'edit' },
      when: (cx) => claude(cx) && cx.snap.status !== 'exited' && !cx.snap.handover, run: (cx) => openFresh(cx.id) },
    { id: 'session.rename', label: 'Rename and colour…', group: 'Actions', aliases: ['name', 'color', 'colour'],
      shortcut: 'CmdOrCtrl+Shift+R', menu: { menu: 'Session', section: 'edit' }, when: any, run: (cx) => openRename(cx.id) },
    { id: 'session.timer', label: 'Time budget…', group: 'Actions', icon: 'timer', aliases: ['budget', 'timer', 'clock'],
      shortcut: { mac: 'Cmd+T', win: 'Ctrl+Shift+T' }, menu: { menu: 'Session', section: 'edit' }, when: claude, run: (cx) => openTimer(cx.id) },
    { id: 'session.pin', label: 'Pin as main', group: 'Actions', icon: 'pin', aliases: ['unpin'],
      shortcut: 'CmdOrCtrl+Shift+P', menu: { menu: 'Session', section: 'edit' }, when: any, run: (cx) => hangar.pin(cx.id) },
    { id: 'session.zoom', label: 'Zoom', group: 'Actions', aliases: ['maximise', 'maximize', 'full'],
      shortcut: 'CmdOrCtrl+Shift+Enter', menu: { menu: 'Session', section: 'edit' }, when: any, run: (cx) => { setFocus(cx.id); toggleZoom(cx.id); } },
    { id: 'session.restart', label: 'Resume', group: 'Actions', aliases: ['restart', 'reopen'],
      when: (cx) => any(cx) && cx.snap.status === 'exited', run: (cx) => hangar.restart(cx.id) },
    { id: 'session.close', label: 'Close session', group: 'Actions', aliases: ['quit', 'kill', 'end'],
      menu: { menu: 'Session', section: 'close' }, when: any, run: (cx) => closeTile(cx.id) },
    { id: 'session.reopen', label: 'Reopen closed session', group: 'Start', aliases: ['undo close'],
      shortcut: { mac: 'Cmd+Shift+T', win: 'Ctrl+Alt+T' }, menu: { menu: 'Session', section: 'close' }, run: () => hangar.reopen() },

    // Modes
    { id: 'mode.choose', label: 'Choose mode…', group: 'Modes', shortcut: 'CmdOrCtrl+Shift+M', menu: { menu: 'Modes', section: 'choose' },
      when: claude, run: (cx) => openModePicker(cx.id) },
    // (one entry per mode, then No mode and Edit modes, come from the provider below)

    // App and view
    { id: 'app.palette', label: 'Command palette', group: 'App', icon: 'search', palette: false,
      shortcut: { mac: 'Cmd+K', win: 'Ctrl+Shift+K' }, menu: { menu: 'View', section: 'palette' }, run: () => HangarPalette.open() },
    { id: 'app.overseer', label: 'Overseer', group: 'App', icon: 'eye', aliases: ['ask'],
      shortcut: 'CmdOrCtrl+Shift+O', menu: { menu: 'View', section: 'panels' }, run: () => toggleOverseer() },
    { id: 'view.clean', label: 'Clean view', group: 'App', icon: 'chat', aliases: ['chat', 'terminal'],
      shortcut: 'CmdOrCtrl+Shift+L', menu: { menu: 'View', section: 'panels' },
      run: () => {
        if (document.body.classList.contains('ov-open') && $('#overseer').contains(document.activeElement)) { if (ov) setOvView(!ovChatOn); }
        else if (focused) setView(focused, !tiles.get(focused)?.chat?.on);
      } },
    { id: 'app.usage', label: 'Usage', group: 'App', icon: 'chart', aliases: ['tokens', 'cost', 'limits'],
      shortcut: 'CmdOrCtrl+Shift+Y', menu: { menu: 'View', section: 'panels' }, run: () => openUsage() },
    { id: 'view.reset-sizes', label: 'Reset tile sizes', group: 'App', aliases: ['layout'],
      menu: { menu: 'View', section: 'size' }, run: () => resetSizes() },
    { id: 'view.text-bigger', label: 'Bigger text', group: 'App', aliases: ['font'],
      shortcut: 'CmdOrCtrl+=', menu: { menu: 'View', section: 'size' }, run: () => hangar.font(1) },
    { id: 'view.text-smaller', label: 'Smaller text', group: 'App', aliases: ['font'],
      shortcut: 'CmdOrCtrl+-', menu: { menu: 'View', section: 'size' }, run: () => hangar.font(-1) },
    { id: 'view.ui-bigger', label: 'Larger interface', group: 'App', aliases: ['zoom in'],
      menu: { menu: 'View', section: 'ui' }, run: () => hangar.zoom(1) },
    { id: 'view.ui-smaller', label: 'Smaller interface', group: 'App', aliases: ['zoom out'],
      menu: { menu: 'View', section: 'ui' }, run: () => hangar.zoom(-1) },
    { id: 'view.ui-actual', label: 'Actual size', group: 'App', aliases: ['zoom reset'],
      shortcut: 'CmdOrCtrl+0', menu: { menu: 'View', section: 'ui' }, run: () => hangar.zoom(0) },
    { id: 'app.settings', label: 'Settings…', group: 'App', icon: 'sliders', aliases: ['preferences', 'options'],
      shortcut: { mac: 'Cmd+,', win: null }, menu: { menu: 'App' }, run: () => openSettings($('#btn-settings')) },
    { id: 'app.shortcuts', label: 'Keyboard shortcuts', group: 'App', icon: 'keyboard', aliases: ['keys', 'help', '?'],
      menu: { menu: 'Help' }, run: () => HangarPalette.openShortcuts() },

    // Window
    { id: 'session.next-waiting', label: 'Next session that needs you', group: 'App', aliases: ['waiting', 'jump'],
      shortcut: 'CmdOrCtrl+Shift+U', menu: { menu: 'Window', section: 'next' }, run: () => nextWaiting() },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `window.session-${i + 1}`, label: `Session ${i + 1}`, group: 'Sessions', palette: false,
      shortcut: `CmdOrCtrl+${i + 1}`, menu: { menu: 'Window', section: 'tiles' },
      run: () => { const t = state.tiles[i]; if (t) setFocus(t.id); },
    })),
  ]);

  // The 'modes' provider (one entry per mode) lives in modes-ui.js.

  // Sessions: one row each. ↩ focuses, ⌘↩ zooms, ⇥ lists its actions.
  const SHAPE = { idle: '○', starting: '○', working: '●', needs_input: '◆', done: '✓', error: '✕', exited: '–' };
  // Every workspace's sessions; with 2 or more workspaces each row names its workspace.
  const wsName = (t) => ((state.workspaces || []).length > 1 ? (state.workspaces.find((w) => w.id === t.ws)?.name || '') : '');
  C.provide('sessions', () => (state.allTiles || state.tiles).map((t) => ({
    id: `tile:${t.id}`, label: t.name, group: 'Sessions', aliases: [folderName(t.cwd || ''), wsName(t)].filter(Boolean),
    context: wsName(t) || folderName(t.cwd || ''), status: t.status, statusLabel: STATUS_LABEL[t.status] || t.status,
    shape: SHAPE[t.status] || '○', color: t.color, tileId: t.id,
    run: () => setFocus(t.id),
    secondary: () => { setFocus(t.id); toggleZoom(t.id); },
  })));

  // Recent folders, filled by the palette when it opens (hangar.recent is async).
  let folders = [];
  C.setFolders = (list) => { folders = list || []; };
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  C.provide('folders', () => folders.filter((d, i) => folders.findIndex((x) => norm(x) === norm(d)) === i).map((dir) => ({
    id: `start:${dir}`, label: `New in ${folderName(dir)}`, group: 'Start', icon: 'spark', aliases: [dir], context: dir,
    run: (cx, o) => start(dir, o.shift ? 'continue' : 'new'),
    secondary: () => start(dir, 'continue'),
  })));

  // Native menu: rebuilt from the registry whenever its labels change.
  C.onChange((spec) => hangar.setMenu(spec));
  hangar.onCommand((id) => C.run(id));
  hangar.onState(() => C.changed());
})();
