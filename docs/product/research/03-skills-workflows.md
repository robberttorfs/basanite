# 03 - Skills, plugins and workflows Hangar can build on

Researched 5 Nov 2026. Read first: README, OWNER-NOTES, MODES-RESEARCH, src/main/modes.js (existing modes: Notes, Plan, Build, Overnight, Phased, Review, Refine, Careful, Crew; Fresh start, time budgets, overseer already exist).
Sources are inline. Claims I could not verify are marked VERIFY.

## 0. Findings that change the plan

1. **Skills cost tokens just by existing.** Every skill's name and description sits in context on every turn; only the body is on demand ([skills docs](https://code.claude.com/docs/en/skills)). Bundling 10 skills into the user's `~/.claude/skills` would be a permanent tax and breaks Hangar's "never waste tokens" rule. The fix is `disable-model-invocation: true`: the description then stays out of context and only the user can invoke it. So Hangar's modes should stay what they are (text sent once, hidden), and any skill Hangar ships must be user-invoked only. Claude Code's `/skill-doctor` shows per-skill context cost; Hangar can point users at it.
2. **Claude Code already ships the loop features Hangar's modes imitate.** `/goal <condition>` keeps Claude working until a small fast model (Haiku class) judges the condition met, with a turn cap written into the condition; evaluation tokens are "typically negligible" ([goal docs](https://code.claude.com/docs/en/goal)). `/loop`, `/code-review`, `/simplify`, `/batch`, `/verify`, `/debug` are bundled prompt skills. Hangar can offer these as one-click actions at zero licence risk and zero extra context (they are the user's own Claude Code).
3. **Licensing is easy if we write our own text.** Methods are not copyrightable; prompt text is. Superpowers is MIT ([repo](https://github.com/obra/superpowers), ~313k stars), Spec Kit is MIT ([repo](https://github.com/github/spec-kit), ~148k stars), anthropics/skills is Apache-2.0 except docx/pdf/pptx/xlsx which are source-available and must NOT be bundled ([repo](https://github.com/anthropics/skills)). anthropics/claude-plugins-official root is Apache-2.0 but each plugin carries its own licence ([repo](https://github.com/anthropics/claude-plugins-official)). Recommendation: write Hangar's mode texts ourselves (short, in the owner's voice), credit methods in a NOTICE, and for third-party packages offer "install" (runs `claude plugin install x@marketplace` in the user's own Claude Code) instead of copying files.
4. **Hangar can get most of this through hooks it already has.** 33 hook events exist, 5 hook types (command, http, mcp_tool, prompt, agent), and `additionalContext` can be injected by SessionStart, SubagentStart, UserPromptSubmit and tool events ([hooks docs](https://code.claude.com/docs/en/hooks)). Strings over 10,000 chars get written to a file with a 2,000-char preview, so keep mode text well under that (modes.js caps at 8,000, fine).

## 1. Ranked list: modes and bundled skills worth adding

Ranking = value to a solo builder like the owner x fit with "calm" x token safety. "Bundle?" = may we ship it inside an MIT app. All new prompt text would be written fresh by us.

| # | Candidate | What it does | Why valuable | Source and licence | Bundle? | How Hangar surfaces it | Token note |
|---|---|---|---|---|---|---|---|
| 1 | **Until done** (wraps `/goal`) | User states one measurable end state ("tests in X pass, lint clean, or stop after 20 turns"); Claude keeps going turn after turn until a cheap evaluator says met. | The proper engine for Overnight/Build: finishes by a test, not by Claude's mood. Survives resume. Works headless. `/goal` status shows turns and token spend. | Built into Claude Code ([docs](https://code.claude.com/docs/en/goal)). Nothing to bundle. | Yes (it is a command) | Mode chip "Until done" with a one-line field "Done when..." and a turn/time cap. Hangar types `/goal ...` into the session. Tile shows goal and turn count. | One cheap evaluator call per turn. Idle check-ins can start turns on their own (max 3 per goal), each sending full context; warn, and offer `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` for Overnight. Always require a turn cap. |
| 2 | **Test first** (TDD red, green, refactor) | Failing test first, minimal code to pass, refactor, never skip red. | Most-used engineering workflow in the ecosystem; Superpowers makes it a core skill. Keeps changes verifiable. | Method from Superpowers (MIT) and common practice; write own text. | Own text yes; Superpowers file with credit also OK (MIT) | Mode "Test first". Pairs with Until done ("all tests pass"). | Slightly more tokens per task, fewer rework loops. |
| 3 | **Debug** (root cause before fixing) | Reproduce, hypotheses, gather evidence, fix the cause not the symptom, add regression test, no shotgun edits. | Owner's history is full of bug-fix rounds. Stops Claude "fixing" by guessing. | Superpowers systematic-debugging (MIT). Claude Code's bundled `/debug` debugs Claude Code itself, not your project; do not confuse. Own text. | Own text yes | Mode "Debug". Exit word "fix it" (like Review). | Neutral. |
| 4 | **Spec first** (spec, plan, tasks, build) | Spec, plan, task list, implement task by task, converge at the end. | Spec-driven development is the fastest-growing pattern (Spec Kit ~148k stars). Fits "questions up front, then go". Writes durable files, so it survives Fresh start. | Spec Kit MIT. Its Claude Code integration details were not on the page I read (VERIFY). | Own condensed text yes; do not vendor Spec Kit, offer "Install Spec Kit" instead | Mode "Spec"; writes docs/spec/ files; pairs with Phased. | Planning is cheap; avoids expensive rebuilds. |
| 5 | **Verify before done** | Before saying finished: run the real check (tests, build, open the app), show evidence, list what was NOT verified. | Cheapest quality add. Prevents "done" claims. | Superpowers verification-before-completion (MIT); Claude Code bundled `/verify`. | Own text yes, or a button that types `/verify` | Stackable toggle "Verify at end" on any tile (an add-on, not a mode). | One extra pass per task; saves rework. |
| 6 | **Tidy commits** | Small logical commits, explicit paths only (no `git add -A`), clear messages, no secrets, never touch main. | Already in the owner's Careful rules; as an add-on it helps Build and Overnight. | Anthropic `commit-commands` plugin exists in the official marketplace (licence VERIFY per plugin). | Own text yes; plugin: install link only | Stackable toggle "Commits". | Neutral. |
| 7 | **Quiet** (Concise output style) | Result first, no preamble or recap. | The owner repeats "minimal text, plain short English" everywhere. Native output style, no prompt hack. Cuts output tokens. | Built-in: Proactive, Concise, Explanatory, Learning ([docs](https://code.claude.com/docs/en/output-styles)). Concise needs v2.1.237+. | Yes (a setting) | Style picker in the tile mode menu. Set `outputStyle` in the tile settings file at launch; mid-session switch costs a prompt-cache miss on the next message. | Lowers tokens. Explanatory and Learning raise them; mark "+tokens". |
| 8 | **Branch this session** (fork) | Branch the conversation to try another approach; original stays intact. | Safe experimenting (`--fork-session`, `/branch`, `/fork`; see [checkpointing](https://code.claude.com/docs/en/checkpointing)). | Built in. | Yes | Tile menu "Branch". Hangar opens a new tile with `--resume <id> --fork-session`. | A fork re-reads the full context on its first message; show that. |
| 9 | **Own branch** (worktree) | Session works on its own branch in `.claude/worktrees/<name>`, so parallel tiles cannot overwrite each other. | Best protection when several tiles touch one repo. Pairs with Careful, Overnight, Crew. `.worktreeinclude` copies .env files. Background sessions auto-isolate. ([worktrees](https://code.claude.com/docs/en/worktrees)) | Built in (`--worktree <name>`). | Yes | Switch in New session: "Own branch". Tile shows branch from statusline `worktree.name`. Exiting a named worktree prompts; clean view must hand that prompt to the terminal. | Neutral. |
| 10 | **Parallel review** (agent teams) | Several teammates review from different lenses and challenge each other. | Good for Refine-style review but experimental, needs `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, and costs far more (docs: roughly 7x in plan mode) ([agent teams](https://code.claude.com/docs/en/agent-teams), [costs](https://code.claude.com/docs/en/costs)). | Built in, experimental. | Yes | Opt-in only, labelled heavy, with a token warning like Refine. Never enable the env var globally. | HIGH. Warn every time. |
| 11 | **Simplify / Code review buttons** | `/simplify` cleans changed code; `/code-review` finds correctness bugs (levels low to max, `--fix`). | Zero-effort wins; max/ultra are costliest (docs: only when asked). | Bundled with Claude Code. | Yes (just commands) | "After the work" row in the tile menu: Review, Simplify. Default medium. | Ultra/max spawn many reviewers: label them. |
| 12 | **Handover plus project notes** | Fresh start already covers handover. Add: record decisions in CLAUDE.md or docs/NOTES.md too. | Official advice: CLAUDE.md under 200 lines, move workflow text into skills ([costs](https://code.claude.com/docs/en/costs)). | Own. | n/a | Fresh start gets a checkbox "Also update project notes". | Saves tokens over time. |

Not recommended: a full Superpowers bundle (many auto-invoking skills, token tax); document skills (docx/pdf/pptx/xlsx are not open); anything that needs MCP servers by default.

Tighten existing modes with what the research shows:
- **Overnight**: run as a `/goal` with a turn cap under the hood; keep the hard limits. Consider `--permission-mode auto` or acceptEdits plus deny rules. Auto needs Opus 4.6+/Sonnet 4.6+/Haiku 5.5 on the API and classifier calls can count as tokens on API/enterprise accounts ([permission modes](https://code.claude.com/docs/en/permission-modes)).
- **Plan**: map to Claude's real `plan` permission mode (`--permission-mode plan`, or Shift+Tab) so edits are blocked by the tool, not only by instruction.
- **Review**: same, or enforce read-only with a PreToolUse hook (permissionDecision deny on Edit/Write). A guarantee text cannot give.
- **Careful**: back the prose with a PreToolUse hook that denies `git push`, deploy commands, `rm -rf` outside the project. Docs say anything that must happen every time belongs in a hook, not an instruction ([output styles: choose between features](https://code.claude.com/docs/en/output-styles)).

## 2. Claude Code capabilities Hangar should use but does not yet

Based on what the README says Hangar uses today (HTTP hooks, statusline, transcript, subagents folder, SessionStart restate).

| Capability | What it gives | Docs | Effort | Token effect |
|---|---|---|---|---|
| `prompt_cache` statusline object (hit ratio, misses, warm/cold, TTL) | "Cache is cold" hint: after idle longer than the TTL the next message re-reads the whole context. Suggest Fresh start or a short message before stepping away. Explains usage jumps. | [costs](https://code.claude.com/docs/en/costs), [statusline](https://code.claude.com/docs/en/statusline) | Low (field already arrives) | Saves tokens |
| Statusline fields not yet shown: `session_name`, `worktree.*`, `workspace.git_worktree`, `effort.level`, `thinking.enabled`, `output_style.name`, `rate_limits.*.resets_at`, `fast_mode` | Calm tile subtitle: branch, effort, style. Reset times. | statusline | Low | None |
| `permission_mode` in every hook payload (default, plan, acceptEdits, auto, dontAsk, bypassPermissions) | Show the real mode on the tile; sync a Plan chip with Shift+Tab changes made in the terminal; warn when a tile is in bypass. | [hooks](https://code.claude.com/docs/en/hooks) | Low | None |
| `PermissionRequest` / `PermissionDenied` hooks | Answer or batch-approve prompts from a calm side list instead of the terminal; "always allow in this project". HTTP hooks can return allow/deny. Needs strong guardrails. | hooks | Medium | None |
| `StopFailure`, `Notification`, `PreCompact`/`PostCompact`, `PostModelSwitch` | Reliable "hit a limit / API error" state; replace the SessionStart restate with PostCompact context; show model changes. | hooks | Low-medium | None |
| `TaskCreated` / `TaskCompleted`, `TeammateIdle`, `SubagentStart/Stop` | Tiny progress strip (3 of 7 tasks) from Claude's own task list, no polling. | hooks, [agent teams](https://code.claude.com/docs/en/agent-teams) | Medium | None |
| `UserPromptSubmit` `additionalContext` | Deliver the mode block here instead of mixing it into the typed prompt: it arrives as a system reminder, not as the user's words, so clean view and history stay clean. Stays under 10k chars. | hooks | Low | Same as now |
| `claude agents --json --all`, `--bg`, `attach`, `logs`, `stop`, `respawn` | Official, stable way to list background sessions with `state`/`waitingFor` (docs say do not parse `~/.claude/jobs/`). `--bg` work survives closing Hangar (a supervisor keeps it running); background sessions auto-use worktrees. | [agent view](https://code.claude.com/docs/en/agent-view) | Medium-high (research preview) | None |
| `/usage` breakdown | Attribution by skill, subagent, plugin, MCP server and loops, plus "f to fix" recommendations. Hangar's usage view could link or mirror it. Local history only; the plan-limit endpoint can be rate limited. | costs | Low (open as a command) | Saves tokens |
| Checkpoints and `/rewind` | "Undo last turn". Covers Claude's file-edit tools only; Bash-only changes and most subagent edits are not restored. Never promise it as a backup. | [checkpointing](https://code.claude.com/docs/en/checkpointing) | Medium (interactive menu) | None |
| `--output-format stream-json`, `--include-hook-events`, `--session-id`, `--name`, `--max-budget-usd`, `--max-turns` | Foundation for headless Overnight and Until-done jobs with hard caps and a clean event stream. `--max-budget-usd` is a real spend ceiling, stronger than prose. | [CLI reference](https://code.claude.com/docs/en/cli-reference) | Medium | Bounds spend |
| `--append-system-prompt(-file)` | Alternative delivery for a mode chosen at session start: sits in the cached system prompt rather than the conversation. Cannot change mid-session. | CLI reference | Low | Slightly cheaper |
| Background token use switches in the tile settings file | Turn off prompt suggestions, session recap, idle compaction ([costs: background token usage](https://code.claude.com/docs/en/costs)). Exact setting names not confirmed (VERIFY in settings reference). Also `crossSessionInbound: hold` so other sessions cannot wake a tile. | costs | Low | Saves tokens |
| Rate-limit auto-continue | Claude Code can wait for the limit reset and continue (v2.1.234+, `autoContinueAtUsageLimit`). Hangar can show "waiting for reset, resumes 03:10" from `rate_limits.*.resets_at`. | costs | Low | None |
| `--worktree "#1234"`, `--from-pr` | "Open this PR in a tile" in Review mode on an isolated checkout. | [worktrees](https://code.claude.com/docs/en/worktrees) | Medium | None |
| Output styles | Per-tile voice: Quiet, Explain, Learn. | [output styles](https://code.claude.com/docs/en/output-styles) | Low | See table |
| Scheduled tasks / routines | Nightly runs with no tile open (`/loop`, cloud routines). Not for v1: session loops re-send full context each fire. | [scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks) | - | Loops cost context each fire |
| Settings layers (user, project, local, managed, `--settings`) | Hangar's separate `--settings` file is the right layer. Keep it. Project-level `auto` mode is ignored, so auto must come from user settings or the flag. | [permission modes](https://code.claude.com/docs/en/permission-modes) | n/a | n/a |

Token and safety traps found:
- Enabling agent teams makes Claude's own named subagents launch as teammates silently, at far higher cost. Never set that env var globally.
- `/goal` idle check-ins and `/loop` fire while a tile looks idle and each sends the full context. Show an "auto-running" marker.
- Cross-session messages wake idle sessions with full context (the overseer types deliberately, so fine).
- Auto mode classifier calls may count as tokens on API/enterprise accounts.
- Changing output style or editing CLAUDE.md mid-session invalidates the prompt cache for the next message.
- Fork and resume re-read the whole context on the first message.

## 3. Mode and skill library UX that stays simple

Principles from OWNER-NOTES: fewer visible things, no explainer text, icons over text, instant switches. One idea: **a mode is a card with a name, one line, and text.** Everything else is optional.

1. **Two kinds only.** *Modes* are exclusive (one per tile, the chip). *Add-ons* are stackable small switches (Verify at end, Tidy commits, Quiet, Own branch). Never say "skill" in the UI: it is Claude Code jargon and skills carry a token tax.
2. **Library = one grid in Settings > Modes.** Card per mode: colour dot, name, one line, a tiny tag only where it matters ("+tokens" for Refine/teams, "runs alone" for Overnight/Until done). Hover actions: Use here, Edit, Duplicate, Hide. No categories or search until there are over about 15.
3. **Default shelf of 7:** Notes, Plan, Build, Overnight, Review, Careful, Until done (the high-evidence ones from MODES-RESEARCH). Phased, Refine, Crew, Test first, Debug, Spec sit under a collapsed "More" in the same grid.
4. **Add-ons live in the mode popover as small icon buttons**, not the tile header. The header keeps one chip; active add-ons show as tiny glyphs inside it.
5. **Mode packs as plain files.** Export/import `.hangar-mode.json` (name, colour, one line, instructions, exit words, tokenWarn, add-ons). Sharing = a file or a gist URL. No marketplace, no account, no server.
6. **Plugin interop without bundling.** An "Extras" list of 4 to 6 buttons that run `claude plugin install <name>@<marketplace>` in a plain shell tile, with licence and a cost note ("adds N skills; their descriptions load every turn"). Candidates: Superpowers (MIT), commit-commands, code-review, a language-server plugin. Never auto-install, never preselect. Third-party marketplaces are unreviewed by Anthropic ([marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces)).
7. **Token meter on the card, not a dialog.** Reuse `tokenWarn`; show one to three dots for relative cost (Notes 0, Plan 0, Build 1, Until done 1, Refine 3, Teams 3). Confirm only for 3-dot modes.
8. **Create from a session** (already planned) plus the overseer ("make a mode from how I instructed session X"). Add "Duplicate and tweak" on built-ins instead of blank forms.
9. **Live size in the editor.** Show approximate tokens (chars / 4) of what Claude receives, so users keep modes short; a short mode is a cheaper mode.
10. **Per-project default.** Remember the last mode per project folder and pre-select it as one clearable chip on New session.
11. **Setup cost line (later).** Per project: CLAUDE.md size, number of skills, MCP servers. Official guidance is CLAUDE.md under 200 lines; link to `/skill-doctor`.

## 4. Suggested build order (smallest first)

1. Passive tile info: real `permission_mode`, worktree, effort, output style, cache warm/cold (zero tokens).
2. Enforcement hooks behind Review, Plan, Careful (deny edits; deny push/deploy) so modes become guarantees.
3. Until done mode wrapping `/goal`, turn cap mandatory.
4. Own branch switch (`--worktree`) in New session; Branch this session (fork).
5. Add-ons: Verify at end, Tidy commits, Quiet.
6. Test first, Debug, Spec as modes under "More".
7. Mode export/import file; Extras list with plugin install buttons.
8. PermissionRequest side list and `claude agents --json` background tiles (largest, riskiest).

## 5. Sources

- Skills: https://code.claude.com/docs/en/skills
- Hooks: https://code.claude.com/docs/en/hooks
- Status line: https://code.claude.com/docs/en/statusline
- Goal: https://code.claude.com/docs/en/goal
- Agent view and background sessions: https://code.claude.com/docs/en/agent-view
- Agent teams: https://code.claude.com/docs/en/agent-teams
- Permission modes: https://code.claude.com/docs/en/permission-modes
- Output styles: https://code.claude.com/docs/en/output-styles
- Checkpointing: https://code.claude.com/docs/en/checkpointing
- Worktrees: https://code.claude.com/docs/en/worktrees
- Costs: https://code.claude.com/docs/en/costs
- CLI reference: https://code.claude.com/docs/en/cli-reference
- Anthropic marketplaces: https://code.claude.com/docs/en/plugins/anthropic-marketplaces
- Superpowers (MIT): https://github.com/obra/superpowers
- Spec Kit (MIT): https://github.com/github/spec-kit
- anthropics/skills (Apache-2.0; document skills source-available): https://github.com/anthropics/skills
- anthropics/claude-plugins-official (Apache-2.0 root; per-plugin licences): https://github.com/anthropics/claude-plugins-official
- Lists: hesreallyhim/awesome-claude-code (~57k stars; list licence not confirmed), rohitg00/awesome-claude-code-toolkit, ComposioHQ/awesome-claude-skills, summarised at https://fast.io/resources/awesome-claude-code-resources-2026/ (secondary source; star counts differ between sources)

Not verified: licences of individual official plugins (commit-commands, code-review, feature-dev, ralph-loop); exact setting names for switching off prompt suggestions, recap and idle compaction; Spec Kit's Claude Code install path; contents of the awesome lists (README bodies did not load).
