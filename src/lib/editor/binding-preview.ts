'use client';

/**
 * Live arrow/line endpoint binding preview — Excalidraw's `suggestedBinding`.
 *
 * While an endpoint is being dragged (or an arrow is being drawn), this
 * resolves the best bindable target for the endpoint's *current* position and
 * returns:
 *
 * - `points` — the endpoint position to render. It follows the pointer 1:1
 *   (Excalidraw), except for a tight magnetic snap to discrete anchor points
 *   (edge midpoints / corners / center) so common attachments click in
 *   without being sticky.
 * - `preview` — the geometry the interaction layer should draw so the user
 *   sees "this arrow is about to connect here": the target outline plus a dot
 *   on the exact attachment point the endpoint will snap to on release.
 *
 * No document state is touched: the returned points are only used to render
 * the live draft. The persistent binding is still created on pointerup by the
 * existing `resolveEndpointBinding` path, which re-derives it from the same
 * geometry — so preview and commit always agree.
 *
 * The detection threshold is Excalidraw's (`bindingDistanceImage`, zoom-aware,
 * 15–30 screen px); the midpoint/anchor snap threshold is tighter (≈8 screen
 * px), which is what makes connection feel magnetic rather than sticky.
 */

import type { ArrowElement, EditorElement, LineElement } from '@/types/editor';
import {
  anchorForBinding,
  isBindableElement,
  resolveEndpointBinding,
} from './binding';

export interface BindingPreview {
  targetId: string;
  /** Target bounds in image coordinates (for the outline highlight). */
  bounds: { x: number; y: number; w: number; h: number };
  /** Absolute image position the endpoint will land on. */
  anchor: { x: number; y: number };
  mode: 'inside' | 'orbit';
}

export interface EndpointSnapResult {
  points: number[];
  preview: BindingPreview | null;
}

type Pt = { x: number; y: number };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Axis-aligned bounds of a bindable element (mirrors binding.ts). */
function boundsOf(el: EditorElement, imageSize: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  if (el.type === 'step') {
    const r = (el as { radius?: number }).radius || 16;
    return { x: el.x - r, y: el.y - r, w: r * 2, h: r * 2 };
  }
  if (el.type === 'text') {
    const t = el as { width?: number; height?: number; text?: string; fontSize?: number; x: number; y: number };
    const w = t.width || Math.max(40, (t.text?.length || 1) * (t.fontSize || 24) * 0.55);
    const h = (t.fontSize || 24) * 1.4;
    return { x: t.x, y: t.y, w, h };
  }
  const w = Math.abs((el as { width: number }).width);
  const h = Math.abs((el as { height: number }).height);
  const x = (el as { width: number }).width < 0 ? el.x + (el as { width: number }).width : el.x;
  const y = (el as { height: number }).height < 0 ? el.y + (el as { height: number }).height : el.y;
  return { x, y, w, h };
}

/**
 * Anchor points worth snapping to, as normalized fixed points in the target's
 * local box (same convention as `FixedPointBinding.fixedPoint`). Edge
 * midpoints + corners + center — Excalidraw's midpoint snapping set.
 */
function snapCandidates(type: string): Array<[number, number]> {
  if (type === 'circle' || type === 'step') {
    return [
      [0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0.5],
    ];
  }
  if (type === 'diamond') {
    return [
      [0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0.5],
    ];
  }
  return [
    [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5],
    [0.5, 0.5],
  ];
}

/** Snap threshold in IMAGE px for the discrete anchor points (≈8 screen px). */
function midpointSnapDistanceImage(zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  return 8 / z;
}

/**
 * Resolve the live binding candidate for one endpoint of a line-like element.
 * Returns the snapped points (endpoint glued to the target outline or a
 * discrete anchor point) plus the preview geometry, or the input points
 * unchanged when no bindable target is within reach.
 */
export function snapEndpointForBinding(
  line: ArrowElement | LineElement,
  which: 'start' | 'end',
  points: number[],
  elements: EditorElement[],
  imageSize: { width: number; height: number },
  zoom: number,
  enabled: boolean,
): EndpointSnapResult {
  if (!enabled) return { points, preview: null };
  const eIdx = which === 'start' ? 0 : points.length - 2;
  const abs: Pt = { x: line.x + points[eIdx], y: line.y + points[eIdx + 1] };

  const candidate = resolveEndpointBinding(
    { ...line, points: points as [number, number, number, number] },
    which,
    elements,
    imageSize,
    zoom,
  );
  if (!candidate) return { points, preview: null };
  // 'skip' is reserved for multi-point intermediates that must not pin; a
  // 'skip' candidate never binds, so there is nothing to preview.
  if (candidate.mode === 'skip') return { points, preview: null };
  const target = elements.find((el) => el.id === candidate.elementId);
  if (!target || !isBindableElement(target)) return { points, preview: null };

  const box = boundsOf(target, imageSize);
  const mode = candidate.mode;
  // Where the endpoint will land on release (the binding anchor).
  const anchor = anchorForBinding(target, candidate.fixedPoint, mode, imageSize);

  // Midpoint/anchor snapping: within the tighter threshold of a discrete
  // attachment point the endpoint magnetically follows it; otherwise it
  // tracks the pointer 1:1 (Excalidraw behavior).
  let snap: Pt | null = null;
  const snapDist = midpointSnapDistanceImage(zoom);
  for (const [fx, fy] of snapCandidates(target.type)) {
    const a = anchorForBinding(target, [clamp01(fx), clamp01(fy)], mode, imageSize);
    if (Math.hypot(a.x - abs.x, a.y - abs.y) < snapDist) {
      snap = a;
      break;
    }
  }

  const next = [...points];
  if (snap) {
    next[eIdx] = snap.x - line.x;
    next[eIdx + 1] = snap.y - line.y;
  }
  return {
    points: next,
    preview: {
      targetId: target.id,
      bounds: box,
      anchor: snap ?? anchor,
      mode,
    },
  };
}
