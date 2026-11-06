# Status: end of the 5 Nov 2026 build

Everything in PLAN.md rounds 1 to 5 is built, reviewed (code and UX), and fixed. Round 6 is done except the steps that need the owner. The repo stays private, and nothing is deployed.

## Built
- **Foundations:**
  - Windows quit crash fixed (ConPTY teardown) and auto-update (electron-updater).
  - CI: tests on Linux and Windows, plus a release workflow for all four builds on `v*` tags.
  - One command registry behind the menus, the palette (⌘K / Ctrl+Shift+K) and the shortcut sheet.
  - Focus return, themes (system/light/dark), high contrast, reduced motion, status shapes, the header diet, compact density.
- **Workspaces:** pills, switching, put away and reopen, moving sessions, cross-workspace attention, per-workspace notifications and default mode.
- **Overview:** attention list, preview, number keys answer menus, seen state, snooze, notifications named after the session.
- **Tiles:** doing line, git chip, changes peek, same-file notice, folder actions, cold-cache marker.
- **Sessions:** history and search, branch a session (fork), own branch (worktree), Claude inside terminal tiles.
- **Modes 2.0:**
  - Add-ons, plus the new modes Until done (`/goal`), Test first, Debug and Spec first.
  - Real guards: Review/Plan block edits; Careful blocks risky commands.
  - Library with token-cost dots, per-folder default, mode files, and one-click Review/Simplify.
- **Usage:** 14-day chart (≈ estimate) and per-project list.
- **Launch material:** MIT licence, README, website (landing page and docs, local only, in site/).

## Needs the owner
1. **Name: Basanite (chosen 6 Nov), done** in the app, icon, README and site. Still to do: rename the GitHub repo and this folder, then update `site/config.mjs` (`repo`, `siteUrl`) and `package.json` `repository`. Internal names (`hangarctl`, `HANGAR_*`, `window.hangar`) are unchanged.
2. **Public repo.** Make it public (or create the final repo). Then:
   - set `brand.releases`;
   - fix `package.json` `repository` (it still points at the private personal repo);
   - add `macos-latest` back to `.github/workflows/test.yml`.
3. **Signing.** Apple notarisation and Windows signing (optional; the README explains the unsigned steps).
4. **Website deploy.** It is ready in site/ (`node site/build.mjs --serve 4377` to preview).
5. **First release.** Tag `v0.4.0`; check the Windows installer file names and `latest-mac.yml`.

## Known rough edges
- Real OS key presses (⌘K, workspace keys, Folder flyout arrows) were never tested by automation; try them by hand.
- Creating a worktree and real same-file overlap events were only unit-tested.
- History doesn't find conversations for very long folder paths.
- Snoozes don't survive a restart (on purpose).

## Website v3 (night of 5-6 Nov)
- One finished site in site/ ("Runway" palette: petrol black and amber, chosen from 6 researched schemes in site/directions/colours.html). v1 and v2 are in versions/.
- Built in 3 chunks by one designer, then a fresh review (site/REVIEW-v3.md: 2 P1, 8 P2, 22 P3), all fixed except: the two P1s need the public repo (then run `node site/build.mjs && node site/check-links.mjs`).
- Small leftovers:
  - the palette screenshot shows slivers of the app at its right edge;
  - the overview shot's sample prompt differs from the wall's;
  - E:\demo (4 tiny demo repos used for screenshots) must be deleted by hand, because the tool's safety check blocks it.

## Website v4 (6 Nov)
Full rebuild after the owner called v3 "meh": see site/DESIGN.md and site/RESEARCH-v4.md. Download buttons 404 until the repo is public and has a release.
