# modes log

## Log
- 20:37 start: read RULES, PLAN 3.G, research 03, modes/session/app code. /goal exists (Claude Code 2.1.318), /code-review and /simplify bundled. Plan permission mode can't be switched in-session safely (only Shift+Tab cycling), so Plan uses the hook guard.
- 20:42 main side: guards.js (readonly/risky PreToolUse deny), modes.js (13 modes + 3 add-ons, cost/icon/guard, project defaults, file import/export), session.js add-ons + guard, modes-ipc.js
- 20:48 renderer: modes-ui.js/.css (picker with More + add-on row, goal form, library grid + editor with icon/cost/guard/live tokens, export/import/drop, Review/Simplify, registry); app.js wrappers + chip delegate + New dialog default
- 20:51 LIVE: Review mode chip shows shield + add-on glyph; Haiku Write(hi2.txt) denied by PreToolUse hook in a readonly-guard mode, no file created (screen captured)
- 20:54 checked in dev app (shots in .devdata/modes/shots: 02 picker, 05/06 library, 07 editor, 08 goal form, 09 tile menu, 11 picker More); live import of a .hangar-mode.json OK, bad file refused; registry has every mode, add-on, Review/Simplify, Import; folder default recorded. npm test 88 green. Committed.

## Decisions for the owner
- Careful blocks pushes, deploys and destructive commands (risky guard), not all file edits: blocking edits would make it the same as Review. One switch in the editor (Guard: Read-only) changes it.
- Plan uses Hangar's read-only hook guard, not Claude Code's plan permission mode: that can only be switched in-session by Shift+Tab cycling, which depends on the current mode and is not safe to type blind.

## Left over
- /goal idle check-ins can start turns while a tile looks idle (max 3 per goal). Hangar could set CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0 for tiles; not done (changes Claude Code behaviour, owner call).
- Until done picked from the New dialog or palette ⌘↩ (no tile to anchor the goal form) falls back to the mode text ("treat your next message as the goal").
- New dialog still shows "No mode" while a folder with its own remembered mode will start in that mode; it could show the folder's mode on the highlighted row.
- Export uses the native save dialog (not exercised in the quiet harness); toFile/import are unit-tested and import was checked live.
- Palette rows for add-ons don't show on/off state (registry has no checked flag).
