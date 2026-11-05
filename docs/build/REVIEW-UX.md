# UX review (reviewer "ux", 5 Nov 2026)

Scope: every surface in dark and light, using the dev harness (`tools/dev.sh`, NAME ux). States were faked through the hook endpoint (UserPromptSubmit, PostToolUse, PermissionRequest, Stop, StopFailure), and the native menu was listed through the dev `menu` api. Screenshots are in `.devdata/ux/shots/`. No prompts were sent to Claude.

Private: `28-history-dark.png` shows the owner's real prompts (the same problem as `x-history.png`). Never use it publicly.

Ranking: **P1** = broken or clearly wrong. **P2** = noticeably worse than it should be. **P3** = polish.

---

## P1

1. **Amber is used for things that aren't "needs you"** (breaks promise 3).
   - Where: the mode palette in `src/main/modes.js` (`COLORS`), the session swatches (`SWATCHES` in `app.js`), the workspace colour swatches, and the mode editor swatches.
   - What's wrong: the built-in **Notes** mode and the **Tidy commits** add-on use `#f5b545`, which is exactly `--needs`. A Notes tile shows a solid amber chip next to "Working" or "Done", so it reads as a tile waiting for you (shot 09). Users can also pick amber for a session, a workspace underline or a custom mode. Green (`#5fd39a` = `--done`) and red (`#ff8a7a`, close to `--error`) are in the same palette, so mode chips can also look like status. Review and Overnight use `#c49cff`, which is almost the overseer's `--ov` `#b49cff` (this goes against note 9).
   - Fix: take amber out of every user-picked palette. Give modes a palette that can't be mistaken for a status colour (for example blue, teal, pink, slate, plus a lime or brown instead of amber). Recolour Notes and Tidy commits, and move Review and Overnight off the overseer purple. Migrate stored colours that are amber to the nearest allowed colour.
   - Shots: `08-modes-set-dark.png`, `09-states-dark.png`, `13-pill-menu-dark.png`, `11-mode-editor-light.png`.

2. **The tile header drops the session name when a tile is narrow** (breaks A5, "name always").
   - What happened: with the overseer open, delta's name was 0 px wide in a 445 px tile, and alpha's was 2 px in a 328 px tile. The header showed only "✕ Error: API error: overloaded" with no name at all. This is common: the overseer, four tiles and a laptop screen are enough.
   - Fix: give `.name` `flex-shrink: 0` and a `min-width` of about 6ch with an ellipsis. Make the state, doing line and error text the parts that shrink or drop first (`min-width: 0; overflow: hidden; text-overflow: ellipsis`).
   - Shot: `19-overseer-dark.png`.

## P2

3. **Mode picker can't be used from the keyboard.** ↑/↓ do nothing (it doesn't use `arrowNav`), there's no type-to-filter (PLAN D: "type to filter in every menu"), and the focused row has no visible highlight.
   - Fix: wire `arrowNav(el)` in the picker, include the add-on chips, and add the same filter as the palette (typing filters the rows). Give `.item:focus` the hover background.
   - Shots: `07b-mode-picker-typed.png`, `07c-mode-picker-arrow.png`.
4. **New popover has no type-to-filter**, and its rows aren't accessible (`div.recent-item tabindex=-1`, no role). Typing letters does nothing.
   - Fix: add a filter field (or type-to-filter like the palette). Use `role="listbox"` and `role="option"` with `aria-selected` on the rows.
   - Shot: `02c-new-type.png`.
5. **New remembers the Terminal tab.** After opening one terminal, every later Ctrl+Shift+N "New session…" opens on Terminal.
   - Fix: always open on Claude Code. Open on Terminal only from "New terminal" (Ctrl+Alt+N).
   - Shot: `03-new-terminal.png`.
6. **New popover sits on top of the empty-state folder list with no backdrop.** You see two copies of the same list, one through the other, which looks broken.
   - Fix: hide the empty-state list while New is open, or dim the stage behind the modal.
   - Shot: `02-new-dark.png`.
7. **Explainer copy is still in several places** (rule: no helper sentences):
   - Mode picker: "Claude gets the mode with your next message."
   - Usage: "Plan limits show up after the first reply in any session." and "Cost is what these sessions would cost at API prices." (lead's item, confirmed). There is also a second "≈ estimate at API prices" line under the chart.
   - Settings: "0 turns a warning off.", "For sessions started or resumed after the change. Shift+Tab in a tile changes it there.", "Applies on New chat."
   - Time budget: "Starts with your next prompt. Claude wraps up near the end."
   - Tooltips: the name has "Double-click to rename", and the lock has "Size set by hand. Click to let it size itself again."
   - Fix: delete them all. Keep the single ≈ mark, with a tooltip "Estimate at API prices". For "0 = off", use an "Off" placeholder in the field.
   - Shots: `07-mode-picker-dark.png`, `17b-usage-dark.png`, `21-settings-light.png`, `26-timer-dark.png`.
8. **Usage popover jumps.** On first open there's no history. The chart arrives later and the popover grows by about 280 px under the cursor. The "Open sessions" rows are empty grey dots with no values.
   - Fix: reserve the chart's height with a quiet skeleton, or open only after the cached data is ready. Hide the "Open sessions" block until a session has numbers.
   - Shots: `17-usage-dark.png`, `17b-usage-dark.png`.
9. **The usage control is easy to miss** (note 4: "a clear view usage control"). At rest it's a faint, borderless bar-chart glyph, while every other top-bar button has a border.
   - Fix: give it the same `.btn icon` frame as Menu and Settings.
   - Shot: `01-empty-dark.png`.
10. **Mode chips are low contrast in light theme.** Notes (amber on cream) and Overnight (lilac on lilac) look disabled. The dark-theme hex colours are reused unchanged.
    - Fix: in light theme, use a darker text tone for each mode colour (mix about 45% black into `--mc`), or fill the chip with a darker background.
    - Shot: `09-states-light.png`.
11. **Errors aren't counted.**
    - The top-bar summary and the overview's count row show ◆1 ✓2 while a tile is in error, even though the overview lists the error tile under "Needs you".
    - Fix: add an "✕ n" count in the error colour, or count errors with "needs you" in both places.
    - Shots: `09-states-dark.png`, `14-overview-dark.png`.
12. **Three notice styles from three helpers.**
    - Tile notice: Undo plus a plain ×.
    - Overlap notice: text plus a plain ×.
    - Workspace toast (`ws-toast`, its own code in `workspaces.js:321`): Undo plus a boxed, filled × button, pinned to the window's top-right corner.
    - The workspace toast covers the top-right tile's git chip and ⋯ menu, and stacks against that tile's overlap notice.
    - Fix: use one toast component (`app.js:915`) everywhere, with the same × style. Put window-level toasts below the top bar's right edge, not over a tile's header.
    - Shots: `24-putaway-undo-light.png`, `22-notices-light.png`.
13. **Closing a session gives no Undo notice.** PLAN B promises "Undo for put-away and close". Put-away has it, but tile close and the ended tile's "Close" don't. "Reopen closed session" exists, but only in the menu and the palette.
    - Fix: show the same "alpha closed · Undo" toast, without the dot, i.e. "alpha closed" plus an [Undo] button.
    - Shot: `23-close-undo-light.png`.
14. **Ctrl+M minimises the window on Windows.** The `minimize` role brings its default accelerator. Ctrl+M is Enter (CR) in shells and in Claude Code, so it gets taken over (rule: never plain Ctrl+letter).
    - Fix: set `{ role: 'minimize', accelerator: '' }`, or `registerAccelerator: false`, on Windows and Linux.
    - Shot: native menu list (`dev.sh api ux menu`).
15. **Wrong shortcut in a tooltip.** The header timer says "Time budget (Ctrl+T)", but the registry has Ctrl+Shift+T. Plain Ctrl+T would also break the rule.
    - Fix: build the tooltip from the registry (`HangarCommands` shortcut label), as the pin and mode tooltips already do.
    - Shot: `05b-header-crop.png`.
16. **Settings select is cut off.** Permissions shows "Ask firs". The native selects all have different widths and the OS look, while the rest of the panel uses app controls.
    - Fix: give selects one `min-width` (about 140 px) and `appearance: none`, with the app's chevron.
    - Shot: `21-settings-light.png`.
17. **Changes peek shows raw git codes** ("M", "??"). Clicking an untracked file does nothing.
    - Fix: map the codes to small icons or words (modified, new, deleted) with an accessible name. Clicking a new file shows its contents as all-added lines.
    - Shots: `18-changes-peek-dark.png`, `18c-changes-diff.png`.
18. **Tile ⋯ menu has 14 items** (lead's item, confirmed). It also mixes naming with the native menu ("Mode" vs "Choose mode…", "Fresh start" vs "Fresh start…"). There are three "changes" items with different meanings: "Review changes" and "Simplify changes" here, "Show changes" only in the menu. "Snooze…" appears on tiles that aren't asking for anything.
    - Fix: see Cuts.
    - Shot: `06-tile-menu-dark.png`.
19. **Opening the overseer re-lays out every tile** (each one shrinks sideways and terminals reflow), and closing it does the same again. The focused tile keeps its slot, but tiles that weren't touched visibly jump twice.
    - Fix: accept the reflow, but animate only the width with the same 120 ms fade (no slide). Or open the overseer as an overlay drawer, so the tiles don't move at all.
    - Shots: `19-overseer-dark.png`, `20-clean-view-light.png`.

## P3

20. **Gap between name and state in the header.** The hidden "Mode" chip (`opacity: 0`) still takes up space, so there's a hole between the name and "Needs you" or "Working". Use `display: none`, or `width: 0` until hover or focus. Shots: `04-tiles-trust-dark.png`, `22-notices-light.png`.
21. **"Error: API error: overloaded"** says "error" twice. Strip a leading "API error:" or drop the "Error:" prefix (the ✕ shape already says it). Shot: `09-states-dark.png`.
22. **On hover, an empty context bar** (0%) appears in the header. Hide `.ctx` until the context is above 0. Shot: `05b-header-crop.png`.
23. **Missing tooltips.** The ⋯ "More" and clean-view header buttons have aria-labels but no `title`, unlike their neighbours. Add "More" and "Clean view (Ctrl+Shift+L)".
24. **Palette rows mostly have no icon** (PLAN D: icon, label, keycaps). Only modes and "New in…" rows have one. Token-cost dots sit right after the label here, but right-aligned in the tile menu. Give every command an `icon` from `ICON`, and right-align the cost dots everywhere. Shot: `15b-palette-query.png`.
25. **Icon reuse.** The Review mode uses the eye glyph, which is also the overseer's icon. Use a magnifier or a check-list for Review. Shot: `07-mode-picker-dark.png`.
26. **Overview headings are in caps** ("NEEDS YOU", "DONE"). Use sentence case, small and muted, like the rest of the app. Shot: `14-overview-dark.png`.
27. **The New popover changes height** when you switch Claude Code / Terminal (row height 41 → 36 px), and the "Own branch" checkbox pops in and out of the footer as the selection moves between git and non-git folders. Keep one row height, and keep the footer slot reserved (dim the checkbox when the folder isn't a git repo). Shots: `02-new-dark.png`, `03-new-terminal.png`.
28. **Tab buttons don't match.** In New, "Claude Code" has no icon but "Terminal" does. Give Claude Code the spark icon. In the mode library header, "New mode" has no icon, while Import and Ask the overseer do, and it isn't styled as the primary action. Shots: `02-new-dark.png`, `10-mode-library-light.png`.
29. **Selected text can barely be read** in the rename and workspace name fields (grey selection on dark grey text). Set `::selection { background: color-mix(var(--accent) 35%, transparent); color: var(--text); }`. Shots: `12-ws-new-dark.png`, `27-rename-dark.png`.
30. **Mode editor wording.** "Shown in the menu" is unclear; call it "Description". The built-in "Hide" button is red, but hiding isn't destructive, so use the normal button style. Shot: `11-mode-editor-light.png`.
31. **Empty-state copy.** Clean view: "Nothing here yet. Messages and replies show up as you go." Overseer: "Ask about your sessions, or tell it what to do in them." Cut both to nothing or a single word. The composer placeholder already explains it. Shots: `20-clean-view-light.png`, `19-overseer-dark.png`.
32. **Usage repeats itself:** "Last 14 days" is followed by "14 days 38M tokens". Keep one of them. Shot: `17b-usage-dark.png`.
33. **The shortcut sheet isn't grouped.** Rows run across two columns in registry order, so the workspace keys sit between the view keys. Group them under Session, Workspace, Modes and View, and add the overview's own keys (↑↓ ↩ H ⌫ 1-9). Shot: `16-shortcuts-dark.png`.
34. **Two pulse animations for one dot.** `style.css:138` (`pulse 1.6s`) and `look.css:19` (`breathe 2s`) both style the working dot. Keep the A4 one in `look.css` and delete the other. Pop-in is 140 ms and the toast exit 200 ms, against the ≤120 ms rule; set both to 120.
35. **"Saved" and "Exported" in the mode editor disappear after 1.4 s.** Strictly, that's a timed notice. Make it a quiet state on the button instead ("Saved ✓" until the next edit).
36. **The empty-state folder list reorders by itself** a moment after load: the first and second shots showed different orders with no input in between. Sort once from the cached list. Shot: `01-empty-dark.png` (compared with the first light shot).
37. **Duplicate folder names in recents.** Two "proj" rows can only be told apart by their long paths. When names clash, show the parent folder ("modes/proj", "hangar/.devdata/proj").
38. **History uses the default OS scrollbar** inside the popover. Use the thin app scrollbar the terminals use. Shot: `28-history-dark.png` (PRIVATE).
39. **Ended tiles reflow badly.** After a resize, the ended tile's frozen terminal text wraps mid-word ("tru st?"). Leave the dimmed snapshot unfitted, or clear it behind the "Session ended" card. Shot: `20-clean-view-light.png`.

---

## What's genuinely good

- **Status reads instantly.** Shape plus colour (◆ ● ✓ ✕ ○), an amber frame only on the waiting tile, and a calm red frame on errors. The top-bar summary and the workspace pill's amber dot work well together.
- **The focused tile really stays put.** A permission request on another tile, a new terminal and status changes all left the focused tile's rect unchanged (`29-focus-stable-dark.png`). Note 8 holds.
- **The mode editor is excellent:** live token count, cost dots, guard, exit phrases, "then switch to", and an optional warning threshold, all on one quiet screen. Notes mode ended → "Notes mode ended [Undo]" works exactly as note 15 asks.
- **The overview** (list plus live preview with the real permission menu) is clear and fast, and Esc returns focus to the terminal.
- **The palette's empty state** (who needs you, then recent commands, plus a context chip showing which tile it acts on) is well judged.
- **Workspace pills only appear once there are two workspaces**, and the pill menu is compact (rename, notifications, default mode, colour, put away, close).
- **Every button has an accessible name.** I found none without one.
- **Native menu, palette and shortcuts come from one registry.** The labels match, apart from the few noted above.

## Cuts (simplify how things are shown; nothing the owner asked for is removed)

- **Tile ⋯ menu: 14 items down to about 8.** Keep: Rename and colour, Mode…, Fresh start…, Pin, Snooze (only while the tile glows), History…, Branch this session, Close. Move "Copy folder path / Copy session ID / Reveal / Open in editor" into one **"Folder ›"** submenu. Move "Review changes / Simplify changes" into the changes peek (opened from the git chip) as two buttons with their cost dots. Then everything about changes lives in one place, and the menu's "Show changes" can go from the Session menu as its own item.
- **Usage popover:** drop the empty "Open sessions" list until it has numbers, the two explainer lines, and the repeated "14 days". Keep the meters, chart, per-project rows and one ≈.
- **Settings:** drop the three helper sentences and the "Edit modes" button (it's already in the mode chip, the Modes menu and the palette).
- **Header on hover:** it shows mode, git, an empty context bar, timer, pin, clean view and ⋯. Hide the context bar until it has a value. Pin is also in ⋯, the menu and the palette, so consider showing it on hover only when the tile is already pinned.
- **Overview count row** duplicates the top-bar summary right above it. Drop the row, or the summary, while the overview is open.
- **Notices:** merge the two toast implementations into one.
