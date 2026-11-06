// The hero wall: every few seconds one session starts waiting on you. It grows, turns amber
// and the rest dim; then it's answered and settles. Your tile (column 1) never changes size.
// Click or tap the waiting tile to answer it. Stops off screen and in hidden tabs.
// Also: the screenshot below dims everything but its waiting tile once it's on screen.
(function () {
  'use strict';
  const wall = document.querySelector('[data-wall]');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (wall) {
    const tiles = {};
    for (const t of wall.querySelectorAll('[data-t]')) tiles[t.dataset.t] = t;
    // Only tiles in columns 2 and 3 can ask: growing a column-1 tile would move yours.
    const askers = ['web', 'api', 'infra', 'mobile'];
    let hot = null, last = null, timer = 0, visible = false, nextAt = 0, phase = 'rest';

    const setGrow = (name, on) => {
      const t = tiles[name], col = t.parentElement;
      t.style.flexGrow = on ? '2.2' : '';
      col.style.flexGrow = on ? '1.6' : '';
    };
    function ask() {
      const pool = askers.filter((n) => n !== last);
      hot = pool[Math.floor(Math.random() * pool.length)];
      setGrow(hot, true);
      tiles[hot].classList.add('hot');
      wall.classList.add('asking');
      phase = 'ask';
    }
    function answer() {
      if (!hot) return;
      const t = tiles[hot];
      t.classList.remove('hot');
      setGrow(hot, false);
      wall.classList.remove('asking');
      // it goes back to work; now and then a working tile finishes, or a done one starts again
      t.querySelector('.sh').className = 'sh work';
      const other = tiles[askers[Math.floor(Math.random() * askers.length)]];
      if (other !== t) { const sh = other.querySelector('.sh'); sh.className = sh.classList.contains('done') ? 'sh work' : 'sh done'; }
      last = hot; hot = null; phase = 'rest';
    }
    function schedule(ms) { clearTimeout(timer); nextAt = Date.now() + ms; if (visible) timer = setTimeout(step, ms); }
    function step() {
      if (phase === 'rest') { ask(); schedule(4200); } else { answer(); schedule(2600); }
    }
    wall.addEventListener('click', (e) => {
      const t = e.target.closest('.tile.hot');
      if (t) { answer(); if (still) ask(); else schedule(2600); }  // reduced motion: the next one asks at once
    });

    // start with one already waiting so the idea is there on the first frame
    ask();
    if (!still) {
      const resume = () => { clearTimeout(timer); if (visible && !document.hidden) timer = setTimeout(step, Math.max(400, nextAt - Date.now())); };
      nextAt = Date.now() + 3400;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) resume(); else clearTimeout(timer); }).observe(wall);
      document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else resume(); });
    }
  }

  const spot = document.querySelector('[data-spot]');
  if (spot) {
    if (still || !('IntersectionObserver' in window)) spot.classList.add('on');
    else {
      const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio > .5) { spot.classList.add('on'); io.disconnect(); } }, { threshold: [0, .5, 1] });
      io.observe(spot);
    }
  }
})();
