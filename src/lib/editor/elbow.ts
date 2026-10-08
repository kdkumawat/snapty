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

/** How far an elbow runs straight out of a bound shape before turning (Excalidraw pads bound shapes by 40). */
const STUB = 40;

function step(p: Pt, h: Heading, d: number): Pt {
  if (h === 'n') return { x: p.x, y: p.y - d };
  if (h === 's') return { x: p.x, y: p.y + d };
  if (h === 'e') return { x: p.x + d, y: p.y };
  if (h === 'w') return { x: p.x - d, y: p.y };
  return p;
}

/**
 * Orthogonal route between two absolute points. Returns the interior
 * vertices (excluding start/end). A bound end leaves its shape square to the
 * side it sits on (its heading) for STUB px before turning, so the arrow
 * meets the shape head-on as in Excalidraw; free ends turn straight away.
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

  const a = step(start, startHeading, STUB);
  const b = step(end, endHeading, STUB);
  // A free end takes the axis of the other end's stub, or the longer axis.
  const fallback = Math.abs(dx) >= Math.abs(dy);
  const aH = startHeading ? horiz(startHeading) : endHeading ? !horiz(endHeading) : fallback;
  const bH = endHeading ? horiz(endHeading) : aH ? false : true;

  const mid: Pt[] = [];
  if (aH && bH) {
    // Both stubs horizontal: join them with one vertical run. Stubs that
    // point the same way share the far side so the route never doubles back.
    const x = startHeading && startHeading === endHeading
      ? (startHeading === 'e' ? Math.max(a.x, b.x) : Math.min(a.x, b.x))
      : (a.x + b.x) / 2;
    mid.push({ x, y: a.y }, { x, y: b.y });
  } else if (!aH && !bH) {
    const y = startHeading && startHeading === endHeading
      ? (startHeading === 's' ? Math.max(a.y, b.y) : Math.min(a.y, b.y))
      : (a.y + b.y) / 2;
    mid.push({ x: a.x, y }, { x: b.x, y });
  } else if (aH) {
    mid.push({ x: b.x, y: a.y });
  } else {
    mid.push({ x: a.x, y: b.y });
  }

  // Drop repeated and collinear points (the stubs often line up with a run).
  const all = [start, ...(startHeading ? [a] : []), ...mid, ...(endHeading ? [b] : []), end];
  const out: Pt[] = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const p = all[i];
    const q = out[out.length - 1];
    if (Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6) continue;
    const r = out[out.length - 2];
    if (r && ((Math.abs(r.x - q.x) < 1e-6 && Math.abs(q.x - p.x) < 1e-6) || (Math.abs(r.y - q.y) < 1e-6 && Math.abs(q.y - p.y) < 1e-6))) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out.slice(1, -1);
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
