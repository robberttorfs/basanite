# 04 · UI research: workspaces, overviews, palette, calm status

Research for the next Hangar version (workspaces, overviews, better menus, quality of life). 5 Nov 2026.
Read alongside `README.md` and `docs/OWNER-NOTES.md` (notes 7, 8, 18, 20, 24, 25 are the UI standard).

## Where Hangar is today (from the code)

- **Top bar:** hidden hamburger (Windows), live summary (`2 need you`, `3 working`, `1 done`, the first is a button that jumps), usage meters, **New**, **Overseer**, settings sliders. Calm already; the summary is the best thing in it.
- **Tiles:** header holds dot, kind icon, name, mode chip, state word, path, Fresh start hint, context bar, then up to five icon buttons (lock, timer, pin, view, more). Pin and timer already hide until hover/in use. Agents row under the header.
- **Popovers** for timer, more, rename, mode picker, usage, settings; **New** is a modal with a Claude Code / Terminal switch, recent list with arrow keys, mode menu, Choose folder.
- **Native menu bar** already exists (Session, Modes, View, Window) with accelerators.
- **Theme:** dark only (`:root` tokens, no light set). `prefers-reduced-motion` is handled in two places only.
- **Shortcut space in use:** ⌘1-9 (sessions), ⇧⌘ U/P/M/R/T/L/Y/O/K/↩, ⌘T, ⌘N, ⌥⌘N, ⌘=, ⌘-, ⌘0. Windows uses Ctrl+Shift for all of them because plain Ctrl belongs to the terminal.

Everything below is shaped around that: Hangar is mostly a wall of live terminals, so any new chrome competes with them. The bar for adding anything is high.

---

## 1. Principles for Hangar

Short and opinionated. Each one is a test a new feature must pass.

1. **The periphery speaks, the centre works.** Status lives at edges (tile borders, the top bar, a pill). The focused tile never moves, never resizes, never gets an overlay it didn't ask for. (Case, principle 3: "make use of the periphery"; owner note 8.)
2. **One colour means one thing.** Amber = needs you. Nothing else is amber: not warnings, not selection, not the timer at 80% (move that to a neutral fill and keep red for time-up). Things 3 runs ~95% neutral and keeps colour for meaning; copy that ratio.
3. **Attention escalates in steps, never jumps.** Idle → quiet dot. Working → dot + soft activity. Needs you → amber glow + top-bar count. Waiting a long time → OS notification once. Never a sound, never a shake, never a second notification for the same wait.
4. **Nothing closes by itself, nothing moves by itself while you look.** Notices stay until dismissed; layout changes wait until focus leaves (already the rule for the selected tile; extend it to workspaces and overviews).
5. **Instant switch + short fade (≤120 ms).** No sliding workspaces, no zoom-out animations, no spring physics. Mission Control's zoom is the one thing *not* to copy. With reduced motion: no fade, just swap.
6. **Show it when it matters, hide it when it doesn't.** A control that is relevant <10% of the time appears on hover or state (lock only when locked, timer only when set, workspace pills only when there is >1 workspace). Case principle 7: "the minimum needed to solve the problem".
7. **Icons first, one word second, sentences never.** No helper lines, no "Tip:", no subtitles under titles. Tooltips carry the name and the shortcut, nothing more.
8. **Everything reachable three ways:** a visible control (for discovery), the native menu (for the full list), the palette (for speed). The palette and menu are generated from the same command table so they never drift.
9. **Keyboard is first-class, mouse is complete.** Every action has a palette entry; frequent ones have a shortcut; nothing is keyboard-only.
10. **Colour is never alone.** Every status has a shape and a word too (WCAG 1.4.1), and a screen-reader label.
11. **Fail visibly but calmly.** A crashed session keeps its tile, shows one line and Resume. A broken workspace restore opens what it can and lists the rest in one dismissible notice. (Case principle 6: "work even when it fails".)
12. **Free for single-workspace users.** Someone who never makes a second workspace should see exactly today's app, pixel for pixel.

---

## 2. Workspaces and switching: three designs

**Model (shared by all three).** A workspace is a named set of sessions plus their layout (order, pins, locks, sizes, clean-view state, modes). Sessions in a background workspace **keep running**; switching only changes what is drawn. A workspace can be **put away** (sessions stop and resume later, exactly like quitting Hangar does today) and **reopened** later, like iTerm2 arrangements or Warp launch configs. There is always one workspace ("Main"), unnamed in the UI until a second one exists.

Attention crosses workspaces: the top-bar summary counts all of them, and ⇧⌘U (next that needs you) hops workspaces when it has to.

### Design A: pills in the top bar (Arc spaces / browser tabs, made quiet)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Main   Nichenaut •   Portfolio    +      ● 1 needs you  ● 3 working   5h ▮▮▯ 41%  [+ New] [◉] [⚙] │
├───────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ ● api-server   Build      │ │ ● web  Notes │ │ ○ docs       │               │
│ │                           │ │              │ │              │               │
│ │  (terminal)               │ │              │ │              │               │
│ └───────────────────────────┘ └──────────────┘ └──────────────┘               │
└───────────────────────────────────────────────────────────────────────────────┘
  active pill = full text colour, others = muted; "•" = amber dot when a hidden
  workspace has a session that needs you. "+" appears on hover of the pill row.
```

- Switch: click a pill, ⌃⌘← / ⌃⌘→ (Windows Ctrl+Alt+←/→), ⌥⌘1-9 (Windows Ctrl+Alt+1-9), or the palette.
- Right-click a pill: Rename, Colour, Put away, Close. Drag pills to reorder. Drag a tile header onto a pill to move the session there.
- Pills only render when there are 2+ workspaces. With one, the bar is today's bar.

Pros: zero learning (everyone knows tabs); always shows where you are; amber dot on a pill is the perfect peripheral cue; cheap to build (one flex row, reuses the summary's dot styles).
Cons: top-bar width is finite (beyond ~6 pills it needs an overflow chevron); adds a row of text to the calmest part of the app.

### Design B: thin left rail (Slack workspace switcher / Arc sidebar icons)

```
┌──┬────────────────────────────────────────────────────────────────────────────┐
│  │ ● 1 needs you  ● 3 working                 5h ▮▮▯ 41%  [+ New] [◉] [⚙]       │
│▣ ├────────────────────────────────────────────────────────────────────────────┤
│M │ ┌───────────────────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ │ ● api-server   Build      │ │ ● web  Notes │ │ ○ docs       │            │
│N•│ │                           │ │              │ │              │            │
│  │ │                           │ │              │ │              │            │
│P │ └───────────────────────────┘ └──────────────┘ └──────────────┘            │
│+ │                                                                            │
└──┴────────────────────────────────────────────────────────────────────────────┘
  36 px rail: a coloured letter square per workspace, amber corner dot for attention,
  hover shows name + shortcut. Hidden entirely with one workspace.
```

Pros: scales to many workspaces; colour squares are icons-over-text; does not touch the top bar.
Cons: costs horizontal space on every screen for something you switch a few times an hour; letter squares are hard to tell apart past 4-5 (Slack's own users complained the collapsed switcher hid activity, TidBITS); one more "chrome" surface next to tiles that already have headers; a second vertical strip when the overseer panel is open on the right makes the window feel boxed in.

### Design C: no visible switcher, one name + overview (VS Code profiles / Arc ⌘S / Stage Manager-lite)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Nichenaut ▾      ● 1 needs you · elsewhere   ● 3 working   5h ▮▮▯ 41%  [+ New] [◉] [⚙] │
├───────────────────────────────────────────────────────────────────────────────┤
│   tiles as today                                                              │
└───────────────────────────────────────────────────────────────────────────────┘
   click "Nichenaut ▾"           ┌──────────────────────┐
                                 │ ✓ Nichenaut      ⌥⌘1 │
                                 │   Portfolio •    ⌥⌘2 │
                                 │   Main           ⌥⌘3 │
                                 │ ──────────────────── │
                                 │   New workspace…     │
                                 │   Put away Nichenaut │
                                 └──────────────────────┘
```

Pros: the quietest possible; one word of chrome; menu scales to any number; matches the existing popover style exactly.
Cons: other workspaces are out of sight, so attention in them has to be carried by the summary ("elsewhere"), which is more text; switching is two clicks; VS Code had to add a profile badge because people forgot which profile they were in, which shows the risk of a hidden switcher.

### Pick: A, with C's menu as its overflow

Pills in the top bar, hidden when there is one workspace, muted until active, an amber dot on any hidden workspace with a waiting session. When pills would not fit (rare: 7+ workspaces or a narrow window), the extra ones fold into a `▾` menu that is exactly Design C. Reasons: it keeps "where am I" always visible (VS Code's lesson), puts cross-workspace attention in the periphery without words, uses no extra screen edge, and is the least code. B is the right answer only for people with 10+ workspaces, and Hangar users will mostly have 2-4.

Details that make A feel good:
- Switch is instant; incoming tiles fade in over 100 ms; the outgoing set simply disappears. Terminals in hidden workspaces stay mounted but `display:none`-like (keep xterm instances, skip fit until shown) so switching back is instant and costs no PTY resize storm.
- Remember the focused tile per workspace; switching back restores focus and scroll.
- New session from a workspace lands in that workspace. Dropping a folder onto a pill starts it there.
- "Put away" asks once inline in the pill menu (no modal), then the pill goes and a single notice offers Undo until dismissed.
- Workspace colour is optional and only tints the pill text underline, never the tiles.

---

## 3. Overview screen: two designs

Purpose: "what is everything doing" in one look, across all workspaces, then jump. Opens with **⇧⌘A** (Windows Ctrl+Shift+A), the top-bar summary (click the counts), the View menu, or the palette. Esc or the same key closes. Opening is an instant swap with a 100 ms fade, never a zoom.

### Design 1: the grid (Mission Control / Exposé, but status cards not thumbnails)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Overview                                                                  Esc │
├───────────────────────────────────────────────────────────────────────────────┤
│ Nichenaut                                                                     │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐                │
│ │◆ api-server      │ │● web       Notes │ │○ docs            │                │
│ │ Needs you · 4m   │ │ Working · 12m    │ │ Idle             │                │
│ │ "Allow edit to   │ │ Editing shop.tsx │ │                  │                │
│ │  routes.ts?"     │ │ ▮▮▮▮▯ 62%  ⏱ 18m │ │ ▮▯▯▯▯ 9%         │                │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘                │
│ Portfolio                                                                     │
│ ┌──────────────────┐ ┌──────────────────┐                                     │
│ │✓ site            │ │● copy     Review │                                     │
│ │ Done · 2m        │ │ Working · 3m     │                                     │
│ └──────────────────┘ └──────────────────┘                                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

Pros: spatial memory (cards keep their workspace order); looks great with 3-12 sessions; one card shape reused everywhere.
Cons: busy past ~12 sessions; the eye has to scan a 2-D field to find the amber one; cards with a last line of text invite wall-of-text.

### Design 2: the attention list (Linear Inbox / Things Today / Superhuman's split)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ◆ 1   ● 3   ✓ 1   ○ 2                                              Esc │
├───────────────────────────────────────┬───────────────────────────────────────┤
│ NEEDS YOU                             │ api-server · Nichenaut                │
│ ▸ ◆ api-server     Nichenaut    4m    │                                       │
│                                       │ Claude: I want to edit routes.ts to   │
│ WORKING                               │ add the /shop handler.                │
│   ● web            Nichenaut   12m    │                                       │
│   ● copy           Portfolio    3m    │ ❯ 1. Yes                              │
│   ● scraper        Main        41m    │   2. Yes, and don't ask again         │
│                                       │   3. No                               │
│ DONE                                  │                                       │
│   ✓ site           Portfolio    2m    │                    [Open ↩]  [1] [2] [3]│
│                                       │                                       │
│ IDLE                                  │                                       │
│   ○ docs           Nichenaut          │                                       │
│   ○ notes          Main               │                                       │
└───────────────────────────────────────┴───────────────────────────────────────┘
  ↑/↓ moves, ↩ opens the session (switching workspace if needed), 1-9 answers a
  permission menu right from the preview, ⌫ marks Done as seen (moves it to Idle).
```

- Rows are one line: shape+colour, name, workspace (muted), time in state. Mode and context only in the preview pane.
- The preview is the clean-view tail (last Claude message + any pending menu), read-only except for menu number keys, which go through the same safe path the overseer uses.
- Section headers are small caps in `--faint`; empty sections are not drawn at all.

Pros: answers "who needs me" in the first row, always; scales to 30 sessions; keyboard triage in seconds (Linear's U/H model, Superhuman's "today / later / done"); the preview makes most visits to a tile unnecessary; text-light.
Cons: loses spatial memory of where tiles are; needs a preview renderer (but clean view already parses the transcript, so this is reuse).

### Pick: Design 2, the attention list

It matches Hangar's one real job (show what needs you) better than a picture of everything, it stays calm at any session count, and it reuses clean view. If the owner wants the grid feel later, it can be a toggle (`G`) inside the same screen; do not build both now.

Extra: when only one workspace exists and ≤4 sessions are open, the overview adds little, so the summary click keeps today's behaviour (jump to next waiting) and the overview stays on its shortcut and menu item.

---

## 4. Command palette spec

**Open:** ⌘K on Mac. On Windows plain Ctrl+K belongs to the shell (kill line), so use **Ctrl+Shift+K** and move Fresh Start off ⇧⌘K (it is rare and weighty; it can live in the palette, the tile's More menu and the Session menu with no shortcut, or take ⇧⌘F). Also in the menu: View → Command Palette. Open is instant, no animation; a 80 ms opacity fade at most.

**Look:** centred, 560 px wide, 20% from the top, max 8 rows visible, `--pop` surface, one 1 px `--line` border, no shadow stack. Input with no placeholder sentence: just a magnifier glyph. Each row: icon · label · (muted) context · right-aligned shortcut keycaps. No descriptions. The highlighted row may show a second line only for sessions (its last state, e.g. "Needs you · 4m").

**What is in it (one command table shared with the native menu):**

| Group | Examples | Enter does |
|---|---|---|
| Sessions | `api-server` (with status shape) | focus it, switching workspace if needed |
| Workspaces | `Nichenaut`, `New workspace…`, `Put away Portfolio` | switch / create / put away |
| Actions (scoped to focused session) | Rename and colour, Time budget, Pin, Zoom, Clean view, Fresh start, Close | runs on the focused session |
| Modes | `Mode: Notes`, `Mode: Build`, `No mode`, `Edit modes…` | applies to focused session |
| Start | recent folders (`New in ~/nichenaut`), `New terminal`, `Choose folder…` | starts there; ⇧↩ = Continue last conversation |
| App | Overview, Usage, Overseer, Settings, Bigger text, Theme: Light/Dark/System | runs |
| Fallback (only when nothing matches well) | `Ask overseer: "<typed text>"` | opens the overseer with the text |

**Empty query** shows, in order: sessions that need you, then the 5 most recent commands (frecency), then nothing else. No "Suggestions" heading.

**Matching:** case-insensitive; rank exact prefix > word-start initials (`rc` → Rename and colour) > fuzzy subsequence; boost by frecency (count × recency decay). Aliases per command (`budget`, `timer`, `clock` → Time budget). Ties keep table order so results never shuffle while you type.

**Keys:** ↑/↓ or ⌃N/⌃P move; ↩ runs; ⌘↩ runs the secondary action (session: open in zoom; folder: continue; mode: apply to all sessions in workspace); ⇥ on a session row opens a small action list for that session (Raycast's action panel, scoped); ⌫ on an empty input leaves that sub-list; Esc closes and returns focus exactly where it was (the xterm textarea).

**Scope chip:** when actions apply to a session, a small chip at the left of the input shows its dot and name (`● api-server`). ⇥ cycles it to another session without leaving the palette.

**Teaching shortcuts without copy:** the keycaps on every row are the whole lesson (Raycast added its action bar for exactly this). `?` as the whole query lists all shortcuts.

**Accessibility:** input `role="combobox"` with `aria-expanded`, list `role="listbox"`, rows `role="option"`, `aria-activedescendant` on the input; each row's accessible name includes status ("api-server, needs you"). Focus trapped while open.

**Build cost:** one module (~250 lines): command registry (id, label, aliases, group, icon, shortcut, when(), run()), scorer, renderer. Have `main.js` build the native menu from the same registry over IPC, or at least share ids, so labels stay identical.

---

## 5. Quality-of-life details great apps have (ranked by value per effort)

1. **One command registry** behind menu, palette and shortcuts (VS Code, Raycast). Prevents drift, makes every later item cheaper.
2. **Status shapes, not only colours:** `○` idle, `●` working (with a slow 2 s opacity breathe, off under reduced motion), `◆` or ring+glow needs you, `✓` done, `✕` error. Fixes WCAG 1.4.1 and reads faster at a glance.
3. **Focus return everywhere:** every popover, palette and overview returns focus to the exact terminal it came from. The single biggest "feels solid" detail in keyboard apps.
4. **"Seen" state for Done:** Done stays green until you look at that tile (focus it or open it in the overview), then quietly becomes Idle. Stops the top bar saying "3 done" forever (Linear's read/unread).
5. **Snooze a session's attention** (`H` in the overview, or tile More menu): "don't glow for 30 min / until it changes". The calm answer to a long-running session that keeps asking.
6. **Light theme + System**, via `nativeTheme.themeSource` ('system' | 'light' | 'dark'); `prefers-color-scheme` then just works in CSS. Re-derive the amber for light backgrounds (darker, e.g. `#b26b00`) so it still passes 3:1 against the tile.
7. **High contrast:** read `nativeTheme.shouldUseHighContrastColors` (Mac + Windows) and swap to a token set with solid 2 px borders and no glows; on Windows respect `forced-colors`.
8. **Full reduced-motion pass:** one rule that zeroes every transition and the glow pulse, not just two spots. Also offer it in Settings (some people want calm without changing the OS).
9. **Live region for status:** a single visually hidden `role="status"` that announces "api-server needs you" once per change, debounced (the summary already has `aria-live`; make it one sentence, not the whole bar).
10. **Restore exactly:** window size, workspace, focused tile, clean/terminal view, scroll position, overview open or not. Already mostly true; make it true for workspaces from day one.
11. **Undo for anything that closes** (close session, put away workspace, mode change) as a notice that stays until dismissed. ⇧⌘T already exists; extend it to workspaces.
12. **Density setting, two values only:** Comfortable (today) and Compact (header 26 px instead of ~34, smaller gaps, path hidden). Two values, not a slider.
13. **Tile header diet:** show name, dot, mode chip always; state word only when not Idle; path only on hover or in Comfortable+wide tiles; lock/timer/pin only when active or hovered; `⋯` always last. Current header can show up to 11 things.
14. **Type-to-filter in every menu** (Raycast): any popover list (modes, recent folders, workspaces) filters as you type.
15. **Keycaps in tooltips and menus, never in body text.**
16. **Drag targets that explain themselves visually:** dropping a folder on a pill outlines that pill; dropping on a tile outlines the tile; the stage-wide "Drop a folder…" line can become just a dashed outline + folder icon.
17. **Quiet first run instead of onboarding:** empty state = a folder icon, the recent list, and one keycap (`⌘N`). No tour. The first time a session needs you, the amber glow *is* the tutorial. The first time a second workspace exists, the pills appear; that is the tutorial for workspaces.
18. **Per-workspace notification override** (all / needs-you only / none) from the pill menu; "Main" muted while you focus on a client project, etc.
19. **Copy session path / reveal in Finder/Explorer** in the tile `⋯` menu and palette. Tiny, used constantly.
20. **`?` shortcut sheet** generated from the registry, in a plain two-column popover.

---

## 6. Things to avoid

- **Animated workspace transitions** (slides, zoom-outs, 3-D flips). macOS Spaces' slide is exactly the jumpy feel the owner dislikes. Swap + fade only.
- **Live thumbnails of terminals** in the overview or pills. Expensive (WebGL contexts, battery, note 22) and unreadable at small size. Use status cards and transcript text.
- **Red/green/amber traffic lights as the only signal**, and any second use of amber.
- **Badges with numbers on everything.** One count in the top bar is enough; elsewhere a dot. Numbers on every pill turn the bar into a dashboard.
- **Auto-switching workspaces** when something needs you. Never move the user; show the dot and let ⇧⌘U do it.
- **Nested hierarchy** (workspace → group → session). Two levels max. Stage Manager's sets inside Spaces confused people; Hangar should not repeat it.
- **Onboarding tours, coach marks, "Did you know?" cards, empty-state paragraphs.**
- **Toasts that disappear** or show timer bars (owner rule). Notices close on X, Esc, or a click.
- **A second settings screen per feature.** Workspace settings live in the pill's right-click menu; global ones in the existing settings popover.
- **Shortcut collisions with the terminal.** On Windows never bind plain Ctrl+letter; on Mac avoid ⌃letter (readline). Keep ⌘ / Ctrl+Shift / Ctrl+Alt.
- **Duplicating the native menu in-window** with a big hamburger. The Windows hamburger stays as is; the palette is the in-window "everything" list.
- **Overseer creep:** the palette's "Ask overseer" fallback is the only new link; don't add AI suggestion rows, "smart" summaries in the overview, or any line that reads like a helper.
- **Building both overview designs, or a slider for density.** Pick one, ship it, revisit only if the owner asks.

---

## Build order for one developer

1. Command registry + palette (unblocks everything, small).
2. Status shapes + reduced-motion pass + live region (accessibility, tiny).
3. Workspaces model + pills (biggest piece; keep terminals mounted, skip fit while hidden).
4. Attention-list overview (reuses clean-view transcript reader).
5. Light/System theme + high contrast tokens.
6. QoL items 4, 5, 11-13 in any order.

---

## Sources

- Amber Case, Principles of Calm Technology: https://www.caseorganic.com/post/principles-of-calm-technology
- Amber Case, O'Reilly excerpt: https://oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us
- Arc spaces and sidebar: https://www.zapier.com/blog/arc-browser-review , https://blakecrosley.com/blog/design-study-arc , https://supasidebar.com/blog/what-is-arc-browser-sidebar-2026
- Slack workspace switcher: https://tidbits.com/2023/09/21/how-to-restore-the-slack-workspace-sidebar/ , https://slack.com/help/articles/5509711831827
- macOS Stage Manager and Mission Control: https://macmost.com/the-comprehensive-guide-to-mac-stage-manager.html , https://mjtsai.com/blog/2022/10/25/stage-manager-in-macos-13-0
- VS Code profiles indicator: https://code.visualstudio.com/updates/v1_76 , https://dev.to/robole/vs-code-profiles-know-what-profile-you-are-using-no-bloody-mystery-26ii
- tmux choose-tree: https://waylonwalker.com/tmux-choose-tree/
- Zed windows and projects: https://zed.dev/docs/windows-and-projects
- Warp launch configurations / tab configs: https://docs.warp.dev/features/sessions/launch-configurations , https://docs.warp.dev/terminal/windows/tab-configs/
- iTerm2 arrangements: https://iterm2.com/python-api/arrangement.html , https://til-engineering.nulogy.com/iTerm2-Window-Arrangements/
- Raycast action panel and redesign: https://manual.raycast.com/action-panel , https://raycast.com/blog/a-fresh-look-and-feel , https://blakecrosley.com/guides/design/raycast
- Linear command menu and inbox: https://linear.app/docs/inbox , https://linear.app/docs/snooze , https://linear.app/changelog/2021-06-17-inbox-snooze-and-easier-issue-merge
- Command palette libraries and patterns: https://github.com/Schniz/kbar , https://www.github.com/stefanjudis/awesome-command-palette
- Superhuman Split Inbox / Inbox Zero: https://blog.superhuman.com/inbox-zero-in-7-steps/
- Things 3 design: https://blakecrosley.com/blog/design-study-things , https://www.macstories.net/?p=48965
- Empty states: https://vercel.com/geist/empty-state , https://setproduct.com/blog/empty-state-ui-design
- WCAG 1.4.1 use of colour: https://www.disabilityworld.org/toolkit/standards/wcag/1-4-1-use-of-color/
- WCAG 4.1.3 status messages / live regions: https://tabnav.com/academy/wcag/success-criterion-4.1.3 , https://universaldesign.ie/communications-digital/web-and-mobile-accessibility/web-accessibility-techniques/developers-introduction-and-index/use-aria-appropriately/use-aria-to-announce-updates-and-messaging
- Electron nativeTheme (themeSource, high contrast): https://electronjs.org/docs/api/native-theme
