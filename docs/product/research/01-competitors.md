# 01 - Competitor survey (as of 5 Nov 2026)

Method: about 20 web searches and fetches, mostly vendor pages and third-party write-ups. Claims marked (v) are vendor-reported and unverified; (?) means I could not confirm. No user-review sites (Reddit, HN threads) were reachable, so "praise/complaints" is thin and partly inferred from comparison pages, which are often written by rivals. Treat this as a map, not a verdict.

## 1. Summary table

| Product | Platform | Licence / price | Maintained? | Core idea |
|---|---|---|---|---|
| Claude Code desktop (Anthropic) | Mac, Win, Linux beta | Closed; included in plan | Yes, very active (redesign 14 Apr, update 14 Oct 2026) | Official multi-session sidebar, chat surface rather than raw terminal |
| Conductor (Melty Labs) | Mac (Apple silicon) only | Closed; app free, Cloud tier (v0.78, 30 Jul) | Yes, near-daily releases, $22m Series A | One worktree "workspace" per task, diff + PR flow |
| Superset (superset.sh) | Mac, Linux experimental; Win not yet | MIT (README); free desktop, Pro for automations/mobile/cloud | Yes, 16k stars, YC | Terminal + worktrees + review pane for 10+ CLI agents |
| Claude Squad | Anywhere tmux runs | AGPL-3.0, free | Yes (older, stable) | TUI: tmux + worktree per agent |
| Nimbalyst (ex-Crystal) | Mac/Win/Linux (?) | Free, open source (?) | Yes; Crystal deprecated Feb 2026 | Kanban of sessions + visual editors, mobile app |
| Vibe Kanban (bloop) | Local web app | Open source | Company shut down 10 Apr 2026; community maintained | Kanban issues dispatched to agents |
| opcode / Claudia | Tauri desktop | Open source | Unclear (?) | GUI: sessions, custom agents, checkpoints, usage dashboard |
| cmux (Manaflow) | Mac only (Swift, libghostty) | GPL-3.0 per README; free | Yes (star counts 4k-25k, sources disagree) | Ghostty terminal with vertical tabs + attention rings |
| crystl | Mac only | Closed; free tier, Guild $18/mo or $170/yr | Yes | "Gems/shards", approvals as cards, iPhone app |
| Sculptor (Imbue) | Desktop (?) | Closed; free in beta (?) | Unclear now | Each Claude agent in a Docker container, Pairing Mode |
| Warp (Oz + agent support) | Mac, Win, Linux | Closed; freemium | Yes | Terminal with vertical tabs, agent status icons, Claude Code notifications via plugin; Oz cloud agents |
| Muxara | Mac only (Tauri) | MIT, free | Hobby project | Always-on-top status cards over tmux sessions |
| CCManager | Any (npm CLI) | Open source | Yes | CLI picker: waiting/busy/idle, worktrees |
| Clave (codika-io) | Mac (Electron) | MIT | (?) | Unlimited Claude Code sessions, a PTY each (page returned 403, not verified) |
| ClaudeManager | Linux snap (?) | (?) | (?) | Groups + grid layout of sessions |
| AgentsRoom | Desktop (?) | (?) | (?) | Per-session token meter, native alerts, mobile companion, encrypted sync; marketing only (v) |
| Long tail | Mixed | Mostly MIT | Hobby | Clawdboard (Swift menu bar), AgentsBoard, claudectl (Rust TUI, task graphs, webhooks), agent-dashboard, Fleet (tmux), claude-code-gui (markes76), OpenGUI, cc-director |

Also relevant: VS Code "Agents window" and JetBrains Air (alpha) now do multi-agent sessions inside the IDE; Air tracks unread updates, changed files and outgoing commits per project.

## 2. Per-product notes

### Claude Code desktop (official)
Sources: https://claude.com/resources/articles/claude-code-desktop-redesign , https://macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app , https://pasqualepillitteri.it/pt/news/24049/claude-code-desktop-sessoes-aninhadas-ambientes
- 14 Apr redesign: one sidebar of active and recent sessions; filter by status/project/environment, group by project; sessions auto-archive when their PR merges or closes. Drag-and-drop panes: integrated terminal, file editor, rebuilt diff viewer, HTML/PDF/app-server preview. Verbose / Normal / Summary view modes (close to Hangar's clean view). Usage button showing context and session usage. Environments: local, cloud, SSH (now Mac too), WSL. Plugins work.
- Routines (research preview, 14 Apr): prompt + repo + connectors, run on a schedule, API call or GitHub event, on Anthropic's cloud, with daily caps per plan.
- 14 Oct update: recent folders on the new-session screen; saved environments (folders + destination + optional worktree per folder); nested sessions (parallel tasks open child sessions that return into the parent); task chips (suggested out-of-scope follow-ups start in a new worktree session in one click); /btw side questions in a separate tab (Cmd+;), not saved; sidebar shows working vs needs-input; to-do list, per-turn recap card, side rail for where it runs and what changed.
- Keyboard: session switching, spawn; Cmd+/ lists all shortcuts.
- Complaints (from a rival's page, so partial): Claude only, a chat surface not a real terminal, admins can disable local sessions, cloud sessions cannot use bypass permissions.
- Threat to Hangar: high. It now covers sidebar, status, diff, preview, recap. It does not give a calm all-at-once tile wall, time budgets, modes or an overseer.

### Conductor
Sources: https://www.conductor.build/changelog.md , https://www.morphllm.com/conductor-ai-coding , https://www.conductor.build/compare/claude-code
- Workspace = worktree + branch + terminal + diff + checks + PR page (0.73). Built-in file editor (0.37), Dispatcher to start workspaces (0.63), Cursor and OpenCode support, Cloud (0.78), a "manual mode" (0.37).
- Praise: updates almost daily, responsive developer, not vendor-locked. Cons: Mac-only, closed source, every task is a branch (git-heavy mental model).
- Uses the real Claude Code with your login, like Hangar.

### Superset
Source: https://github.com/superset-sh/superset
- Per-task worktree/branch/terminals; review pane with inline comments, edit, commit and push; in-app browser with port detection; sidebar agent status; completion chimes and dock badges; terminal presets that open a saved layout with one keystroke; command palette; every shortcut remappable; remote hosts. Automations/mobile/cloud are Pro. Worktrees "do not sandbox processes".

### Claude Squad
Source: https://github.com/smtg-ai/claude-squad
- TUI. Tab toggles preview/diff, c = commit and pause (frees the worktree), r = resume, s = push. Experimental --autoyes. Praise: simple, SSH-friendly. Cons: a wrapper, review and merge are manual; AGPL.

### Nimbalyst / Crystal
Sources: https://rywalker.com/research/nimbalyst , https://www.sitepoint.com/nimbalyst-the-visual-workspace-for-building-with-claude-code-and-codex/
- Sessions as kanban cards that move between columns by state; WYSIWYG markdown, Monaco editor, mockups, diagrams, AI commit, workstreams, mobile app. Broad, closer to an IDE than a calm monitor.

### Vibe Kanban
Source: https://vibekanban.com/blog/shutdown
- Company shut down 10 Apr 2026, hosted services removed after 30 days, code stays open and community maintained. Lesson: heavy dispatch/kanban products without a business model struggle.

### opcode / Claudia
Source: https://github.com/winfunc/opcode/wiki
- Usage dashboard (cost by model/project/date, export), session checkpoints with branching timeline, restore and diff, custom agents. Mostly built from source. Local, no telemetry (claimed).

### cmux
Source: https://github.com/manaflow-ai/cmux
- Native Swift. Vertical tabs show branch, PR status, cwd, listening ports and latest notification text. Blue ring on the pane that needs you; notification panel; Cmd+Shift+U jumps to latest unread. OSC 9/99/777 and a `cmux notify` CLI for hooks. In-app browser, SSH, scriptable socket API. Restores layout but not live Claude sessions.

### crystl
Source: https://crystl.dev/blog/desktop-app-gui-multiple-claude-code-sessions/
- Projects ("gems") with sessions ("shards"); per-project approval mode; badge per project counting pending approvals, waiting sessions and errors, aging the longer they wait; approvals as cards; agent-callable CLI (orchestration behind paid tier); iPhone companion. Attention routing is its whole pitch, the nearest philosophical rival to Hangar.

### Sculptor (Imbue)
Source: https://imbue.com/sculptor
- Docker container per agent (no permission prompts needed inside), Pairing Mode syncs agent code to your IDE both ways. Heavier, needs Docker; different value (safety, isolation).

### Warp
Sources: https://docs.warp.dev/agent-platform/capabilities/agent-notifications.md , https://docs.warp.dev/agent-platform/third-party-agents/claude-code
- Vertical tabs with status icon (working / blocked / completed / errored) and branch/PR metadata; native code review; Claude Code notifications through a plugin that needs jq. Oz = cloud agents, multi-harness. Adopting it means switching terminals.

### Small tools
- Muxara (https://dev.to/mani_kolbe_510e0016d2a32e/i-built-a-free-dashboard-for-managing-parallel-claude-code-sessions-macos-open-source-2ai8): small always-on-top window of status cards, needs-input sorted to top, last lines of output per card, per-project bootstrap commands, arrow-key switching.
- CCManager: waiting/busy/idle list in the terminal; copies session data when making a new worktree.
- claudectl, AgentsBoard, Clawdboard, Fleet, agent-dashboard: priority-sorted lists (needs input, errors, working, idle), notification hooks, webhooks, task dependency graphs (claudectl), menu-bar one-click jump (Clawdboard).
- AgentsRoom (https://agentsroom.dev): token meter per session, native alerts, mobile companion (v).

## 3. How each area is handled

| Area | Best approach seen | Who |
|---|---|---|
| Workspaces / project grouping | Group by project in sidebar; saved environment (folders + destination); per-project settings | Official app, crystl, Superset presets |
| Overview / dashboard | Priority-sorted list (needs you first); badge counts that age; menu-bar glance; kanban by state | crystl, Muxara, Clawdboard, Nimbalyst. None has a calm all-at-once wall like Hangar |
| Notifications | Sound + dock badge + ring on pane + jump to unread; phone push | Superset, cmux, Warp, official; phone: crystl, AgentsRoom, Nimbalyst, Paradev Pro |
| Session status | Working / needs input / done / error from hooks | All; hooks are the accurate way (Hangar does this) |
| Worktrees | Core to Conductor, Superset, Squad, Muxara; optional in official saved environments and task chips | Hangar has none |
| Diff review | Inline comment + edit + commit/push; rebuilt viewer; checkpoints | Superset, official, opcode. Hangar has none |
| Usage / cost | Per-session token meter, dashboard by model/project/date, plan limits | opcode, AgentsRoom, official usage button. Hangar's 5h/weekly meters are rare |
| Prompt / workflow saving | Terminal presets (layouts), custom agents, routines, bootstrap commands | Superset, opcode, official, Muxara. Hangar modes are the strongest saved-behaviour idea |
| Keyboard UX | Command palette, remappable keys, shortcut cheat sheet, jump to unread | Superset, official, cmux. Hangar has a good set but no palette or remapping |

## 4. Gaps Hangar can own

1. The calm wall of real terminals that sizes itself by need. Nobody else does status-driven tile sizing; everyone else uses sidebar lists or kanban. This is Hangar's identity.
2. Zero extra tokens with the real CLI. The official app is a chat surface; opcode and Sculptor wrap more heavily; orchestrators add prompts.
3. Modes (saved, reliable behaviours with safe exit words) plus time budgets. No competitor has either; closest are Superset presets (layouts only) and routines (scheduled, cloud, cost real tokens).
4. The overseer: "what is waiting on me?" answered cheaply (Sonnet, about 6k tokens), able to type replies. Closest is claudectl webhooks.
5. Fresh start (handover, clear, continue). Not seen anywhere; official has only /btw side chats and nested sessions.
6. Mac and Windows in one open-source app. Conductor, cmux, crystl and Muxara are Mac-only; Superset has no Windows yet.
7. Plan-limit meters always visible. Only the official app has something similar.
8. Non-git users (students, writers, mixed folders). Worktree-first tools assume a git workflow; Hangar works on any folder.

## 5. Features worth borrowing (ranked by value vs clutter)

| Rank | Feature | From | Value | Clutter | Note |
|---|---|---|---|---|---|
| 1 | Workspaces: a named set of folders reopened together with their modes, layout and pins; project grouping in the top bar or New window | Official saved environments, Superset presets | High | Low (one switcher / menu) | Headline for the next version; zero tokens |
| 2 | Command palette (Cmd+K): jump to session, set mode, usage, new session, plus a Cmd+/ shortcut cheat sheet | Superset, official | High | Very low | Hides features instead of adding buttons |
| 3 | Overview toggle: compact list/grid of all sessions with status, last line and "waiting for N min", needs-you first | crystl, Muxara, AgentsBoard | High | Low if a toggle, not a new panel | Reads existing hook data |
| 4 | Menu-bar / tray glance and jump-to-waiting | Clawdboard, cmux | Medium | None in window | Fits owner note 25 |
| 5 | Git chip on tile: branch, dirty count, ahead/behind | cmux, Warp | Medium | Low | Read-only |
| 6 | Read-only changes peek (changed files and diff of the session folder), no commit/PR flow | Superset, official | Medium | Medium | Keep it a glance |
| 7 | Optional worktree checkbox when starting a session in a git repo | Conductor, official | Medium | Low | Never the default |
| 8 | Recap card per session or on return after being away | Official | Medium | Low | Build only from the existing transcript, no new model calls |
| 9 | Usage history per project per day from local transcripts | opcode | Medium | Low (inside usage popover) | |
| 10 | Phone alert when a session needs you (opt-in) | crystl, AgentsRoom | Medium | None | Needs a relay; weigh against the local-only privacy promise |
| 11 | Remappable shortcuts | Superset | Low-medium | None | |
| 12 | Scheduled / routine runs | Official routines | Medium | High | Skip: cannot be both calm and token-free |
| 13 | Kanban, task graphs, containers, built-in browser/editor, multi-agent (Codex) | Nimbalyst, claudectl, Sculptor, Superset | Low for Hangar | High | Avoid on purpose; this is why others feel busy |

## 6. Threats and watch list
- The official app is converging on Hangar's ground (status sidebar, summary view, recap, saved environments). Hangar's moat: tile wall, modes, time budgets, overseer, Fresh start, Mac + Windows, real terminal.
- Superset (16k stars, YC, MIT) is the fast-moving open-source rival, but worktree and git centric rather than calm.
- Vibe Kanban's April shutdown shows heavy orchestration products struggle to sustain; a small free calm app is easier to keep alive.

## 7. Unverified, check next
Exact licences of Conductor Cloud, Nimbalyst and opcode; Clave, ClaudeManager and AgentsRoom details; Sculptor's current status; real user complaints (search r/ClaudeAI directly); whether Windows is planned for Conductor and Superset.
