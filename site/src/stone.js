// The one 3D moment: a field of black stone columns on one fixed canvas, lit by the cursor, with
// one column in gold. The screenshots are drawn on the same canvas as planes synced to their real
// <img>, so they can bend with scroll speed. Plain WebGL2, no libraries.
// home.js drives it: Stone.frame({ dt, cam, dim, goldMask, pointer, vel }).
(function () {
  'use strict';

  const BG = [8 / 255, 9 / 255, 11 / 255];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  /* ---------- the field: irregular columns, like real columnar basalt ---------- */
  function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

  function clipPoly(poly, px, pz, qx, qz) {
    // keep the side of the bisector of p and q that holds p
    const mx = (px + qx) / 2, mz = (pz + qz) / 2, nx = qx - px, nz = qz - pz;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - mz) * nz, db = (b[0] - mx) * nx + (b[1] - mz) * nz;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function buildField(small) {
    const r = rng(7331), step = 1.72, rowH = step * 0.87;
    const X = small ? 15 : 30, Zn = small ? -18 : -36, Zp = small ? 10 : 16;
    const pts = [];
    let row = 0;
    for (let z = Zn; z <= Zp; z += rowH, row++) {
      for (let x = -X + (row % 2 ? step / 2 : 0); x <= X; x += step) {
        pts.push([x + (r() - 0.5) * step * 0.62, z + (r() - 0.5) * rowH * 0.62, r()]);
      }
    }
    // grid lookup for neighbours and for "which column is under the cursor"
    const cell = 3.6, grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
    pts.forEach((p, i) => { const k = key(p[0], p[1]); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const near = (x, z) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell), res = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const g = grid.get((cx + a) + ':' + (cz + b)); if (g) res.push(...g); }
      return res;
    };

    const data = [];
    const push = (x, y, z, nx, ny, nz, c, e) => data.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], e);
    const CHAMFER = 0.07, DEPTH = 11;
    pts.forEach((p, id) => {
      let poly = [[p[0] - 4, p[1] - 4], [p[0] + 4, p[1] - 4], [p[0] + 4, p[1] + 4], [p[0] - 4, p[1] + 4]];
      for (const j of near(p[0], p[1])) if (j !== id) poly = clipPoly(poly, p[0], p[1], pts[j][0], pts[j][1]);
      if (poly.length < 3) return;
      let cx = 0, cz = 0; for (const v of poly) { cx += v[0]; cz += v[1]; } cx /= poly.length; cz /= poly.length;
      p[3] = cx; p[4] = cz;
      const c = [cx, cz, p[2]];
      const outer = poly.map((v) => [cx + (v[0] - cx) * 0.965, cz + (v[1] - cz) * 0.965]);
      const inner = poly.map((v) => [cx + (v[0] - cx) * 0.875, cz + (v[1] - cz) * 0.875]);
      // clipPoly keeps the winding of the start square; n points outwards for each edge
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const a = outer[i], b = outer[j], ia = inner[i], ib = inner[j];
        let ex = b[0] - a[0], ez = b[1] - a[1];
        let nx = ez, nz = -ex; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if ((a[0] - cx) * nx + (a[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
        // top: fan from the centre
        push(cx, 0, cz, 0, 1, 0, c, 0); push(ia[0], 0, ia[1], 0, 1, 0, c, 0.8); push(ib[0], 0, ib[1], 0, 1, 0, c, 0.8);
        // chamfer: catches the light
        const sn = Math.hypot(nx, 1), cnx = nx / sn, cny = 1 / sn, cnz = nz / sn;
        push(ia[0], 0, ia[1], cnx, cny, cnz, c, 0.8); push(a[0], -CHAMFER, a[1], cnx, cny, cnz, c, 1); push(b[0], -CHAMFER, b[1], cnx, cny, cnz, c, 1);
        push(ia[0], 0, ia[1], cnx, cny, cnz, c, 0.8); push(b[0], -CHAMFER, b[1], cnx, cny, cnz, c, 1); push(ib[0], 0, ib[1], cnx, cny, cnz, c, 0.8);
        // side
        push(a[0], -CHAMFER, a[1], nx, 0, nz, c, 1); push(a[0], -DEPTH, a[1], nx, 0, nz, c, 1); push(b[0], -DEPTH, b[1], nx, 0, nz, c, 1);
        push(a[0], -CHAMFER, a[1], nx, 0, nz, c, 1); push(b[0], -DEPTH, b[1], nx, 0, nz, c, 1); push(b[0], -CHAMFER, b[1], nx, 0, nz, c, 1);
      }
    });
    return { verts: new Float32Array(data), pts, near };
  }

  /* ---------- shaders ---------- */
  const heightGL = `
    float cellH(vec2 c, float s) {
      return 0.5 * sin(c.x * 0.31 + 1.3) * cos(c.y * 0.26 - 0.4) + s * s * 1.0;
    }`;
  const heightJS = (x, z, s) => 0.5 * Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.26 - 0.4) + s * s * 1.0;
  const GOLD_RISE = 1.5;

  const fieldVS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCell; layout(location=3) in float aEdge;
  uniform mat4 uVP; uniform float uT, uIntro; uniform vec3 uCur; uniform vec4 uG0, uG1;
  out vec3 vW, vN, vCell; out float vD, vE, vGold;
  ${heightGL}
  void main() {
    vec2 c = aCell.xy; float s = aCell.z;
    float h = cellH(c, s);
    h += sin(uT * 0.22 + c.x * 0.19 + s * 6.28) * 0.045;
    float d = distance(c, uCur.xy);
    h += exp(-d * d * 0.11) * 0.62 * uCur.z;
    float g0 = 1.0 - step(0.5, distance(c, uG0.xy) * 40.0);
    float g1 = 1.0 - step(0.5, distance(c, uG1.xy) * 40.0);
    float gold = g0 * uG0.z + g1 * uG1.z;
    h += gold * ${GOLD_RISE.toFixed(2)};
    float wave = clamp(uIntro * 2.1 - (length(c) / 34.0) - s * 0.25, 0.0, 1.0);
    wave = 1.0 - pow(1.0 - wave, 3.0);
    h -= (1.0 - wave) * 7.0;
    vec3 w = vec3(aPos.x, aPos.y + h, aPos.z);
    vW = w; vN = aNor; vCell = aCell; vD = -aPos.y; vE = aEdge; vGold = gold;
    gl_Position = uVP * vec4(w, 1.0);
  }`;

  const fieldFS = `#version 300 es
  precision highp float;
  in vec3 vW, vN, vCell; in float vD, vE, vGold;
  uniform vec3 uEye, uL0, uL1, uCursorL; uniform vec2 uLA; uniform float uDim, uLight, uT;
  out vec4 o;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return noise(p) * 0.55 + noise(p * 2.13 + 3.1) * 0.3 + noise(p * 4.7 + 7.7) * 0.15; }
  vec3 pointL(vec3 w, vec3 n, vec3 v, vec3 lp, vec3 col, float rough) {
    vec3 l = lp - w; float d2 = dot(l, l); l /= sqrt(d2);
    float att = 1.0 / (1.0 + d2 * 0.22);
    float nl = max(dot(n, l), 0.0);
    vec3 h = normalize(l + v);
    float sp = pow(max(dot(n, h), 0.0), rough) * 0.55;
    return col * att * (nl * 0.85 + sp * nl);
  }
  void main() {
    bool isSide = abs(vN.y) < 0.01;
    float seed = vCell.z;
    vec3 sp = isSide ? vec3(vW.x * 1.7, vW.y * 1.9, vW.z * 1.7) + seed * 13.0 : vec3(vW.x * 1.7, seed * 11.0, vW.z * 1.7);
    float hgt = fbm(sp);
    float fine = noise(sp * 9.0);
    float bump = hgt + fine * 0.09;
    vec3 N = normalize(vN);
    vec3 dpx = dFdx(vW), dpy = dFdy(vW);
    float hx = dFdx(bump), hy = dFdy(bump);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    float k = isSide ? 0.22 : 0.3;
    vec3 n = normalize(abs(det) * N - k * grad);

    vec3 v = normalize(uEye - vW);
    vec3 alb = mix(vec3(0.026, 0.027, 0.030), vec3(0.085, 0.086, 0.090), seed * 0.5 + hgt * 0.6);
    alb *= 0.74 + fine * 0.42;
    float ao = isSide ? (exp(-vD * 2.2) * 0.8 + 0.006) : mix(1.0, 0.8, smoothstep(0.4, 0.8, vE));

    // moonlight from far behind, low: it rakes the tops and rims every column
    vec3 ld = normalize(vec3(-0.6, 0.5, -0.62));
    float nl = max(dot(n, ld), 0.0);
    vec3 hv = normalize(ld + v);
    vec3 col = alb * vec3(0.62, 0.68, 0.78) * nl * 1.15;
    col += vec3(0.5, 0.55, 0.64) * pow(max(dot(n, hv), 0.0), 30.0) * 0.07 * nl;
    col += alb * vec3(0.11, 0.12, 0.14);
    col *= ao;

    // the cursor's light, warm white
    col += alb * pointL(vW, n, v, uCursorL, vec3(1.0, 0.91, 0.78) * 6.0 * uLight, 22.0) * (isSide ? ao * 1.4 + 0.1 : 1.0);
    col += pointL(vW, n, v, uCursorL, vec3(1.0, 0.92, 0.8) * 0.26 * uLight, 44.0) * (isSide ? ao : 1.0);

    // gold light from whichever column is lit, spilling on its neighbours
    vec3 gc = vec3(1.0, 0.5, 0.09);
    col += (alb + 0.012) * pointL(vW, n, v, uL0, gc * 3.8 * uLA.x, 18.0) * (isSide ? ao * 1.2 + 0.05 : 1.0);
    col += (alb + 0.012) * pointL(vW, n, v, uL1, gc * 3.8 * uLA.y, 18.0) * (isSide ? ao * 1.2 + 0.05 : 1.0);

    // the lit column: gold veins through the top, gold rim, gold running down the side
    if (vGold > 0.001) {
      float g = vGold;
      float vn = fbm(vec3(vW.xz * 1.25 + seed * 9.0, 2.0));
      float vein = 1.0 - smoothstep(0.0, 0.03, abs(vn - 0.5));
      vec3 hot = vec3(1.0, 0.54, 0.1);
      if (isSide) col += hot * g * exp(-vD * 3.0) * (0.08 + hgt * 0.15);
      else {
        col += alb * vec3(0.9, 0.46, 0.1) * g;
        col += hot * g * vein * 3.4;
        col += hot * g * smoothstep(0.76, 1.0, vE) * 2.6;
      }
    }

    // soft haze round the lit column, seen along the view ray
    for (int i = 0; i < 2; i++) {
      vec3 lp = i == 0 ? uL0 : uL1; float a = i == 0 ? uLA.x : uLA.y;
      if (a > 0.001) {
        vec3 rd = normalize(vW - uEye);
        float tt = max(dot(lp - uEye, rd), 0.0);
        float dr = length(uEye + rd * tt - lp);
        col += vec3(1.0, 0.6, 0.18) * a * exp(-dr * dr * 0.5) * 0.09;
      }
    }

    col = 1.0 - exp(-col * 1.75);
    col = pow(col, vec3(1.0 / 2.2));
    float dist = length(uEye - vW);
    float fog = smoothstep(19.0, 40.0, dist);
    vec3 bg = vec3(${BG.map((v) => v.toFixed(4)).join(',')});
    col = mix(col, bg, fog);
    col = mix(bg, col, uDim);
    // dither, so the dark gradients don't band
    col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    o = vec4(col, 1.0);
  }`;

  const planeVS = `#version 300 es
  layout(location=0) in vec2 aUv;
  uniform vec2 uView, uCenter, uSize, uTilt; uniform float uBend;
  out vec2 vUv;
  void main() {
    vUv = aUv;
    vec2 q = aUv - 0.5;
    vec2 p = q * uSize;
    p.y += sin(aUv.x * 3.14159) * uBend;
    float z = (q.x * uTilt.x + q.y * uTilt.y) * uSize.x * 0.055;
    float f = 1300.0;
    p *= f / (f + z);
    vec2 c = uCenter + p;
    gl_Position = vec4(c.x / uView.x * 2.0 - 1.0, 1.0 - c.y / uView.y * 2.0, 0.0, 1.0);
  }`;
  const planeFS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex; uniform vec2 uSize; uniform float uR, uAlpha, uSpot; uniform vec4 uSpotBox;
  out vec4 o;
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 px = (vUv - 0.5) * uSize;
    float d = box(px, uSize * 0.5, uR);
    float a = (1.0 - smoothstep(-0.75, 0.75, d)) * uAlpha;
    vec3 c = texture(uTex, vUv).rgb;
    // 1 px edge: frame and picture are one piece
    c = mix(c, vec3(0.2, 0.205, 0.22), smoothstep(-1.75, -0.75, d) * 0.9);
    if (uSpot > 0.001) {
      float s = box(vUv * uSize - (uSpotBox.xy + uSpotBox.zw * 0.5) * uSize, uSpotBox.zw * 0.5 * uSize, 6.0);
      float out_ = smoothstep(-1.0, 1.0, s);
      c = mix(c, c * 0.42, out_ * uSpot);
      c += vec3(1.0, 0.68, 0.24) * exp(-max(s, 0.0) * 0.045) * out_ * uSpot * 0.16;
    }
    o = vec4(c * a, a);
  }`;

  function prog(gl, vs, fs) {
    const mk = (t, s) => {
      const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
      if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h));
      return h;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }

  /* ---------- small maths ---------- */
  function perspective(fov, asp, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function lookAt(e, c) {
    const z = norm(sub(e, c)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
    }
    return o;
  }

  /* ---------- setup ---------- */
  function create(canvas, opts) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.still });
    if (!gl) return null;
    const P = prog(gl, fieldVS, fieldFS), Q = prog(gl, planeVS, planeFS);
    const field = buildField(opts.small);

    const fieldVao = gl.createVertexArray();
    gl.bindVertexArray(fieldVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, field.verts, gl.STATIC_DRAW);
    const stride = 40;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
    const count = field.verts.length / 10;

    const N = 28, uvs = [], idx = [];
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) uvs.push(x / N, y / N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const planeVao = gl.createVertexArray();
    gl.bindVertexArray(planeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    let W = 0, H = 0, scale = Math.min(devicePixelRatio || 1, 1.6);
    function resize() {
      W = innerWidth; H = innerHeight;
      const w = Math.round(W * scale), h = Math.round(H * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    addEventListener('resize', resize);
    resize();

    // gold: two slots, so one can fade out while the next rises
    const gold = [{ c: null, a: 0, to: 0 }, { c: null, a: 0, to: 0 }];
    const cursor = { x: 0, z: 0, on: 0, L: 0 };
    let t = 0, intro = opts.still ? 1 : 0, VP = null, eye = [0, 5, 14];
    let slow = 0, fastFrames = 0;
    const planes = [];

    const cellAt = (x, z) => {
      let best = null, bd = 1e9;
      for (const i of field.near(x, z)) {
        const p = field.pts[i]; if (p[3] === undefined) continue;
        const d = (p[3] - x) ** 2 + (p[4] - z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const cellTop = (p) => heightJS(p[3], p[4], p[2]);

    function light(i, p) {
      const s = gold[i];
      if (p) { s.c = p; s.to = 1; } else s.to = 0;
    }
    // Light a column: the current one settles, the new one rises.
    function setGold(p) {
      const free = gold[0].to === 0 && gold[0].a < 0.5 ? 0 : (gold[1].to === 0 && gold[1].a < 0.5 ? 1 : (gold[0].to === 0 ? 0 : 1));
      gold[1 - free].to = 0;
      light(free, p);
    }
    const litCell = () => (gold[0].to ? gold[0].c : gold[1].to ? gold[1].c : null);

    // where the camera's ray through a screen point crosses the plane y = h
    function rayGround(px, py, cam, h = 1) {
      const z = norm(sub(cam.eye, cam.at)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
      const th = Math.tan(cam.fov / 2), asp = W / H;
      const nx = (px / W * 2 - 1) * th * asp, ny = (1 - py / H * 2) * th;
      const d = [x[0] * nx + y[0] * ny - z[0], x[1] * nx + y[1] * ny - z[1], x[2] * nx + y[2] * ny - z[2]];
      if (Math.abs(d[1]) < 1e-3) return null;
      const k = (h - cam.eye[1]) / d[1];
      return k > 0 ? { x: cam.eye[0] + d[0] * k, z: cam.eye[2] + d[2] * k } : null;
    }
    function project(w) {
      if (!VP) return null;
      const m = VP, x = m[0] * w[0] + m[4] * w[1] + m[8] * w[2] + m[12], y = m[1] * w[0] + m[5] * w[1] + m[9] * w[2] + m[13], c = m[3] * w[0] + m[7] * w[1] + m[11] * w[2] + m[15];
      return c > 0 ? { x: (x / c + 1) / 2 * W, y: (1 - y / c) / 2 * H } : null;
    }

    function addPlane(fig, src, o) {
      const pl = Object.assign({ fig, tex: null, alpha: 1, tilt: [0, 0], hov: [0, 0], hovOn: 0, spot: 0, box: [0, 0, 0, 0], bend: 0, r: 8, base: [0, 0] }, o);
      const img = new Image();
      img.onload = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
        pl.tex = tex;
        fig.classList.add('gl-on');
        opts.onDirty && opts.onDirty();
      };
      img.src = src;
      fig.addEventListener('pointermove', (e) => {
        const r = fig.getBoundingClientRect();
        pl.hov = [clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1)];
        pl.hovOn = 1;
      });
      fig.addEventListener('pointerleave', () => { pl.hovOn = 0; });
      planes.push(pl);
      return pl;
    }

    /* ---------- one frame ---------- */
    function frame(f) {
      const dt = f.dt;
      t += dt;
      if (intro < 1) intro = Math.min(1, intro + dt / 2.4);
      resize();

      // adaptive resolution: step down when frames run slow, never back up mid-visit (a size change flashes)
      if (f.measure) {
        if (dt > 1 / 38) { slow++; fastFrames = 0; } else { fastFrames++; if (fastFrames > 30) slow = 0; }
        if (slow > 24 && scale > 0.7) { scale = Math.max(0.7, scale * 0.8); slow = 0; resize(); }
      }

      const cam = f.cam;
      eye = cam.eye;
      VP = mul(perspective(cam.fov, W / H, 0.1, 80), lookAt(cam.eye, cam.at));

      // cursor light follows with a little lag; with no pointer it wanders slowly
      let goal = f.pointer ? rayGround(f.pointer.x, f.pointer.y, cam, 1.2) : null;
      if (!goal) goal = { x: Math.sin(t * 0.21) * 6 + cam.at[0], z: Math.cos(t * 0.16) * 3 - 1 + cam.at[2] * 0.4 };
      cursor.x = damp(cursor.x, goal.x, 7, dt);
      cursor.z = damp(cursor.z, goal.z, 7, dt);
      cursor.on = damp(cursor.on, f.pointer ? 1 : 0.0, 4, dt);
      cursor.L = damp(cursor.L, f.pointer ? 1 : 0.55, 3, dt);

      for (const s of gold) s.a = damp(s.a, s.to, s.to ? 2.2 : 3.2, dt);
      const lift = (s) => (s.c ? [s.c[3], cellTop(s.c) + s.a * GOLD_RISE + 1.0, s.c[4]] : [0, -50, 0]);
      const mask = f.goldMask;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW);
      gl.clearColor(BG[0], BG[1], BG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (f.dim > 0.003) {
        // The stone belongs to the first screen: it moves up with the page, not behind it.
        gl.viewport(0, Math.round((f.scrollY || 0) * canvas.height / H), canvas.width, canvas.height);
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uVP, false, VP);
        gl.uniform1f(P.u.uT, t);
        gl.uniform1f(P.u.uIntro, intro);
        gl.uniform3f(P.u.uCur, cursor.x, cursor.z, cursor.on);
        const g0 = gold[0], g1 = gold[1];
        gl.uniform4f(P.u.uG0, g0.c ? g0.c[3] : 999, g0.c ? g0.c[4] : 999, g0.a * mask, 0);
        gl.uniform4f(P.u.uG1, g1.c ? g1.c[3] : 999, g1.c ? g1.c[4] : 999, g1.a * mask, 0);
        gl.uniform3fv(P.u.uEye, cam.eye);
        gl.uniform3fv(P.u.uL0, lift(g0));
        gl.uniform3fv(P.u.uL1, lift(g1));
        gl.uniform2f(P.u.uLA, g0.a * mask * intro, g1.a * mask * intro);
        gl.uniform3f(P.u.uCursorL, cursor.x, 3.4, cursor.z);
        gl.uniform1f(P.u.uLight, cursor.L);
        gl.uniform1f(P.u.uDim, f.dim);
        gl.bindVertexArray(fieldVao);
        gl.drawArrays(gl.TRIANGLES, 0, count);
      }

      // screenshots
      const live = planes.filter((p) => p.tex && p.alpha > 0.002);
      if (live.length) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(Q.p);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(planeVao);
        gl.uniform2f(Q.u.uView, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(Q.u.uTex, 0);
        for (const p of live) {
          const r = p.fig.getBoundingClientRect();
          if (r.bottom < -80 || r.top > H + 80) continue;
          p.bend = damp(p.bend, clamp(f.vel * 0.35, -9, 9), 9, dt);
          const tx = p.hovOn ? p.hov[0] * 0.09 : 0, ty = p.hovOn ? -p.hov[1] * 0.09 : 0;
          p.tilt[0] = damp(p.tilt[0], tx, 6, dt); p.tilt[1] = damp(p.tilt[1], ty, 6, dt);
          gl.uniform2f(Q.u.uCenter, r.left + r.width / 2, r.top + r.height / 2);
          gl.uniform2f(Q.u.uSize, r.width, r.height);
          gl.uniform2f(Q.u.uTilt, p.tilt[0], p.tilt[1]);
          gl.uniform1f(Q.u.uBend, p.bend);
          gl.uniform1f(Q.u.uR, p.r);
          gl.uniform1f(Q.u.uAlpha, p.alpha);
          gl.uniform1f(Q.u.uSpot, p.spot);
          gl.uniform4f(Q.u.uSpotBox, p.box[0], p.box[1], p.box[2], p.box[3]);
          gl.bindTexture(gl.TEXTURE_2D, p.tex);
          gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        }
      }
      gl.bindVertexArray(null);
    }

    return { frame, setGold, litCell, cellAt, cellTop, heightJS, addPlane, rayGround, project, planes, goldRise: GOLD_RISE, gold, lost: () => gl.isContextLost() };
  }

  window.Stone = { create };
})();
