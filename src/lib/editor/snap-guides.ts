export type Bounds = { x: number; y: number; w: number; h: number };

export type GuideLine = {
  orientation: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
};

export type SnapResult = {
  x: number;
  y: number;
  guides: GuideLine[];
};

const THRESHOLD = 6;

function centers(b: Bounds) {
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

/** Snap moving bounds against other element bounds. Returns adjusted top-left + guide lines. */
export function snapBounds(
  moving: Bounds,
  others: Bounds[],
  threshold = THRESHOLD,
): SnapResult {
  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const guides: GuideLine[] = [];
  const m = centers(moving);

  const movingEdges = {
    left: moving.x,
    right: moving.x + moving.w,
    top: moving.y,
    bottom: moving.y + moving.h,
    cx: m.cx,
    cy: m.cy,
  };

  for (const o of others) {
    const oc = centers(o);
    const candidatesX = [
      { from: movingEdges.left, to: o.x },
      { from: movingEdges.right, to: o.x + o.w },
      { from: movingEdges.cx, to: oc.cx },
      { from: movingEdges.left, to: o.x + o.w },
      { from: movingEdges.right, to: o.x },
      { from: movingEdges.left, to: oc.cx },
      { from: movingEdges.right, to: oc.cx },
      { from: movingEdges.cx, to: o.x },
      { from: movingEdges.cx, to: o.x + o.w },
    ];
    const candidatesY = [
      { from: movingEdges.top, to: o.y },
      { from: movingEdges.bottom, to: o.y + o.h },
      { from: movingEdges.cy, to: oc.cy },
      { from: movingEdges.top, to: o.y + o.h },
      { from: movingEdges.bottom, to: o.y },
      { from: movingEdges.top, to: oc.cy },
      { from: movingEdges.bottom, to: oc.cy },
      { from: movingEdges.cy, to: o.y },
      { from: movingEdges.cy, to: o.y + o.h },
    ];

    for (const c of candidatesX) {
      const dist = Math.abs(c.from - c.to);
      if (dist < bestX) {
        bestX = dist;
        dx = c.to - c.from;
      }
    }
    for (const c of candidatesY) {
      const dist = Math.abs(c.from - c.to);
      if (dist < bestY) {
        bestY = dist;
        dy = c.to - c.from;
      }
    }
  }

  const snappedX = bestX <= threshold ? moving.x + dx : moving.x;
  const snappedY = bestY <= threshold ? moving.y + dy : moving.y;
  let snapped: Bounds = { ...moving, x: snappedX, y: snappedY };
  const sc = centers(snapped);

  // Equal-spacing guides (Excalidraw's snap-to-equal-gaps): when the moving
  // element is aligned with two others on an axis and would land at a
  // distance matching their gap — beyond either end, or exactly between them
  // — snap to the precise equal-spaced position and draw guides at each gap
  // midpoint. Subtle: only the closest candidate pair wins, and it only
  // engages within the same small threshold as alignment snapping.
  const spacingX = spacingSnap('x', moving, snapped, others, threshold);
  const spacingY = spacingSnap('y', moving, snapped, others, threshold);
  if (spacingX.delta !== 0 || spacingY.delta !== 0) {
    snapped = { ...snapped, x: snapped.x + spacingX.delta, y: snapped.y + spacingY.delta };
  }

  if (bestX <= threshold) {
    for (const o of others) {
      const oc = centers(o);
      const matches = [o.x, o.x + o.w, oc.cx].some((v) => Math.abs(v - sc.cx) < 0.5 || Math.abs(v - snapped.x) < 0.5 || Math.abs(v - (snapped.x + snapped.w)) < 0.5);
      if (!matches) continue;
      const pos = Math.abs(o.x - snapped.x) < 0.5 ? o.x
        : Math.abs(o.x + o.w - (snapped.x + snapped.w)) < 0.5 ? o.x + o.w
        : Math.abs(oc.cx - sc.cx) < 0.5 ? oc.cx
        : Math.abs(o.x - (snapped.x + snapped.w)) < 0.5 ? o.x
        : Math.abs(o.x + o.w - snapped.x) < 0.5 ? o.x + o.w
        : oc.cx;
      guides.push({
        orientation: 'vertical',
        position: pos,
        start: Math.min(snapped.y, o.y),
        end: Math.max(snapped.y + snapped.h, o.y + o.h),
      });
    }
  }

  if (bestY <= threshold) {
    for (const o of others) {
      const oc = centers(o);
      const matches = [o.y, o.y + o.h, oc.cy].some((v) => Math.abs(v - sc.cy) < 0.5 || Math.abs(v - snapped.y) < 0.5 || Math.abs(v - (snapped.y + snapped.h)) < 0.5);
      if (!matches) continue;
      const pos = Math.abs(o.y - snapped.y) < 0.5 ? o.y
        : Math.abs(o.y + o.h - (snapped.y + snapped.h)) < 0.5 ? o.y + o.h
        : Math.abs(oc.cy - sc.cy) < 0.5 ? oc.cy
        : Math.abs(o.y - (snapped.y + snapped.h)) < 0.5 ? o.y
        : Math.abs(o.y + o.h - snapped.y) < 0.5 ? o.y + o.h
        : oc.cy;
      guides.push({
        orientation: 'horizontal',
        position: pos,
        start: Math.min(snapped.x, o.x),
        end: Math.max(snapped.x + snapped.w, o.x + o.w),
      });
    }
  }

  guides.push(...spacingX.guides, ...spacingY.guides);
  return { x: snapped.x, y: snapped.y, guides };
}

/**
 * Equal-spacing snap on one axis. Returns the delta to apply (0 when no
 * equal-spaced candidate is within `threshold`) plus the gap-midpoint guides.
 */
function spacingSnap(
  axis: 'x' | 'y',
  moving: Bounds,
  snapped: Bounds,
  others: Bounds[],
  threshold: number,
): { delta: number; guides: GuideLine[] } {
  const coord = (b: Bounds) => (axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2);
  const perp = (b: Bounds) => (axis === 'x' ? b.y + b.h / 2 : b.x + b.w / 2);
  const mc = coord(snapped);

  let bestD = threshold + 1;
  let bestDelta = 0;
  let bestRefs: Bounds[] = [];

  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i];
      const b = others[j];
      // The moving element and both references must be aligned on the
      // perpendicular axis, or the spacing relationship is meaningless.
      if (Math.abs(perp(a) - perp(b)) > threshold || Math.abs(perp(a) - perp(moving)) > threshold) continue;
      const gap = Math.abs(coord(a) - coord(b));
      if (gap < 1) continue;
      const lo = Math.min(coord(a), coord(b));
      const hi = Math.max(coord(a), coord(b));
      // Candidates: one gap beyond each end, or the midpoint between them.
      const candidates = [lo - gap, hi + gap];
      if (mc > lo - threshold && mc < hi + threshold) candidates.push((lo + hi) / 2);
      for (const c of candidates) {
        const d = Math.abs(c - mc);
        if (d < bestD) {
          bestD = d;
          bestDelta = c - mc;
          bestRefs = [a, b];
        }
      }
    }
  }

  if (bestD > threshold || bestRefs.length !== 2) return { delta: 0, guides: [] };

  const guides: GuideLine[] = [];
  const xs = [coord(bestRefs[0]), coord(bestRefs[1]), mc + bestDelta].sort((p, q) => p - q);
  const involved = [moving, ...bestRefs];
  const p0 = (axis === 'x'
    ? Math.min(...involved.map((b) => b.y)) - 14
    : Math.min(...involved.map((b) => b.x)) - 14);
  const p1 = (axis === 'x'
    ? Math.max(...involved.map((b) => b.y + b.h)) + 14
    : Math.max(...involved.map((b) => b.x + b.w)) + 14);
  for (let k = 0; k < xs.length - 1; k++) {
    const mid = (xs[k] + xs[k + 1]) / 2;
    guides.push(axis === 'x'
      ? { orientation: 'vertical', position: mid, start: p0, end: p1 }
      : { orientation: 'horizontal', position: mid, start: p0, end: p1 });
  }
  return { delta: bestDelta, guides };
}
