# Site design (v4, 6 Nov 2026)

v1 to v3 are in `versions/`. Research for this round: `RESEARCH-v4.md`. Logo options: `directions/logos.html` (F was picked).

## The idea
Basanite is the black stone goldsmiths rubbed gold on to test it. One streak of gold on black, which is also what the app does: quiet sessions, and the one that needs you lights up.

The page is one full-screen 3D field of black stone columns (`src/stone.js`, plain WebGL2). Each column is a session. One has gold veins running through it. Answer it (click) and it settles, and later another one asks. The cursor is a warm light moving over the stone.

## Structure
A pinned story, then a normal page. Times are in screens of scroll, set in `data-at` on each scene (`in start, in end, out start, out end`):
1. Name, edge to edge, with the one line and the download.
2. "Most of them are fine." All dark.
3. "One needs you." The camera comes in on the gold column.
4. "The one you're typing in stays put."
5. "The real claude, in real terminals." The real screenshot rises, then dims except the waiting tile.
6. Three features: huge title bottom left, big tilted screenshot on the right.
7. Three promises as hover rows, then the download rows, questions and footer.

## Motion
One ticker (`src/home.js`): Lenis, the scenes, the name and the stone update in the same frame, all time-based. Scenes read the real scroll position, so they still work with Lenis off. Magnetic edges are the owner-approved spec from the portfolio's `smooth.ts`. Screenshots are planes on the canvas synced to their `<img>`: they bend with scroll speed, sit slightly tilted and straighten towards the cursor. Letters rise on load, sink when the hero leaves, lift a little near the cursor and catch gold.

Idle pages draw at 24 fps; hidden tabs stop; resolution steps down on slow machines.

Phones, touch and reduced motion get `html.flow`: the same content as a plain stacked page with real `<img>`s. No WebGL: `stone.webp`.

## Colour and type
Dark only on the landing page. `#08090B` black, `#EFECE5` bone, `#F5B545` gold (the app's own "needs you"). Gold is only for what needs you and for download.
Big Shoulders Display for headings and the name, Schibsted Grotesk for text, JetBrains Mono for file names. Docs keep their light and dark themes.

## Files
`src/index.html`, `src/home.css`, `src/home.js`, `src/stone.js`, `src/site.js` (download picking, copy). Docs: `src/docs.html`, `src/docs.css`, `src/style.css`, `src/palette.js`. Logo: `public/logo.svg`; app icon: `scripts/make-icon.py`.
