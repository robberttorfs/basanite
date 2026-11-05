// CI smoke test: the prebuilt node-pty loads under Electron's Node and can run
// a shell on this OS (ConPTY on Windows). Run with ELECTRON_RUN_AS_NODE=1.
const pty = require('node-pty');
const isWin = process.platform === 'win32';
const p = isWin
  ? pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', 'Write-Output hangar-smoke-ok'], { cols: 80, rows: 10, useConpty: true })
  : pty.spawn('/bin/sh', ['-c', 'echo hangar-smoke-ok'], { cols: 80, rows: 10 });
let out = '';
p.onData((d) => { out += d; });
p.onExit(({ exitCode }) => {
  const ok = out.includes('hangar-smoke-ok');
  console.log(ok ? 'pty smoke ok' : `pty smoke FAILED (exit ${exitCode}): ${JSON.stringify(out)}`);
  process.exit(ok ? 0 : 1);
});
setTimeout(() => { console.log('pty smoke timed out', JSON.stringify(out)); process.exit(1); }, 20000);
