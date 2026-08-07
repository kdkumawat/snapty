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
  const snapped: Bounds = { ...moving, x: snappedX, y: snappedY };
  const sc = centers(snapped);

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

  return { x: snappedX, y: snappedY, guides };
}
