// npm drops the executable bit on node-pty's prebuilt spawn-helper, which
// makes every terminal fail with "posix_spawnp failed". Put it back.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const f = path.join(dir, d, 'spawn-helper');
  if (fs.existsSync(f)) fs.chmodSync(f, 0o755);
}
