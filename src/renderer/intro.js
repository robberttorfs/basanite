/* global HangarCommands, HangarClaudeCheck, HangarModes, ICON, hangar, h, $, esc, openPop, closePop, isMac */
// The short intro: shown once on the very first launch, and any time from Help. One screen says
// what the app is and what to do, and leads straight to the first real action, choosing a folder.
// A second page, only if asked for, lists what else it does. tips.js teaches the rest in place.
'use strict';

(function (root) {
  // ---------- the steps (pure, tested in test/intro.test.js) ----------

  const welcome = {
    img: 'wall.webp',
    alt: 'Four session tiles. The web-app tile has an amber edge and says Needs you.',
    title: 'Run all your Claude Code sessions in one window',
    steps: [
      'Choose a project folder. A session opens there.',
      'Type to Claude as you would in a terminal. Your login, skills and commands all work.',
      'Start more. The one that needs you grows and turns amber.',
    ],
  };
  const features = (mac) => {
    const key = (m, w) => (mac ? m : w);
    return [
      { name: 'Overview', icon: 'grid', text: 'Every session in one list, what needs you first', keys: key('⇧⌘A', 'Ctrl+Shift+A') },
      { name: 'Modes', icon: 'map', text: 'Plan, Build, Review, or make your own', keys: key('⇧⌘M', 'Ctrl+Shift+M') },
      { name: 'Workspaces', icon: 'layers', text: 'Group sessions and switch between them' },
      { name: 'Overseer', icon: 'eye', text: "Manages your sessions. Ask what's going on or have it instruct them", keys: key('⇧⌘O', 'Ctrl+Shift+O') },
      { name: 'Fresh start', icon: 'loop', text: 'Clear the context and carry on from a handover' },
      { name: 'Palette', icon: 'search', text: 'Find any session, mode or action', keys: key('⌘K', 'Ctrl+Shift+K') },
    ];
  };
  const pure = { welcome, features };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---------- the window ----------

  function open() {
    const el = h('div', 'pop modal intro-pop');
    el.setAttribute('aria-label', 'Introduction');
    el.innerHTML = `<button class="hbtn in-close" aria-label="Close" title="Close"><svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button>
      <div class="in-page in-welcome">
        <div class="in-shot"><img src="intro/${welcome.img}" alt="${esc(welcome.alt)}"></div>
        <div class="in-text"><h2>${esc(welcome.title)}</h2>
          <ol>${welcome.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      </div>
      <div class="in-page in-features" hidden>
        <h2>What else it does</h2>
        <div class="in-rows">${features(isMac).map((f) => `<div class="in-row"><span class="in-ic" aria-hidden="true">${ICON[f.icon] || HangarModes.icon({ icon: f.icon })}</span><b>${esc(f.name)}</b><p>${esc(f.text)}</p>${f.keys ? `<kbd class="in-key">${esc(f.keys)}</kbd>` : ''}</div>`).join('')}</div>
      </div>
      <div class="in-foot">
        <button class="btn in-more" data-swap></button>
        <button class="btn primary" data-go>Choose a folder</button>
      </div>`;
    const swap = $('[data-swap]', el), go = $('[data-go]', el);
    const pageA = $('.in-welcome', el), pageB = $('.in-features', el);
    const show = (more) => {
      pageA.hidden = more; pageB.hidden = !more;
      swap.textContent = more ? 'Back' : 'See what else it does';
    };
    swap.onclick = () => show(pageB.hidden);
    $('.in-close', el).onclick = () => closePop();
    go.onclick = () => { closePop(); HangarCommands.run('session.new'); };
    openPop(el, null);
    show(false);
    go.focus();
  }

  root.HangarIntro = { open, ...pure };

  HangarCommands.register([
    { id: 'app.intro', label: 'Show intro', group: 'App', icon: 'info', aliases: ['tour', 'welcome', 'tutorial', 'help', 'getting started'],
      menu: { menu: 'Help' }, run: () => open() },
  ]);

  // First launch only; the main process remembers, so it never comes back by itself.
  // Without Claude Code the intro's first step can't work, so the warning comes first and the
  // intro waits for a launch where it can.
  HangarClaudeCheck.atLaunch().then((missing) => {
    if (!missing) hangar.introFirst().then((first) => { if (first) open(); });
  });
})(typeof window !== 'undefined' ? window : globalThis);
