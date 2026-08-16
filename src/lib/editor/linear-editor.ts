'use client';

/**
 * Linear element editor geometry — Excalidraw's `LinearElementEditor`
 * semantics adapted to Snapty's data model (see excalidraw-gap-analysis.md
 * §5).
 *
 * Snapty linear elements (arrow/line) come in three shapes:
 *
 * - 2-point straight:  `points: [sx, sy, ex, ey]`, no `bend`.
 * - 2-point curved:    `points: [sx, sy, ex, ey]` + `bend` (legacy quadratic
 *   Bézier; kept only as a back-compat render/editing path for old arrows).
 * - Multi-point:       `points.length > 4` straight-segment polyline.
 *
 * Excalidraw has exactly ONE model — a polyline of real vertices — and
 * dragging a segment midpoint inserts a real vertex. This module makes that
 * interaction first-class in Snapty: hit tests are screen-space aware, and
 * `insertVertexAt` converts a 2-point element to a polyline the moment its
 * midpoint is dragged, so the gesture is continuous from the first frame.
 */

import type { ArrowElement, LineElement } from '@/types/editor';

export type LinearElement = ArrowElement | LineElement;
export type Pt = { x: number; y: number };

/** Excalidraw's POINT_HANDLE_SIZE (screen px). */
export const POINT_HANDLE_SIZE = 10;

/** Hit threshold in IMAGE px for a given zoom (Excalidraw: (size + 1) / zoom). */
export function hitRadiusImage(zoom: number, size = POINT_HANDLE_SIZE): number {
  const z = zoom > 0 ? zoom : 1;
  return (size + 1) / z;
}

export function isMultiPoint(el: LinearElement): boolean {
  return el.points.length > 4;
}

/** Point list as [{x,y}, ...] in ELEMENT-LOCAL coordinates. */
export function localPoints(el: LinearElement): Pt[] {
  const pts = el.points;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
  return out;
}

/** Midpoint of segment `segIdx` (0-based) in element-local coordinates. */
export function segmentMidpointLocal(el: LinearElement, segIdx: number): Pt {
  const pts = el.points;
  const i = segIdx * 2;
  return {
    x: (pts[i] + pts[i + 2]) / 2,
    y: (pts[i + 1] + pts[i + 3]) / 2,
  };
}

/** All segment midpoints in element-local coordinates (length = points/2 - 1). */
export function segmentMidpointsLocal(el: LinearElement): Pt[] {
  const n = el.points.length / 2 - 1;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push(segmentMidpointLocal(el, i));
  return out;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Nearest segment midpoint to an absolute image point, within the
 * screen-space threshold. Returns { seg, pt } in element-local coords, or
 * null. Excalidraw's `getSegmentMidpointHitCoords`.
 */
export function hitTestMidpoint(
  el: LinearElement,
  absX: number,
  absY: number,
  zoom: number,
): { seg: number; pt: Pt } | null {
  const r = hitRadiusImage(zoom);
  const px = absX - el.x;
  const py = absY - el.y;
  const mps = segmentMidpointsLocal(el);
  let best: { seg: number; pt: Pt } | null = null;
  let bestD = r;
  for (let i = 0; i < mps.length; i++) {
    const d = dist(mps[i], { x: px, y: py });
    if (d <= bestD) {
      bestD = d;
      best = { seg: i, pt: mps[i] };
    }
  }
  return best;
}

/**
 * Nearest vertex to an absolute image point within the screen-space
 * threshold. Returns the point INDEX into the flat points array (the x
 * index), or -1.
 */
export function hitTestVertex(
  el: LinearElement,
  absX: number,
  absY: number,
  zoom: number,
): number {
  const r = hitRadiusImage(zoom);
  const px = absX - el.x;
  const py = absY - el.y;
  const pts = el.points;
  let best = -1;
  let bestD = r;
  for (let i = 0; i < pts.length; i += 2) {
    const d = Math.hypot(pts[i] - px, pts[i + 1] - py);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Distance from an absolute image point to the nearest point on segment
 * `segIdx` (element-local geometry). Used for hover hit-testing.
 */
export function distanceToSegment(
  el: LinearElement,
  segIdx: number,
  absX: number,
  absY: number,
): number {
  const pts = el.points;
  const i = segIdx * 2;
  const ax = pts[i];
  const ay = pts[i + 1];
  const bx = pts[i + 2];
  const by = pts[i + 3];
  const px = absX - el.x;
  const py = absY - el.y;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Insert a vertex at `(x, y)` (element-local) between points `segIdx` and
 * `segIdx + 1`. Returns the new flat points array. Converts a 2-point
 * element into a polyline; the resulting `bend` must be reset to 0.
 */
export function insertVertexAt(
  el: LinearElement,
  segIdx: number,
  x: number,
  y: number,
): number[] {
  const pts = [...el.points];
  const i = segIdx * 2 + 2;
  pts.splice(i, 0, x, y);
  return pts;
}

/**
 * Remove vertex at flat index `i` (x index). Interior vertices only —
 * endpoints are never removed. Returns null when the element cannot lose a
 * vertex (2-point, or index out of range). A 3-point removal collapses to a
 * straight 2-point element.
 */
export function removeVertexAt(el: LinearElement, i: number): number[] | null {
  const pts = el.points;
  if (i < 2 || i > pts.length - 4 || i % 2 !== 0) return null;
  const next = [...pts];
  next.splice(i, 2);
  return next.length >= 4 ? next : null;
}

/**
 * Convert a legacy curved 2-point element (`bend` ≠ 0) to a 3-point
 * polyline, preserving the control point as the new vertex. The curve's
 * silhouette changes (quadratic through the control point vs polyline), the
 * endpoints and the control point stay put — Excalidraw's
 * curved→straight conversion has the same property.
 */
export function bendToPolyline(el: LinearElement): { points: number[]; bend: 0 } | null {
  if (isMultiPoint(el)) return null;
  const bend = el.bend ?? 0;
  if (bend === 0) return null;
  const [sx, sy, ex, ey] = el.points;
  const length = Math.max(1, Math.hypot(ex - sx, ey - sy));
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const nx = (sy - ey) / length;
  const ny = (ex - sx) / length;
  const d = bend * length * 0.55;
  return {
    points: [sx, sy, midX + nx * d, midY + ny * d, ex, ey],
    bend: 0,
  };
}

/** Drag vertex at flat index `i` to `(x, y)` (element-local); returns new points. */
export function dragVertexAt(el: LinearElement, i: number, x: number, y: number): number[] {
  const pts = [...el.points];
  pts[i] = x;
  pts[i + 1] = y;
  return pts;
}
