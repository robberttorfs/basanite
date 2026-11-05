// Small page helpers: the download buttons pick this computer's build, the theme
// button flips light and dark (remembered per browser), and copy buttons copy.
(function () {
  'use strict';
  const root = document.documentElement;

  // Download: Apple silicon for any Mac (Intel sits right under it), x64 or ARM for Windows.
  // Phones, Linux and anything unknown keep "Download", which scrolls to every build.
  const ua = navigator.userAgent;
  const ud = navigator.userAgentData;
  const plat = (ud && ud.platform) || navigator.platform || '';
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (ud && ud.mobile);
  const os = mobile ? '' : /Mac/i.test(plat) ? 'mac' : /Win/i.test(plat) ? 'win' : '';
  const btns = document.querySelectorAll('[data-dl-auto]');
  const pick = (href, text) => btns.forEach((a) => { a.href = href; a.querySelector('span').textContent = text; });
  const d = btns[0] && btns[0].dataset;
  if (d && os === 'mac') pick(d.macArm, 'Download for Mac');
  if (d && os === 'win') {
    pick(d.win, 'Download for Windows');
    if (ud && ud.getHighEntropyValues) ud.getHighEntropyValues(['architecture']).then((v) => {
      if (v.architecture === 'arm') pick(d.winArm, 'Download for Windows on ARM');
    }).catch(() => {});
  }
  if (os) { const p = document.getElementById('os-' + os); if (p) p.setAttribute('data-here', ''); }

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
    if (m) m.content = now() === 'light' ? '#ebeae6' : '#0b0b0a';
  }
  for (const b of document.querySelectorAll('[data-theme-btn]')) { b.addEventListener('click', flip); b.title = 'Theme'; }
  document.addEventListener('site:theme', flip);
  label();

  // Copy
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', () => {
      const text = b.parentElement.querySelector('code').textContent;
      const done = () => { b.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
    });
    b.addEventListener('blur', () => { b.textContent = 'Copy'; });
  }
})();
