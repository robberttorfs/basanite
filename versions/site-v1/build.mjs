// Builds the static site into site/dist: fills {{name}}, {{github}}, {{dl.*}} and
// {{claudeCode}} from config.mjs into src/, and copies public/ as is.
//   node site/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'src');
const pub = path.join(here, 'public');
const dist = path.join(here, 'dist');

const github = `https://github.com/${config.owner}/${config.repo}`;
const vars = {
  name: config.name,
  github,
  releases: `${github}/releases`,
  claudeCode: config.claudeCode,
  year: String(new Date().getFullYear()),
};
for (const [k, file] of Object.entries(config.artifacts)) {
  vars[`dl.${k}`] = `${github}/releases/latest/download/${file}`;
  vars[`file.${k}`] = file;
}
const fill = (text, file) => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
  if (!(key in vars)) throw new Error(`${file}: unknown {{${key}}}`);
  return vars[key];
});

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(pub, dist, { recursive: true });
for (const f of fs.readdirSync(src)) {
  const text = fs.readFileSync(path.join(src, f), 'utf8');
  fs.writeFileSync(path.join(dist, f), /\.(html|css|js|txt|xml|json)$/.test(f) ? fill(text, f) : text);
}
console.log(`built ${path.relative(process.cwd(), dist)} for "${config.name}"`);

// node site/build.mjs --serve [port]: a local preview that maps /docs to docs.html like Vercel.
const at = process.argv.indexOf('--serve');
if (at > -1) {
  const http = await import('node:http');
  const port = Number(process.argv[at + 1]) || 4321;
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    let f = path.join(dist, p);
    if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${port}/`));
}
