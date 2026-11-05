// The hero's live tile wall: a calm mock of the app. The left tile is "yours" and never
// moves; on the right, sessions work, finish and ask, and the one that needs you grows.
// Reduced motion shows one still frame. It pauses when off screen or in a hidden tab.
(function () {
  'use strict';
  const root = document.getElementById('wall');
  if (!root) return;

  const WORD = { working: 'Working', needs: 'Needs you', done: 'Done', idle: '' };

  // Each tile: name, branch, mode, and a script of terminal lines it plays while working.
  const tiles = {
    you: { name: 'portfolio', br: 'main', mode: 'Build', state: 'working', lines: [
      ['you', 'make the projects grid two columns on tablets'],
      ['tool', 'Read src/styles/grid.css'],
      ['tool', 'Edit src/styles/grid.css'],
      ['', '  Added a 768px breakpoint with two columns.'],
      ['tool', 'Bash npm run build'],
      ['ok', '  Built in 2.1s'],
    ], doing: 'Editing grid.css' },
    api: { name: 'api-server', br: 'rate-limit', mode: 'Review', state: 'working', lines: [
      ['you', 'review the login route before I ship it'],
      ['tool', 'Read src/routes/login.ts'],
      ['tool', 'Grep "session" src/'],
      ['tool', 'Read src/auth/limits.ts'],
    ], doing: 'Reading limits.ts' },
    web: { name: 'web-app', br: 'main', mode: null, state: 'working', lines: [
      ['you', 'update the date picker to the new API'],
      ['tool', 'Read src/components/DatePicker.tsx'],
      ['tool', 'Bash npm test -- DatePicker'],
    ], doing: 'Running tests' },
    notes: { name: 'settings', br: 'main', mode: 'Plan', state: 'idle', lines: [
      ['you', 'how should we split the settings page?'],
      ['', '  Three options above. Nothing changed yet.'],
    ], doing: '' },
  };
  const ASK = [
    ['ask', 'Do you want to make this edit to package.json?'],
    ['opt sel', '❯ 1. Yes'],
    ['opt', '  2. Yes, and don\'t ask again this session'],
    ['opt', '  3. No, and tell Claude what to do differently'],
  ];

  // The loop. Each step changes one thing, a few seconds apart.
  const STEPS = [
    () => { set('web', 'needs'); },
    () => { push('you'); push('api'); },
    () => { set('api', 'done', [['', '  Two findings, both small. Details above.']]); },
    () => { push('you'); },
    () => { answer('web'); },
    () => { push('web'); push('you'); },
    () => { set('web', 'done', [['ok', '  12 tests passed']]); },
    () => { reset(); },
  ];

  const el = {};
  const shown = {};   // how many script lines each tile shows
  const extra = {};   // lines added by state changes

  function chip(mode) {
    if (!mode) return '';
    return `<span class="chip m-${mode.toLowerCase()}">${mode}</span>`;
  }
  function build() {
    const grid = document.createElement('div');
    grid.className = 'grid';
    const col = document.createElement('div');
    col.className = 'col';
    for (const id of Object.keys(tiles)) {
      const t = tiles[id];
      const n = document.createElement('div');
      n.className = 'tile' + (id === 'you' ? ' focused' : '');
      n.innerHTML = `<div class="head"><span class="sh"></span><span class="nm">${t.name}</span>${chip(t.mode)}<span class="st"></span>${t.br ? `<span class="br">${t.br}</span>` : ''}</div><div class="term"></div><div class="doing"></div>`;
      el[id] = n;
      (id === 'you' ? grid : col).appendChild(n);
    }
    grid.appendChild(col);
    root.querySelector('.grid-slot').replaceWith(grid);
  }

  function draw(id) {
    const t = tiles[id], n = el[id];
    n.className = `tile s-${t.state}${id === 'you' ? ' focused' : ''}${t.state === 'needs' ? ' needs' : ''}`;
    n.querySelector('.st').textContent = WORD[t.state];
    const lines = t.lines.slice(0, shown[id]).concat(extra[id] || []);
    const term = n.querySelector('.term');
    term.innerHTML = lines.slice(-9).map(([c, s]) => `<div class="${c}">${esc(s)}</div>`).join('');
    keepBottom();
    const doing = n.querySelector('.doing');
    doing.textContent = t.state === 'working' ? t.doing : '';
    doing.hidden = !doing.textContent;
  }
  // Like a terminal: when lines don't fit, the newest stay in view. Again after tiles resize.
  let settle = null;
  function keepBottom() {
    const all = () => root.querySelectorAll('.term').forEach((t) => { t.scrollTop = t.scrollHeight; });
    all(); clearTimeout(settle); settle = setTimeout(all, 320);
  }
  function counts() {
    const all = Object.values(tiles);
    const c = (s) => all.filter((t) => t.state === s).length;
    const needs = root.querySelector('.n-needs');
    needs.hidden = !c('needs');
    needs.lastChild.textContent = ` ${c('needs')} needs you`;
    root.querySelector('.n-working').lastChild.textContent = ` ${c('working')} working`;
    root.querySelector('.n-done').lastChild.textContent = ` ${c('done')} done`;
  }
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function set(id, state, add) {
    tiles[id].state = state;
    if (state === 'needs') extra[id] = ASK.slice();
    else if (add) extra[id] = (extra[id] || []).concat(add);
    draw(id); counts();
  }
  function push(id) {
    const t = tiles[id];
    if (shown[id] < t.lines.length) { shown[id]++; draw(id); }
  }
  function answer(id) {
    extra[id] = [['you', '1'], ['tool', 'Edit package.json']];
    set(id, 'working');
  }
  function reset() {
    const start = { you: 3, api: 2, web: 2, notes: 2 };
    for (const id of Object.keys(tiles)) {
      tiles[id].state = id === 'notes' ? 'idle' : 'working';
      shown[id] = start[id];
      extra[id] = [];
      draw(id);
    }
    counts();
  }

  build();
  reset();

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  if (still.matches) { set('web', 'needs'); set('api', 'done', [['', '  Two findings, both small.']]); return; }

  let step = 0, timer = null, visible = false;
  const tick = () => { STEPS[step](); step = (step + 1) % STEPS.length; };
  const play = () => { if (!timer && visible && !document.hidden) timer = setInterval(tick, 2600); };
  const pause = () => { clearInterval(timer); timer = null; };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : pause(); }, { threshold: 0.2 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  still.addEventListener?.('change', (e) => { if (e.matches) pause(); });
})();
