# Site design (v3, 5 Nov 2026)

v1 is in `versions/site-v1/`, v2 in `versions/site-v2/`. Research for this round: `RESEARCH-v3.md`. Colour candidates side by side: `directions/colours.html`.

Owner on v2: "too messy, too much going on, especially showcasing those Claude sessions has way too much info." v3 is the opposite: one idea, one picture, a clear download.

## Hero idea: the one that needs you lights up

The headline names the product in plain words: **Every Claude Code session on one calm screen.** Next to it (under it on phones) sits a quiet wall of six tiles. Each tile carries one word, its folder name, and a small shape for its state. No terminal text, no tool calls, no menus.

Every few seconds one tile starts waiting on you: it grows, its edge turns amber, it says "needs you", and the rest of the wall dims a little. Then it's answered, settles back, and later another one asks. One tile has a blinking caret: that's the one you're typing in, and it never moves or resizes, however the others shift. Hover or tap the waiting tile and it settles straight away.

That's the whole app in about three seconds: many sessions, calm, the one that needs you comes forward, yours stays put.

## Page structure (one idea per screen, lots of space)

1. **Hero.** Headline, one line under it, the OS-detected download, the other builds and the source as one quiet line, then the tile wall.
2. **The real thing.** A single large real screenshot of the app with the spotlight move: the window dims, the waiting tile stays at full brightness. One short headline and two lines: it's the real `claude`, in real terminals, with your own login and settings.
3. **Workspaces and the overview** (chunk 2): one real shot, one headline.
4. **⌘K and modes** (chunk 2): one real shot, one headline; Review and Plan really block edits.
5. **Tokens and privacy** (chunk 2): three plain statements, big type, no icons.
6. **Download** (chunk 2): every build, the unsigned first-launch steps, then a short FAQ and the footer.

No three-column icon grids, no logos, no testimonials, no numbered labels.

## Colour: "Runway"

Chosen from six (`directions/colours.html`): Runway, Carbon (v2), Kingfisher, Vesper, Sumi ink, Hi-vis.

Why Runway: the neutrals are a deep petrol black tinted towards blue-green, so the page gets its character from the blue family the owner likes, without blue ever being a button or a signal. The signal stays the app's own amber (`#F5B545`, the same value as `--needs` in the app), so the page and every real screenshot say "waiting" in the same colour. Kingfisher (blue as the signal) was the runner-up and lost because blue reads as "link" or "working", and every screenshot shows waiting in amber. Carbon is v2's look. Vesper's peach is too soft to mean "needs you". Sumi ink is someone else's theme and only goes cream in light mode. Hi-vis turns amber into a loud block.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0A1317` | `#F1F4F5` | the one page background (no section blocks) |
| `--tile` | `#0F1B20` | `#FFFFFF` | tiles, panels |
| `--line` | `#1E2E35` | `#D3DDE0` | 1 px edges |
| `--text` | `#E6EDEF` (15.9:1) | `#0A1A20` (16.1:1) | headings, body |
| `--muted` | `#8FA2A9` (7.1:1) | `#4E6169` (5.9:1) | secondary text |
| `--sig` | `#F5B545` | `#E9A532` | amber edge and glow only |
| `--sig-text` | `#F5B545` (10.4:1) | `#8A5A00` (5.4:1) | the words "needs you" |

Rules: amber appears only where something needs you (the waiting tile, the waiting tile in screenshots). The download button is ink on the page colour, never amber. All text passes WCAG AA. Light and dark follow the system; the nav button flips and remembers. The same tokens carry through the docs page in chunk 2.

## Type

**Schibsted Grotesk** (Google Fonts, 500 to 800) for everything: big tight headlines at 800, body at 500. It's a newspaper-born grotesk, firm and professional, less common than Inter or Geist. **JetBrains Mono** 500 only for the tile names and keys, the things that come from a terminal. Headline sizes are the drama: up to about 84 px on desktop, 44 px on phones.

## Motion

- Time-based CSS transitions only (same on 60 and 120 Hz): a tile grows over 0.7 s, the amber edge fades in over 0.5 s, the dim over 0.6 s. A small JS timer only picks which tile asks next.
- Nothing bounces, nothing slides in from the side, no scroll hijacking.
- The wall stops when it's off screen or the tab is hidden.
- Reduced motion: one still frame with one tile waiting, no transitions; the caret doesn't blink.

## Files

`src/index.html`, `src/style.css`, `src/hero.js` (the wall), `src/site.js` (download picking, theme). `src/docs.html` still uses v2's styles (`src/docs-v2.css`) until chunk 2 restyles it. Name and links only in `config.mjs`.
