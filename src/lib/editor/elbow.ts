'use client';

/**
 * Elbow (orthogonal) arrows — Excalidraw's `elbowArrow.ts` adapted to
 * Snapty's scale (see excalidraw-gap-analysis.md §5).
 *
 * Excalidraw routes elbow arrows with an A* search over a dynamic grid that
 * dodges bindable shapes. Snapty is a screenshot editor with few overlapping
 * shapes; this module implements the same *conceptual* model with a simple
 * deterministic Manhattan router:
 *
 * - The path is an orthogonal polyline: start → one or two corners → end.
 * - The corner axis is chosen from the endpoints' relative position, with
 *   the bound endpoints' side headings used to break ties and to avoid
 *   immediately routing back into the shape the arrow exits from.
 * - The data model is compatible with upgrading to the full router later:
 *   the element stores `elbowed: true` and the routed interior vertices live
 *   in `points` (first/last = the bound/free endpoints).
 */

import type { Pt } from './linear-editor';

export type Heading = 'n' | 's' | 'e' | 'w' | null;

/**
 * Side heading implied by a normalized fixed point on a box target:
 * x ≈ 0 → west, x ≈ 1 → east, y ≈ 0 → north, y ≈ 1 → south, center → null.
 * The heading describes which way the arrow LEAVES the shape at that anchor.
 */
export function headingFromFixedPoint(fp: [number, number] | undefined): Heading {
  if (!fp) return null;
  const [fx, fy] = fp;
  const tx = Math.abs(fx - 0.5);
  const ty = Math.abs(fy - 0.5);
  // Prefer the axis the point is furthest from center on; near-center ties
  // fall through to null (no strong side).
  if (tx < 0.12 && ty < 0.12) return null;
  if (tx > ty) return fx > 0.5 ? 'e' : 'w';
  return fy > 0.5 ? 's' : 'n';
}

function horiz(h: Heading): boolean {
  return h === 'e' || h === 'w';
}

/**
 * Orthogonal route between two absolute points. Returns the interior
 * vertices (excluding start/end). The route never leaves the bounding box of
 * the two endpoints, so bound elbows stay tight.
 */
export function routeElbow(
  start: Pt,
  end: Pt,
  startHeading: Heading = null,
  endHeading: Heading = null,
): Pt[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Degenerate: identical points → no interior vertex.
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [];

  // Route axis preference. Exit headings get first say (an arrow leaving
  // horizontally keeps going horizontally), then the longer axis wins, then
  // a fixed default (horizontal) keeps behavior deterministic.
  let horizontalFirst: boolean;
  if (horiz(startHeading) !== horiz(endHeading)) {
    horizontalFirst = horiz(startHeading);
  } else if (startHeading && endHeading) {
    horizontalFirst = horiz(startHeading) && horiz(endHeading);
  } else {
    horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  }

  if (horizontalFirst) {
    // start → (end.x, start.y) → end : horizontal leg first, then vertical.
    return [{ x: end.x, y: start.y }];
  }
  // start → (start.x, end.y) → end : vertical leg first, then horizontal.
  return [{ x: start.x, y: end.y }];
}

/**
 * Build the full flat points array (element-local) for an elbow arrow whose
 * endpoints are known. `origin` is the element position.
 */
export function elbowPointsLocal(
  origin: Pt,
  startAbs: Pt,
  endAbs: Pt,
  startHeading: Heading = null,
  endHeading: Heading = null,
): number[] {
  const interior = routeElbow(startAbs, endAbs, startHeading, endHeading);
  const pts: number[] = [
    startAbs.x - origin.x, startAbs.y - origin.y,
  ];
  for (const p of interior) pts.push(p.x - origin.x, p.y - origin.y);
  pts.push(endAbs.x - origin.x, endAbs.y - origin.y);
  return pts;
}
