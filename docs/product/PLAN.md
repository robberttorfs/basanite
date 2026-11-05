# Hangar 1.0: the public release plan

Status: draft for discussion, 5 Nov 2026. Nothing here is built yet. The name "Hangar" is a placeholder; the product gets its final name and a new GitHub repo after this plan is agreed.

Research behind it (in `research/`):
1. `01-competitors.md`: what the 15+ other tools do.
2. `02-user-wants.md`: what people on Reddit and GitHub keep asking for.
3. `03-skills-workflows.md`: skills, workflows and Claude Code features worth using.
4. `04-ui-research.md`: calm UI patterns, plus designs for workspaces, the overview and the palette.

Caveat: Reddit and Hacker News came through mirrors and search snippets, not full threads. The themes are solid, but the counts are rough.

## Owner decisions (5 Nov 2026)

1. **Workspaces:** pills in the top bar, hidden while there's only one workspace.
2. **Overview:** the attention list with a preview pane.
3. **Agents:** Claude Code only.
4. **Phone alerts:** later, and opt-in only (through a free relay such as ntfy).
5. **Own branch:** an optional worktree checkbox on New.
6. **Notification sound:** optional, off by default.
7. **Website:** a landing page plus a docs page. It should be decent and unique, clear and easy to download from, and still show off the app. It draws on the portfolio lessons plus extra research into product sites. The owner builds the definitive site later.
8. **Licence:** MIT, plus a README note that the name and logo aren't covered.
9. **The current hangar repo** stays private as history. The open-source version gets a new folder and a new repo.
10. **Windows palette key:** Ctrl+Shift+K. Fresh start has no shortcut.
11. **Theme:** follows the system.
12. **Density:** Comfortable and Compact.
13. **Usage history chart:** in the Usage popover.
14. **Same-file warning:** yes.
15. **Name style:** one calm real word (discussion ongoing).

---

## 1. What we are making

**A calm mission control for the Claude Code you already use.** It's free, open source (MIT), and runs on Mac and Windows.

Where it stands against the rest:
- **The official Claude Code desktop app** is converging on "parallel sessions in a sidebar". But it's its own chat surface, not your CLI, and it has no tile wall, modes, time budgets or overseer.
- **Conductor, Superset, Claude Squad and cmux** are built around worktrees and diff review. They're busier, and mostly Mac-only or terminal-only.
- **Nobody else** sizes tiles by who needs you, or has modes with safe exit words, time budgets, a token-lean overseer, Fresh start, or always-on plan meters. That's our identity. We keep it and make it deeper.

**Promises (every feature must pass all six):**
1. **Real CLI.** Every session is a real `claude` process. We never reimplement Claude Code.
2. **Zero extra tokens.** Hangar itself never spends tokens unless you ask. Anything that costs tokens shows it before you use it.
3. **Calm.** The focused tile never moves. Amber means "needs you" and nothing else. Nothing auto-closes, nothing jumps.
4. **Simple for one-project users.** If you never make a second workspace, the app looks exactly like today's.
5. **Three ways to reach anything:** a visible control, the native menu, and the command palette, all built from one command list.
6. **Private.** No telemetry, no accounts, no server. Everything stays on your machine.

---

## 2. What stays exactly as it is

Tiles sized by status, manual resize and locks, pinning, modes, clean view, terminal tiles (now with Claude inside them, done 5 Nov), the overseer, time budgets, Fresh start, usage meters, images by paste or drag, rename and colours, and the native menus.

---

## 3. The new version, by area

Sizes: S = small, M = medium, L = large. Ranking is by value for the clutter it adds.

### A. Foundations (first, because everything else stands on them)

| # | What | Why | Size |
|---|---|---|---|
| A1 | **Fix the Windows crash** (Hangar.exe null read on 5 Nov) and finish the Windows smoke test | Can't ship a public app that crashes | M |
| A2 | **One command registry** behind menus, palette, shortcuts and a `?` shortcut sheet | Labels never drift, and every later feature gets cheaper | M |
| A3 | **Light theme + System**, high contrast, a full reduced-motion pass | The app is dark only today, and reduced motion is handled in only 2 places | M |
| A4 | **Status shapes as well as colours**: ○ idle, ● working, ◆ needs you, ✓ done, ✕ error | Colour-blind safe, and faster to read | S |
| A5 | **Tile header diet**: name, dot and mode always; everything else only when active or hovered | The header can show 11 things today | S |
| A6 | **Focus return** to the exact terminal after every popover, palette and overview | The biggest "feels solid" detail | S |
| A7 | **Auto-update** from GitHub Releases (electron-updater, free) | Users stay on fixed versions without reinstalling | S |
| A8 | **CI builds** on GitHub Actions: Mac arm64 + x64, Windows x64 + ARM, tests on every push | Releases stop depending on one PC | M |

### B. Workspaces (the headline feature)

**What a workspace is:** a named set of sessions plus their layout (order, pins, sizes, modes, view). Examples: "Nichenaut", "School", "Portfolio".

- **Switching:** pills in the top bar, **only shown once there are 2 or more workspaces**. The active pill is bright and the others are muted. A hidden workspace with a session that needs you gets an amber dot on its pill. Past about 6 pills, the rest fold into a `▾` menu.
- **Keys:** Ctrl+⌘←/→ (Windows Ctrl+Alt+←/→), ⌥⌘1-9, or the palette.
- **Background sessions keep running.** Switching only changes what's drawn, and it's instant with a 100 ms fade.
- **Put away** a workspace: its sessions stop and resume later, exactly like quitting does today. **Reopen** it with one click from the pill menu or the palette. This gives you saved setups, like "open my Nichenaut workspace" bringing back 4 sessions in their modes.
- **Moving sessions:** drag a tile header onto a pill. Dropping a folder onto a pill starts a session there. New sessions land in the current workspace.
- **Cross-workspace attention:** the top bar counts every workspace, and "next that needs you" (⇧⌘U) hops workspaces when it has to.
- **Per workspace:** an optional colour (a pill underline only, never the tiles), notifications (all / needs-you only / none), and a default mode for new sessions.
- **Undo** for put-away and close, as a notice that stays until you dismiss it.

### C. Overview (see everything, triage fast)

An **attention list** that opens with ⇧⌘A, by clicking the top-bar counts, or from the palette.

```
◆ 1  ● 3  ✓ 1  ○ 2                                        Esc
NEEDS YOU                      │ api-server · Nichenaut
▸ ◆ api-server  Nichenaut  4m  │ Claude: I want to edit routes.ts …
WORKING                        │ ❯ 1. Yes  2. Yes, always  3. No
  ● web         Nichenaut 12m  │
  ● scraper     Main      41m  │              [Open ↩]  [1] [2] [3]
DONE
  ✓ site        Portfolio  2m
```

- Each row is one line: shape, name, workspace and time in state.
- The right pane previews the end of the clean view, including any pending permission menu. **Number keys answer the menu from here**, using the same safe path the overseer uses.
- ↑/↓ to move, ↩ to open the session (switching workspace if needed), H to snooze, ⌫ to mark as seen.
- **"Seen" state:** Done stays green until you look at that session, then quietly becomes Idle. The top bar stops saying "3 done" forever.
- **Snooze:** "don't glow for 30 min / until it changes", for a long session that keeps asking.

### D. Command palette and menus

- **⌘K** on Mac, **Ctrl+Shift+K** on Windows (plain Ctrl+K belongs to the shell). Fresh Start moves off ⇧⌘K and goes to the palette and the menus.
- **Contents:** sessions (jump to one), workspaces (switch, create, put away), actions on the focused session, modes, start (recent folders; ⇧↩ continues the last conversation), and app commands (overview, usage, theme, settings).
- **Empty query:** shows sessions that need you, then your 5 most recent commands. If nothing matches, the last row is **"Ask overseer: …"**.
- **Rows:** icon, label, then the shortcut keycaps. No descriptions; the keycaps teach the shortcuts.
- **Type to filter** in every menu (modes, recent folders, workspaces).
- **Native menu bar:** rebuilt from the same registry, with Workspace and View menus filled out.

### E. Tiles: more useful at a glance (all free of tokens)

| # | What | Size |
|---|---|---|
| E1 | **"Doing" line**: one short muted line with the latest step ("Editing routes.ts", "Running tests"), taken from the transcript the app already reads | S |
| E2 | **Git chip**: branch name and a dot when there are uncommitted changes. Hidden for non-git folders | S |
| E3 | **Changes peek**: read-only view of this session's changed files and diff (`git diff`), opened from the git chip | M |
| E4 | **Same-repo warning**: a quiet notice when two live sessions edit the same file. No competitor has this | M |
| E5 | **Better notifications**: named after the session, a click focuses the right tile, no ping when it's already on screen, optional sound (off by default) | S |
| E6 | Copy path / reveal in Finder or Explorer / open in editor, in the tile menu | S |
| E7 | **Density**: Comfortable (today) or Compact. Two values, no slider | S |

### F. Sessions: history and branching

| # | What | Size |
|---|---|---|
| F1 | **History**: searchable list of past conversations per folder (from the transcripts on disk), with first prompt, date and size. Open = resume in a tile | M |
| F2 | **Branch this session**: fork the conversation into a second tile (`--fork-session`). It shows a token note, since a fork re-reads the context once | S |
| F3 | **Own branch** (optional checkbox on New): start the session in a git worktree (`--worktree`), so parallel sessions don't clash | M |
| F4 | **Claude inside terminal tiles**: done 5 Nov; gets a live test in this round | done |

### G. Modes 2.0 (the core feature, deeper)

- **Two kinds only:**
  - **Modes**: one at a time, as today.
  - **Add-ons**: stackable on top of a mode, e.g. *Verify at end*, *Tidy commits*, *Quiet* (short replies).
  - The word "skill" never appears in the UI.
- **New built-in modes** (our own text, crediting the methods; the sources are MIT or Apache):
  - **Until done**: wraps Claude Code's `/goal`, with a turn cap.
  - **Test first**
  - **Debug**: reproduce, isolate, fix, prove.
  - **Spec first**
- **Real guarantees:**
  - Plan and Review modes use Claude Code's own plan permission mode.
  - Careful and Review block edits through a pre-tool hook, instead of relying on words alone.
- **Mode library**: a card grid showing 7 modes, with the rest under "More". Each card has **token cost dots (0 to 3)** and a **live token count** in the editor.
- **Sharing:** modes save as plain `.hangar-mode.json` files you can share. No marketplace.
- **Per-project default mode.**
- **One-click Review / Simplify** in the tile menu, using Claude Code's own `/code-review` and `/simplify`.
- **Token traps the docs will warn about:** agent teams (about 7x cost), `/loop` and `/goal` check-ins while a tile looks idle, and switching output style mid-session (cache miss).

### H. Usage

- **Usage history:** tokens and cost per day and per project, from the transcripts. A small chart in the Usage popover.
- **Cache-cold note:** when a session's prompt cache has expired, the tile says so quietly before you send, because the next message will cost more. Read from the statusline, no tokens.
- **Hard caps (optional, per session):** stop at a cost or turn count, using Claude Code's own `--max-budget-usd` and `--max-turns`.

### I. Public launch

- **New folder and new repo**, MIT licence, under the final name: a new, clearly titled folder in `E:\AI\Claude` (e.g. `E:\AI\Claude\<name>-open-source`). The current `E:\AI\Claude\hangar` folder and repo stay the owner's **personal-only** version. This plan and the research move into the new folder once it exists.
- **README** with a short demo GIF, install steps and a feature list. Also CONTRIBUTING, issue templates and a CHANGELOG.
- **Website:** a single calm landing page on Vercel, with download buttons for each OS, a 30 to 60 second demo video, features with screenshots, and a docs page (modes, shortcuts, privacy). Built in the same visual style as the app.
- **Signing:** Mac notarisation ($99 a year) and Windows signing, once you've checked the costs. Until then the README explains the one-time "open anyway" step, as it does now.
- **Announcement:** r/ClaudeAI, r/ClaudeCode, a Show HN, and the awesome-claude-code lists. Only once it's stable.

---

## 4. On purpose NOT doing

- **No kanban or task graphs.** They're busy, and Vibe Kanban's company shut down.
- **No built-in editor or browser.**
- **No cloud, accounts, telemetry or server tier.** That was your decision.
- **No scheduled routines.** They spend tokens while you're away.
- **No live terminal thumbnails.**
- **No animated workspace transitions.**
- **No onboarding tour or AI suggestion rows.** The first amber glow is the tutorial.
- **No Ctrl+letter shortcuts on Windows**, because they clash with shells.
- **No Codex or Gemini support yet.** That's a question for you (below).
- **No phone push.** It would need a third-party relay. Also a question (below).

---

## 5. Order of work

1. **Round 1, Foundations:** A1 to A8, plus the live test of Claude in terminal tiles. Ends with a stable 0.4 on the current repo.
2. **Round 2, Palette + workspaces:** D, B. The headline round.
3. **Round 3, Overview + tiles:** C, E1, E2, E5 to E7.
4. **Round 4, Modes 2.0:** G.
5. **Round 5, Sessions + usage:** F1 to F3, H, E3, E4.
6. **Round 6, Launch:** the full review pass (owner note "after all notes are in"), the new repo, website, demo video, 1.0 release.

Each round is one build, one review, and your fixes, as usual.

Timing: I haven't measured throughput on this app yet. After Round 1 I'll give real ranges based on how long it actually took.

---

## 6. Name

Picked after this plan, in discussion. Rules from the research:
- No "Claude" in the name (Anthropic's brand rules).
- It must be free on GitHub, as a domain, and in the stores.
- Short, calm, and not already a dev tool. "Hangar" is likely taken by other apps.

I'll bring a shortlist with availability checked once you've answered the questions.
