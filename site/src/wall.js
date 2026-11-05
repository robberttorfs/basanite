// The live tile wall. A small, honest mock of the app: sessions work, finish and ask.
// The one that asks grows and turns amber, and it waits until you answer it, like the
// real thing. The tile marked .mine is yours: the script never touches it, so it never moves.
//
// Markup it needs: <div data-wall> with an optional .mine tile and an empty .col inside.
// Optional counters anywhere in the page: [data-count="needs|working|done"].
// Motion is CSS transitions (time-based). Timers pause off screen and in hidden tabs.
// Reduced motion: one still frame, answering still works.
(function () {
  'use strict';
  const root = document.querySelector('[data-wall]');
  if (!root) return;
  const col = root.querySelector('.col');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  const WORD = { working: 'Working', needs: 'Needs you', done: 'Done', idle: 'Idle' };
  const SHAPE = { working: '●', needs: '◆', done: '✓', idle: '○' };

  // Each session loops through jobs. A job is a prompt, some steps, maybe one question,
  // and a result. Steps: [kind, text]. 'ask' pauses the session until someone answers.
  const SESSIONS = [
    { name: 'api-server', branch: 'rate-limit', mode: 'Review', jobs: [
      { you: 'review the login route before I ship it', steps: [
        ['tool', 'Read src/routes/login.ts'], ['tool', 'Grep "session" src/'], ['tool', 'Read src/auth/limits.ts'],
      ], done: 'Two findings, both small. No edits made.' },
      { you: 'and the signup route?', steps: [
        ['tool', 'Read src/routes/signup.ts'], ['tool', 'Read src/auth/hash.ts'],
      ], done: 'Looks fine. One missing rate limit.' },
    ] },
    { name: 'web-app', branch: 'main', mode: null, jobs: [
      { you: 'move the date picker to the new API', steps: [
        ['tool', 'Read src/components/DatePicker.tsx'],
        ['ask', 'Edit package.json'],
        ['tool', 'Edit src/components/DatePicker.tsx'], ['tool', 'Bash npm test -- DatePicker'],
      ], done: '12 tests passed.' },
      { you: 'now the range picker', steps: [
        ['tool', 'Read src/components/RangePicker.tsx'], ['tool', 'Edit src/components/RangePicker.tsx'],
        ['ask', 'Bash npm install date-fns@4'],
        ['tool', 'Bash npm test'],
      ], done: 'All 48 tests passed.' },
    ] },
    { name: 'scraper', branch: 'fix-timeouts', mode: 'Debug', jobs: [
      { you: 'why does the crawl stall after 200 pages?', steps: [
        ['tool', 'Read src/queue.py'], ['tool', 'Bash pytest -k stall'], ['tool', 'Read src/fetch.py'],
        ['ask', 'Edit src/fetch.py'],
        ['tool', 'Bash pytest'],
      ], done: 'The pool never released sockets. Fixed.' },
    ] },
  ];
  const ASK = (what) => [`Allow ${what.split(' ')[0]}?`, what.slice(what.indexOf(' ') + 1)];
  const OPTS = ['Yes', 'Yes, and don’t ask again', 'No, tell Claude what to do'];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = SESSIONS.map((s, i) => ({ ...s, i, job: 0, step: -1, state: 'working', lines: [], spin: 0, wait: 0 }));

  function build(s) {
    const n = document.createElement('div');
    n.className = 'tile';
    n.innerHTML =
      `<div class="th"><span class="sh" aria-hidden="true"></span><span class="nm">${s.name}</span>` +
      (s.mode ? `<span class="md">${s.mode}</span>` : '') +
      `<span class="st"></span><span class="br" aria-hidden="true">${s.branch}</span></div>` +
      `<div class="tb" aria-hidden="true"></div><div class="ask" hidden></div>`;
    s.el = n; s.tb = n.querySelector('.tb'); s.ask = n.querySelector('.ask');
    s.ask.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) answer(s, Number(b.dataset.n));
    });
    col.appendChild(n);
  }

  function line(kind, text) {
    if (kind === 'you') return `<div class="l you"><b>&gt;</b> ${esc(text)}</div>`;
    if (kind === 'tool') {
      const sp = text.indexOf(' ');
      return `<div class="l tool"><b>⏺</b> <i>${esc(text.slice(0, sp))}</i>(${esc(text.slice(sp + 1))})</div>`;
    }
    if (kind === 'ok') return `<div class="l ok"><b>⎿</b> ${esc(text)}</div>`;
    return `<div class="l">${esc(text)}</div>`;
  }

  function draw(s) {
    const n = s.el;
    n.dataset.state = s.state;
    n.querySelector('.sh').textContent = SHAPE[s.state];
    n.querySelector('.st').textContent = WORD[s.state];
    let html = s.lines.slice(-7).map(([k, t]) => line(k, t)).join('');
    if (s.state === 'working') html += `<div class="l spin"><b>${SPIN[s.spin % SPIN.length]}</b> ${s.thinking || 'Working'}…</div>`;
    s.tb.innerHTML = html;
    s.spinEl = s.tb.querySelector('.spin b');
    if (s.state === 'needs') {
      const [q, what] = ASK(s.asking);
      s.ask.innerHTML = `<p class="q">${esc(q)} <code>${esc(what)}</code></p>` +
        OPTS.map((o, k) => `<button type="button" data-n="${k + 1}" aria-label="${esc(s.name)}: ${esc(o)}"><span class="k">${k + 1}</span>${esc(o)}</button>`).join('');
      s.ask.hidden = false;
    } else if (!s.ask.hidden) {
      s.ask.hidden = true; s.ask.innerHTML = '';
    }
    counts();
  }

  function counts() {
    for (const c of document.querySelectorAll('[data-count]')) {
      const k = c.dataset.count;
      const v = S.filter((s) => s.state === k).length;
      const num = c.querySelector('.n') || c;
      num.textContent = v;
      c.toggleAttribute('data-zero', v === 0);
    }
    root.toggleAttribute('data-waiting', S.some((s) => s.state === 'needs'));
  }

  const THINK = ['Reading', 'Pondering', 'Checking', 'Tracing', 'Working'];
  // Advance one session by one step.
  function advance(s) {
    if (s.state === 'needs') return;           // it waits for you, however long that takes
    const job = s.jobs[s.job];
    if (s.state === 'done' || s.state === 'idle') {
      if (--s.wait > 0) return;
      s.job = (s.job + 1) % s.jobs.length; s.step = -1; s.state = 'working';
      s.lines.push(['you', s.jobs[s.job].you]);
      return draw(s);
    }
    s.step++;
    if (s.step === 0 && !s.lines.length) s.lines.push(['you', job.you]);
    const st = job.steps[s.step];
    if (!st) {
      s.lines.push(['ok', job.done]);
      s.state = 'done'; s.wait = 3 + s.i;
      return draw(s);
    }
    if (st[0] === 'ask') { s.asking = st[1]; s.state = 'needs'; return draw(s); }
    s.lines.push(st);
    s.thinking = THINK[(s.step + s.i) % THINK.length];
    draw(s);
  }

  function answer(s, n) {
    if (s.state !== 'needs') return;
    if (n === 3) {
      s.lines.push(['', '  No changes. Tell me what to do instead.']);
      s.state = 'idle'; s.wait = 4;
    } else {
      s.lines.push(['tool', s.asking]);
      s.lines.push(['ok', n === 2 ? 'Allowed for this session.' : 'Done.']);
      s.state = 'working';
    }
    draw(s);
    root.dispatchEvent(new CustomEvent('wall:answered', { bubbles: true }));
  }
  // For the page palette and the number keys.
  root.answerFirst = (n = 1) => { const s = S.find((x) => x.state === 'needs'); if (s) answer(s, n); return !!s; };
  root.waiting = () => S.some((s) => s.state === 'needs');

  S.forEach(build);
  // A starting frame that already has a little history in it.
  S[0].lines.push(['you', S[0].jobs[0].you], S[0].jobs[0].steps[0]); S[0].step = 0;
  S[1].lines.push(['you', S[1].jobs[0].you], S[1].jobs[0].steps[0]); S[1].step = 0;
  S[2].lines.push(['you', S[2].jobs[0].you]); S[2].step = -1;
  S.forEach(draw);

  // Number keys answer the waiting session while the wall is on screen.
  let onScreen = false;
  document.addEventListener('keydown', (e) => {
    if (!onScreen || e.metaKey || e.ctrlKey || e.altKey || !/^[123]$/.test(e.key)) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable], dialog[open]')) return;
    if (root.answerFirst(Number(e.key))) e.preventDefault();
  });

  if (still) {
    // One still frame: web-app is asking, the others are mid-work.
    S[1].asking = 'Edit package.json'; S[1].state = 'needs'; S[1].step = 1;
    S[0].lines.push(S[0].jobs[0].steps[1]);
    S.forEach(draw);
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(root);
    return;
  }

  // The clock. One step every 1.1 s, sessions take turns, so the wall changes about
  // once a second and never in a burst. The spinner glyph turns every 120 ms.
  let order = [1, 0, 2, 0, 2, 1, 0, 1, 2, 2, 0, 1], k = 0, stepT = null, spinT = null;
  function tick() { advance(S[order[k++ % order.length]]); }
  function spin() { for (const s of S) if (s.state === 'working' && s.spinEl) s.spinEl.textContent = SPIN[++s.spin % SPIN.length]; }
  function play() {
    if (stepT || !onScreen || document.hidden) return;
    stepT = setInterval(tick, 1100); spinT = setInterval(spin, 120);
  }
  function pause() { clearInterval(stepT); clearInterval(spinT); stepT = spinT = null; }
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? play() : pause(); }, { threshold: 0.05 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
})();
