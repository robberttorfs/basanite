// Headless looks at the site, silent and off screen: node tools/site-look.mjs <url> <out.png> [width height] [scrollY] [wait ms]
import { createRequire } from 'node:module';
const require = createRequire('E:/AI/Claude/festival-gen/');
const { chromium } = require('playwright');
const [url, out, w = 1440, h = 900, y = 0, wait = 2500] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.USERPROFILE + '/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[')) console.log(m.text()); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(+wait);
if (+y) { await p.evaluate((y) => scrollTo(0, y), +y); await p.waitForTimeout(1200); }
await p.screenshot({ path: out });
await b.close();
