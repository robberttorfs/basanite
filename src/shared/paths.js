// Paths shared by the app and the hangarctl helper. No Electron imports here,
// because hangarctl runs as plain Node.
const os = require('os');
const path = require('path');
const brand = require('./brand');

function dataDir() {
  if (process.env.HANGAR_DATA_DIR) return process.env.HANGAR_DATA_DIR;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', brand.name);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), brand.name);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), brand.name);
}

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

module.exports = {
  dataDir,
  claudeDir,
  serverFile: () => path.join(dataDir(), 'server.json'),
  workspaceFile: () => path.join(dataDir(), 'workspace.json'),
  settingsFile: () => path.join(dataDir(), 'settings.json'),
  modesFile: () => path.join(dataDir(), 'modes.json'),
  tileDir: (id) => path.join(dataDir(), 'tiles', id),
  binDir: () => path.join(dataDir(), 'bin'),
  overseerDir: () => path.join(dataDir(), 'overseer'),
};
