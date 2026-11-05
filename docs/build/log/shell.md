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
