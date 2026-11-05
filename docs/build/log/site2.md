# site2 log

## Log
- 22:22 start: read RULES, README, STATUS, v1 site + notes; copied site/ to versions/site-v1/
- 22:50 research in site/RESEARCH-v2.md; shared wall.js + palette.js; directions A/B/C + picker in site/directions/
- 23:15 full site written: src/index.html, docs.html (ported, Windows workspace keys fixed to Ctrl+Shift+PageUp/PageDown per workspaces.js), style.css, site.js (replaces download.js), palette.js, wall.js
- 23:40 checks in headless Edge: 360/390/600/768/1024/1440, landscape 844x390, 200% zoom, light+dark, reduced motion, touch tap answers the waiting tile, key 1 answers, palette filters. Fixed: palette dialog id clashed with docs #palette, hidden rows still shown, themed screenshots both visible, phone grid overflow, keycap wrap. No horizontal overflow at any width.
- 23:45 done; copy re-read (dropped unverified 'Windows 10 and 11', mode cost now says 'once, and after a compaction'); preview and Edge stopped; committed
## Left over
- Direction pages load ../src/wall.js, so they share later wall.js changes (fine for now; copy it in if they must stay frozen).
- Screenshots are whole-window shots shown at ~760 px, so text in them is small; tighter crops of each feature would read better (needs a new tools/site-shots.sh run).
- Real ⌘K on a Mac and the Windows ARM detection weren't tried on real hardware.
