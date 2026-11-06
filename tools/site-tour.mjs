// Screenshots at scroll stops, silent and off screen: node tools/site-tour.mjs <outdir> <w> <h> <u,u,u...> (u = screens of scroll; 'end' = bottom)
import { createRequire } from 'node:module';
const require = createRequire('E:/AI/Claude/festival-gen/');
const { chromium } = require('playwright');
const [dir, w, h, list, url = 'http://127.0.0.1:4377/'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.USERPROFILE + '/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(2800);
for (const u of list.split(',')) {
  await p.evaluate((u) => scrollTo({ top: u === 'end' ? document.documentElement.scrollHeight : Number(u) * innerHeight, behavior: 'instant' }), u);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${dir}/t-${w}-${u}.png` });
}
console.log(await p.evaluate(() => ({ h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, iw: innerWidth })));
await b.close();
