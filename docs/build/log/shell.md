# shell log

## Command registry API (src/renderer/commands.js, global `HangarCommands`)
- `HangarCommands.register(cmd | [cmd])`: cmd = `{ id, label, group, icon?, aliases?, shortcut?: { mac, win } | 'Accel', menu?: { menu: 'Workspace', section?: 'name', label? }, palette?: false, when?(ctx), run(ctx, opts), secondary?(ctx, opts), actions?(ctx) }`
- Groups: 'Sessions', 'Workspaces', 'Actions', 'Modes', 'Start', 'App'. Shortcuts are Electron accelerators (never plain Ctrl+letter on Windows).
- `HangarCommands.provide(name, fn)`: dynamic commands (fn(ctx) returns an array), re-read every time (e.g. one row per workspace).
- `HangarCommands.run(id)`; `HangarCommands.changed()` after your state changes so the native menu rebuilds (only if its labels/enabled changed).
- Menu items placed with `menu: { menu: 'Workspace' }` appear in the native menu automatically, in registration order; a new `section` value puts a separator before it.
- ctx (from app.js): `{ focused, snap, tiles, state }`.

## Log
- 20:10 commands.js registry created (API above)
- 20:19 menu built from registry (main.js menu:set), app-commands.js, palette.js, focus return, tests
- 20:28 palette, ? sheet, focus return checked in dev app (shots in .devdata/shell/shots); committed

## Left over
- Real OS accelerators can't be pressed by the dev harness (sendInputEvent skips the menu on Windows); checked via `dev.sh api NAME menu 'accel=Ctrl%2BShift%2BK'`, which clicks the menu item with that shortcut.
- Session rows list `state.tiles` (the current workspace view); cross-workspace session rows are up to the workspaces helper (provide() a rows provider or widen state).
- Workspace menu labels use Title Case ("New Workspace"); the rest of the registry is sentence case.
- Palette rows have no second line for the highlighted session (spec says optional).
- 20:34 chunk 2 start: palette mode rows plain names + quiet Modes label; look.js/look.css/main look.js (themes, hc, calm, density, shapes, diet, live region)
- 20:39 chunk 2 done: themes (System default), high contrast, reduce motion, status shapes, live region, neutral timer/context/usage warn, header diet, Compact density; shots in .devdata/shell/shots (light, dark, compact, header-hover, settings, palette-modes)

## Left over (chunk 2)
- Real mouse hover can't be sent by the harness; the hover shot uses an injected style on an unfocused tile.
- Windows title-bar buttons follow the theme via setTitleBarOverlay; capturePage doesn't show them, so not seen in a shot.
- High contrast and forced-colors CSS written but not seen (no HC mode toggled on this PC).
- Light theme: Claude Code's own truecolor text is kept readable by xterm minimumContrastRatio 4.5; its "auto mode" yellow reads as dark gold.
- 20:43 chunk 3: extras.js (doing, git chip + changes, overlap notice, cold marker, folder actions, history, fork, worktree, usage chart), shellops.js; path element removed; tileNotice no longer auto-closes
