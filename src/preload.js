const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('hangar', {
  init: () => ipcRenderer.invoke('init'),
  recent: () => ipcRenderer.invoke('recent'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  saveImage: (bytes, type) => ipcRenderer.invoke('image:save', { bytes, type }),

  create: (cwd, mode, sessionMode) => ipcRenderer.invoke('tile:create', { cwd, mode, sessionMode }),
  setMode: (id, mode) => ipcRenderer.send('tile:mode', { id, mode }),
  setColor: (id, color) => ipcRenderer.send('tile:color', { id, color }),
  setLock: (id, lock) => ipcRenderer.send('tile:lock', { id, lock }),
  saveMode: (m) => ipcRenderer.invoke('modes:save', m),
  deleteMode: (id) => ipcRenderer.send('modes:delete', id),
  resetMode: (id) => ipcRenderer.invoke('modes:reset', id),
  input: (id, data) => ipcRenderer.send('tile:input', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('tile:resize', { id, cols, rows }),
  close: (id) => ipcRenderer.send('tile:close', id),
  restart: (id) => ipcRenderer.send('tile:restart', id),
  rename: (id, name) => ipcRenderer.send('tile:rename', { id, name }),
  pin: (id) => ipcRenderer.send('tile:pin', id),
  move: (id, to) => ipcRenderer.send('tile:move', { id, to }),
  setTimer: (id, minutes) => ipcRenderer.send('tile:timer', { id, minutes }),
  focus: (id) => ipcRenderer.send('tile:focus', id),
  dialog: (id, open) => ipcRenderer.send('tile:dialog', { id, open }),
  screenReply: (req, text) => ipcRenderer.send('screen:reply', { req, text }),

  chatOpen: (id) => ipcRenderer.invoke('chat:open', id),
  chatClose: (id) => ipcRenderer.send('chat:close', id),
  onChat: on('chat:items'),

  overseerStart: () => ipcRenderer.send('overseer:start'),
  overseerInput: (d) => ipcRenderer.send('overseer:input', d),
  overseerResize: (cols, rows) => ipcRenderer.send('overseer:resize', { cols, rows }),
  overseerRestart: () => ipcRenderer.send('overseer:restart'),
  reopen: () => ipcRenderer.send('tile:reopen'),
  freshStart: (id) => ipcRenderer.send('tile:fresh', id),
  overseerAsk: (text) => ipcRenderer.send('overseer:ask', text),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  zoom: (dir) => ipcRenderer.send('ui:zoom', dir),
  openMenu: (x, y) => ipcRenderer.send('menu:popup', { x, y }),
  font: (dir) => ipcRenderer.send('ui:font', dir),
  setMenu: (spec) => ipcRenderer.send('menu:set', spec),
  onCommand: on('cmd:run'),

  onState: on('state'),
  onData: on('tile:data'),
  onClear: on('tile:clear'),
  onModeEnded: on('tile:mode-ended'),
  onNotice: on('tile:notice'),
  onFocus: on('tile:focus'),
  onFocusIndex: on('tile:focus-index'),
  onScreenRequest: on('screen:request'),
  onOverseerData: on('overseer:data'),
  onOverseerClear: on('overseer:clear'),
  platform: process.platform,
});
