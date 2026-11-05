<p align="center">
  <img src="build/icon.png" width="96" alt="Hangar icon">
</p>

<h1 align="center">Hangar</h1>

<p align="center">
  A calm, fullscreen home for your Claude Code sessions.<br>
  See every project at once, know which one needs you, and keep an eye on tokens and agents.
</p>

<p align="center">
  <a href="https://github.com/robberttorfs/hangar-releases/releases/latest/download/Hangar-mac-arm64.dmg"><b>Mac (Apple silicon)</b></a> ·
  <a href="https://github.com/robberttorfs/hangar-releases/releases/latest/download/Hangar-mac-x64.dmg"><b>Mac (Intel)</b></a> ·
  <a href="https://github.com/robberttorfs/hangar-releases/releases/latest/download/Hangar-windows-x64-setup.exe"><b>Windows</b></a> ·
  <a href="https://github.com/robberttorfs/hangar-releases/releases/latest/download/Hangar-windows-arm64-setup.exe">Windows on ARM</a>
</p>

![Hangar with three sessions and the overseer](docs/screenshot.png)

## What it does

- **Real Claude Code, side by side.** Every tile is a full `claude` terminal. Nothing is reimplemented, so everything you know still works.
- **Tiles that size themselves, calmly.** A session that needs you grows and glows amber, quiet ones shrink. The tile you're working in never moves while others change. Drag the edge between tiles to set a size yourself; pin one to keep it big on the left.
- **Modes.** Put a session in Notes, Plan, Build, Overnight, Review and more with one click, or make your own. Claude gets the mode's instructions with your next message, and the tile shows which mode it's in.
- **Clean view.** Flip any session, or the overseer, to a tidy chat: your messages and Claude's replies, with commands and file edits folded into one quiet line you can open. Type in the box below and it goes into the real session. Permission prompts and menus switch back to the terminal by themselves.
- **Terminals too.** Open a plain shell next to your sessions from the same New window.
- **Know who needs you.** A coloured dot and label on every tile: *Working*, *Needs you*, *Done*, *Idle*. The top bar counts them, and a notification arrives when a session waits on you or finishes something long.
- **Agents you can see.** When Claude starts subagents, each one shows up as a chip under the tile header with its job, how long it has run and how many tokens it used.
- **Live token counters.** Context used (with a bar), output tokens including agents, estimated cost, and your plan's 5-hour and weekly usage in the top bar.
- **Time budgets.** Give a session 30 minutes and Claude plans to fit: it gets a short note at the start, a "start wrapping up" note at 80% and a "finish now" note at the end, so it lands near the time with work that holds up.
- **The overseer.** A side panel with its own small Claude that can see all your sessions. Ask "anything waiting on me?" or "tell the portfolio session to use teal" and it checks, answers, or types the reply for you.

## Install

You need [Claude Code](https://code.claude.com) installed and logged in. Check that `claude` works in a normal terminal first.

### Mac

1. Download the `.dmg` for your Mac (Apple silicon for M1 and newer, Intel otherwise).
2. Open it and drag **Hangar** into **Applications**.
3. Hangar isn't notarised by Apple yet, so the first launch needs one extra step. Open Terminal and run:
   ```sh
   xattr -cr /Applications/Hangar.app
   ```
   Then open Hangar normally. (Alternatively: right-click Hangar, choose **Open**, then **Open** again.)
4. Allow notifications when asked.

### Windows

1. Download `Hangar-windows-x64-setup.exe` (or the ARM one for Snapdragon laptops).
2. Run it. Windows SmartScreen may say it doesn't recognise the app: click **More info**, then **Run anyway**.
3. Pick a folder or keep the default, and finish the installer.

Claude Code on Windows must be runnable as `claude` from PowerShell.

## Using it

**Start a session.** Drop a project folder anywhere on the window, press <kbd>⌘N</kbd> (<kbd>Ctrl+Shift+N</kbd> on Windows), or click a recent project. Click **Continue** on a recent project to pick up its last conversation instead of starting fresh.

**Work in it.** Click a tile and type, exactly like a terminal. Drag files onto a tile to paste their paths. <kbd>Shift+Enter</kbd> adds a new line.

**Arrange.** Drag a tile by its header onto another to swap places. Drag the gap between two tiles to resize; that tile keeps its size (a lock shows on it) until you click the lock or double-click the edge. Click the pin to make a session the main one.

**Clean view.** Click the speech-bubble icon in a tile header (or <kbd>⇧⌘L</kbd>) to switch between the chat and the terminal. Enter sends, <kbd>Shift+Enter</kbd> adds a line, <kbd>Esc</kbd> stops Claude. The overseer opens in clean view. Settings can open new sessions in clean view too, and switch the polished terminal look on or off.

**Name and colour.** Double-click a name, or press <kbd>⇧⌘R</kbd>, to rename a session and give it a colour.

**Modes.** Click the mode chip on a tile (or <kbd>⇧⌘M</kbd>) and pick one. The chip is outlined until your next message carries the mode to Claude, then filled. Modes like Notes end when your whole message is one of their end words, such as "start" or "go" (never a word inside a sentence), and the tile offers Undo. Edit, hide or add modes under Settings, Edit modes. The overseer can make one for you, including from how you've been instructing an existing session.

**Usage.** Click the usage meters in the top bar (<kbd>⇧⌘Y</kbd>) for your plan limits, when they reset, and what each open session has used.

**Time budget.** Click the clock on a tile, pick 10 to 90 minutes or type your own. If Claude is already working it starts now; otherwise it starts with your next prompt. The clock turns amber at 80% and red when time is up. Nothing is ever killed; Claude is just told to wrap up.

**Overseer.** Click **Overseer** (<kbd>⇧⌘O</kbd>). Ask anything about your sessions in plain words. It only types into a session when you ask it to, and it checks the screen first so a permission menu gets a number, not a sentence. **New chat** starts it fresh.

**Closing.** Quitting Hangar stops the sessions, and they resume where they were the next time you open it.

### Shortcuts

| Action | Mac | Windows |
|---|---|---|
| New session | <kbd>⌘N</kbd> | <kbd>Ctrl+Shift+N</kbd> |
| Jump to session 1 to 9 | <kbd>⌘1</kbd> … <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> … <kbd>Ctrl+9</kbd> |
| Next session that needs you | <kbd>⇧⌘U</kbd> | <kbd>Ctrl+Shift+U</kbd> |
| Pin focused session | <kbd>⇧⌘P</kbd> | <kbd>Ctrl+Shift+P</kbd> |
| Time budget for focused session | <kbd>⌘T</kbd> | <kbd>Ctrl+Shift+T</kbd> |
| Mode for focused session | <kbd>⇧⌘M</kbd> | <kbd>Ctrl+Shift+M</kbd> |
| Rename and colour | <kbd>⇧⌘R</kbd> | <kbd>Ctrl+Shift+R</kbd> |
| Reopen closed session | <kbd>⇧⌘T</kbd> | <kbd>Ctrl+Alt+T</kbd> |
| Clean view on or off | <kbd>⇧⌘L</kbd> | <kbd>Ctrl+Shift+L</kbd> |
| Zoom focused session | <kbd>⇧⌘↩</kbd> | <kbd>Ctrl+Shift+Enter</kbd> |
| Usage | <kbd>⇧⌘Y</kbd> | <kbd>Ctrl+Shift+Y</kbd> |
| Overseer | <kbd>⇧⌘O</kbd> | <kbd>Ctrl+Shift+O</kbd> |
| Bigger / smaller text | <kbd>⌘=</kbd> / <kbd>⌘-</kbd> | <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> |
| Fullscreen | <kbd>⌃⌘F</kbd> | <kbd>F11</kbd> |
| Copy / paste in a tile | <kbd>⌘C</kbd> / <kbd>⌘V</kbd> | <kbd>Ctrl+Shift+C</kbd> / <kbd>Ctrl+Shift+V</kbd> |

The sliders icon in the top bar sets which notifications you get, the context and usage warning levels, and the overseer's model.

## Token use

Hangar is built to cost you nothing extra.

- **Sessions get no added context** unless you ask for it. Hangar listens through Claude Code hooks that reply with nothing. The exceptions are things you set yourself: a mode is sent once when it starts (and restated after a compaction), and a time budget adds a few one-line notes over the task.
- **Counters are read locally** from Claude Code's statusline and transcript files. They make no API calls.
- **The overseer is lean.** It runs Sonnet with only one tool and no MCP servers, plugins or skills, so each question starts from about 6k tokens of context instead of the usual 60k or more. It reads a one-line-per-session summary first and only opens a session's messages or screen when your question needs them. When you aren't asking it anything, it uses nothing.

## Privacy

Everything stays on your computer. Sessions are ordinary `claude` processes using your own login. Hangar talks to them over `127.0.0.1` with a random key per launch. It doesn't change your global Claude Code settings: each session gets its hooks through a separate settings file.

## Troubleshooting

- **"claude was not found".** Hangar starts `claude` through your login shell (PowerShell on Windows), so it sees the same PATH as your terminal. Make sure `claude --version` works there, then press **Restart** on the tile.
- **A tile says *Needs you* but nothing seems to be asked.** Claude Code is showing a menu or tip at the bottom of that terminal. Answer it or press <kbd>Esc</kbd>.
- **No 5-hour or weekly gauge.** Those numbers only exist for claude.ai Pro, Max and Ultra plans, and appear after the first reply.
- **Mac says the app is damaged.** Run the `xattr -cr` command from the install steps.

## Uninstall

- **Mac:** delete Hangar from Applications, and optionally `~/Library/Application Support/Hangar`.
- **Windows:** uninstall from Settings → Apps, and optionally delete `%APPDATA%\Hangar`.

Your Claude Code sessions and history are untouched; they live in Claude Code's own folder as always.

## Development

```sh
npm install          # also restores node-pty's spawn-helper permissions
npm start            # run from source
npm test             # unit tests: timer, transcript reader, layout, status logic
npm run dist:mac     # build .dmg files into dist/
```

Windows installers are built by GitHub Actions (`.github/workflows/build.yml`) on a Windows runner, which also runs the tests and a terminal smoke test there. Push a tag like `v0.1.1` to build both platforms, then publish the files from the run's artifacts to the public `hangar-releases` repo.

### How it fits together

- `src/main/main.js` runs the window, one `node-pty` terminal per tile, notifications and the overseer.
- Each session is launched as `claude --session-id <id> --settings <tile settings>`. That settings file adds **HTTP hooks** pointing at a local server (`src/main/server.js`) and a statusline command. Nothing goes into the user's global settings.
- `src/main/session.js` turns hook events into a status and reads tokens from the statusline and the transcript (`src/main/transcript.js`). Subagents come from the session's `subagents/` folder.
- `src/main/timer.js` decides when a timed session gets a note. `src/main/modes.js` holds the built-in modes, your edits (in `modes.json`) and the exit-word rule. A SessionStart command hook (`hangarctl hook`) restates a mode after a compaction.
- `src/cli/hangarctl.js` runs on Electron's bundled Node. Claude Code calls it for the statusline, and the overseer calls it to `list`, read the `log` or `screen` of a session, `send` text, and list, set or save `modes`.
- `src/renderer/` is plain HTML, CSS and JS with xterm.js. `layout.js` places the tiles.

Set `HANGAR_DEV=1` to enable the local screenshot and scripting endpoints used for testing, and `HANGAR_DATA_DIR` to keep test data apart from real data.
