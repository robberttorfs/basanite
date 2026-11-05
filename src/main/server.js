// Local HTTP server on 127.0.0.1. Claude Code's HTTP hooks post here, the
// statusline helper posts here, and hangarctl (used by the overseer) reads
// and sends through here. Every path carries a random token.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const paths = require('../shared/paths');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size < 4e6) chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); }
    });
  });
}

/**
 * handlers: { hook(tileId, body), statusline(tileId, body), list(), screen(tile, lines), log(tile, n), send(tile, text) }
 * Each handler may return a value or a promise. Errors become { error }.
 */
function startServer(handlers) {
  const token = crypto.randomBytes(16).toString('hex');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(obj == null ? '' : JSON.stringify(obj));
    };
    if (parts[1] !== token) return reply(403, { error: 'bad token' });
    try {
      const kind = parts[0];
      if (kind === 'hook' && req.method === 'POST') {
        const out = await handlers.hook(parts[2], await readBody(req));
        return reply(200, out);   // empty body = no effect on the session
      }
      // curl from the statusline: record it and answer with the text to show.
      if (kind === 'statusline' && req.method === 'POST') {
        const text = await handlers.statusline(parts[2], await readBody(req));
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(text || '');
      }
      if (kind === 'status' && req.method === 'POST') {
        await handlers.statusline(parts[2], await readBody(req));
        return reply(200, null);
      }
      if (kind === 'api') {
        const cmd = parts[2];
        const q = Object.fromEntries(url.searchParams);
        if (cmd === 'list') return reply(200, await handlers.list());
        if (cmd === 'screen') return reply(200, await handlers.screen(q.tile, Number(q.lines) || 30));
        if (cmd === 'log') return reply(200, await handlers.log(q.tile, Number(q.n) || 4));
        if (cmd === 'shot' && handlers.shot) return reply(200, await handlers.shot(q.file));
        if (cmd === 'key' && handlers.key) return reply(200, await handlers.key(q.key, q.mods));
        if (cmd === 'menu' && handlers.menu) return reply(200, await handlers.menu(q.accel));
        if (cmd === 'js' && handlers.js) return reply(200, await handlers.js(q.code));
        if (cmd === 'open' && handlers.open) return reply(200, await handlers.open(q.dir, q.timer));
        if (cmd === 'detach' && req.method === 'POST' && handlers.detach) return reply(200, await handlers.detach(q.tile));
        if (cmd === 'modes') return reply(200, await handlers.modes());
        if ((cmd === 'mode' || cmd === 'mode-save') && req.method === 'POST') {
          return reply(200, await handlers[cmd === 'mode' ? 'mode' : 'modeSave'](await readBody(req)));
        }
        if (cmd === 'send' && req.method === 'POST') {
          const b = await readBody(req);
          return reply(200, await handlers.send(b.tile, b.text));
        }
      }
      reply(404, { error: 'not found' });
    } catch (e) {
      reply(200, { error: String(e.message || e) });
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const info = { port: server.address().port, token, pid: process.pid };
      fs.mkdirSync(paths.dataDir(), { recursive: true });
      fs.writeFileSync(paths.serverFile(), JSON.stringify(info), { mode: 0o600 });
      resolve({ ...info, close: () => server.close() });
    });
  });
}

module.exports = { startServer };
