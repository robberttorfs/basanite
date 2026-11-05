# Code review: seams after the five-helper build (977f1e1..a2557a7)

Reviewer: code. Baseline: `npm test` 88/88 green; `node --check` clean on every tracked JS file in src, test, scripts, build.
Live checks ran in `tools/dev.sh` NAME=code (no prompts sent; stopped at the end).
How each item was confirmed: **read** (code reading), **test** (node probe), **live** (dev instance).

## P1: bugs

1. **A second launch takes over the running app's server file.** `src/main/main.js:29`
   `if (!app.requestSingleInstanceLock()) { app.quit(); }` does not stop the module. `whenReady` still runs in the second process, which calls `startServer` and overwrites `server.json` with its own port, token and pid, then dies. After that, `hangarctl` (so the overseer) and `dev.sh stop` point at a dead server for the rest of the first instance's life. Double-clicking the icon while Hangar is open is enough. The quit path can also `unlinkSync(serverFile)`, and an empty-session `saveWorkspace()` could wipe the file.
   Fix: `if (!app.requestSingleInstanceLock()) { app.exit(0); return; }` at module level (top-level `return` is legal in CJS), or guard every `app.on`/`whenReady` with a `primary` flag.
   Confirmed **live**: I launched a second electron on `.devdata/code`. `server.json` changed from pid 41808/port 63089 to pid 35808/port 58153, and that process was gone seconds later. The bug came over from 0.3.2, but it is still a real one.

2. **⌘↩ / Ctrl+Enter on "Until done" in the palette clears every session's mode.** `src/renderer/modes-ui.js:409`
   `secondary: () => { for (const t of state.tiles) ... pick(t.id, m.goal ? null : m.id); }`: for the goal mode, `pick(id, null)` calls `hangar.setMode(id, null)` on every Claude tile. Each tile gets an end-of-mode context, and through `tile:mode` the folder defaults get wiped (`modes-ipc.js:43`).
   Fix: for `m.goal`, skip the row's secondary (`secondary: m.goal ? undefined : ...`) or open the goal form for the focused tile only.
   Confirmed **read**.

## P2: risks, fragile spots

3. **Until done becomes sticky as the folder default.** `src/main/modes-ipc.js:52` (`tile:goal`) and `:43` (`tile:mode`). After one goal run, every new session in that folder starts in Until done with no `/goal` set. Its fallback text then makes Claude "treat the next message as the goal and keep working" (`modes.js:95`). That means long autonomous runs the user did not ask for in that session (token promise). Fix: never store `goal` modes (and maybe guard modes) as a project default in `setProjectDefault`. **read**

4. **`/goal` is not cleared when Until done ends any way other than the tile mode menu.** `leaveGoal` lives only in the `tile:mode` IPC (`modes-ipc.js:33-36`). The exit-phrase end (`session.js:143`), `hangarctl mode` (`main.js:1114`), `modes:delete` (`main.js:888`) and a restart all leave Claude Code's `/goal` running, and `goalSet` is not persisted. Its idle check-ins can then start turns in a tile that shows no mode (token promise). Fix: move `leaveGoal` into `Session.setMode` (main side, with `typeInto` injected) and persist `goalSet` in `persisted()`. **read**

5. **Startup and quit race can wipe open workspaces' sessions.** `main.js:1163-1167` and `main.js:1187`. Open workspaces keep their saved tiles in `w.tiles` only until `did-finish-load`. `toJSON` writes open workspaces from `tilesByWs` (`workspaces.js:180`), so any `saveWorkspace()` before then writes `tiles: []`, for example a quit during load, or a `ws:*`/settings IPC during load. Fix: in `toJSON`, fall back to `w.tiles` for open workspaces until a `restored` flag is set, or restore sessions before the first possible save. **read**

6. **Fork carries the mode but not add-ons, and the mode is re-sent.** `data-ipc.js:52` passes `mode: s.mode` without `modeApplied`, `addons` or `addonsApplied`. The forked conversation already has the mode and add-on text in its history. The new tile restates the mode on the first prompt (extra tokens), and it cannot turn off add-ons it does not know it has. Fix: pass `modeApplied: s.modeApplied, addons: s.addons, addonsApplied: s.addonsApplied`. **read**

7. **Fork is offered for sessions with no conversation.** `extras.js` `canFork` (and `data-ipc.js:51`) needs only `sessionId`, which `launch()` sets for every new tile before any prompt (`main.js:168`). `claude --resume <id> --fork-session` then fails and the tile exits. Fix: require `snap.lastResponseAt` or a transcript (`s.transcriptPath`). **read**

8. **History "open" can resume a conversation that is already running in another tile.** `data-ipc.js:44-48`. Two `claude --resume` processes then write the same transcript. Fix: if a session with that `sessionId` exists, focus it and return its id. **read**

9. **`git status` in the background takes the index lock.** `git.js:79` and `:109`. A routine refresh after every edit and Stop can collide with Claude's own `git add`/`commit` ("index.lock exists"). Fix: add `--no-optional-locks` (or env `GIT_OPTIONAL_LOCKS=0`) to every read-only call in `run()`. **read**

10. **Guard false positives on harmless read commands.** `guards.js:16-36`, probed with node. In readonly modes (Review, Plan) these are blocked: `git stash list`, `git tag -l`, `grep -rn "<div>" src`, `awk '$1 > 5' f`, `node -e "console.log(a>b)"`, `python -c "print(len(x)>2)"`, and `grep -rn "git push" docs` (the RISKY list is applied in readonly too). In Careful mode, `rg "delete from" -i src` and `ls --force` are blocked. Each denial sends a reason back to Claude, so a few tokens per retry. Fix: limit the redirect regex to outside quotes (strip quoted strings before testing), allow `git stash list|show`, `git tag` with no args or `-l`, and test RISKY patterns on the command with quoted strings removed. Writes through `python -c`/`node -e` are not caught at all. That is fine ("clearly write"), but worth a line in the docs. **test**

11. **Windows notifications: AUMID does not match the installer's appId.** `main.js:26-28` sets `app.setName('Hangar')` and `setAppUserModelId('com.robberttorfs.hangar')`, while `package.json` `build.appId` is `com.robberttorfs.hangar-oss` (NSIS stamps that on the Start-menu shortcut). Toasts can show under the wrong name or be dropped, and they share a group with the closed-source Hangar. Fix: take both from `brand.js` (name, plus a new `appId`) and use `app.setAppUserModelId(brand.appId)`. **read**

12. **macOS auto-update has no feed.** `package.json` mac target is `dmg` only. electron-builder writes `latest-mac.yml` and the updater zip only with a `zip` target, so the release workflow's `dist/latest-mac.yml` will not exist. `if-no-files-found: error` won't catch it because the dmg matches. Fix: add `{ target: 'zip', arch: [...] }` to `build.mac.target`. Also check that a single NSIS run with `x64` and `arm64` gives the two `Hangar-windows-${arch}-setup.exe` names the workflow expects (with both archs in one run it builds one combined installer). Confirmed by **read**; verify on the first tagged CI run.

13. **Restart-to-update vs the busy-quit dialog.** `updater.js:71` and `main.js:1174-1196`. `quitAndInstall` starts the NSIS installer and then quits. If the user picks Cancel at "N sessions still working", the installer runs against a live app. Fix: in `act()`, check busy sessions first (ask before calling `quitAndInstall`), or set `autoInstallOnAppQuit = true` and just `app.quit()`. **read**

14. **Usage scan reads whole new file tails into one buffer.** `usage.js:118-121`. `Buffer.alloc(st.size - rec.offset)` on the first scan of a multi-hundred-MB transcript (image-heavy sessions) is a big spike. Past V8's ~512 MB string limit, `toString` throws, which rejects `history()`, and the chart silently stays empty. Also, subagent transcripts (`projects/<slug>/<session>/subagents/*.jsonl`) are not scanned, so usage under-counts Crew-style sessions. Fix: read in 1-4 MB chunks with a line carry, as `history.js` does, and recurse one level into `<session>/subagents`. **read**

15. **Editor lookup is fragile.** `shellops.js:12-34`. On macOS, when the app is started from Finder, `which code` runs without the login-shell PATH, so the editor is never found. A `VISUAL`/`EDITOR` path with spaces (`C:\Program Files\...`) is split on whitespace, so the spawn fails. The lead's order (VISUAL, then code/cursor/zed, then EDITOR, because the owner has EDITOR=notepad) is not done. Fix: check the known app paths and `code`/`cursor`/`zed` before EDITOR, parse quoted paths, and on mac use `open -a`. **read**

16. **put away / close workspace skip `data.forget`.** `main.js:773-786` (`stopSessions`) does not call `data?.forget(s.id)` (closeSession does at `:352`). Overlap records stay for those ids. When the workspace reopens with the same tile ids, stale overlap events can fire against old edits. Fix: call `data?.forget(s.id)` in `stopSessions`. **read**

## P3: cleanup

17. Dead: the `'modes'` provider in `src/renderer/app-commands.js:92-103` is replaced by `modes-ui.js:403`, because `provide()` is keyed by name and modes-ui loads later. Delete it, and drop `openModes`/`visibleModes` from that file's globals if they become unused there. **read**
18. Dead: `onFocusIndex` (`preload.js:93`, `app.js:1275`). Main no longer sends `tile:focus-index`, because the Session 1-9 menu items now come from the registry. **read**
19. `session.js` emits `onChange({ type: 'guard' })` on a deny, and nothing listens (main only re-broadcasts). Either show a quiet tile notice ("Edit blocked by Review") or drop the event. **read**
20. `main.js` `notified` Map gains a `done:<id>:<turnStartedAt>` key every long turn and never prunes, and `dialogShown` (`app.js:1332`) keeps closed tile ids. Prune entries older than a day, and delete on tile dispose. **read**
21. `freshStart` 20-minute timeout (`main.js:304`) is never cleared; harmless but leaks a closure per use. **read**
22. `history.js:53` and `usage.js:121` decode chunk by chunk with `buf.toString`. A multibyte UTF-8 character on a chunk edge becomes U+FFFD, and in usage that also shifts the byte offset (`Buffer.byteLength` of the decoded text). Use `StringDecoder` or track offsets in bytes. **read**
23. `history.js` `slugFor` does not match Claude Code's hashed slug for very long paths, so History is empty for those folders (`transcriptExists` has a scan fallback, history doesn't). **read**
24. `git.js:33` porcelain v1 quotes paths with spaces or special characters (`"a b.txt"`), so the changes peek can't match them to diff sections. Use `--porcelain=v1 -z`. **read**
25. `git.js:97` creates worktrees in `<parent of repo>/.worktrees/`, outside the project folder. The owner's own rule is "side folders inside the project". Consider `<root>/.worktrees` plus a `.git/info/exclude` entry. **read**
26. Native menu on Windows: `role: 'minimize'` registers Ctrl+M (= Enter in terminals). Ctrl+Alt+Left/Right (workspace keys) is the Intel graphics screen-rotate hotkey on many PCs. Window > Session 1-9 use plain Ctrl+digit. Consider `registerAccelerator: false` on minimize. **live** (menu dump)
27. Workspace accelerators are written as `Control+...` while the rest use `CmdOrCtrl`. They are correct on both platforms (mac has its own strings), so this is only inconsistent. **live**
28. Mac app menu label is hard-coded `'Hangar'` (`main.js:706`) and `package.json` `repository` still points at `robberttorfs/hangar`. Take both from `brand.js` before release. **read**
29. `HANGAR_DETACH_URL` (token in the URL) is visible to every program run in a terminal tile. Same user, so not a boundary, but a POST-only `/detach` that takes the tile id in the body with a per-tile secret would be tidier. **read**

## Checked and fine
- Every `ipcRenderer` channel in `preload.js` has a main handler, and every main `send` has a preload listener. Exceptions: item 18, plus `look`/`onLook`, which are used. No channel is registered twice.
- 82 registry commands: no duplicate ids, no duplicate shortcuts (**live**).
- The hook adds no output when no guard, mode, add-on or timer applies (`session.js` returns `null`, and the server sends an empty 200). The PreToolUse matcher now includes Bash/Edit, and the reply for those is empty.
- Every new HTTP endpoint goes through the single token check (`server.js:33`). `shot/key/menu/js/open` are gated by `HANGAR_DEV`, and so is the statusline sample write.
- Workspace put away and reopen worked **live** (session stopped, saved in `workspace.json`, resumed on reopen. With no prompt sent it starts as new, as designed). Old `{tiles, recent}` files migrate to "Main" (unit-tested).
- Shell wrappers are unchanged since 977f1e1. `.gitattributes` forces LF for `src/shell/**`, and no CR was found. `asarUnpack` covers `src/cli`, `src/shell`, `src/shared`. The updater is off until `brand.releases` is filled.
