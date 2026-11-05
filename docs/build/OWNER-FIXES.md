# Owner fixes (from testing, 5 Nov 2026)

Noted only; not started until the owner says.

1. **Cursor flickers while typing.** In a terminal tile, the cursor rapidly switches between visible and hidden as you type: stuttering, off-on-off-on. Scope: every terminal tile in Hangar OSS (it may also happen in the personal Hangar, since it uses the same terminal code; check both).
2. **Overseer panel content doesn't fit.** Sometimes the overseer's clean view overflows on the right instead of wrapping or adjusting:
   - message bubbles are cut off ("answer the question appropriat…");
   - Claude's text runs past the edge ("Mad Libs H…", "what's wait…");
   - the collapsed "Ran hangarctl …" tool line is cut off;
   - the input box is cut off too.

   It looks like the panel's content is wider than the panel, maybe after a resize or a long unbroken line. Scope: the overseer panel (check that session tiles in clean view use the same chat code and get the same fix). Screenshot: the owner's image #8, 5 Nov.
3. **Getting to the overview needs to be clearer.** Today it's only reachable through Ctrl+Shift+A / ⇧⌘A, the View menu, the palette, or clicking the top-bar counts (which isn't obvious). It needs a clear, visible way in, without adding clutter (calm, icons over text). Scope: the top bar, app-wide.
4. **The ☰ menu (Windows) needs a much better layout.** Today it pops up the native menu bar as a plain list of submenus (Session, Workspace, Modes, Edit, View, Window, Help), each needing another hover to see anything. It should be a well-designed in-app menu instead: the most-used actions visible straight away, grouped clearly, with icons and shortcuts, in the app's own style, not a system list of folders. Scope: the Windows ☰ button (the Mac menu bar stays native). See the owner's image #9, 5 Nov.

## Status (5 Nov, night)
- 1 cursor flicker: likely cause fixed (held redraws, cursor-steady.js), also in personal Hangar. Not reproducible in the test copy: owner to confirm in real use.
- 2 overseer overflow: fixed (shared chat CSS, tiles in clean view too).
- 3 overview: grid icon button left of the top-bar counts; counts highlight on hover.
- 4 ☰ menu: new in-app menu on Windows/Linux (app-menu.js), built from the command registry.
- Small leftovers: in More, the current theme/density is greyed instead of ticked; many palette rows have no icon; Edit (undo/copy/paste) not in the in-app menu (keys work).
