// Checks every outside link on the built site (GitHub repo, releases, downloads, Claude Code).
// Run after the repo is public and a release is out:  node site/build.mjs && node site/check-links.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const urls = new Set();
for (const f of fs.readdirSync(dist).filter((f) => f.endsWith('.html'))) {
  for (const m of fs.readFileSync(path.join(dist, f), 'utf8').matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.add(m[1]);
}
let bad = 0;
for (const u of urls) {
  let code;
  try { code = (await fetch(u, { method: 'HEAD', redirect: 'follow' })).status; } catch (e) { code = String(e.cause?.code || e.message); }
  const ok = typeof code === 'number' && code < 400;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${code} ${u}`);
}
console.log(bad ? `${bad} of ${urls.size} links failed` : `all ${urls.size} links work`);
process.exitCode = bad ? 1 : 0;
