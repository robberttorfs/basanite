// Tile layout. Tiles keep their order so nothing jumps around under you;
// importance only changes how much space a tile gets. A pinned tile takes
// the left side and the rest share the right.
//
// Two things hold a tile still:
// - a lock: a size you set by dragging an edge. It keeps its width and/or
//   height; the other tiles share what is left.
// - an anchor: the selected tile's current rect. It keeps its size and, when
//   the neighbours leave room, its position too, so the tile you are working
//   in does not move while others change status.
(function (root) {
  const TARGET_ASPECT = 1.6; // terminals read best a bit wider than tall
  const MIN_W = 260;
  const MIN_H = 140;

  function bestRows(n, w, h) {
    let best = 1, bestScore = Infinity;
    for (let r = 1; r <= n; r++) {
      const cols = Math.ceil(n / r);
      const score = Math.abs(Math.log((w / cols) / (h / r) / TARGET_ASPECT));
      if (score < bestScore - 1e-9) { best = r; bestScore = score; }
    }
    return best;
  }

  /**
   * Splits [start, start+total) between items along one axis.
   * items: [{ weight, fixed: size|null, at: position|null }]. At most one item
   * should carry `at`; it is dropped when the items around it cannot fit.
   * Returns [{ start, size }].
   */
  function splitAxis(items, start, total, gap, min) {
    const n = items.length;
    if (!n) return [];
    const k = items.findIndex((it) => it.fixed != null && it.at != null);
    if (k >= 0) {
      const it = items[k];
      const size = Math.min(it.fixed, total);
      const before = items.slice(0, k), after = items.slice(k + 1);
      const beforeSpace = it.at - start - (before.length ? gap : 0);
      const afterSpace = start + total - (it.at + size) - (after.length ? gap : 0);
      if (fits(before, beforeSpace, gap, min) && fits(after, afterSpace, gap, min)) {
        return [
          ...fill(before, start, beforeSpace, gap, min),
          { start: it.at, size },
          ...fill(after, it.at + size + gap, afterSpace, gap, min),
        ];
      }
    }
    return fill(items, start, total, gap, min);
  }

  // A segment fits when its flexible items get at least `min` and an
  // all-fixed segment lands exactly on its space. Empty segments need no room.
  function fits(items, space, gap, min) {
    if (!items.length) return Math.abs(space) < 1;
    if (space < 0) return false;
    const usable = space - gap * (items.length - 1);
    const fixed = items.filter((i) => i.fixed != null);
    const flex = items.length - fixed.length;
    const fixedSum = fixed.reduce((a, i) => a + Math.max(min, i.fixed), 0);
    if (!flex) return Math.abs(usable - fixedSum) < 2;
    return usable - fixedSum >= flex * min;
  }

  function fill(items, start, total, gap, min) {
    const n = items.length;
    if (!n) return [];
    const usable = Math.max(0, total - gap * (n - 1));
    const flex = items.filter((i) => i.fixed == null);
    let sizes = items.map((i) => (i.fixed == null ? null : Math.max(min, i.fixed)));
    let fixedSum = sizes.reduce((a, s) => a + (s ?? 0), 0);
    const flexRoom = usable - fixedSum;
    const needFlex = flex.length * min;
    if (!flex.length || flexRoom < needFlex) {
      // Scale the fixed sizes so everything still fits (or fills, with no flexible items).
      const target = flex.length ? Math.max(0, usable - needFlex) : usable;
      const scale = fixedSum ? target / fixedSum : 1;
      sizes = sizes.map((s) => (s == null ? null : s * scale));
      fixedSum = target;
    }
    const room = usable - fixedSum;
    const wsum = flex.reduce((a, i) => a + i.weight, 0) || 1;
    let pos = start;
    return items.map((it, i) => {
      const size = sizes[i] ?? room * (it.weight / wsum);
      const out = { start: pos, size };
      pos += size + gap;
      return out;
    });
  }

  function grid(tiles, x, y, w, h, gap, out) {
    const n = tiles.length;
    if (!n) return;
    const rows = bestRows(n, w, h);
    const perRow = Math.ceil(n / rows);
    const rowTiles = [];
    for (let i = 0; i < n; i += perRow) rowTiles.push(tiles.slice(i, i + perRow));
    const rowItems = rowTiles.map((r) => {
      const anchored = r.find((t) => t.anchor);
      const locked = r.map((t) => t.lock?.h).filter((v) => v != null);
      return {
        weight: Math.max(...r.map((t) => t.weight)),
        fixed: anchored ? anchored.anchor.h : locked.length ? Math.max(...locked) : null,
        at: anchored ? anchored.anchor.y : null,
      };
    });
    splitAxis(rowItems, y, h, gap, MIN_H).forEach((row, ri) => {
      const items = rowTiles[ri].map((t) => ({
        weight: t.weight,
        fixed: t.anchor ? t.anchor.w : t.lock?.w ?? null,
        at: t.anchor ? t.anchor.x : null,
      }));
      splitAxis(items, x, w, gap, MIN_W).forEach((col, ci) => {
        out[rowTiles[ri][ci].id] = { x: col.start, y: row.start, w: col.size, h: row.size };
      });
    });
  }

  /**
   * tiles: [{ id, weight, pinned, lock?: { w?, h? }, anchor?: { x, y, w, h } }]
   * in display order. Sizes are pixels. Returns { [id]: { x, y, w, h } }, rounded.
   */
  function computeLayout(tiles, W, H, gap = 8) {
    const out = {};
    const pinned = tiles.find((t) => t.pinned);
    if (pinned && tiles.length > 1) {
      const rest = tiles.filter((t) => t !== pinned);
      const want = pinned.anchor?.w ?? pinned.lock?.w ?? (W - gap) * (rest.length === 1 ? 0.62 : 0.58);
      const leftW = Math.round(Math.max(MIN_W, Math.min(W - gap - MIN_W, want)));
      out[pinned.id] = { x: 0, y: 0, w: leftW, h: H };
      grid(rest, leftW + gap, 0, W - leftW - gap, H, gap, out);
    } else {
      grid(tiles, 0, 0, W, H, gap, out);
    }
    for (const k of Object.keys(out)) {
      const r = out[k];
      out[k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    }
    return out;
  }

  /** Space a tile deserves. Clamped so a quiet tile never becomes unreadable. */
  function weightFor(status) {
    return { needs_input: 1.9, working: 1.2, done: 1.15, idle: 0.85, starting: 1, exited: 0.6 }[status] ?? 1;
  }

  /** Biggest corner movement between two layouts, in pixels. */
  function maxShift(a, b) {
    let m = 0;
    for (const id of Object.keys(b)) {
      const p = a[id], q = b[id];
      if (!p) return Infinity;
      m = Math.max(m, Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.x + p.w - q.x - q.w), Math.abs(p.y + p.h - q.y - q.h));
    }
    return m;
  }

  const api = { computeLayout, weightFor, maxShift, MIN_W, MIN_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HangarLayout = api;
})(this);
