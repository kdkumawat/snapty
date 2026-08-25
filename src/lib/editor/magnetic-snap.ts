/**
 * Magnetic snap during drag.
 *
 * Distinct from `snap-guides.ts` (which handles alignment + equal-spacing of
 * edge midpoints) and from `binding.ts` (which pins arrow endpoints to shape
 * outlines). This is the Excalidraw "stick to neighbor" feel: when dragging
 * a shape near another, the moving shape's center, edges, and corners lock
 * onto the corresponding features of any neighbor within `threshold`.
 *
 * Returns the smallest `{dx, dy}` correction that engages at least one
 * magnetic candidate, plus the full list of candidates (winning + losing) so
 * the caller can render guide lines — losing candidates at 0.4 opacity so
 * the user sees why the drag "stuck" at a particular spot.
 */
import type { Bounds } from '@/lib/editor/snap-guides';

export type MagneticAnchor =
  | 'left' | 'center-x' | 'right'
  | 'top'  | 'center-y' | 'bottom'
  | 'tl' | 'tr' | 'bl' | 'br';

export interface MagneticCandidate {
  moving: MagneticAnchor;
  other: MagneticAnchor;
  /** The (dx,dy) that would snap moving's anchor onto other's anchor. */
  delta: { x: number; y: number };
  /** Euclidean distance between the two anchors (in image units). */
  distance: number;
  /** True for the candidate(s) actually applied; false for losing guides. */
  winner: boolean;
}

export interface MagneticSnapResult {
  dx: number;
  dy: number;
  candidates: MagneticCandidate[];
}

const MOVING_ANCHORS_X: MagneticAnchor[] = ['left', 'center-x', 'right'];
const MOVING_ANCHORS_Y: MagneticAnchor[] = ['top', 'center-y', 'bottom'];
const CORNERS: MagneticAnchor[] = ['tl', 'tr', 'bl', 'br'];

function anchorX(b: Bounds, a: MagneticAnchor): number {
  switch (a) {
    case 'left': case 'tl': case 'bl': return b.x;
    case 'center-x': return b.x + b.w / 2;
    case 'right': case 'tr': case 'br': return b.x + b.w;
    default: return b.x;
  }
}

function anchorY(b: Bounds, a: MagneticAnchor): number {
  switch (a) {
    case 'top': case 'tl': case 'tr': return b.y;
    case 'center-y': return b.y + b.h / 2;
    case 'bottom': case 'bl': case 'br': return b.y + b.h;
    default: return b.y;
  }
}

function anchorPair(from: MagneticAnchor): [MagneticAnchor, MagneticAnchor[]] {
  if (from === 'tl' || from === 'tr' || from === 'bl' || from === 'br') {
    return [from, CORNERS];
  }
  if (MOVING_ANCHORS_X.includes(from)) return [from, MOVING_ANCHORS_X];
  return [from, MOVING_ANCHORS_Y];
}

export function magneticSnap(
  moving: Bounds,
  others: Bounds[],
  threshold: number,
): MagneticSnapResult {
  if (!others.length || threshold <= 0) {
    return { dx: 0, dy: 0, candidates: [] };
  }

  // Pre-filter: only neighbors within 4*threshold of the moving bounds matter
  // (cheap). Bounds comparison in image units.
  const expanded: Bounds = {
    x: moving.x - 4 * threshold,
    y: moving.y - 4 * threshold,
    w: moving.w + 8 * threshold,
    h: moving.h + 8 * threshold,
  };
  const close = others.filter(
    (o) =>
      o.x + o.w >= expanded.x &&
      o.x <= expanded.x + expanded.w &&
      o.y + o.h >= expanded.y &&
      o.y <= expanded.y + expanded.h,
  );
  if (!close.length) return { dx: 0, dy: 0, candidates: [] };

  type XHit = { moving: MagneticAnchor; other: MagneticAnchor; delta: number; distance: number };
  type YHit = { moving: MagneticAnchor; other: MagneticAnchor; delta: number; distance: number };

  const xHits: XHit[] = [];
  const yHits: YHit[] = [];

  for (const o of close) {
    for (const ma of MOVING_ANCHORS_X) {
      for (const oa of MOVING_ANCHORS_X) {
        const mvX = anchorX(moving, ma);
        const otX = anchorX(o, oa);
        const delta = otX - mvX;
        if (Math.abs(delta) <= threshold) {
          xHits.push({ moving: ma, other: oa, delta, distance: Math.abs(delta) });
        }
      }
    }
    for (const ma of MOVING_ANCHORS_Y) {
      for (const oa of MOVING_ANCHORS_Y) {
        const mvY = anchorY(moving, ma);
        const otY = anchorY(o, oa);
        const delta = otY - mvY;
        if (Math.abs(delta) <= threshold) {
          yHits.push({ moving: ma, other: oa, delta, distance: Math.abs(delta) });
        }
      }
    }
    for (const ca of CORNERS) {
      const mvX = anchorX(moving, ca);
      const mvY = anchorY(moving, ca);
      for (const oc of CORNERS) {
        const otX = anchorX(o, oc);
        const otY = anchorY(o, oc);
        const dx = otX - mvX;
        const dy = otY - mvY;
        if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) {
          // represent as a synthetic edge-aligned candidate: we'll combine
          // dx with the closest x-axis anchor and dy with the closest y-axis
          // anchor below; for the candidates list we emit a corner hit only
          // when both axes tie to a single edge anchor pair.
          xHits.push({ moving: ca, other: oc, delta: dx, distance: Math.abs(dx) });
          yHits.push({ moving: ca, other: oc, delta: dy, distance: Math.abs(dy) });
        }
      }
    }
  }

  if (!xHits.length && !yHits.length) {
    return { dx: 0, dy: 0, candidates: [] };
  }

  // Pick the closest hit on each axis. If a corner's dx wins, force the
  // matching corner dy to win too (so we lock to the corner, not a phantom
  // edge).
  const xBest = pickBest(xHits);
  const yBest = pickBest(yHits);

  let dx = xBest ? xBest.delta : 0;
  let dy = yBest ? yBest.delta : 0;

  if (xBest && yBest && isCorner(xBest.moving) && isCorner(yBest.moving) &&
      xBest.moving !== yBest.moving) {
    // mismatched corners — keep the closer one and pin the other to the same
    // corner so we lock fully.
    if (xBest.distance <= yBest.distance) {
      const corner = xBest.moving;
      const yCorner = yHits.find(
        (h) => h.moving === corner && h.other === xBest.other,
      );
      if (yCorner) {
        dy = yCorner.delta;
      }
    } else {
      const corner = yBest.moving;
      const xCorner = xHits.find(
        (h) => h.moving === corner && h.other === yBest.other,
      );
      if (xCorner) {
        dx = xCorner.delta;
      }
    }
  }

  // Build candidate list for guide rendering. Winners are xBest and yBest.
  const winnerSet = new Set<string>();
  if (xBest) winnerSet.add(winnerKey(xBest.moving, xBest.other, 'x'));
  if (yBest) winnerSet.add(winnerKey(yBest.moving, yBest.other, 'y'));

  const candidates: MagneticCandidate[] = [];
  // axis-aligned: xHits + yHits collapsed to the chosen winners
  if (xBest) {
    const [mAnchor, _mGroup] = anchorPair(xBest.moving);
    candidates.push({
      moving: mAnchor,
      other: xBest.other,
      delta: { x: xBest.delta, y: 0 },
      distance: xBest.distance,
      winner: true,
    });
  }
  if (yBest) {
    const [mAnchor] = anchorPair(yBest.moving);
    candidates.push({
      moving: mAnchor,
      other: yBest.other,
      delta: { x: 0, y: yBest.delta },
      distance: yBest.distance,
      winner: true,
    });
  }

  // losing candidates within threshold (faint guides)
  for (const h of xHits) {
    if (winnerSet.has(winnerKey(h.moving, h.other, 'x'))) continue;
    const [mAnchor] = anchorPair(h.moving);
    candidates.push({
      moving: mAnchor,
      other: h.other,
      delta: { x: h.delta, y: 0 },
      distance: h.distance,
      winner: false,
    });
  }
  for (const h of yHits) {
    if (winnerSet.has(winnerKey(h.moving, h.other, 'y'))) continue;
    const [mAnchor] = anchorPair(h.moving);
    candidates.push({
      moving: mAnchor,
      other: h.other,
      delta: { x: 0, y: h.delta },
      distance: h.distance,
      winner: false,
    });
  }

  return { dx, dy, candidates };
}

function pickBest<T extends { distance: number }>(hits: T[]): T | null {
  if (!hits.length) return null;
  let best = hits[0]!;
  for (let i = 1; i < hits.length; i++) {
    if (hits[i]!.distance < best.distance) best = hits[i]!;
  }
  return best;
}

function isCorner(a: MagneticAnchor): boolean {
  return a === 'tl' || a === 'tr' || a === 'bl' || a === 'br';
}

function winnerKey(m: MagneticAnchor, o: MagneticAnchor, axis: 'x' | 'y'): string {
  return `${axis}:${m}:${o}`;
}
