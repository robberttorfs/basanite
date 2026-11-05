# Build rules for every helper

You are one of a few helpers building the open-source version of Hangar (placeholder name "Hangar OSS", in `src/shared/brand.js`). The plan is `docs/product/PLAN.md`; read only the section your brief names. These rules keep everyone's work consistent. Follow them exactly.

## The six promises (every change must pass all of them)
1. **Real CLI.** Every session is a real `claude` process. Never reimplement Claude Code.
2. **Zero extra tokens.** Hangar never spends tokens unless the user asks. Anything that costs tokens says so before use.
3. **Calm.** The focused tile never moves or resizes. Amber means "needs you" and nothing else. Nothing auto-closes (no timers on notices, no auto-dismiss), nothing jumps.
4. **Simple for one-project users.** With one workspace, the app looks exactly like today's.
5. **Three ways to reach anything:** a visible control, the native menu, the command palette, all from one command registry (`src/renderer/commands.js`, once it exists).
6. **Private.** No telemetry, accounts or server.

## UI rules (owner's taste, non-negotiable)
- Minimal and calm. Show a control only when it matters (on hover or state).
- **Icons over text.** No "A · B · C" dot-chained labels. Little text.
- **No explainer or helper copy:** no "Tip:", no subtitles under titles, no instructive sentences. Tooltips carry a name and a shortcut only.
- Motion: an instant switch plus a short fade (≤120 ms). No sliding, zooming or spring layouts. Respect reduced motion. Never ship something glitchy.
- Match the existing look exactly: reuse the CSS variables in `src/renderer/style.css` and the existing icon set (`ICON` in `app.js`). Never invent a new visual style.
- Colour is never the only signal (shape or word too). Keep good contrast. Every control gets an accessible name.
- Windows shortcuts: never plain Ctrl+letter (it clashes with shells). Use Ctrl+Shift or Ctrl+Alt.
- Desktop app, Mac and Windows: test on Windows here, and keep Mac code paths correct (`isMac` checks, ⌘ vs Ctrl labels via the existing helpers).

## Code rules
- Plain JS, no new frameworks, no new dependencies unless your brief allows one.
- Put new features in **new modules** where you can (`src/renderer/<feature>.js`, `src/main/<feature>.js`). Keep edits to shared files (`app.js`, `main.js`, `style.css`, `index.html`, `preload.js`) small and in your own region, because other helpers edit them at the same time. Re-read the exact lines just before editing; never rewrite whole shared files.
- Add a unit test in `test/` for logic you add (`npm test` must stay green).
- `node --check` every JS file you touch.

## Testing (quiet, cheap)
- Use `bash tools/dev.sh` (read its header). Always use your **own NAME** (your helper name) so instances don't collide. It runs off screen, muted and unfocused, with notifications logged instead of shown. Never launch the app any other way, and never pop windows on the owner's screen.
- Screenshots go to `.devdata/<your-name>/shots/`. Look at them with the Read tool. One shot per screen state you changed, not a matrix.
- **Never send prompts to Claude sessions** unless a check truly needs one; then send a few words only (the dev harness uses Haiku). Opening sessions is fine.
- The owner is using this PC: at most one dev instance of yours at a time, and stop it when done (`dev.sh stop NAME`).

## Progress and finishing
- After each meaningful step, append one line to `docs/build/log/<your-name>.md` (time, what changed). The lead watches this file.
- **Time budget:** your brief gives one. Past it, finish the current change, write what's left under "Left over" in your log, and report.
- **Commit** your own files when a part works: `git add <your files>` (never `git add -A`; other helpers have uncommitted work), then a clear message ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014TU9Sq62YeEbfgKSSF34xB
  ```
  Don't push; the lead pushes.
- Before your final report, stop every process you started (dev instances, watchers).
- Final report: under 15 lines covering what's built, how you checked it, what's rough, and any decision the owner must make.
