// The page's motion: one ticker for Lenis, the name and the stone. Below the first screen it's a normal
// page with smooth scroll; screenshots rise in, flex slightly with scroll speed and barely lean towards the cursor.
// Everything reads the real scroll position, so it still works with Lenis off (Opera GX's own smooth scrolling).
(function () {
  'use strict';
  const root = document.documentElement;
  const fx = root.classList.contains('fx');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  /* ---------- the name fills its box ---------- */
  const mark = document.querySelector('.mark');
  function fitMark() {
    const base = mark.querySelector('.base');
    mark.style.fontSize = '100px';
    const w = base.getBoundingClientRect().width;
    mark.style.fontSize = (100 * (mark.clientWidth - 1) / w) + 'px';
  }
  const letters = [mark.querySelectorAll('.base i'), mark.querySelectorAll('.glow i')];
  const lean = new Float32Array(8);
  function setLetters(offs) {
    for (let i = 0; i < 8; i++) {
      const v = offs[i].toFixed(2) + '%';
      letters[0][i].style.setProperty('--ly', v);
      letters[1][i].style.setProperty('--ly', v);
    }
  }

  /* ---------- the stone ---------- */
  const canvas = document.getElementById('stone');
  let stone = null;
  // Touch screens scroll on their own thread, ahead of any script. There the canvas sits in the page and
  // scrolls natively; a fixed canvas moved by code would always lag behind the page.
  const hero = document.querySelector('.hero');
  const box = fx ? null : () => {
    const r = { w: hero.offsetWidth, h: hero.offsetHeight };
    canvas.style.height = r.h + 'px';
    return r;
  };
  try { stone = window.Stone && Stone.create(canvas, { small: innerWidth < 761 || !matchMedia('(pointer:fine)').matches, still: reduced, box }); } catch (e) { console.error(e); }
  if (!stone) root.classList.add('nogl');

  const camFor = () => ({ eye: [0, 11.5, 12.5], at: [0, 0.2, -4.2], fov: 38 * Math.PI / 180 });

  /* ---------- screenshots on the canvas ---------- */
  const shots = [];
  if (fx && stone) {
    for (const fig of document.querySelectorAll('[data-shot]')) {
      const pl = stone.addPlane(fig, fig.dataset.shot, { r: Number(fig.dataset.r) || 8, alpha: 0 });
      if (fig.dataset.spotBox) pl.box = fig.dataset.spotBox.split(',').map(Number);
      shots.push({ fig, pl, inView: false, shown: false, t: 0, spotOn: !!fig.dataset.spotBox });
    }
    const io = new IntersectionObserver((ens) => {
      for (const e of ens) {
        const s = shots.find((x) => x.fig === e.target);
        s.inView = e.isIntersecting;
        if (e.isIntersecting) s.shown = true;
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
    shots.forEach((s) => io.observe(s.fig));
  }
  function updateShots(dt) {
    for (const s of shots) {
      if (s.shown && s.t < 1) s.t = Math.min(1, s.t + dt / 1.1);
      const y = (1 - out3(s.t)) * 24;
      const next = y < 0.02 ? '' : `translateY(${y.toFixed(2)}px)`;
      if (s.fig.style.transform !== next) s.fig.style.transform = next;
      s.pl.alpha = s.t ? ease(s.t * 2.2) : 0;
      if (s.spotOn) {
        // The wall dims except the tile that needs you, once it's on screen; point at it to see all of it.
        const r = s.fig.getBoundingClientRect();
        const mid = (r.top + r.height / 2) / innerHeight;
        const goal = s.pl.hovOn ? 0 : (mid > 0.2 && mid < 0.72 ? 1 : 0);
        s.pl.spot = damp(s.pl.spot, goal, 3, dt);
      }
    }
  }

  // Text rises once as it comes on screen.
  if (fx) {
    const rio = new IntersectionObserver((ens) => {
      for (const e of ens) if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); }
    }, { rootMargin: '0px 0px -7% 0px' });
    document.querySelectorAll('[data-rise]').forEach((el) => rio.observe(el));
  }

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (fx && window.Lenis) lenis = new Lenis({ lerp: 0.1, autoRaf: false, smoothWheel: true });
  function go(sel) {
    const t = document.querySelector(sel);
    if (!t) return;
    const landed = () => t.focus && t.focus({ preventScroll: true });
    if (lenis) lenis.scrollTo(t, { duration: 1.4, offset: -60, easing: (x) => 1 - Math.pow(1 - x, 4), onComplete: landed });
    else { t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); landed(); }
  }
  for (const a of document.querySelectorAll('[data-to]')) a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.to); });
  // The big button scrolls to the list only when this OS couldn't be picked.
  const auto = document.querySelector('[data-dl-auto]');
  // A phone can't run it, so the button says where it goes.
  if (!root.dataset.os && innerWidth < 761) auto.querySelector('span').textContent = 'Get it for your computer';
  auto.addEventListener('click', (e) => { if (auto.getAttribute('href') === '#download') { e.preventDefault(); go('#download'); } });

  // going to the docs: the page comes up, then it changes
  const wipe = document.querySelector('.wipe');
  for (const a of document.querySelectorAll('[data-wipe]')) a.addEventListener('click', (e) => {
    if (reduced || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    wipe.classList.add('on');
    setTimeout(() => { location.href = a.href; }, 400);
  });
  addEventListener('pageshow', () => wipe.classList.remove('on'));

  const nav = document.querySelector('.nav');

  /* ---------- pointer ---------- */
  let pointer = null, inputAt = performance.now();
  addEventListener('pointermove', (e) => {
    inputAt = performance.now();
    if (e.pointerType !== 'touch') pointer = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  addEventListener('blur', () => { pointer = null; });
  ['wheel', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { inputAt = performance.now(); }, { passive: true, capture: true }));

  // the button leans a few pixels towards the cursor, no more
  const mag = document.querySelector('[data-magnet]');
  let mx = 0, my = 0, magOn = false;

  /* ---------- gold: one column asks, gets answered, and later another asks ---------- */
  // Only columns fully on screen can ask: never under the nav or the text, never past an edge, whatever the window.
  let nextAsk = 7, litSpot = null;
  function safeCells() {
    const W = innerWidth, top = mark.getBoundingClientRect().top + scrollY;
    const cta = document.querySelector('.cta').getBoundingClientRect().top + scrollY;
    const margin = Math.max(16, W * 0.05);
    return stone.cellsInside(camFor(), { left: margin, right: W - margin, top: nav.offsetHeight + 12, bottom: Math.min(top, cta) - 16 });
  }
  function askNext(first) {
    const list = safeCells();
    if (!list.length) return;
    const W = innerWidth, H = innerHeight;
    let pick;
    if (first) {
      // Opens right of centre on a wide window, in the middle on a narrow one.
      const gx = W > 760 ? W * 0.64 : W * 0.5, gy = H * 0.32;
      pick = list.reduce((a, c) => (Math.hypot(c.x - gx, c.y - gy) < Math.hypot(a.x - gx, a.y - gy) ? c : a));
    } else {
      const far = litSpot ? list.filter((c) => Math.hypot(c.x - litSpot.x, c.y - litSpot.y) > Math.min(W, H) * 0.22) : list;
      const from = far.length ? far : list;
      pick = from[Math.floor(Math.random() * from.length)];
    }
    litSpot = pick;
    stone.setGold(pick.cell);
    nextAsk = 9;
  }
  // If a resize pushes the lit column out of the safe area, another takes over.
  function recheckLit() {
    if (!stone || !litSpot) return;
    if (!safeCells().some((c) => c.cell === litSpot.cell)) askNext(true);
  }
  addEventListener('click', (e) => {
    if (!stone || !lastCam || !lit || scrollY > innerHeight * 0.3) return;
    if (e.target.closest('a,button,h1,p')) return;
    const g = stone.rayGround(e.clientX, e.clientY + scrollY, lastCam, stone.cellTop(lit) + stone.goldRise);
    if (g && Math.hypot(g.x - lit[3], g.z - lit[4]) < 1.4) askNext();
  });

  /* ---------- the ticker ---------- */
  let last = 0, intro = 0, lastCam = null, lit = null, parX = 0, parY = 0;
  let lastY = scrollY, vel = 0, drew = 0, blank = false, firstDone = false, touchY = scrollY, touchAt = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) { last = 0; return; }
    if (lenis) lenis.raf(now);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    if (intro < 1) intro = Math.min(1, intro + dt / 1.5);

    const y = scrollY, H = innerHeight, u = y / H;
    vel = damp(vel, (y - lastY) / Math.max(dt, 0.001) / 60, 18, dt);
    lastY = y;
    nav.classList.toggle('past', u > 0.75);

    if (fx && u < 1.05) {
      const r = mark.getBoundingClientRect(), offs = [];
      for (let i = 0; i < 8; i++) {
        let target = 0;
        if (pointer && pointer.y > r.top - 60 && pointer.y < r.bottom + 30) {
          const d = (pointer.x - (r.left + r.width * (i + 0.5) / 8)) / (r.width / 8);
          target = -3.5 * Math.exp(-d * d * 0.5);
        }
        lean[i] = damp(lean[i], target, 9, dt);
        offs[i] = (1 - out3(intro * 1.5 - i * 0.05)) * 105 + lean[i];
      }
      setLetters(offs);
      mark.style.setProperty('--mx', pointer ? (pointer.x - r.left) + 'px' : '-30vw');
      mark.style.setProperty('--my', pointer ? (pointer.y - r.top) + 'px' : '-30vw');
    }

    if (fx && mag) {
      let tx = 0, ty = 0;
      if (pointer && u < 0.1) {
        const r = mag.getBoundingClientRect();
        const dx = pointer.x - (r.left - mx + r.width / 2), dy = pointer.y - (r.top - my + r.height / 2);
        if (Math.abs(dx) < r.width / 2 + 30 && Math.abs(dy) < r.height / 2 + 30) { tx = clamp(dx * 0.03, -5, 5); ty = clamp(dy * 0.08, -4, 4); }
      }
      mx = damp(mx, tx, 11, dt); my = damp(my, ty, 11, dt);
      const settled = Math.abs(mx) < 0.05 && Math.abs(my) < 0.05 && !tx && !ty;
      if (settled && magOn) { mag.style.transform = ''; magOn = false; mx = my = 0; }
      else if (!settled) { mag.style.transform = `translate(${mx.toFixed(2)}px,${my.toFixed(2)}px)`; magOn = true; }
    }

    if (!stone || stone.lost()) return;
    updateShots(dt);

    // Touch: don't draw while the page is moving, so the scroll has the whole phone to itself.
    if (!fx) {
      if (y !== touchY) { touchY = y; touchAt = now; }
      if (now - touchAt < 180 || u > 1.02) return;
    }

    // Nothing to draw: the stone has gone and no screenshot is on screen. Clear once, then stop using the GPU.
    const dim = u < 1.02 ? 1 : 0; // the stone leaves with the first screen
    const planeOn = shots.some((s) => s.inView || (s.t > 0 && s.t < 1));
    if (dim <= 0.003 && !planeOn) {
      if (blank) return;
      blank = true;
    } else blank = false;

    // A still page draws less: 60 fps while something's happening, 24 when it's idle.
    const idle = now - inputAt > 6000 && intro >= 1;
    if (idle && now - drew < 41) return;
    const fdt = drew ? Math.min(0.1, (now - drew) / 1000) : 0.016;
    drew = now;

    if (u < 0.3) { nextAsk -= fdt; if (nextAsk <= 0) askNext(); }
    lit = stone.litCell();

    const cam = camFor();
    if (pointer) {
      parX = damp(parX, pointer.x / innerWidth - 0.5, 2.4, fdt);
      parY = damp(parY, pointer.y / innerHeight - 0.5, 2.4, fdt);
    }
    cam.eye = [cam.eye[0] + parX * 0.55, cam.eye[1] - parY * 0.25, cam.eye[2]];
    lastCam = cam;

    // The stone is drawn shifted up by the scroll, so the pointer is looked up at the same offset.
    const onStone = pointer && u < 1 ? { x: pointer.x, y: pointer.y + y } : null;
    stone.frame({ dt: fdt, cam, pointer: onStone, vel, dim, scrollY: fx ? y : 0, goldMask: 1, measure: !idle && firstDone });
    firstDone = true;
  }

  async function start() {
    fitMark();
    addEventListener('resize', () => { fitMark(); recheckLit(); });
    if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]); } catch (e) {} fitMark(); }
    if (stone) askNext(true);
    if (reduced) {
      setLetters(new Array(8).fill(0));
      if (stone) {
        const draw = () => stone.frame({ dt: 3, cam: camFor(), pointer: null, vel: 0, dim: 0.75, goldMask: 1, measure: false });
        draw();
        addEventListener('resize', draw);
      }
      return;
    }
    requestAnimationFrame(tick);
  }
  start();
  window.__home = { stone, go, safe: () => safeCells() };
})();
