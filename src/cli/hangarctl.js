// hangarctl: tiny helper that talks to the running Basanite app.
//
//   hangarctl statusline          (run by Claude Code's statusline)
//   hangarctl list [--json]       one line per open session (or the raw data)
//   hangarctl screen <tile> [n]   last n lines of its terminal
//   hangarctl log <tile> [n]      last n user/Claude messages
//   hangarctl send <tile> <text>  type text into the session and press Enter
//   hangarctl folders             recent project folders
//   hangarctl open <folder> ...   open a new session (see help)
//   hangarctl answer <tile> <n>   pick option n in its question or permission menu
//   hangarctl focus <tile>        bring Basanite forward on that session
//   hangarctl modes               the modes a session can be put in
//   hangarctl mode <tile> <mode>  put a session in a mode (or "none")
//   hangarctl mode-save ...       create or update a mode (see help)
//   hangarctl hook                (run by Claude Code's SessionStart hook)
//
// Runs under Electron's bundled Node (ELECTRON_RUN_AS_NODE=1), so users do
// not need Node installed.
const fs = require('fs');
const http = require('http');
const paths = require('../shared/paths');

const args = process.argv.slice(2);

function server() {
  try { return JSON.parse(fs.readFileSync(paths.serverFile(), 'utf8')); } catch { return null; }
}

function request(method, p, body) {
  const s = server();
  if (!s) return Promise.reject(new Error('Basanite is not running.'));
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port: s.port, method, path: p.replace('TOKEN', s.token), timeout: 4000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const t = Buffer.concat(chunks).toString('utf8');
        try { resolve(t ? JSON.parse(t) : null); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Basanite did not answer.')));
    req.on('error', () => reject(new Error('Basanite is not running.')));
    if (data) req.write(data);
    req.end();
  });
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function k(n) { return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n); }

async function statusline() {
  const raw = await readStdin();
  let j = {};
  try { j = JSON.parse(raw); } catch {}
  const tile = process.env.HANGAR_TILE;
  if (tile) await request('POST', `/status/TOKEN/${tile}`, j).catch(() => {});
  const parts = [];
  if (j.model?.display_name) parts.push(j.model.display_name);
  if (j.context_window?.used_percentage != null) parts.push(`ctx ${Math.round(j.context_window.used_percentage)}%`);
  process.stdout.write(parts.join('  '));
}

/** Forwards a command hook's stdin to Basanite and prints its answer for Claude Code. */
async function hook() {
  const raw = await readStdin();
  const tile = process.env.HANGAR_TILE;
  if (!tile) return;
  let j = {};
  try { j = JSON.parse(raw); } catch {}
  const out = await request('POST', `/hook/TOKEN/${tile}`, j).catch(() => null);
  if (out) process.stdout.write(JSON.stringify(out));
}

/** --flag value pairs, the rest is positional. */
function flags(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) out[list[i].slice(2)] = list[++i] ?? '';
    else out._.push(list[i]);
  }
  return out;
}

function fail(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

async function main() {
  const [cmd, ...rest] = args;
  if (cmd === 'statusline') return statusline();
  if (cmd === 'hook') return hook();
  try {
    if (cmd === 'list') {
      const r = await request('GET', '/api/TOKEN/list');
      if (r?.error) fail(r.error);
      if (rest[0] === '--json') return console.log(JSON.stringify(r));
      if (!r.tiles.length) return console.log('No sessions open.');
      for (const [i, t] of r.tiles.entries()) {
        let line = `${i + 1}. ${t.name} [${t.status}${t.statusAge ? ` ${t.statusAge}` : ''}] ctx ${k(t.tokens.context)}/${k(t.tokens.contextSize)} out ${k(t.tokens.output + t.tokens.agentOutput)}`;
        const running = t.agents.filter((a) => a.running);
        if (running.length) line += ` | agents running: ${running.map((a) => `${a.type || 'agent'}${a.desc ? ` "${a.desc}"` : ''}`).join('; ')}`;
        if (t.timer && !t.timer.finished) line += ` | timer ${Math.max(0, Math.round(t.timer.remaining))}m left of ${t.timer.minutes}`;
        if (t.mode) line += ` | mode: ${t.mode.name}`;
        if (t.question) line += ` | asking: "${t.question.questions[0].question.slice(0, 90).replace(/\s+/g, ' ')}"`;
        if (t.error) line += ` | error: ${t.error}`;
        if (t.lastPrompt) line += ` | last prompt: "${t.lastPrompt.slice(0, 90).replace(/\s+/g, ' ')}"`;
        line += ` | ${t.cwd}`;
        console.log(line);
      }
    } else if (cmd === 'screen' || cmd === 'log') {
      if (!rest[0]) fail(`usage: hangarctl ${cmd} <tile> [n]`);
      const q = cmd === 'screen' ? `lines=${rest[1] || 30}` : `n=${rest[1] || 4}`;
      const r = await request('GET', `/api/TOKEN/${cmd}?tile=${encodeURIComponent(rest[0])}&${q}`);
      if (r?.error) fail(r.error);
      console.log(r.text);
    } else if (cmd === 'send') {
      if (rest.length < 2) fail('usage: hangarctl send <tile> <text>');
      const r = await request('POST', '/api/TOKEN/send', { tile: rest[0], text: rest.slice(1).join(' ') });
      if (r?.error) fail(r.error);
      console.log(r.text);
    } else if (cmd === 'folders') {
      const r = await request('GET', '/api/TOKEN/folders');
      if (r?.error) fail(r.error);
      console.log(r.folders.length ? r.folders.join('\n') : 'No recent folders.');
    } else if (cmd === 'open') {
      const f = flags(rest);
      if (!f._.length) fail('usage: hangarctl open <folder> [--mode <mode>] [--name <name>]');
      const r = await request('POST', '/api/TOKEN/open-session', { dir: f._.join(' '), mode: f.mode, name: f.name });
      if (r?.error) fail(r.error);
      console.log(r.text);
    } else if (cmd === 'answer' || cmd === 'focus') {
      if (!rest[0] || (cmd === 'answer' && rest.length < 2)) fail(cmd === 'answer' ? 'usage: hangarctl answer <tile> <option number | label | esc>' : 'usage: hangarctl focus <tile>');
      const r = await request('POST', `/api/TOKEN/${cmd}`, { tile: rest[0], choice: rest.slice(1).join(' ') });
      if (r?.error) fail(r.error === 'not found' ? `This Basanite is older than "hangarctl ${cmd}"; it works after Basanite restarts.` : r.error);
      console.log(r.text);
    } else if (cmd === 'modes') {
      const r = await request('GET', '/api/TOKEN/modes');
      if (r?.error) fail(r.error);
      for (const m of r.modes) {
        console.log(`${m.id}: ${m.name}${m.builtin ? '' : ' (custom)'} - ${m.description}${m.exitPhrases.length ? ` | ends on: ${m.exitPhrases.join(', ')}` : ''}`);
        if (rest[0] === '--full') console.log(m.instructions.replace(/^/gm, '    ') + '\n');
      }
    } else if (cmd === 'mode') {
      if (rest.length < 2) fail('usage: hangarctl mode <tile> <mode id or name | none>');
      const r = await request('POST', '/api/TOKEN/mode', { tile: rest[0], mode: rest.slice(1).join(' ') });
      if (r?.error) fail(r.error);
      console.log(r.text);
    } else if (cmd === 'mode-save') {
      const f = flags(rest);
      if (!f.name) fail('usage: hangarctl mode-save --name <name> [--id <id to update>] [--description <text>] [--color <hex>] [--exit "start, go"] [--instructions <text> | instructions on stdin]');
      let instructions = f.instructions;
      if (instructions == null && !process.stdin.isTTY) instructions = await readStdin();
      const r = await request('POST', '/api/TOKEN/mode-save', {
        id: f.id, name: f.name, description: f.description, color: f.color,
        exitPhrases: f.exit, instructions,
      });
      if (r?.error) fail(r.error);
      console.log(r.text);
    } else {
      console.log([
        'hangarctl list [--json]        one line per open session (--json: the raw data)',
        'hangarctl screen <tile> [n]    last n lines of its terminal (default 30)',
        'hangarctl log <tile> [n]       last n user/Claude messages (default 4)',
        'hangarctl send <tile> <text>   type text into the session and press Enter',
        'hangarctl folders              recent project folders',
        'hangarctl open <folder> [--mode M] [--name N]',
        '                               open a new session in that folder',
        'hangarctl answer <tile> <n>    pick option n (or its label, or esc) in a question card or permission menu',
        'hangarctl focus <tile>         bring Basanite forward on that session',
        'hangarctl modes [--full]       list modes (--full shows their instructions)',
        'hangarctl mode <tile> <mode>   put a session in a mode, or "none"',
        'hangarctl mode-save --name N [--id ID] [--description D] [--color #hex] [--exit "start, go"] --instructions T',
        '                               create a mode, or update one by id (instructions may come on stdin)',
        '<tile> is the number from list or part of its name.',
      ].join('\n'));
    }
  } catch (e) { fail(e.message); }
}

main();
