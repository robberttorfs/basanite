# Site design

**Idea:** the page behaves like the app. It is quiet, dark first, and amber shows up in one place only: the tile that needs you. Even the download button isn't amber, because in the app amber means "needs you" and nothing else.

- **Tokens** are the app's own, from `src/renderer/style.css` and `look.css`: `#0e0f12` background, `#14161b` panels, `#262a33` lines, `#dcdfe5` text, `#8b919c` muted, `#f5b545` needs you, `#6aa8ff` working, `#5fd39a` done. Light mode uses the app's light set (darker amber `#a65f00`). Radius 10 px like a tile.
- **Type:** the system UI stack the app uses, plus the system mono for terminal text. No web fonts, so nothing loads late and nothing reflows.
- **Hero:** a short headline, one plain line, one download button for your OS and a GitHub link. Under it sits the showpiece: a live HTML mock of the tile wall. The left tile is "yours" and never moves. On the right, sessions work, finish, and one asks for permission: it turns amber and grows while the others shrink, then shrinks back once answered. The status shapes are the app's (○ idle, ● working, ◆ needs you, ✓ done). With reduced motion it shows one still frame. It pauses off screen.
- **Features:** each big one is a heading, two or three lines and a real screenshot in a tile frame. Smaller ones are a plain two-column list. No icon cards, no numbers, no pills.
- **Privacy and download:** plain facts, then a download block with all four builds and the one-time "open anyway" steps right next to them.
- **Docs:** one page, a sticky contents list on desktop and a fold-out list on phones.
- **Motion:** colour and size changes at the app's own 0.28 s ease. Nothing slides in on scroll.
- **Name and links** live in `site/config.mjs` only. `node site/build.mjs` fills them into `site/dist`.
