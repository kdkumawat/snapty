'use client';

import { leaderGeometry } from '@/lib/editor/magnifier-geometry';
import type {
  EditorElement,
  ArrowElement,
  LineElement,
  PencilElement,
  TextElement,
} from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { TEXT_PADDING, TEXT_LINE_HEIGHT, HANDWRITTEN_FONT, type CalloutElement } from '@/types/editor';
import { controlPoint } from '@/lib/editor/curve';
import { layoutText, measureTextWidth } from '@/lib/editor/text-layout';

export { measureTextWidth };

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
 *
 * Legacy detection path — new code should prefer `isContainerText` /
 * `resolveContainerShape` for the explicit `containerId` relationship.
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
 * Fast-path: a text element is a container label when it has `containerId`
 * set. Falls back to the legacy groupId pair when not (so old projects keep
 * rendering without migration).
 */
export function isContainerText(
  el: EditorElement,
  elements: EditorElement[],
): boolean {
  if (el.type !== 'text') return false;
  if (el.containerId) {
    return elements.some((other) => other.id === el.containerId);
  }
  return !!el.groupId && isLabelPairGroup(el.groupId, elements);
}

/**
 * Expand a set of element ids to include the partner of any shape↔label pair.
 *
 * - `fromShapeOnly` (delete/eraser): removing a shape also removes its label,
 *   but removing the label alone leaves the shape intact — so only the
 *   non-text member pulls its text partner in.
 * - Otherwise (duplicate/copy): either member pulls the whole pair, since a
 *   clone/paste of one half must never strand the other.
 *
 * Honours both the explicit `containerId` binding and the legacy
 * `groupId`-pair detection so old projects still work.
 */
export function expandLabelPairs(
  elements: EditorElement[],
  ids: Iterable<string>,
  fromShapeOnly = false,
): Set<string> {
  const out = new Set(ids);
  const byId = new Map(elements.map((el) => [el.id, el]));
  // Build the full container relationship in one pass so we can resolve
  // any element (text or shape) to its label-partners in O(1).
  const textByContainer = new Map<string, string[]>();
  const legacyPairByMember = new Map<string, string>();
  for (const el of elements) {
    if (el.type === 'text' && el.containerId) {
      const list = textByContainer.get(el.containerId) ?? [];
      list.push(el.id);
      textByContainer.set(el.containerId, list);
    }
  }
  for (const el of elements) {
    if (el.type === 'text' && el.groupId && isLabelPairGroup(el.groupId, elements)) {
      for (const other of elements) {
        if (other.id !== el.id && other.groupId === el.groupId) {
          legacyPairByMember.set(el.id, other.id);
          legacyPairByMember.set(other.id, el.id);
        }
      }
    }
  }

  for (const id of ids) {
    const el = byId.get(id);
    if (!el) continue;
    if (fromShapeOnly && el.type === 'text') continue;

    // containerId path: the shape pulls ALL of its labels in.
    if (el.type !== 'text' && textByContainer.has(el.id)) {
      for (const labelId of textByContainer.get(el.id)!) out.add(labelId);
    }
    if (el.type === 'text' && el.containerId) {
      // text pulling its container: only on copy/duplicate, not on delete.
      if (!fromShapeOnly) out.add(el.containerId);
    }
    // legacy groupId pair
    if (el.groupId) {
      if (!isLabelPairGroup(el.groupId, elements)) continue;
      const partner = legacyPairByMember.get(id);
      if (partner) out.add(partner);
    }
  }
  return out;
}

export function isClosedShape(el: EditorElement): boolean {
  return CLOSED_SHAPES.has(el.type);
}

/**
 * Which element id should own selection chrome after a click.
 *
 * Closed-shape + text pairs behave as one object (click either → the shape).
 * Arrow/line labels stay independently selectable so they can slide on the path.
 * Honours the explicit `containerId` first, then falls back to the legacy
 * `groupId`-pair detection.
 */
export function selectionTargetForClick(
  clicked: EditorElement,
  elements: EditorElement[],
): string {
  // containerId path: clicking a label routes to its container.
  if (clicked.type === 'text' && clicked.containerId) {
    return clicked.containerId;
  }
  if (!clicked.groupId || !isLabelPairGroup(clicked.groupId, elements)) return clicked.id;
  const pair = elements.filter((el) => el.groupId === clicked.groupId);
  const container = pair.find((el) => el.type !== 'text' && isClosedShape(el));
  if (container) return container.id;
  return clicked.id;
}

/** The non-clicked member of a shape↔label pair, or undefined. */
export function labelPairPartner(
  el: EditorElement,
  elements: EditorElement[],
): EditorElement | undefined {
  // containerId path: text → its container; container → its primary label.
  if (el.containerId) {
    const partner = elements.find((other) => other.id === el.containerId);
    if (partner) return partner;
  }
  if (el.type === 'text' && el.containerId) {
    return elements.find((other) => other.id === el.containerId);
  }
  if (el.type !== 'text') {
    const labelIds = (el as { labelIds?: string[] }).labelIds;
    if (labelIds?.length) {
      const first = elements.find((other) => other.id === labelIds[0]);
      if (first) return first;
    }
  }
  if (!el.groupId || !isLabelPairGroup(el.groupId, elements)) return undefined;
  return elements.find((other) => other.id !== el.id && other.groupId === el.groupId);
}

/** Inner box of a closed shape (bounds minus padding), used as the label area. */
export function innerBoxOf(
  el: EditorElement,
  imageSize: { width: number; height: number },
  pad: number,
): { x: number; y: number; w: number; h: number } {
  // For callouts, center text in the body only (exclude pointer area)
  // so text sits in the visible rounded-rect, not shifted by the tail.
  if (el.type === 'callout') {
    const co = el as CalloutElement;
    const cw = Math.abs(co.width);
    const ch = Math.abs(co.height);
    const cx = co.width < 0 ? el.x + co.width : el.x;
    const cy = co.height < 0 ? el.y + co.height : el.y;
    const w = Math.max(20, cw - pad * 2);
    const h = Math.max(20, ch - pad * 2);
    return { x: cx + pad, y: cy + pad, w, h };
  }
  const bounds = getElementBounds(el, imageSize);
  // Excalidraw: the text area is the inscribed rectangle (ellipse: side * sqrt(1/2), diamond: side / 2).
  const k = el.type === 'circle' ? Math.SQRT1_2 : el.type === 'diamond' ? 0.5 : 1;
  const w = Math.max(20, bounds.w * k - pad * 2);
  const h = Math.max(20, bounds.h * k - pad * 2);
  // A shape rotates about its top-left origin, so its visual centre moves
  // with the angle; the label box (which spins about its own centre) is
  // seated on that true centre.
  const rot = (((el as { rotation?: number }).rotation ?? 0) * Math.PI) / 180;
  const cx = bounds.x + (Math.cos(rot) * bounds.w - Math.sin(rot) * bounds.h) / 2;
  const cy = bounds.y + (Math.sin(rot) * bounds.w + Math.cos(rot) * bounds.h) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
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
  label?: Partial<Pick<TextElement, 'labelOffset' | 'labelOffsetY' | 'text' | 'width' | 'fontSize' | 'fontFamily' | 'fontStyle' | 'padding' | 'lineHeight'>>,
): LabelAnchor {
  const bounds = getElementBounds(el, imageSize);
  const pad = TEXT_PADDING * scale;

  if (isClosedShape(el)) {
    // The text node pads itself by TEXT_PADDING; one more px per side gives
    // Excalidraw's 5px bound-text padding without padding twice.
    const box = innerBoxOf(el, imageSize, pad / TEXT_PADDING);
    return { x: box.x, y: box.y, width: box.w, height: box.h };
  }

  // Magnifier: the label rides the middle of its connecting arrow.
  if (el.type === 'magnifier') {
    const g = leaderGeometry(el, imageSize);
    const width = 220;
    return {
      x: el.x + g.cx - width / 2,
      y: el.y + g.cy - (fontSize * TEXT_LINE_HEIGHT + TEXT_PADDING * 2) / 2,
      width,
    };
  }

  const isLineLike =
    el.type === 'arrow' || el.type === 'line' || el.type === 'pencil' || el.type === 'highlighter';

  if (isLineLike && (el.type === 'arrow' || el.type === 'line')) {
    // Fixed wrap width, independent of the arrow's bbox (a vertical arrow must
    // not squeeze its label into a column).
    const width = 220;
    const lay = layoutText({ ...label, fontSize: label?.fontSize ?? fontSize }, label?.text ?? '', width);
    const boxW = Math.max(24, lay.w);
    const tail = labelTailEnd(el);
    let cx: number;
    let cy: number;
    if (tail) {
      // Words belong at the end without the head: sit just beyond that end,
      // continuing the arrow's direction away from the head, clear of the shaft.
      const a = el as ArrowElement;
      const start = tail === 'start';
      const tan = tangentAlongPath(a, start ? 0 : 1);
      const d = start ? { x: -tan.x, y: -tan.y } : tan;
      const pts = a.points;
      const sx = start ? pts[0] : pts[pts.length - 2];
      const sy = start ? pts[1] : pts[pts.length - 1];
      // Anchor the label's NEAR EDGE a fixed gap from the tail, never its
      // centre, so typing (wider, taller) never slides the anchored edge.
      const gap = 8 + (a.strokeWidth ?? 2) / 2;
      const px = el.x + sx;
      const py = el.y + sy;
      if (Math.abs(d.y) >= Math.abs(d.x)) {
        // More vertical: above/below the tail, centred on it; lines grow away.
        const y = d.y < 0 ? py - gap - lay.h : py + gap;
        return { x: px - width / 2, y, width };
      }
      // More horizontal: beside the tail, vertically centred on it.
      cx = d.x < 0 ? px - gap - boxW / 2 : px + gap + boxW / 2;
      cy = py;
    } else {
      const t = clamp01(label?.labelOffset ?? 0.5);
      const pt = pointAlongPath(el, t);
      cx = pt.x + el.x;
      cy = pt.y + el.y;
      // Perpendicular offset (image px): beside the stroke, along the path normal.
      const offsetY = label?.labelOffsetY ?? 0;
      if (offsetY !== 0) {
        const tan = tangentAlongPath(el, t);
        cx += -tan.y * offsetY;
        cy += tan.x * offsetY;
      }
    }
    return { x: cx - width / 2, y: cy - lay.h / 2, width };
  }

  // Freehand: center of the stroke's bounds.
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const width = Math.max(48, Math.min(bounds.w, 220));
  return { x: cx - width / 2, y: cy - (fontSize * TEXT_LINE_HEIGHT) / 2, width };
}

/**
 * Gap rect (parent-local) cut out of an arrow/line behind its label. `text`
 * overrides the stored text so the gap tracks what is being typed.
 */
export function pathLabelClipRect(
  t: TextElement,
  parent: { x: number; y: number; type?: string; startArrowhead?: string; endArrowhead?: string },
  imageSize: { width: number; height: number },
  text = t.text,
): { x: number; y: number; w: number; h: number } | null {
  // A label beyond the tail end never touches the shaft: nothing to cut.
  if (!text.trim() || labelTailEnd(parent)) return null;
  const tb = getElementBounds(t, imageSize);
  const lay = layoutText(t, text, t.width);
  const w = Math.max(24, Math.min(tb.w, lay.w + 12));
  let x = tb.x - parent.x;
  if (t.align === 'center') x += (tb.w - w) / 2;
  else if (t.align === 'right') x += tb.w - w;
  return { x, y: t.y - parent.y, w, h: lay.h };
}

/**
 * Which end of an arrow carries no head (its label sits beyond that end), or
 * null for midpoint labels: lines, and arrows with heads at both ends or none.
 */
export function labelTailEnd(el: { type?: string; startArrowhead?: string; endArrowhead?: string }): 'start' | 'end' | null {
  if (el.type !== 'arrow') return null;
  const s = (el.startArrowhead ?? 'none') !== 'none';
  const e = (el.endArrowhead ?? 'arrow') !== 'none';
  return s === e ? null : e ? 'start' : 'end';
}

/**
 * Re-seat every arrow/line label from its arrow's geometry and its (optionally
 * live, mid-typing) text. Returns the same array when nothing moved, so older
 * projects whose labels were stored at the midpoint settle in one pass.
 */
export function placeLinearLabels(
  elements: EditorElement[],
  imageSize: { width: number; height: number },
  live?: { id: string; text: string } | null,
): EditorElement[] {
  let byId: Map<string, EditorElement> | undefined;
  let out = elements;
  for (let i = 0; i < elements.length; i++) {
    const t = elements[i];
    if (t.type !== 'text' || !(t.containerId || t.groupId)) continue;
    byId ??= new Map(elements.map((e) => [e.id, e]));
    let owner = t.containerId ? byId.get(t.containerId) : undefined;
    if (!owner && t.groupId && isLabelPairGroup(t.groupId, elements)) {
      owner = elements.find((e) => e.id !== t.id && e.groupId === t.groupId);
    }
    if (!owner || (owner.type !== 'arrow' && owner.type !== 'line')) continue;
    const text = t as TextElement;
    const a = labelAnchorForElement(owner, imageSize, text.fontSize ?? 24, 1, {
      ...text,
      text: (live?.id === t.id ? live.text : text.text).trim(),
    });
    if (Math.abs(a.x - t.x) < 0.01 && Math.abs(a.y - t.y) < 0.01 && text.width === a.width) continue;
    if (out === elements) out = elements.slice();
    out[i] = { ...text, x: a.x, y: a.y, width: a.width };
  }
  return out;
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
        const p = i * 2;
        return {
          x: pts[p] + (pts[p + 2] - pts[p]) * k,
          y: pts[p + 1] + (pts[p + 3] - pts[p + 1]) * k,
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
 *
 * Writes both `containerId` (the explicit back-reference) and `groupId`
 * (the user-group mechanism + the legacy label-pair fallback). Reading
 * code prefers `containerId`; old projects without it still resolve via
 * the groupId-pair path.
 */
export function createAttachedLabel(
  id: string,
  groupId: string,
  anchor: LabelAnchor,
  style: LabelStyle,
  existing?: Partial<
    Pick<TextElement, 'text' | 'width' | 'padding' | 'lineHeight' | 'verticalAlign' | 'labelOffset' | 'labelOffsetY'>
  > & { containerId?: string },
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
    labelOffsetY: existing?.labelOffsetY,
    fill: style.fill,
    opacity: style.opacity,
    padding: existing?.padding ?? TEXT_PADDING,
    lineHeight: existing?.lineHeight ?? TEXT_LINE_HEIGHT,
    groupId,
    containerId: existing?.containerId,
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
