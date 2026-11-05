- 21:17 P1s: palette without status colours (src/shared/palette.js) + migration; name keeps ~7ch, state/doing/markers shrink first
- 21:24 P2: mode picker arrows + type-to-filter; New filter + listbox roles + backdrop; usage popover trimmed + reserved chart + framed control; error counts; one notice style (tile notices below header, window notices in top bar); Undo on close; tooltips from registry; settings copy + select; 120 ms motion. (codefix's commits c0836cd/60458da picked up some of my extras.js/modes-ui.js edits)
- 21:28 tile ⋯ menu trimmed to 7 (Folder › flyout; copy ID, unlock in palette/menu; Review/Simplify in changes peek), git codes as words, overseer instant switch + fade, P3s: thin popover scrollbars, ::selection, overview sentence case, library New mode primary, editor Description/Hide/Saved state, Review magnifier icon, empty-state copy cut
- 21:31 grouped shortcut sheet (+ overview keys), empty-state list no longer reorders (latest render wins), header pin only when pinned, shared colour global renamed HangarColors (HangarPalette is the command palette's)

## Left over
- Changes peek: clicking a new (untracked) file still shows nothing; needs main-side content in data-ipc gitChanges (codefix's git area).
- P3 24 palette icons on every command and right-aligned cost dots in the palette.
- P3 39 ended tiles re-wrapping their frozen text after a resize.
- P2 5: New already remembers Claude/Terminal only for this run and only when picked on its tabs (Ctrl+Alt+N doesn't set it); left as is.
- Not tested with real OS key presses beyond the dev harness `key` api; Folder flyout keyboard (→ / ←) checked by code only.
