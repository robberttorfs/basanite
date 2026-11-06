// A small ⌘K palette for the page, like the app's. Rows come from <template id="cmds">:
// links go where they point, buttons with data-act run an action here.
// Opens with ⌘K / Ctrl+K (and Ctrl+Shift+K, the app's own key on Windows), or any
// [data-palette] button. The download row for this computer (data-os) comes first.
(function () {
  'use strict';
  const tpl = document.getElementById('cmds');
  const dlg = document.getElementById('cmdk');
  if (!tpl || !dlg) return;
  const input = dlg.querySelector('input');
  const list = dlg.querySelector('.rows');
  const os = document.documentElement.dataset.os || '';
  const isMac = os === 'mac' || (!os && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  for (const k of document.querySelectorAll('[data-mod]')) k.textContent = isMac ? '⌘' : 'Ctrl';
  if (!isMac) for (const k of document.querySelectorAll('kbd[data-win]')) k.textContent = k.dataset.win;

  const rows = [...tpl.content.children].map((n) => {
    const r = n.cloneNode(true);
    r.classList.add('row');
    r.setAttribute('role', 'option');
    r.tabIndex = -1;
    return r;
  });
  if (os) rows.sort((a, b) => (b.dataset.os === os) - (a.dataset.os === os));
  rows.forEach((r) => list.appendChild(r));
  let sel = 0;
  const shown = () => rows.filter((r) => !r.hidden);

  function mark() {
    const v = shown();
    v.forEach((r, i) => r.setAttribute('aria-selected', i === sel ? 'true' : 'false'));
    if (v[sel]) { v[sel].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', v[sel].id || ''); }
    dlg.querySelector('.none').hidden = v.length > 0;
  }
  function filter() {
    const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const r of rows) {
      const hay = (r.textContent + ' ' + (r.dataset.also || '')).toLowerCase();
      r.hidden = !q.every((w) => hay.includes(w));
    }
    sel = 0; mark();
  }

  let back = null;
  function run(r) {
    const act = r.dataset.act;
    if (act === 'theme') { close(); document.dispatchEvent(new CustomEvent('site:theme')); return; }
    if (!r.href) return close();
    if (r.hash && r.pathname === location.pathname) {
      const t = document.querySelector(r.hash);
      if (t) { if (!t.hasAttribute('tabindex')) t.tabIndex = -1; back = t; }
      close();
      if (t) t.scrollIntoView();
      history.replaceState(null, '', r.hash);
    } else { close(); location.href = r.href; }
  }
  function open() {
    if (dlg.open) return;
    back = document.activeElement;
    input.value = ''; filter();
    dlg.showModal();
    input.focus();
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => { if (back && back.focus) back.focus({ preventScroll: true }); });

  rows.forEach((r, i) => { r.id = 'cmd-' + i; r.addEventListener('click', (e) => { e.preventDefault(); run(r); }); });
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    const v = shown();
    if (e.key === 'ArrowDown') { sel = Math.min(v.length - 1, sel + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (v[sel]) run(v[sel]); e.preventDefault(); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? close() : open(); }
  });
  for (const b of document.querySelectorAll('[data-palette]')) b.addEventListener('click', open);
})();
