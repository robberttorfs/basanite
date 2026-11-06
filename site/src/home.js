// The page's motion: one ticker for Lenis, the pinned story and the stone. Everything reads the real
// scroll position, so it all still works when Lenis is off (Opera GX's own smooth scrolling, keys, scrollbar drags).
(function () {
  'use strict';
  const root = document.documentElement;
  const pinned = root.classList.contains('pin');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  /* ---------- the name fills the window, edge to edge ---------- */
  function fitMarks() {
    for (const m of document.querySelectorAll('[data-mark]')) {
      const base = m.querySelector('.base');
      const prev = base.style.display;
      base.style.display = 'inline-block';
      m.style.fontSize = '100px';
      const w = base.getBoundingClientRect().width;
      base.style.display = prev;
      const avail = m.clientWidth || innerWidth;
      // Fills the width; on a very wide window it stops growing at 44% of the height and spreads out instead.
      let size = 100 * (avail - 2) / w;
      const cap = innerHeight * 0.44 / 0.8;
      m.style.letterSpacing = '';
      if (size > cap && innerWidth > 760) {
        const em = (avail - 2 - (w / 100) * cap) / 7 / cap;
        m.style.letterSpacing = `calc(.022em + ${em.toFixed(4)}em)`;
        size = cap;
      }
      m.style.fontSize = size + 'px';
    }
  }
  const lettersOf = (m) => [m.querySelectorAll('.base i'), m.querySelectorAll('.glow i')];
  const heroMark = document.querySelector('.mark');
  const footMark = document.querySelector('.foot-mark');

  /* ---------- story timeline, in screen heights of scroll ---------- */
  const scenes = [...document.querySelectorAll('.sc')].map((el) => {
    const at = el.dataset.at.split(',').map(Number);
    const lines = [...el.querySelectorAll('.ln > span')].filter((s) => !s.closest('[data-at]:not(.sc)'));
    return { el, at, lines, shown: null };
  });
  // Pieces with their own timing inside a scene.
  const parts = [...document.querySelectorAll('.sc [data-at]')].map((el) => ({
    el, at: el.dataset.at.split(',').map(Number), lines: [...el.querySelectorAll('.ln > span')], shot: el.classList.contains('shot'),
  }));

  // Camera, by the same unit. gold = positions relative to the lit column.
  const G = { x: 4.4, z: -7.2 };
  const keys = [
    { at: 0.00, eye: [0, 11.5, 12.5], look: [0, 0.2, -4.2], fov: 38 },
    { at: 0.62, eye: [-3.4, 10, 10], look: [-0.8, 0.3, -5.5], fov: 38 },
    { at: 1.24, gold: 1, eye: [-3.4, 3.5, 6.8], look: [-2.2, 1.7, 0], fov: 38 },
    { at: 1.56, gold: 1, eye: [-2.8, 3.3, 6.1], look: [-1.9, 1.8, 0], fov: 38 },
    { at: 2.16, eye: [6, 9, 10], look: [3, 0.4, -4], fov: 42 },
    { at: 3.0, eye: [1, 16, 11], look: [1, 0, -2], fov: 42 },
    { at: 6.74, eye: [9, 13, 11], look: [8, 0, -3], fov: 42 },
    { at: 7.8, eye: [2, 4.8, 14], look: [0, 1.0, -4], fov: 42 },
    { at: 9.6, eye: [0, 7, 15], look: [0, 0.6, -3], fov: 40 },
  ];
  const dimKeys = [[0, 1], [0.5, 0.82], [2.5, 0.92], [2.9, 0.26], [6.8, 0.2], [7.3, 0.3], [9, 0.5], [99, 0.5]];
  const goldKeys = [[0, 1], [0.34, 1], [0.62, 0], [1.0, 0], [1.26, 1], [2.3, 1], [2.7, 0], [7.9, 0], [8.4, 1], [99, 1]];
  const curve = (ks, u) => {
    for (let i = 1; i < ks.length; i++) if (u <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], ease((u - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
    return ks[ks.length - 1][1];
  };

  function camAt(u, litP, stone) {
    const pos = (k, f) => {
      const v = k[f].slice();
      if (k.gold && litP) { v[0] += litP[0]; v[2] += litP[2]; }
      return v;
    };
    let a = keys[0], b = keys[keys.length - 1], t = 0;
    for (let i = 1; i < keys.length; i++) if (u <= keys[i].at) { a = keys[i - 1]; b = keys[i]; t = ease((u - a.at) / (b.at - a.at)); break; }
    if (u > keys[keys.length - 1].at) { a = b; t = 1; }
    const ea = pos(a, 'eye'), eb = pos(b, 'eye'), la = pos(a, 'look'), lb = pos(b, 'look');
    return {
      eye: [lerp(ea[0], eb[0], t), lerp(ea[1], eb[1], t), lerp(ea[2], eb[2], t)],
      at: [lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)],
      fov: lerp(a.fov, b.fov, t) * Math.PI / 180,
    };
  }

  /* ---------- scenes follow the scroll ---------- */
  let spotted = [];
  function setLines(lines, e, o) {
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i], stag = i * 0.12;
      const inn = out3((e - stag) / (1 - stag));
      const off = ease(o);
      const y = (1 - inn) * 106 - off * 106;
      const next = (inn === 1 && off === 0) ? '' : `translateY(${y.toFixed(2)}%)`;
      if (s.style.transform !== next) s.style.transform = next;
    }
  }
  function updateScenes(u, intro) {
    for (const s of scenes) {
      const [a, b, c, d] = s.at;
      const on = u >= a && u <= d;
      if (s.shown !== on) { s.el.style.visibility = on ? 'visible' : 'hidden'; s.shown = on; }
      if (!on) continue;
      const e = a < 0 ? intro : (u - a) / (b - a), o = (u - c) / (d - c);
      setLines(s.lines, clamp(e), clamp(o));
    }
    for (const p of parts) {
      const [a, b, c, d] = p.at;
      const e = clamp((u - a) / (b - a)), o = clamp((u - c) / (d - c));
      if (p.lines.length) setLines(p.lines, e, o);
      if (p.shot) {
        const y = (1 - out3(e)) * 62 + -ease(o) * 8;
        const next = y === 0 ? '' : `translateY(${y.toFixed(3)}vh)`;
        if (p.el.style.transform !== next) p.el.style.transform = next;
        p.alpha = ease(e * 3) * (1 - ease(o));
      }
    }
    // feature shots live on their scene's timing
    for (const f of shotsOwn) {
      const [a, b, c, d] = f.at;
      const e = clamp((u - a) / (b - a)), o = clamp((u - c) / (d - c));
      const x = (1 - out3(e)) * 14 - ease(o) * 5;
      const y = (1 - out3(e)) * 24 - ease(o) * 18;
      const next = (x === 0 && y === 0) ? '' : `translate(${x.toFixed(3)}vw, ${y.toFixed(3)}vh)`;
      if (f.el.style.transform !== next) f.el.style.transform = next;
      f.alpha = ease(e * 1.6) * (1 - ease(o));
    }
  }

  /* ---------- hero name: letters rise in, sink out, and lean up towards the cursor ---------- */
  const heroL = heroMark ? lettersOf(heroMark) : null;
  const footL = footMark ? lettersOf(footMark) : null;
  const lean = new Float32Array(8), footLean = new Float32Array(8);
  function setLetters(L, offs) {
    for (let i = 0; i < 8; i++) {
      const v = offs[i].toFixed(2) + '%';
      if (L[0][i]) L[0][i].style.setProperty('--ly', v);
      if (L[1][i]) L[1][i].style.setProperty('--ly', v);
    }
  }

  /* ---------- start ---------- */
  const canvas = document.getElementById('stone');
  let stone = null;
  const still = reduced || !matchMedia('(hover:hover)').matches;
  try { stone = window.Stone && Stone.create(canvas, { small: innerWidth < 761 || !matchMedia('(pointer:fine)').matches, still: reduced }); } catch (e) { console.error(e); }
  if (!stone) root.classList.add('nogl');

  // Screenshots go on the canvas only on the pinned page; plain pages keep their <img>.
  const shotsOwn = [];
  if (pinned && stone) {
    for (const fig of document.querySelectorAll('[data-shot]')) {
      const part = parts.find((p) => p.el === fig);
      const tilt = (fig.dataset.tilt || '0,0').split(',').map(Number);
      const pl = stone.addPlane(fig, fig.dataset.shot, { base: tilt, r: Number(fig.dataset.r) || 8 });
      if (fig.dataset.spotBox) { pl.box = fig.dataset.spotBox.split(',').map(Number); pl.spotAt = fig.dataset.spotAt.split(',').map(Number); }
      if (part) part.plane = pl;
      else {
        const sc = fig.closest('.sc');
        shotsOwn.push({ el: fig, at: sc.dataset.at.split(',').map(Number), plane: pl, alpha: 0 });
      }
    }
  }

  // Lenis + magnetic section edges (owner-approved spec, from the portfolio's smooth.ts): the wheel's
  // destination bends onto a resting place while the input is still happening, so it reads as one movement.
  let lenis = null, raw = null, lastInput = 0, endTimer = 0;
  const vh = () => innerHeight;
  // Where the story rests, in screens: each scene's plateau.
  function spans() {
    const H = vh();
    const out = [[0, Math.round(0.1 * H)]];
    for (const s of scenes) if (s.at[0] >= 0) out.push([Math.round(s.at[1] * H), Math.round(s.at[2] * H)]);
    const story = document.querySelector('.story');
    for (const el of document.querySelectorAll('.promises, .download')) {
      const top = el.getBoundingClientRect().top + scrollY, h = el.offsetHeight;
      if (h < H * 0.85) continue;
      out.push([Math.round(top), Math.round(top + Math.max(0, h - H))]);
    }
    return story ? out : [];
  }
  let spanList = [];
  const Zpx = () => Math.min(90, innerHeight * 0.11);
  function nearest(y) {
    let best = null, bd = 1e9;
    for (const [a, b] of spanList) {
      const e = Math.min(b, Math.max(a, y)), d = Math.abs(y - e);
      if (d === 0) return null;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function bend(y) {
    const e = nearest(y), Z = Zpx();
    if (e === null) return y;
    const u = y - e;
    if (Math.abs(u) >= Z) return y;
    const t = Math.abs(u) / Z;
    return e + Math.sign(u) * Z * t * t * (2 - t);
  }
  function snapHook(data) {
    const l = lenis;
    if (!l || !data.event.type.includes('wheel') || data.event.ctrlKey) return true;
    if (l.isStopped) { clearTimeout(endTimer); raw = null; return true; }
    const now = performance.now();
    if (raw === null || now - lastInput > 200) { raw = l.targetScroll; spanList = spans(); }
    lastInput = now;
    const asked = data.deltaY;
    raw = clamp(raw + asked, 0, l.limit);
    data.deltaY = bend(raw) - l.targetScroll;
    if (asked !== 0 && data.deltaY === 0 && data.event.cancelable) data.event.preventDefault();
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      const e = raw === null || l.isStopped ? null : nearest(raw);
      if (e !== null && raw !== null && Math.abs(raw - e) < Zpx()) l.scrollTo(e, { lerp: 0.085, force: true });
      raw = null;
    }, 130);
    return true;
  }
  if (pinned && !reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, autoRaf: false, smoothWheel: true, virtualScroll: snapHook });
  }

  // anchors and the nav's Download key
  function go(sel) {
    const t = document.querySelector(sel);
    if (!t) return;
    if (lenis) lenis.scrollTo(t, { duration: 1.5, offset: -70, easing: (x) => 1 - Math.pow(1 - x, 4), onComplete: () => t.focus && t.focus({ preventScroll: true }) });
    else { t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); if (t.focus) t.focus({ preventScroll: true }); }
  }
  for (const a of document.querySelectorAll('[data-to]')) a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.to); });
  // The big button scrolls to the list only when this OS couldn't be picked.
  const auto = document.querySelector('[data-dl-auto]');
  if (auto) auto.addEventListener('click', (e) => { if (auto.getAttribute('href') === '#download') { e.preventDefault(); go('#download'); } });

  // going to the docs: stone rises, then the page changes
  for (const a of document.querySelectorAll('[data-wipe]')) a.addEventListener('click', (e) => {
    if (reduced || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const w = document.querySelector('.wipe');
    w.classList.add('on');
    setTimeout(() => { location.href = a.href; }, 400);
  });
  addEventListener('pageshow', () => document.querySelector('.wipe').classList.remove('on'));

  // the download button leans a few pixels towards the cursor, no more (owner: buttons mustn't move much)
  const mag = document.querySelector('[data-magnet]');
  let mx = 0, my = 0, magOn = false;

  /* ---------- pointer ---------- */
  let pointer = null, inputAt = performance.now();
  addEventListener('pointermove', (e) => {
    inputAt = performance.now();
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  addEventListener('blur', () => { pointer = null; });
  ['wheel', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { inputAt = performance.now(); }, { passive: true, capture: true }));

  /* ---------- gold: one column asks, gets answered, and later another asks ---------- */
  function pickGold(near) {
    if (!stone) return;
    const p = stone.cellAt(near ? near.x : G.x, near ? near.z : G.z);
    if (p) stone.setGold(p);
  }
  let nextAsk = 7;
  const askSpots = [[4.4, -7.2], [-5.6, -8.2], [9, -9], [-1, -9.6], [1.6, -6], [-8.6, -6.6]];
  let askI = 0;
  function askNext() { askI = (askI + 1) % askSpots.length; pickGold({ x: askSpots[askI][0], z: askSpots[askI][1] }); nextAsk = 9; }
  // Click the lit column to answer it. The canvas never takes pointer events, so this looks at the point under the click.
  addEventListener('click', (e) => {
    if (!stone || !lastCam || !lit) return;
    if (e.target.closest('a,button,summary,input,figure,code,p,h1,h2,h3')) return;
    const g = stone.rayGround(e.clientX, e.clientY, lastCam, stone.cellTop(lit) + stone.goldRise);
    if (g && Math.hypot(g.x - lit[3], g.z - lit[4]) < 1.3 && curU < 0.3) askNext();
  });

  /* ---------- the ticker ---------- */
  let last = 0, intro = reduced ? 1 : 0, lastCam = null, curU = 0, lit = null, litSmooth = null;
  let lastY = scrollY, vel = 0, drew = 0, firstDone = false, footIn = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) { last = 0; return; }
    if (lenis) lenis.raf(now);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    if (intro < 1) intro = Math.min(1, intro + dt / 1.5);

    const y = scrollY;
    const pxPerFrame = (y - lastY) / Math.max(dt, 0.001) * (1 / 60);
    vel = damp(vel, pxPerFrame, 18, dt);
    lastY = y;
    const u = y / vh();
    curU = u;

    if (pinned) updateScenes(u, intro);

    if (heroL && pinned || heroL) {
      // letters rise on load, sink into the stone as the hero leaves
      const sink = pinned ? clamp((u - 0.08) / 0.3) : 0;
      const offs = [];
      const r = heroMark.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const inn = out3((intro * 1.5 - i * 0.05));
        let target = 0;
        if (pointer && pointer.y > r.top - 80 && pointer.y < r.bottom + 40) {
          const cx = r.left + r.width * (i + 0.5) / 8;
          const d = (pointer.x - cx) / (r.width / 8);
          target = -3.2 * Math.exp(-d * d * 0.5);
        }
        lean[i] = damp(lean[i], target, 9, dt);
        offs[i] = (1 - inn) * 105 + lean[i] + ease(sink * 1.3 - i * 0.04) * 105;
      }
      if (!reduced) setLetters(heroL, offs);
      if (pointer) {
        heroMark.style.setProperty('--mx', (pointer.x - r.left) + 'px');
        heroMark.style.setProperty('--my', (pointer.y - r.top) + 'px');
      } else heroMark.style.setProperty('--mx', '-30vw');
    }

    if (footMark) {
      const r = footMark.getBoundingClientRect();
      if (r.top < innerHeight) {
        footIn = Math.min(1, footIn + dt / 1.1);
        const offs = [];
        for (let i = 0; i < 8; i++) {
          let target = 0;
          if (pointer && pointer.y > r.top - 40) {
            const cx = r.left + r.width * (i + 0.5) / 8;
            const d = (pointer.x - cx) / (r.width / 8);
            target = -3.2 * Math.exp(-d * d * 0.5);
          }
          footLean[i] = damp(footLean[i], target, 9, dt);
          offs[i] = (1 - out3(footIn * 1.4 - i * 0.05)) * 105 + footLean[i];
        }
        if (!reduced) setLetters(footL, offs);
        if (pointer) {
          footMark.style.setProperty('--mx', (pointer.x - r.left) + 'px');
          footMark.style.setProperty('--my', (pointer.y - r.top) + 'px');
        }
      }
    }

    if (mag) {
      let tx = 0, ty = 0;
      if (pointer && u < 0.1) {
        const r = mag.getBoundingClientRect();
        const cx = r.left - mx + r.width / 2, cy = r.top - my + r.height / 2;
        const dx = pointer.x - cx, dy = pointer.y - cy;
        if (Math.abs(dx) < r.width / 2 + 40 && Math.abs(dy) < r.height / 2 + 40) { tx = clamp(dx * 0.05, -7, 7); ty = clamp(dy * 0.09, -5, 5); }
      }
      mx = damp(mx, tx, 11, dt); my = damp(my, ty, 11, dt);
      const settled = Math.abs(mx) < 0.05 && Math.abs(my) < 0.05 && !tx && !ty;
      if (settled && magOn) { mag.style.transform = ''; magOn = false; mx = my = 0; }
      else if (!settled) { mag.style.transform = `translate(${mx.toFixed(2)}px,${my.toFixed(2)}px)`; magOn = true; }
    }

    if (stone && !stone.lost()) {
      // a calm page draws less: 60 fps while anything is happening, 24 when it's idle
      const idle = now - inputAt > 6000 && intro >= 1;
      if (idle && now - drew < 41) return;
      const fdt = idle ? (now - drew) / 1000 : dt;
      drew = now;

      if (u < 0.26) { nextAsk -= fdt; if (nextAsk <= 0) askNext(); }
      lit = stone.litCell();
      if (lit) {
        const top = stone.cellTop(lit);
        const goal = [lit[3], top, lit[4]];
        litSmooth = litSmooth ? litSmooth.map((v, i) => damp(v, goal[i], 3, fdt)) : goal;
      }

      const cam = camAt(pinned ? u : u * 0.25, litSmooth, stone);
      // a few centimetres of parallax with the mouse
      if (pointer && !reduced) {
        const px = pointer.x / innerWidth - 0.5, py = pointer.y / innerHeight - 0.5;
        parX = damp(parX, px, 2.4, fdt); parY = damp(parY, py, 2.4, fdt);
      }
      cam.eye = [cam.eye[0] + parX * 0.55, cam.eye[1] - parY * 0.25, cam.eye[2]];
      lastCam = cam;

      for (const p of parts) if (p.plane) {
        p.plane.alpha = p.alpha === undefined ? 0 : p.alpha;
        if (p.plane.spotAt) p.plane.spot = ease((u - p.plane.spotAt[0]) / (p.plane.spotAt[1] - p.plane.spotAt[0]));
      }
      for (const f of shotsOwn) f.plane.alpha = f.alpha;

      stone.frame({
        dt: fdt, cam, pointer, vel,
        dim: pinned ? curve(dimKeys, u) : 0.55,
        goldMask: pinned ? curve(goldKeys, u) : 1,
        measure: !idle && firstDone,
      });
      firstDone = true;
    }
  }
  let parX = 0, parY = 0;

  async function start() {
    fitMarks();
    pickGold();
    addEventListener('resize', fitMarks);
    if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]); } catch (e) {} fitMarks(); }
    if (reduced) {
      const offs = new Array(8).fill(0);
      if (heroL) setLetters(heroL, offs);
      if (footL) setLetters(footL, offs);
      if (stone) {
        const cam = camAt(0);
        const draw = () => stone.frame({ dt: 3, cam, pointer: null, vel: 0, dim: 0.75, goldMask: 1, measure: false });
        draw();
        addEventListener('resize', draw);
      }
      return;
    }
    requestAnimationFrame(tick);
  }
  start();
  window.__home = { keys, stone, go };
})();
