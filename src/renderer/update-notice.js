// A quiet notice when an update is waiting. It stays until it is closed or acted on;
// nothing times out. Styled with the existing toast and button classes.
/* global hangar, esc, windowNotice */
(() => {
  let el = null;
  const NAMES = { ready: 'Restart to update', available: 'Download update' };
  hangar.onUpdate((st) => {
    el?.remove();
    el = null;
    if (st && st.kind === 'installing') {
      const cover = document.createElement('div');
      cover.className = 'update-cover';
      cover.textContent = 'Updating';
      document.body.appendChild(cover);
      return;
    }
    const label = NAMES[st && st.kind];
    if (!label) return;
    // The app's one window notice (app.js windowNotice): in the top bar, same look as every other.
    const text = esc(st.version ? `Version ${st.version}` : 'Update ready');
    el = windowNotice(text, [[label, () => { hangar.updateAction(); if (st.kind !== 'available') return false; el = null; return true; }, true]], 'update');
  });
})();
