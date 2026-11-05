# Owner notes

Feedback from the owner, numbered in the order given. Not started unless marked.

Overall (4 Nov 2026): the app is quite good.

1. Let tiles be resized by hand, by dragging their edges.
2. Hide the overseer from recent folders and history when starting a new session.
3. Tiles glitch a little when they change size, which happens often. Make resizing as smooth as possible.
4. Give an easy way to view usage (a clear "view usage" control, one click away).
5. ~~Hangar notifications must break through Do Not Disturb / Focus on the Mac.~~ Owner will allow Hangar in Focus settings themselves; no code change needed.
6. **Session modes** (IMPORTANT, a headline feature; give it the most care): saved prompts/workflows/settings you can create in the app and apply to any session smoothly, so the session reliably gives the output you want.
   - Example: "notes mode", where the session only collects notes into a list and doesn't start work until told to (what this session is doing now).
   - Picking a mode should be simple and easy, and the tile must show clearly which mode the session is in.
   - Ship some built-in modes that work well, based on the prompts and workflows the owner uses often (mine their history to find them).
   - Modes can be edited and customised, perhaps through the overseer or a dedicated session.
   - It has to work well; this is a core feature, not a gimmick.
7. Overall UI must be really good and clean, well executed, with a great user experience. (Standard for the whole app, and for the full pass below.)
8. While a session is selected or being typed in, the layout must stay put: no tile resizing, even if other sessions are busy. The constant shifting is confusing and pulls focus. At minimum, the selected session's tile keeps a constant size and position.
9. The overseer gets its own distinct look (special design or colour) so it never reads as a normal session.
10. Sessions can be colour-coded.
11. Sessions are easy to rename.
12. Make the app more accessible and easier to use overall.
13. The New session screen can also open a plain terminal (a normal shell, no Claude) as a tile.
14. Less terminal clutter (done in 0.3.0: clean view per tile and for the overseer, polished terminal setting):
   - **Clean view toggle** per tile: a tidy chat drawn from the session transcript, with bash commands and tool calls collapsed to one quiet line (expandable), and a text box that types into the real session. The real terminal stays underneath and is shown automatically for permission prompts and menus.
   - **Polished terminal toggle**: nicer font, spacing and colours, quieter Claude Code output, for when the terminal is shown.
   - Start with the overseer, then bring it to session tiles.
15. Exit words must be safe: a mode only ends from typed words when the whole message is the phrase (e.g. "go", "ok start"), never from a word inside a sentence. Modes without exit words only end from the tile's mode menu. A tile shows "<Mode> mode ended" with Undo when it happens.
16. Add an Overnight / unsupervised mode based on how the owner runs sessions overnight ("keep it running without my supervision and make choices as you go"), made better from research.
17. Add a recursive expert mode: many experts, each in their own field, review and rank, then fix, then review again, repeating until it is good enough, with a token usage warning. (Built as Refine, replacing Polish.)
18. UI must be smooth and clean everywhere: nothing glitchy, jumpy or stuttering; good animations where they help; no bugs. Very important.
19. Plain terminal from New without picking a folder (opens in the home folder).
20. The UI is still too busy in places: show less info when it is not needed, simplify, better overall experience.
21. New logo: simple, modern, good looking, and filling its square (the current one is too detailed and too small inside a big white margin).
22. Hangar must be light: low battery use, and never cause extra token use.
23. A Fresh start button per session: Claude writes a handover (and updates memory/notes), the context is cleared, and the same session continues from the handover automatically, so tokens are saved without losing progress or doing anything by hand. (Replaces the Handover mode.)
24. Add quality-of-life features where they help, but keep the app clean and uncluttered.
25. Use the macOS menu bar (Session, Modes, View, Window and so on) to hold features, so the window stays uncluttered.
26. Sending images must be clean: paste (⌘V) or drag a picture into a session, in the terminal and in clean view. (5 Nov)
27. The first message sent in clean view must work, even while the session is still starting. (5 Nov)
28. Pasting an image must add it once, not twice. (5 Nov)

## After all notes are in

Do a large-scale full pass over the whole app: review every part, then improve the UI, clarity, features and user experience. Complete freedom, as long as everything the owner asked for stays in the app somewhere.

- Identify weak points and genuinely useful missing features, then add them where they fit.
- No clutter: don't overload the app with low-value features. Every addition must earn its place, and the UI stays simple and easy to use.

## Decisions (discussion, 4 Nov 2026)

- **Tile sizing:** keep status-based auto-sizing as the main behaviour, but make it smooth, and never resize or move the selected tile. Manual edge-resizing (note 1) must still exist alongside it.
- **Mode behaviour:** a mode is applied once, when it's picked (one instruction sent into the session), not re-attached to every message.
- **Where modes are made and edited:** all three ways — a Modes screen, the overseer (in plain words), and "save this session's instructions as a mode".
- **Built-in modes:** Notes, Build/autonomous, Review only, Careful, plus any more that fit. Research the owner's project/session history to find the patterns they actually use, and make every built-in mode genuinely good.
- **Manual resize vs auto:** a tile resized by hand locks to that size (lock icon shows it); auto-sizing shares out the remaining space. Clicking the lock hands the tile back to auto.
- **Mode refresh:** if a session compacts its context, Hangar quietly re-applies the current mode once so it doesn't fade.
- **Leaving a mode:** pick another mode (or None) from the tile's mode chip, or use the mode's own exit phrase (e.g. "start" for Notes). The chip updates when the phrase is used.
