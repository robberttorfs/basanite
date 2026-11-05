# Windows crash of 5 Nov 2026 (A1)

Symptom: the installed personal Hangar showed "Hangar.exe - Application Error: the instruction at 0x00007FFC1BE1301A referenced memory at 0x0000000000000000" at 16:57:36 while Windows was restarting. The PC had hung from about 16:52 to 16:56.

## What can and cannot be proven
There is no dump and no stack, so the faulting module is not known. Everything below is read from the code and from tests on this PC. The restart-time crash could not be reproduced here (it needs a real logoff or shutdown with live sessions).

## (a) The crash: most likely the pty teardown on quit
Old quit code (`before-quit`): save, then `p.kill()` on every pty and the overseer, then exit in the same tick. What that does on Windows with node-pty 1.1.0 (ConPTY):

1. `kill()` does `fork(conpty_console_list_agent)` per pty. `fork` runs a second copy of the app executable (`Hangar.exe`, as plain node) that calls `AttachConsole` on the shell. This repo's own run.log showed that helper throwing `AttachConsole failed` when the shell was already gone. During a Windows shutdown, many such `Hangar.exe` helpers start while the system tears consoles down. A null read inside `Hangar.exe` fits this, and it explains why the dialog says Hangar.exe even though the main window was long closed.
2. `kill()` also calls the native `ClosePseudoConsole` by hand, then disposes the conout worker. Native exit callbacks for the same pty fire from another thread into a process that is already exiting.
3. Quit and Windows shutdown both took this path. Windows sends `session-end` to the window; the old code ignored it and let the normal quit run the kills while the OS was ending the process.
4. A pty that had already exited could be killed again (double close of the same handle). The map entry was removed on exit, so the main path was safe, but the overseer and several other call sites were not guarded.

I cannot say which of 1, 2 or 4 produced this exact fault; the fix removes all three.

### Fix (src/main/lifecycle.js, small edits in src/main/main.js)
- Every pty is tracked; `killPty` kills each one at most once and never one that has exited.
- On Windows a pty is ended with `taskkill /PID <pid> /T /F` (whole tree). node-pty sees an ordinary exit, so no helper `Hangar.exe` is forked and `ClosePseudoConsole` is not called by hand. On macOS and Linux `p.kill()` is unchanged.
- Quit now waits (at most 2.5 s, plus 150 ms) until the ptys report their exit, then lets the app quit. A second quit request during the wait is ignored.
- `session-end` (Windows logoff/shutdown): only the workspace is saved and the server file removed. No pty is touched; the OS ends the processes itself. The next start restores the tiles as before.
- Measured: closing the window with 3 Claude tiles and a terminal exits in about 2.8 s (4 powershell ptys alone: 1.4 s). No `AttachConsole` error in the log afterwards.

## (b) Did Hangar contribute to the hang?
Dev app, 3 Claude sessions open on the repo (no prompts sent), the whole process tree (13 processes) sampled every 30 s for 5 minutes with PowerShell:

| time | tree CPU (s, cumulative) | main process CPU (s) |
|---|---|---|
| 0:00 | 11.5 | 1.0 |
| 2:30 | 13.7 | 1.4 |
| 5:00 | 15.3 | 1.6 |

- Tree CPU grew 3.8 s in 300 s (about 1.3 % of one core). The main process used 0.6 s (0.2 %). Memory of the tree stayed flat (about 2.15 to 2.43 GB, mostly the three `claude` processes; the Electron main process stayed at 311-313 MB).
- The only timers in the main process are `pollLoop` (1 s, reads the session files every 2nd tick) and the chat poll (400 ms, only while a clean view is open). No statusline storm, no loop.
- Conclusion: an idle Hangar does not load the PC, so it is very unlikely to have caused a 4-minute hang by itself. A hang during shutdown is more likely the Roblox Studio timeout or the `uvx.exe` that delayed shutdown (both seen in the same window), and Hangar then crashed when Windows finally tore its processes down. Not provable without a dump.
- If it happens again: enable Windows Error Reporting local dumps for Hangar.exe (`HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps`) to get a stack.
