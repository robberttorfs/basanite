# Site design (v2, 5 Nov 2026)

v1 is kept in `versions/site-v1/`. The three directions tried for v2 are in `site/directions/` (open `index.html` there); A, "The wall", became the site.

**Idea:** the page opens as the app. The hero is a window of tiles, and the headline sits in your own tile, the one that never moves. The other tiles work, finish and ask; the one that asks grows and turns amber and waits until you answer it (click, tap or press 1, 2, 3). Below the window every section keeps the window's grammar: mono tile headers, 1 px tile edges, terminal glyphs.

- **Colour:** carbon `#0b0b0a`, tiles `#121211`, lines `#2a2925`, bone text `#ece9e2`. Amber `#ffb23f` is the only colour, and it only marks something waiting. Working and done are shapes and words (● ✓), not blue and green. Light mode is its own set (`#ebeae6` page, white tiles, ink text, darker amber `#9c5a00` for text on light). System theme by default; the nav button flips it and remembers per browser.
- **Type:** Archivo (variable, wide setting, 700-780) for headings and body, IBM Plex Mono for everything that comes from a terminal: tile headers, counts, keys, the manual list, the token ledger. Google Fonts, two families.
- **Motion:** CSS transitions only (time-based, same on 60 and 120 Hz): tiles change size over 0.45 s, colour over 0.3 s, the palette fades in over 0.12 s. The spinner glyph is Claude Code's own (· ✢ ✳ ✶ ✻ ✽). The wall's timers stop off screen and in hidden tabs. Reduced motion: one still frame, no transitions, answering still works.
- **Palette:** ⌘K / Ctrl+K on the page, or the keycap in the nav. Downloads, install notes, docs, theme, and "answer the waiting session" while one is waiting.
- **Downloads:** the main button names your OS (`site.js`); all four builds sit under it, in the download section with the unsigned first-launch steps, and in the palette.
- **Files:** `src/index.html`, `src/docs.html`, `src/style.css`, `src/wall.js` (the wall), `src/palette.js`, `src/site.js` (downloads, theme, copy). Name and links only in `config.mjs`.
