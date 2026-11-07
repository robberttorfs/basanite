// Last few human and Claude text messages from a transcript, for the
// overseer. Tool calls, tool results and subagent lines are skipped, and
// only the tail of the file is read.
const fs = require('fs');
const { unwrapPasted } = require('../shared/pasted');

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
  return '';
}

function readLog(file, count) {
  let buf;
  try {
    const st = fs.statSync(file);
    const len = Math.min(st.size, 600 * 1024);
    const fd = fs.openSync(file, 'r');
    buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
  } catch { return null; }
  const msgs = [];
  for (const line of buf.toString('utf8').split('\n')) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.isSidechain || !j.message || (j.type !== 'user' && j.type !== 'assistant')) continue;
    if (j.isMeta) continue;
    let body = unwrapPasted(textOf(j.message.content));
    if (!body || body.startsWith('<') || body.startsWith('[Request interrupted')) continue;
    if (body.length > 600) body = body.slice(0, 600) + '…';
    msgs.push(`${j.type === 'user' ? 'USER' : 'CLAUDE'}: ${body}`);
  }
  return msgs.slice(-count).join('\n\n');
}

module.exports = { readLog };
