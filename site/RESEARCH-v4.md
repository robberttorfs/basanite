# Site v4 research (6 Nov 2026)

Owner on v3: "meh". The first page isn't impressive enough, it doesn't use the whole screen, the portfolio research didn't come across (smooth scroll, animations, special effects), and the name isn't clear. "Don't overload with those; keep it easy to use and clear, but more impressive and nicer to use."

Read this round: `robbert-torfs-portfolio/research/` (FINDINGS, notes 02, 04, 05, 06, 07), `V4-FEEDBACK.md`, `v6/FEEDBACK-R1.md`, and the code that shipped: `v6/site/src/scripts/smooth.ts`, `gl.ts`, `ui.ts`, `loader.ts`, `v6-picks/snap-demo.html`.

## The lesson that decides everything
landonorris.com: **one real 3D moment plus cheap, polished motion everywhere else** feels premium and stays fast (FINDINGS). And note 05's warning: effects with no meaning read as AI-made; every effect must point at something real. So: one big idea, and it has to come from the product.

## The big idea
Basanite is the black stone goldsmiths used to test gold (Greek *basanos*, touchstone; rub the metal on it and read the streak). Black stone with one line of gold: that is also what the app does. Many quiet sessions, and the one that needs you lights up in amber.

So the hero is **a full-screen field of real 3D black stone columns, and one of them is lit with gold.** Each column is a session. It uses the "perfume" spotlight pattern (all dim, one lit, ranked the best wow per minute in note 04) and the cursor-following light (rank 5), and it means something.

## Taken from the portfolio
| Technique | Source | Where it goes |
|---|---|---|
| Lenis on one shared ticker, `lerp 0.1`, wheel only, touch stays native | note 07, `smooth.ts` | whole page |
| Magnetic section edges inside the scroll input (owner approved; never snap after stop) | `smooth.ts`, `snap-demo.html` | the pinned scenes |
| One fixed canvas, real `<img>` in the page, planes synced to their rect | note 07 (14islands), `gl.ts` | stone + screenshots |
| Screenshot and frame warp as ONE piece with scroll speed, tilt on hover, never moving inside their frame | `gl.ts` warp shader, R1 #11 | screenshots |
| Line reveals: text rises from a mask | `ui.ts` | headlines |
| Reactive lettering: letters react to the cursor | note 07 feature 1 | the giant name, as a gold sheen that follows the cursor |
| One-screen feel: scenes hand over on a pinned stage rather than a long page | V4-FEEDBACK (19:08 note) | the features |
| Huge title bottom-left, big tilted screenshot right | V4-FEEDBACK (full-flat, "really likes") | the feature scenes |
| Hover row highlights and shows more (minhpham "sick") | note 06 | download rows, questions |
| One short entrance, any input skips it | `loader.ts`, note 05 pitfall 10 | first load |
| Light magnetic buttons (R1 #7: "move too much") | note 07, R1 | download button only |
| Ticker sleeps when idle, stops when hidden, adaptive resolution | `smooth.ts`, `gl.ts` | canvas |

## Left out on purpose
- Googly eyes, jokes and stickers: those are his personal site. This is a tool people trust with their terminal.
- Spiral, word stacks, charts, 3D props, page-wide colour changes.
- A DOM dot-and-ring cursor. Banned as generic, and the owner found every one invasive at times and fragile (alt-tab, dialogs). A native CSS image cursor can't get lost; the light on the stone is the cursor effect.
- A loader with a wait: the name is on screen from the first frame.
- GSAP and three.js: the stone is one custom shader, so plain WebGL2 and Lenis (19 KB) are enough.

## Rules carried over
- **Whole screen from the first frame** (R1 #1), edge to edge; nothing sits in a narrow centred column.
- Text never goes blurry while moving (R1 #8): whole-pixel settle, no long-lived `will-change` on text.
- Time-based motion, so 60 and 120 Hz match (site-build lessons).
- One continuous background, no section bands (V4-FEEDBACK). Scrollbar hidden; wheel, touch and keys all work.
- No progress bars, numbered labels, eyebrow labels, pill badges, dot-chained text or explainer lines.
- Works if the smooth-scroll library is off (Opera GX): scenes read the real scroll position, never Lenis's.
- Phone rules live only in phone media queries; desktop comes first. Touch gets plain images, no warp.
- Reduced motion or no WebGL: a still picture of the stone and normal stacked sections.
- Note 05 warns "black, one accent, giant grotesk" is the Awwwards default. What stops this being that is the stone itself and the fact that the gold means something.

## Keeping it easy
At most one effect per screen. Download stays one key away in the nav the whole way down. Six screens: name, the idea, the real thing, three features, three promises, download.
