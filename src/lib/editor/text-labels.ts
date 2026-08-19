'use client';

import type {
  EditorElement,
  ArrowElement,
  LineElement,
  PencilElement,
  TextElement,
} from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { TEXT_PADDING, TEXT_LINE_HEIGHT, HANDWRITTEN_FONT } from '@/types/editor';
import { controlPoint } from '@/lib/editor/curve';

/**
 * Centralized geometry + creation for text labels attached to drawn shapes.
 *
 * Every shape (rectangle, circle, diamond, arrow, line, freehand stroke)
 * can carry a label that moves and resizes with it. All the placement math
 * lives here so the label editor, the committed element, and any Konva node
 * agree on where the text lands.
 *
 * Two label models, mirroring Excalidraw:
 *
 * - Closed shapes (rectangle/circle/diamond): the label lives INSIDE the
 *   shape's inner box. `verticalAlign` picks top/middle/bottom placement;
 *   the box height is part of the anchor so Konva can center the block.
 * - Line-like elements (arrow/line): the label sits ON the stroke at
 *   `labelOffset` (0..1 along the path, default 0.5 = midpoint). The stroke
 *   is clipped behind the label box so the text never crosses the line.
 */

export type LabelAnchor = { x: number; y: number; width: number; height?: number };

const CLOSED_SHAPES = new Set(['rectangle', 'rounded-rect', 'circle', 'diamond', 'callout']);

/**
 * True when `groupId` describes a shape↔label pair: exactly one text member
 * and one non-text member sharing the group. User groups with more members
 * (or no text) are not pairs and keep whole-group selection semantics.
 */
export function isLabelPairGroup(groupId: string, elements: EditorElement[]): boolean {
  let text = 0;
  let nonText = 0;
  for (const el of elements) {
    if (el.groupId !== groupId) continue;
    if (el.type === 'text') text++;
    else nonText++;
  }
  return text === 1 && nonText === 1;
}

/**
 * Expand a set of element ids to include the partner of any shape↔label pair.
 *
 * - `fromShapeOnly` (delete/eraser): removing a shape also removes its label,
 *   but removing the label alone leaves the shape intact — so only the
 *   non-text member pulls its text partner in.
 * - Otherwise (duplicate/copy): either member pulls the whole pair, since a
 *   clone/paste of one half must never strand the other.
 */
export function expandLabelPairs(
  elements: EditorElement[],
  ids: Iterable<string>,
  fromShapeOnly = false,
): Set<string> {
  const out = new Set(ids);
  const byId = new Map(elements.map((el) => [el.id, el]));
  for (const id of ids) {
    const el = byId.get(id);
    if (!el || !el.groupId) continue;
    if (fromShapeOnly && el.type === 'text') continue;
    if (!isLabelPairGroup(el.groupId, elements)) continue;
    for (const other of elements) {
      if (other.id !== id && other.groupId === el.groupId) out.add(other.id);
    }
  }
  return out;
}

function isClosedShape(el: EditorElement): boolean {
  return CLOSED_SHAPES.has(el.type);
}

/** Inner box of a closed shape (bounds minus padding), used as the label area. */
export function innerBoxOf(
  el: EditorElement,
  imageSize: { width: number; height: number },
  pad: number,
): { x: number; y: number; w: number; h: number } {
  const bounds = getElementBounds(el, imageSize);
  const w = Math.max(20, bounds.w - pad * 2);
  const h = Math.max(20, bounds.h - pad * 2);
  return {
    x: bounds.x + (bounds.w - w) / 2,
    y: bounds.y + (bounds.h - h) / 2,
    w,
    h,
  };
}

/**
 * Where a label box should sit for a given shape, in image units, returning
 * the box's top-left corner + width. Closed shapes use the inner box (height
 * included so the caller can center text vertically); line-like elements use
 * the point at `labelOffset` along the stroke, clamped so the box stays inside
 * the arrow's bounding box.
 */
export function labelAnchorForElement(
  el: EditorElement,
  imageSize: { width: number; height: number },
  fontSize: number,
  scale: number,
  label?: { labelOffset?: number; labelOffsetY?: number; text?: string; width?: number },
): LabelAnchor {
  const bounds = getElementBounds(el, imageSize);
  const pad = TEXT_PADDING * scale;

  if (isClosedShape(el)) {
    const box = innerBoxOf(el, imageSize, pad);
    return { x: box.x, y: box.y, width: box.w, height: box.h };
  }

  const isLineLike =
    el.type === 'arrow' || el.type === 'line' || el.type === 'pencil' || el.type === 'highlighter';

  if (isLineLike && (el.type === 'arrow' || el.type === 'line')) {
    const t = clamp01(label?.labelOffset ?? 0.5);
    const pt = pointAlongPath(el, t);
    // Box width is capped so a long label cannot exceed the arrow's bbox.
    const width = Math.max(48, Math.min(bounds.w, label?.width ?? 220));
    let x = pt.x + el.x - width / 2;
    let y = pt.y + el.y - (fontSize * TEXT_LINE_HEIGHT) / 2;
    // Perpendicular offset (image px): the label sits beside the stroke on the
    // side picked by the drag. The offset is applied along the path normal so
    // bends keep the label at the same visual distance from the line.
    const offsetY = label?.labelOffsetY ?? 0;
    if (offsetY !== 0) {
      const tan = tangentAlongPath(el, t);
      x += -tan.y * offsetY;
      y += tan.x * offsetY;
    }
    return { x, y, width };
  }

  // Freehand: center of the stroke's bounds.
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const width = Math.max(48, Math.min(bounds.w, 220));
  return { x: cx - width / 2, y: cy - (fontSize * TEXT_LINE_HEIGHT) / 2, width };
}

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Point at fraction `t` (0..1) along an arrow/line path, element-local coords. */
export function pointAlongPath(el: ArrowElement | LineElement, t: number): { x: number; y: number } {
  const pts = el.points ?? [0, 0, 0, 0];
  const bend = (el as { bend?: number }).bend ?? 0;

  // Multi-point polyline: walk by arc length so equal spacing on screen,
  // not equal vertex index, maps to equal t.
  if (pts.length > 4) {
    const segs: { a: number; b: number }[] = [];
    let total = 0;
    for (let i = 0; i < pts.length - 2; i += 2) {
      const len = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
      segs.push({ a: total, b: total + len });
      total += len;
    }
    if (total <= 0) return { x: pts[0], y: pts[1] };
    const target = t * total;
    for (let i = 0; i < segs.length; i++) {
      const { a, b } = segs[i];
      if (target <= b) {
        const k = total > 0 && b - a > 0 ? (target - a) / (b - a) : 0;
        return {
          x: pts[i] + (pts[i + 2] - pts[i]) * k,
          y: pts[i + 1] + (pts[i + 3] - pts[i + 1]) * k,
        };
      }
    }
    const last = pts.length - 2;
    return { x: pts[last], y: pts[last + 1] };
  }

  // Quadratic Bézier (bend 0 collapses to the chord).
  const [sx, sy, ex, ey] = pts;
  const c = controlPoint(sx, sy, ex, ey, bend);
  const u = 1 - t;
  return {
    x: u * u * sx + 2 * u * t * c.x + t * t * ex,
    y: u * u * sy + 2 * u * t * c.y + t * t * ey,
  };
}

/**
 * Unit tangent of the path at fraction `t` (0..1), element-local coords.
 * Computed numerically from neighboring samples so it is correct for both
 * quadratic-bezier bends and straight-segment polylines.
 */
export function tangentAlongPath(el: ArrowElement | LineElement, t: number): { x: number; y: number } {
  const dt = 0.001;
  const a = pointAlongPath(el, clamp01(t - dt));
  const b = pointAlongPath(el, clamp01(t + dt));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Project an element-local point onto the path and return the nearest
 * fraction t (0..1). Used when dragging a label along its arrow.
 */
export function projectPointToPath(
  el: ArrowElement | LineElement,
  px: number,
  py: number,
): number {
  const N = 48;
  let best = 0;
  let bestDist = Infinity;
  let prev = pointAlongPath(el, 0);
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const cur = pointAlongPath(el, t);
    // Distance from (px,py) to segment prev->cur (perpendicular + clamping).
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const len2 = dx * dx + dy * dy;
    let k = len2 > 0 ? ((px - prev.x) * dx + (py - prev.y) * dy) / len2 : 0;
    k = Math.max(0, Math.min(1, k));
    const cx = prev.x + dx * k;
    const cy = prev.y + dy * k;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = (i - 1 + k) / N;
    }
    prev = cur;
  }
  return clamp01(best);
}

/** Estimated height of a label box in image units (for hit areas / clipping). */
export function estimateLabelHeight(textEl: TextElement, fontSize: number): number {
  const fs = textEl.fontSize ?? fontSize;
  const text = textEl.text ?? '';
  const lines = text.split('\n').length;
  const wrapGuess = textEl.width && textEl.width > 0 ? Math.max(1, Math.ceil(text.length / 14)) : 1;
  return Math.max(1, Math.max(lines, wrapGuess)) * fs * TEXT_LINE_HEIGHT + (textEl.padding ?? TEXT_PADDING) * 2;
}

/** The midpoint of a line/arrow stroke, used to anchor arrow labels. */
export function strokeMidpoint(el: ArrowElement | LineElement): { x: number; y: number } {
  const pts = el.points ?? [0, 0, 0, 0];
  // Multi-point polylines: midpoint of the full vertex list.
  if (pts.length > 4) {
    const n = pts.length / 2;
    const i = Math.floor(n / 2) * 2;
    return {
      x: el.x + (pts[i] + pts[i + 2]) / 2,
      y: el.y + (pts[i + 1] + pts[i + 3]) / 2,
    };
  }
  return {
    x: el.x + (pts[0] + pts[2]) / 2,
    y: el.y + (pts[1] + pts[3]) / 2,
  };
}

/** Bounds center for a freehand stroke (its raw points are absolute coords). */
export function freehandCenter(el: PencilElement): { x: number; y: number } {
  const pts = el.points ?? [];
  if (pts.length < 2) return { x: el.x, y: el.y };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxX = Math.max(maxX, pts[i]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Common text styling for a freshly attached label. */
export type LabelStyle = {
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  align: 'left' | 'center' | 'right';
  fill: string;
  opacity: number;
};

/**
 * Build a TextElement for an attached label. Callers wrap it in a single
 * undo step together with the groupId assignment on the shape.
 */
export function createAttachedLabel(
  id: string,
  groupId: string,
  anchor: LabelAnchor,
  style: LabelStyle,
  existing?: Partial<
    Pick<TextElement, 'text' | 'width' | 'padding' | 'lineHeight' | 'verticalAlign' | 'labelOffset'>
  >,
): TextElement {
  return {
    id,
    type: 'text',
    x: anchor.x,
    y: anchor.y,
    text: existing?.text ?? '',
    fontSize: style.fontSize,
    fontFamily: style.fontFamily || HANDWRITTEN_FONT,
    fontStyle: style.fontStyle || 'normal',
    align: style.align,
    width: existing?.width ?? anchor.width,
    height: anchor.height,
    verticalAlign: existing?.verticalAlign ?? 'middle',
    labelOffset: existing?.labelOffset ?? 0.5,
    fill: style.fill,
    opacity: style.opacity,
    padding: existing?.padding ?? TEXT_PADDING,
    lineHeight: existing?.lineHeight ?? TEXT_LINE_HEIGHT,
    groupId,
  };
}

/**
 * Clip a polyline (element-local points) against an axis-aligned rect,
 * returning the segments that lie OUTSIDE the rect. Used to erase the
 * arrow stroke behind its label: the label box is the rect, and the line is
 * redrawn as up to two pieces (before / after the box).
 */
export function clipPolylineAgainstRect(
  points: number[],
  rect: { x: number; y: number; w: number; h: number },
): number[][] {
  if (points.length < 4) return [points];
  const segments: number[][] = [];
  let run: number[] = [];

  const flush = () => {
    if (run.length >= 4) segments.push(run);
    run = [];
  };

  const inside = (x: number, y: number) =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  // Liang–Barsky: the fraction window [t0, t1] of the segment that lies INSIDE
  // the rect (null when the segment misses it entirely).
  const liangBarsky = (
    x1: number, y1: number, x2: number, y2: number,
    r: { x: number; y: number; w: number; h: number },
  ): { t0: number; t1: number } | null => {
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null; // parallel and outside
      } else {
        const rq = q[i] / p[i];
        if (p[i] < 0) {
          if (rq > t1) return null;
          if (rq > t0) t0 = rq;
        } else {
          if (rq < t0) return null;
          if (rq < t1) t1 = rq;
        }
      }
    }
    return t0 < t1 ? { t0, t1 } : null;
  };

  if (points.length < 4) return [points];
  let px = points[0];
  let py = points[1];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const clip = liangBarsky(px, py, x, y, rect);
    const curInside = inside(x, y);

    if (!clip) {
      // Segment entirely outside the rect: keep it.
      if (run.length === 0) run.push(px, py);
      run.push(x, y);
    } else if (clip.t0 <= 0 && clip.t1 >= 1) {
      // Segment entirely inside: drop it and end any pending run.
      flush();
    } else {
      // Partially inside: keep the outside pieces, cutting at the borders.
      if (clip.t0 > 0) {
        // Outside piece before the rect (runs into the entry border).
        if (run.length === 0) run.push(px, py);
        run.push(px + (x - px) * clip.t0, py + (y - py) * clip.t0);
        flush();
      }
      if (clip.t1 < 1) {
        // Outside piece after the rect (starts at the exit border; the next
        // outside segment continues it and appends its own endpoint).
        run.push(px + (x - px) * clip.t1, py + (y - py) * clip.t1);
      }
    }

    // If the current point is outside the rect, make sure the active run ends
    // on it (the entirely-outside branch already pushed it — avoid dupes).
    if (curInside) {
      flush();
    } else if (run.length > 0 && (run[run.length - 2] !== x || run[run.length - 1] !== y)) {
      run.push(x, y);
    }
    px = x;
    py = y;
  }
  flush();
  return segments;
}
