// A quiet notice when an update is waiting. It stays until it is closed or acted on;
// nothing times out. Styled with the existing toast and button classes.
(() => {
  let el = null;
  const NAMES = { ready: 'Restart to update', available: 'Download update' };
  hangar.onUpdate((st) => {
    el?.remove();
    el = null;
    const label = NAMES[st && st.kind];
    if (!label) return;
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;top:auto;right:14px;bottom:14px;z-index:60';
    const text = document.createElement('span');
    text.textContent = st.version ? `Version ${st.version}` : 'Update ready';
    const go = document.createElement('button');
    go.className = 'btn small primary';
    go.textContent = label;
    go.onclick = () => { hangar.updateAction(); if (st.kind === 'available') { el.remove(); el = null; } };
    const x = document.createElement('button');
    x.className = 'btn small';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => { el.remove(); el = null; };
    el.append(text, go, x);
    document.body.appendChild(el);
  });
})();
