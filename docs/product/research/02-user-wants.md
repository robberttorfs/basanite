# 02 - What users want from a multi-session Claude Code tool

Research date: 5 Nov 2026. Method: about 14 WebSearch queries plus one WebFetch. Search could not open Reddit or Hacker News directly. Reddit evidence comes through mirror/snapshot sites, GitHub issues through the claudeissues.com mirror (open/closed status may be stale), and the rest from DEV.to and vendor/competitor blogs. No Show HN thread was found. Counts below are "distinct sources seen in this research", not statistics. Treat them as a rough ranking, not a survey. Quotes are short fragments as returned by the search tool; verify before publishing anywhere.

Coverage key: YES = Hangar does it, PART = partly, NO = not at all (checked against README and OWNER-NOTES).

---

## Theme 1: Knowing who needs me (the biggest theme)

| Pain / wish | Seen | Hangar |
|---|---|---|
| Losing track of which session is doing what, missing when one finishes or waits | ~8 | YES (status dot, top bar counts, amber growth, next-needs-you shortcut) |
| Wrong-pane typing in tmux; no signal when a session ends | ~3 | YES |
| Notifications that say WHICH session (Windows toast shows "Windows PowerShell", not the session) | ~3 | PART (notifications exist; unknown if the toast names the session and focuses it on click, test this) |
| Clicking a notification focuses the wrong or an unrelated session (one Windows bug closes a parallel session) | ~2 | PART (verify click-to-focus the right tile on both OSes) |
| Do not notify when that session is already visible on screen | ~1 | PART (verify; "selected tile" suppression may exist) |
| Sound/audio alerts | ~2 | NO |
| Status that shows what the agent is doing / why it is stuck, not just a chip | ~2 | PART (clean view, agent chips; no one-line "current activity" summary) |

Quotes:
- "around conversation #4 they start forgetting which one is doing what" (Reddit mirror, [snapshot](https://reddit.sentinel-team.org/posts/1rjtztu/snapshots/2026-03-04T15%3A12%3A56.583662Z)).
- Windows toast shows the active window title instead of the finished session: [claude-code #41382](https://claudeissues.com/issue/41382-windows-notification-shows-active-window-title-instead-of-the-claude-code-sessio). Related: [clicking a notification closes an unrelated session](https://claudeissues.com/issue/67501-bug-clicking-a-windows-notification-closes-an-unrelated-parallel-session), [notification palette for multi-tab attention](https://claudeissues.com/issue/38143-notification-palette-for-multi-tab-attention-management), [no notifications when session already visible](https://claudeissues.com/issue/53194-feature-dont-trigger-system-notifications-when-the-claude-code-session-is-alread).
- Competitor evidence this is THE problem: [The Tab-Hunting Problem](https://crystl-web.pages.dev/blog/tab-hunting-approval), [macOS notch control center](https://dev.to/krisying/i-turned-my-macbooks-notch-into-a-control-center-for-ai-coding-agents-2o57), [iTerm2 tab status plugin](https://dev.to/jaspersui/i-kept-losing-track-of-my-claude-code-tabs-so-i-fixed-it-3mc7), [claude-code-manager](https://github.com/Daan-/claude-code-manager), AgentManager (Product Hunt), crowsnest (PyPI).

## Theme 2: Phone, remote, away from desk

| Pain / wish | Seen | Hangar |
|---|---|---|
| Get a push to the phone when a session finishes or needs approval | ~6 | NO |
| Approve permission prompts from the phone | ~5 | NO |
| Anthropic Remote Control needs a watched browser tab, no push model | ~2 | NO |
| Persistent remote/SSH sessions that survive disconnect (tmux) | ~4 | NO |
| See active CLI sessions in the Claude mobile/web app | ~1 | NO |

Quotes:
- claude-remote-approver author: Remote Control is web-based, "you have to keep a browser tab open", no push model, which is the gap they fill ([repo](https://github.com/yuuichieguchi/claude-remote-approver), [DEV post](https://dev.to/yuu1ch13/approve-claude-code-permission-requests-from-your-phone-47nd)).
- [Surface active CLI sessions in the mobile/web app, #33095](https://claudeissues.com/issue/33095-surface-active-claude-code-cli-sessions-in-the-claude-mobile-web-app); [native remote session management via tmux, #13613](https://claudeissues.com/issue/13613-feature-request-native-remote-session-management-persistent-ssh-connections-via).
- Other phone tools: claude-notify (Stop hook to phone), PUNK iOS (Live Activities), Claude Code Notifier Companion (App Store).

## Theme 3: Context, compaction, handover

| Pain / wish | Seen | Hangar |
|---|---|---|
| "Amnesia" after compaction; the reasoning is lost, not the code | ~5 | PART (mode restated after compaction; Fresh start handover is in owner notes #23, check it shipped) |
| Handover note then clear and continue automatically | ~4 | PART (owner note #23) |
| Usage burns fast past ~200k context; want warning before it | ~4 | YES (context bar, warning levels) |
| Workaround: state in CLAUDE.md / PLAN.md files, status note as last message | ~4 | NO (no helper that writes or keeps these) |
| Transcript/reasoning trapped in one session; copy-paste between sessions | ~2 | NO |

Quotes: "Claude doesn't forget the code. It forgets the reasoning behind decisions" (Reddit mirror, [snapshot](https://reddit.sentinel-team.org/posts/1tglril/snapshots/2026-05-23T02%3A20%3A04.239191Z)). Top advice: stop treating the context window as memory, use files ([snapshot](https://reddit.sentinel-team.org/posts/1rrkv0h/snapshots/2026-03-14T00%3A11%3A38.395735Z)). "Every transcript is trapped inside the session that produced it" ([Nimbalyst](https://nimbalyst-website.pages.dev/blog/parallel-claude-code-agents-what-breaks-after-worktrees/)).

## Theme 4: Usage limits and cost

| Pain / wish | Seen | Hangar |
|---|---|---|
| See plan 5-hour and weekly limits, reset time | ~7 | YES (top bar + usage panel) |
| Warnings before hitting the limit; "limits dropped without notice" | ~3 | YES (warning levels) |
| Parallel sessions drain the shared quota faster; which session spent what | ~4 | YES (per-session usage) |
| Usage history over days (10-day view) | ~2 | NO (no history) |
| Subagent / hidden agent cost visibility | ~3 | YES (agent chips with tokens) |
| Statusline usage data failing with many concurrent sessions (shared OAuth rate limit) | ~1 | PART (Hangar reads locally; may share the issue, test with 5+ sessions) |

Quotes: [Add transparent session limit tracking and advance warnings, #38826](https://claudeissues.com/issue/38826-feature-request-add-transparent-session-limit-tracking-and-advance-warnings-befo); [usage transparency and historical tracking, #47287](https://claudeissues.com/issue/47287-feature-request-add-usage-transparency-and-historical-usage-tracking-in-claude-c); [statusline unavailable with multiple concurrent sessions, #31319](https://claudeissues.com/issue/31319-statusline-usage-data-unavailable-with-multiple-concurrent-sessions-oauth-rate-l); [built-in usage command, #6958](https://claudeissues.com/issue/6958-feature-request-built-in-usage-monitoring-command). Usage is account-level, not per-device, so only a tool seeing all sessions can answer "who used it".

## Theme 5: Resuming, history, naming

| Pain / wish | Seen | Hangar |
|---|---|---|
| /resume list unusable past a handful of sessions (shows first message, not what happened) | ~5 | PART (Continue on recent project; no searchable history) |
| Rename sessions, find by name | ~6 (many GitHub issues) | YES (rename + colour) |
| Search across all past sessions / hundreds under ~/.claude | ~3 | NO |
| One-line recap of what a session did / is for | ~3 | NO |
| Restore the whole workspace after restart | ~2 | YES (sessions resume on reopen) |

Quotes: "The /resume UX is basically unusable once you have more than a handful of sessions" (Reddit mirror post id 1smi2km on reddit.sentinel-team.org, Apr 2026; exact snapshot URL not kept, via the search summary); rename requests [#6006](https://github.com/anthropics/claude-code/issues/6006), [#38173](https://claudeissues.com/issue/38173-feature-request-add-session-rename-capability-rename-command), [#26249](https://github.com/anthropics/claude-code/issues/26249) (rename but cannot resume by name); cc9s TUI built because of "hundreds of sessions" under ~/.claude.

## Theme 6: Organising projects and workspaces

| Pain / wish | Seen | Hangar |
|---|---|---|
| Colour-code and name tabs by project | ~4 | YES |
| Group sessions by project / workspace, many tiles at once | ~4 | PART (no groups or workspaces; flat tiles, 9 shortcuts) |
| Multiple windows (desktop app) | ~2 (long thread) | NO |
| Link a session to the work (branch, ticket, PR) it belongs to | ~3 | NO |
| One orchestrator session that supervises workers | ~4 | YES (overseer) |

Quotes: iTerm2 users colour/name tabs by subdirectory (Reddit mirror); [multi-window request #30154](https://github.com/anthropics/claude-code/issues/30154); "What still isn't there is the connective tissue between sessions and the work they're attached to" ([Nimbalyst](https://nimbalyst-website.pages.dev/blog/parallel-claude-code-agents-what-breaks-after-worktrees/)).

## Theme 7: Reviewing changes (verification bottleneck)

| Pain / wish | Seen | Hangar |
|---|---|---|
| Verification is now the bottleneck ("running 10-15 agents") | ~4 | NO |
| Per-session diff view of what changed | ~5 (Conductor, Claude Squad, Crystal all lead with it) | NO |
| Cross-session / cross-diff review of coupled changes | ~2 | NO |
| Open PR / merge from the tool | ~3 | NO |

Quote: "The real gap isn't per-diff UI, it's cross-diff review" ([Nimbalyst](https://nimbalyst-website.pages.dev/blog/parallel-claude-code-agents-what-breaks-after-worktrees/)). Conductor's flow: inspect diff, open PR, merge, archive ([conductor.build](https://www.conductor.build/workflows)).

## Theme 8: Worktrees and conflicts

| Pain / wish | Seen | Hangar |
|---|---|---|
| Worktrees are a pain to manage by hand | ~4 | NO |
| Setup per worktree (node_modules, .env, venv not copied) | ~2 | NO |
| Warn when two live sessions edit the same file / same repo | ~2 (nobody ships it) | NO |
| Semantic conflicts that merge cleanly but contradict | ~1 | NO |
| Worktrees still share the machine (runaway installs, ports) | ~1 | NO |

Quotes: "worktrees are a pain in the ass to manage directly in Claude" (Reddit mirror, via search summary); native `claude --worktree` shipped Feb 2026 ([morphllm](https://www.morphllm.com/claude-code-worktrees)). Note: no tool found warns on overlapping edits across live sessions: an open gap.

## Theme 9: Prompts, modes, workflows

| Pain / wish | Seen | Hangar |
|---|---|---|
| Reusable prompts / roles / workflows per session | ~4 | YES (modes, a headline feature) |
| Spawn a parallel session with duplicated context (/branch) | ~2 | NO |
| Cross-session messaging | ~2 (Anthropic added it Aug 2026) | YES (overseer types into sessions) |
| Unsupervised / overnight runs with time limits | ~3 | YES (Overnight, time budgets) |

Quote: [/branch: spawn parallel session with duplicated context, #14875](https://claudeissues.com/issue/14875-feature-branch-command-spawn-parallel-terminal-session-with-duplicated-context); [AlternativeTo: cross-session messaging](https://alternativeto.net/news/2026/8/claude-code-adds-cross-session-messaging-for-better-workflow/).

## Theme 10: Windows-specific

| Pain / wish | Seen | Hangar |
|---|---|---|
| Native Windows toast channel (only bell/mac/Linux channels exist) | ~2 | YES (desktop notifications on Windows) |
| Toast names the right session, click focuses it | ~3 | PART (verify) |
| Windows is second class in competing tools (Conductor is Mac only; most are Mac/tmux) | ~3 | YES (Windows installer, ARM too) |
| Works in PowerShell / Git Bash / WSL | ~2 | PART (launches via PowerShell; WSL and Git Bash sessions not offered) |

Quote: [native Windows toast notifications, #67220](https://claudeissues.com/issue/67220-feature-native-windows-toast-notifications-a-windows-toast-channel-for-preferred). Windows+Mac in one free app is itself a differentiator: Conductor is Mac only, Claude Squad is terminal/tmux.

## Theme 11: Token waste and tool weight

| Pain / wish | Seen | Hangar |
|---|---|---|
| Parallel agents multiply spend (up to ~7x for agent teams per docs-citing article) | ~5 | YES (counters, nothing added) |
| Sub-agent duplicate work (one dev reported 84 sub-agents) | ~3 | PART (visible, not flagged) |
| Tool must not add tokens | ~2 | YES (README guarantee) |

Sources: [143$ hidden agent costs](https://dev.to/openclawlabs/i-analyzed-my-claude-code-sessions-and-found-143-in-hidden-agent-costs-heres-the-breakdown-3d97), [subagents waste 50k tokens per turn](https://dev.to/jungjaehoon/why-claude-code-subagents-waste-50k-tokens-per-turn-and-how-to-fix-it-41ma/comments).

---

## Top 15 wants Hangar doesn't serve yet (ranked)

1. **Phone push + approve/answer from the phone.** Most repeated unserved want (~6-8 sources); Remote Control is pull-only. Even a plain ntfy/push of "needs you / done" would cover most of it.
2. **Per-session diff view** ("what did this session change?") with one-click open of the project/PR. Every competitor leads with it; verification is the stated bottleneck.
3. **Searchable session history and a real resume picker** across all projects, with one-line recaps instead of first messages.
4. **Notification polish:** says which session, click focuses the right tile, no ping when it is already visible, optional sound. (Mostly verification of what exists, cheap.)
5. **Auto one-line "what is this session doing / for"** on each tile (current activity plus goal), so a glance replaces opening it.
6. **Groups / workspaces:** group tiles by project or task, switch sets, restore a set on launch.
7. **Worktree helper:** one click "run in a new worktree" with env/node_modules setup, and cleanup. Currently painful by hand.
8. **Overlap warning:** alert when two live sessions touch the same repo or file. Nobody ships this; clear gap.
9. **Usage history** (days, per project, per session), plus a "which session burned my quota" view.
10. **Handover/Fresh start that is robust** and keeps decisions/reasoning (owner note #23), possibly writing PLAN.md-style state files.
11. **Persistent remote/SSH sessions** (tmux-backed), survive disconnects.
12. **Branch/fork a session** with duplicated context into a new tile (/branch).
13. **Link sessions to work** (branch, PR, ticket) shown on the tile.
14. **Cross-session context handoff:** send a summary of session A into session B in one click (overseer partly does it by typing).
15. **Optional WSL / Git Bash shells** and multi-window (spread tiles over monitors).

## Things people say they DON'T want

Evidence here is thinner (few direct complaints found; much is inferred from what competitors are praised or criticised for). Treat as hypotheses.

- **Reimplemented UI that breaks CLI behaviour.** Showcase threads draw the skeptical "why not just use the desktop app / terminal?" and one commenter says the friction "isn't really the typing, it's the lack of durable session history". Hangar's "real claude underneath" is the right bet; keep it.
- **Lock-in to one agent or one worktree model.** Comparisons stress Claude Code and Codex transcripts being unreadable across tools; Conductor/Crystal criticised as local-only. Keep sessions as ordinary `claude` processes and history in Claude's own folder.
- **Mac-only, paid, or cloud-hosted.** Conductor is Mac-first; people seek free, local tools. Hangar's free/open/Windows stance matches.
- **Token waste and hidden cost.** 10 parallel agents drain quota fast; multiple sources complain about invisible sub-agent spend. Anything that injects context by default will be resented (Hangar's "adds nothing" promise matters).
- **Notification spam and wrong-target alerts.** Alerts on a visible session, generic titles, and focus bugs are all complaints.
- **Terminal clutter and tab-hunting.** Hence the interest in dashboards, notch apps and status prefixes; but also no extra chrome (matches owner notes 20 and 24).
- **Setup friction.** Having to copy .env/node_modules into each worktree, tmux+ttyd stacks, hook scripts by hand. Tools that need config before value lose.
- **Unsupervised damage.** Worktrees "still touch the real thing" (installs, migrations). People want guard rails around autonomous modes, not more autonomy by default.

## Caveats

- Mirror sites show only the first posts; no HN data. A manual pass on Reddit/HN (Algolia search "claude squad", "conductor", "crystal") would add real quotes and vote counts.
- Several GitHub issues appear "resolved" on the mirror; Anthropic may have shipped renames, worktree flag, remote control and cross-session messaging, which shrinks those wishes to "make them better in a GUI".
