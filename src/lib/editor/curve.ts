import type { Bounds } from '@/lib/editor/snap-guides';

/**
 * Quadratic-curve helpers shared by the arrow and line tools.
 *
 * Both tools store `points: [sx, sy, ex, ey]` local to the element origin plus a
 * scalar `bend`, where 0 is straight and ±1 is the maximum curve in either
 * normal direction. The arrow branch grew this logic inline; extracting it here
 * lets the line reuse it, and lets selection bounds and SVG export agree with
 * what is actually drawn instead of assuming the straight chord.
 */

export type Pt = { x: number; y: number };

/** How far the control point travels per unit of bend, as a fraction of length. */
const BEND_SCALE = 0.55;

/**
 * Control point of the quadratic Bézier for a bent segment, in element-local
 * coordinates. `bend === 0` returns the chord midpoint, so callers can use one
 * code path for straight and curved.
 */
export function controlPoint(
  sx: number, sy: number, ex: number, ey: number, bend = 0,
): Pt {
  const length = Math.max(1, Math.hypot(ex - sx, ey - sy));
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  if (!bend) return { x: midX, y: midY };
  // Unit normal of the chord, rotated 90deg.
  const nx = (sy - ey) / length;
  const ny = (ex - sx) / length;
  const d = bend * length * BEND_SCALE;
  return { x: midX + nx * d, y: midY + ny * d };
}

/**
 * Point list for a Konva `Line`/`Arrow`. Straight segments keep two points so
 * Konva draws an exact chord; bent segments add the control point in the middle
 * and are rendered with tension.
 */
export function renderPoints(
  sx: number, sy: number, ex: number, ey: number, bend = 0,
): number[] {
  if (!bend) return [sx, sy, ex, ey];
  const c = controlPoint(sx, sy, ex, ey, bend);
  return [sx, sy, c.x, c.y, ex, ey];
}

/**
 * Bend implied by dragging the mid handle to `(hx, hy)` (element-local).
 * Projects the handle onto the chord normal and clamps to ±1.
 */
export function bendFromHandle(
  sx: number, sy: number, ex: number, ey: number, hx: number, hy: number,
): number {
  const length = Math.max(1, Math.hypot(ex - sx, ey - sy));
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const nx = (sy - ey) / length;
  const ny = (ex - sx) / length;
  const next = ((hx - midX) * nx + (hy - midY) * ny) / (length * BEND_SCALE);
  return Math.max(-1, Math.min(1, next));
}

/**
 * Outgoing tangent at the start of the segment. Arrowheads must follow this,
 * not the chord: on a bent arrow the chord direction is visibly wrong.
 */
export function tangentAtStart(
  sx: number, sy: number, ex: number, ey: number, bend = 0,
): Pt {
  const c = controlPoint(sx, sy, ex, ey, bend);
  // Derivative of a quadratic Bézier at t=0 is 2*(P1 - P0).
  const dx = c.x - sx;
  const dy = c.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Incoming tangent at the end of the segment. */
export function tangentAtEnd(
  sx: number, sy: number, ex: number, ey: number, bend = 0,
): Pt {
  const c = controlPoint(sx, sy, ex, ey, bend);
  const dx = ex - c.x;
  const dy = ey - c.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Extreme of a quadratic Bézier on one axis. The curve can bulge past both
 * endpoints, so the chord box under-reports the bounds - which is why marquee
 * selection and PNG export used to clip strongly bent arrows.
 */
function quadAxisExtent(p0: number, p1: number, p2: number): [number, number] {
  let min = Math.min(p0, p2);
  let max = Math.max(p0, p2);
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) > 1e-6) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) {
      const v = (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return [min, max];
}

/**
 * Bounds of the drawn segment in absolute coordinates.
 * `originX/originY` is the element position; the points are element-local.
 */
export function quadBounds(
  originX: number, originY: number,
  sx: number, sy: number, ex: number, ey: number,
  bend = 0,
  pad = 0,
): Bounds {
  const c = controlPoint(sx, sy, ex, ey, bend);
  const [minX, maxX] = bend ? quadAxisExtent(sx, c.x, ex) : [Math.min(sx, ex), Math.max(sx, ex)];
  const [minY, maxY] = bend ? quadAxisExtent(sy, c.y, ey) : [Math.min(sy, ey), Math.max(sy, ey)];
  return {
    x: originX + minX - pad,
    y: originY + minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

/** SVG path data for the segment, in absolute coordinates. */
export function quadPathD(
  originX: number, originY: number,
  sx: number, sy: number, ex: number, ey: number,
  bend = 0,
): string {
  const ax = originX + sx;
  const ay = originY + sy;
  const bx = originX + ex;
  const by = originY + ey;
  if (!bend) return `M ${ax} ${ay} L ${bx} ${by}`;
  const c = controlPoint(sx, sy, ex, ey, bend);
  return `M ${ax} ${ay} Q ${originX + c.x} ${originY + c.y} ${bx} ${by}`;
}
