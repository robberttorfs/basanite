/* global HangarCommands, hangar, h, $, openPop, closePop, isMac */
// The short intro: shown once on the very first launch, and any time from Help. Four real
// screenshots, one idea each, skippable from anywhere. It ends on the first real action,
// choosing a folder, rather than on a "you're all set" screen.
'use strict';

(function (root) {
  // ---------- the steps (pure, tested in test/intro.test.js) ----------

  const steps = (mac) => {
    const key = (m, w) => (mac ? m : w);
    return [
      { img: 'wall.webp', title: 'Every session is a tile', text: 'Each one runs the real claude command. The one that needs you grows and turns amber.', alt: 'Four session tiles. The web-app tile has an amber edge and says Needs you.' },
      { img: 'overview.webp', title: 'See them all in one list', text: 'Whatever needs you comes first. Press 1, 2 or 3 to answer from there.', keys: key('⇧⌘A', 'Ctrl+Shift+A'), alt: 'The overview: sessions listed by status, with a permission menu in the preview.' },
      { img: 'modes.webp', title: 'Modes change how Claude works', text: 'Plan, Build, Review, or make your own.', keys: key('⇧⌘M', 'Ctrl+Shift+M'), alt: 'The mode menu: Notes, Plan, Build, Overnight, Review, Careful and Until done.' },
      { img: 'palette.webp', title: 'Find anything from one key', text: 'Any session, workspace, mode or action.', keys: key('⌘K', 'Ctrl+Shift+K'), alt: 'The command palette listing session actions with their shortcuts.' },
    ];
  };
  const clamp = (i, n) => Math.max(0, Math.min(n - 1, i));
  const pure = { steps, clamp };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- the window ----------

  function open(start = 0) {
    const list = steps(isMac);
    list.forEach((s) => { new Image().src = `intro/${s.img}`; });  // no flash between steps
    let at = clamp(start, list.length);
    const el = h('div', 'pop modal intro-pop');
    el.setAttribute('aria-label', 'Introduction');
    el.innerHTML = `<div class="in-shot"><img alt=""></div>
      <div class="in-text"><h2></h2><p><span class="in-words"></span> <kbd class="in-key" hidden></kbd></p></div>
      <div class="in-foot">
        <button class="in-skip" data-skip>Skip</button>
        <div class="in-dots">${list.map((s, i) => `<button data-to="${i}" aria-label="Step ${i + 1} of ${list.length}: ${s.title}"></button>`).join('')}</div>
        <div class="in-nav"><button class="btn" data-back>Back</button><button class="btn primary" data-next>Next</button></div>
      </div>`;
    const img = $('img', el), title = $('h2', el), words = $('.in-words', el), keyEl = $('.in-key', el);
    const back = $('[data-back]', el), next = $('[data-next]', el), skip = $('[data-skip]', el);
    const draw = () => {
      const s = list[at], last = at === list.length - 1;
      img.src = `intro/${s.img}`; img.alt = s.alt;
      title.textContent = s.title;
      words.textContent = s.text;
      keyEl.textContent = s.keys || ''; keyEl.hidden = !s.keys;
      back.style.visibility = at ? '' : 'hidden';
      skip.style.visibility = last ? 'hidden' : '';
      next.textContent = last ? 'Choose a folder' : 'Next';
      el.querySelectorAll('[data-to]').forEach((b, i) => {
        b.classList.toggle('on', i === at);
        if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      // A short fade, restarted for each step; the size never changes, so nothing jumps.
      el.classList.remove('in-fade'); void el.offsetWidth; el.classList.add('in-fade');
    };
    const go = (i) => { at = clamp(i, list.length); draw(); next.focus(); };
    const forward = () => {
      if (at < list.length - 1) return go(at + 1);
      closePop();
      HangarCommands.run('session.new');
    };
    next.onclick = forward;
    back.onclick = () => go(at - 1);
    skip.onclick = () => closePop();
    el.querySelectorAll('[data-to]').forEach((b) => { b.onclick = () => go(Number(b.dataset.to)); });
    openPop(el, null, {
      onKey: (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); if (at < list.length - 1) go(at + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      },
    });
    draw();
    next.focus();
  }

  root.HangarIntro = { open, ...pure };

  HangarCommands.register([
    { id: 'app.intro', label: 'Show intro', group: 'App', icon: 'info', aliases: ['tour', 'welcome', 'tutorial', 'help', 'getting started'],
      menu: { menu: 'Help' }, run: () => open() },
  ]);

  // First launch only; the main process remembers, so it never comes back by itself.
  hangar.introFirst().then((first) => { if (first) open(); });
})(typeof window !== 'undefined' ? window : globalThis);
