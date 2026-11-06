// Small page helpers: the download button picks this computer's build (the head script sets
// <html data-os>), the theme button flips light and dark (remembered per browser), copy buttons copy.
(function () {
  'use strict';
  const root = document.documentElement;
  const os = root.dataset.os || '';

  // Download. Mac: Apple silicon on the button, Intel right beside it (browsers can't reliably
  // tell them apart). Windows: x64, or ARM when the browser says so. Phones, Linux and unknown
  // keep "Download", which scrolls to every build.
  const btn = document.querySelector('[data-dl-auto]');
  if (btn && os) {
    const d = btn.dataset;
    const label = (t) => { btn.querySelector('span').textContent = t; };
    if (os === 'mac') {
      btn.href = d.macArm; label('Download for Mac');
      const alt = document.querySelector('[data-intel]'); if (alt) alt.hidden = false;
    }
    if (os === 'win') {
      btn.href = d.win; label('Download for Windows');
      const ud = navigator.userAgentData;
      if (ud && ud.getHighEntropyValues) ud.getHighEntropyValues(['architecture']).then((v) => {
        if (v.architecture === 'arm') { btn.href = d.winArm; label('Download for Windows on ARM'); }
      }).catch(() => {});
    }
    // The download starts as normal; the first-launch step for this OS shows right under it.
    const reveal = () => { const n = document.querySelector(`[data-first="${os}"]`); if (n) n.hidden = false; };
    btn.addEventListener('click', reveal);
    const alt = document.querySelector('[data-intel]'); if (alt) alt.addEventListener('click', reveal);
    for (const a of document.querySelectorAll(`.builds [data-os="${os}"]`)) a.hidden = true;
    const row = document.getElementById('os-' + os); if (row) row.setAttribute('data-here', '');
  }

  // Theme
  const sys = matchMedia('(prefers-color-scheme: light)');
  const now = () => root.dataset.theme || (sys.matches ? 'light' : 'dark');
  function flip() {
    const next = now() === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    label();
  }
  function label() {
    for (const b of document.querySelectorAll('[data-theme-btn]')) b.setAttribute('aria-label', now() === 'light' ? 'Dark theme' : 'Light theme');
    const m = document.querySelector('meta[name="theme-color"]:not([media])');
    if (m) m.content = now() === 'light' ? '#f1f4f5' : '#0a1317';
  }
  for (const b of document.querySelectorAll('[data-theme-btn]')) { b.addEventListener('click', flip); b.title = 'Theme'; }
  document.addEventListener('site:theme', flip);
  label();

  // Copy (the button is aria-live, so "Copied" is announced)
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', () => {
      const text = b.parentElement.querySelector('code').textContent;
      const done = () => { b.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
    });
    b.addEventListener('blur', () => { b.textContent = 'Copy'; });
  }

  // Screenshots that pan sideways on small screens: a fade on the right edge until the end.
  for (const f of document.querySelectorAll('.shot.pan')) {
    const upd = () => f.classList.toggle('end', f.scrollLeft + f.clientWidth >= f.scrollWidth - 4);
    f.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    f.querySelectorAll('img').forEach((i) => i.addEventListener('load', upd));
    upd();
  }
})();
