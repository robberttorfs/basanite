# Site design (v5, 6 Nov 2026)

v1 to v3 are in `versions/`. Research: `RESEARCH-v4.md` (effects), `RESEARCH-v5.md` (words and order). Logo options: `directions/logos.html` (F was picked).

## The idea
Basanite is the black stone goldsmiths rubbed gold on to test it. The first screen is one full-screen 3D field of black stone columns (`src/stone.js`, plain WebGL2). One column has gold veins; click it and it settles, and later another asks. The cursor is a warm light on the stone.

It scrolls away with that screen (drawn shifted by the scroll, fading to the page black at its bottom edge). Everything below is a normal page on the same black. What to write and what to show comes from `RESEARCH-v5.md`: headings are feature names, the text is plain fact, the app is the picture.

## Motion
One ticker (`src/home.js`): Lenis, the name and the canvas update in the same frame, time-based. Below the first screen: smooth scroll, text that rises once, screenshots drawn on the canvas synced to their `<img>` (rise in, flex slightly with scroll speed, barely lean towards the cursor; never cut off, always fit one screen), the wall dims except the waiting tile, hover rows. No pinning.

The canvas stops drawing when the stone has faded and no screenshot is on screen; a still page draws at 24 fps; hidden tabs stop. Phones, touch and reduced motion get `html.plain` with real `<img>`s. No WebGL: `stone.webp`.

## Colour and type
Dark only on the landing page. `#08090B` black, `#EFECE5` bone, `#F5B545` gold (the app's own "needs you"). Gold is only for what needs you and for download.
Big Shoulders Display for headings and the name, Schibsted Grotesk for text, JetBrains Mono for file names. Docs keep their light and dark themes.

## Files
`src/index.html`, `src/home.css`, `src/home.js`, `src/stone.js`, `src/site.js` (download picking, copy). Docs: `src/docs.html`, `src/docs.css`, `src/style.css`, `src/palette.js`. Logo: `public/logo.svg`; app icon: `scripts/make-icon.py`.
