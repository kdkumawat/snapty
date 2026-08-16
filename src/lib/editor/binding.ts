import type Konva from 'konva';
import type {
  ArrowElement,
  EditorElement,
  FixedPointBinding,
  LineElement,
  StepElement,
  TextElement,
} from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { elbowPointsLocal, headingFromFixedPoint } from './elbow';

/**
 * Arrow/line binding — Excalidraw's model adapted to Snapty (see
 * excalidraw-parity-spec.md §5.1 / §6.2).
 *
 * A line-like element (arrow or line) can anchor either endpoint to a
 * bindable element (rectangle, rounded-rect, circle, diamond, text, step,
 * magnifier). The binding stores the target id + a normalized fixedPoint +
 * a mode:
 *
 * - `inside`: the endpoint is placed on the target's OUTLINE, on the ray
 *   from the shape center through the fixedPoint. The arrowhead lands on the
 *   edge instead of vanishing inside the shape.
 * - `orbit`: the endpoint sits just OUTSIDE the outline (a `BINDING_GAP`
 *   along the same ray), so the arrowhead hugs the edge.
 *
 * When the target moves/resizes/rotates, `recomputeBindings` re-derives the
 * anchored endpoints from the fixedPoint, keeping arrows glued. When a bound
 * arrow itself is translated, `pinBoundEndpoints` keeps its bound end(s)
 * pinned to the anchors while the free end moves with the drag.
 *
 * Constants mirror Excalidraw's `binding.ts`: `BASE_BINDING_GAP = 5` (+
 * strokeWidth/2 of the target) and `maxBindingDistance = clamp(15/(zoom*1.5),
 * 15, 30)` screen px for hit-testing.
 */

/** Gap between an 'orbit' endpoint and the target outline (Excalidraw). */
export const BINDING_GAP = 5;

const BINDABLE_TYPES = new Set([
  'rectangle', 'rounded-rect', 'circle', 'diamond', 'text', 'step', 'magnifier',
]);

export function isBindableElement(el: EditorElement): boolean {
  return BINDABLE_TYPES.has(el.type);
}

export function isLineLike(el: EditorElement): el is ArrowElement | LineElement {
  return el.type === 'arrow' || el.type === 'line';
}

/** Orbit gap for an arrow bound to `target`: 5 + target strokeWidth/2. */
function bindingGapFor(target: EditorElement): number {
  const sw = ('strokeWidth' in target && typeof target.strokeWidth === 'number')
    ? target.strokeWidth
    : 2;
  return BINDING_GAP + sw / 2;
}

/**
 * Max distance (IMAGE px) an endpoint may be from a shape's bounds to bind.
 * `zoom` is the editor zoom; Excalidraw's threshold is in screen px.
 */
export function bindingDistanceImage(zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  const screenPx = Math.max(15, Math.min(30, 15 / (z * 1.5)));
  return screenPx / z;
}

type Pt = { x: number; y: number };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Axis-aligned box of a bindable element in image coords. */
function boundsOf(el: EditorElement, imageSize: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  if (el.type === 'step') {
    const r = (el as { radius?: number }).radius || 16;
    return { x: el.x - r, y: el.y - r, w: r * 2, h: r * 2 };
  }
  if (el.type === 'text') {
    const t = el as TextElement;
    const w = t.width || Math.max(40, (t.text?.length || 1) * (t.fontSize || 24) * 0.55);
    const h = (t.fontSize || 24) * 1.4;
    return { x: t.x, y: t.y, w, h };
  }
  if (el.type === 'magnifier') {
    const b = getElementBounds(el, imageSize);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  const w = Math.abs((el as { width: number }).width);
  const h = Math.abs((el as { height: number }).height);
  const x = (el as { width: number }).width < 0 ? el.x + (el as { width: number }).width : el.x;
  const y = (el as { height: number }).height < 0 ? el.y + (el as { height: number }).height : el.y;
  return { x, y, w, h };
}

function rot(v: Pt, cos: number, sin: number): Pt {
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/**
 * Where a bound endpoint should sit, in image coordinates, for a target
 * element + fixedPoint + mode. Rotates the fixedPoint with the shape.
 */
export function anchorForBinding(
  target: EditorElement,
  fixedPoint: [number, number],
  mode: FixedPointBinding['mode'],
  imageSize: { width: number; height: number },
): Pt {
  const box = boundsOf(target, imageSize);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Unrotated direction from the shape center to the fixedPoint.
  let dir = { x: (fixedPoint[0] - 0.5) * box.w, y: (fixedPoint[1] - 0.5) * box.h };
  const dirLen = Math.hypot(dir.x, dir.y);
  if (dirLen < 1e-6) dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 }; // dead center
  else { dir.x /= dirLen; dir.y /= dirLen; }

  const radians = ((target as { rotation?: number }).rotation ?? 0) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // Work in the shape's local (unrotated) space, then rotate the result out.
  const localDir = rot(dir, cos, -sin);
  const boundary = intersectOutline(box, cx, cy, localDir, target.type);
  const worldDir = rot(localDir, cos, sin);
  const worldBoundary = rot({ x: boundary.x - cx, y: boundary.y - cy }, cos, sin);
  const boundaryWorld = { x: cx + worldBoundary.x, y: cy + worldBoundary.y };
  if (mode === 'orbit') {
    const gap = bindingGapFor(target);
    return { x: boundaryWorld.x + worldDir.x * gap, y: boundaryWorld.y + worldDir.y * gap };
  }
  return boundaryWorld;
}

/** Ray (center, dir) → outline point, in the shape's local space. */
function intersectOutline(
  box: { x: number; y: number; w: number; h: number },
  cx: number, cy: number,
  dir: Pt,
  type: string,
): Pt {
  if (type === 'circle' || type === 'step') {
    const a = box.w / 2;
    const b = box.h / 2;
    const t = 1 / Math.sqrt(Math.pow(dir.x / a, 2) + Math.pow(dir.y / b, 2));
    return { x: cx + dir.x * t, y: cy + dir.y * t };
  }
  if (type === 'diamond') {
    const verts: Pt[] = [
      { x: cx, y: box.y },
      { x: box.x + box.w, y: cy },
      { x: cx, y: box.y + box.h },
      { x: box.x, y: cy },
    ];
    let best: Pt | null = null;
    let bestT = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const hit = raySegment(cx, cy, dir, a, b);
      if (hit && hit.t < bestT) { bestT = hit.t; best = hit.p; }
    }
    return best ?? { x: cx + dir.x, y: cy + dir.y };
  }
  // Rectangle (default): slab-method exit point from the center ray. The
  // center is inside the box, so the first boundary hit is the exit tMax.
  let tMin = 0;
  let tMax = Infinity;
  const axes: Array<{ lo: number; hi: number; d: number; o: number }> = [
    { lo: box.x, hi: box.x + box.w, d: dir.x, o: cx },
    { lo: box.y, hi: box.y + box.h, d: dir.y, o: cy },
  ];
  for (const { lo, hi, d, o } of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return { x: cx + dir.x, y: cy + dir.y };
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  const t = Number.isFinite(tMax) && tMax > 0 ? tMax : Math.max(0, tMin);
  return { x: cx + dir.x * t, y: cy + dir.y * t };
}

function raySegment(ox: number, oy: number, dir: Pt, a: Pt, b: Pt): { t: number; p: Pt } | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dir.x * ey - dir.y * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((a.x - ox) * ey - (a.y - oy) * ex) / denom;
  const u = ((a.x - ox) * dir.y - (a.y - oy) * dir.x) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return { t, p: { x: ox + dir.x * t, y: oy + dir.y * t } };
}

/** Replace one endpoint of a line-like element with a new absolute anchor. */
export function setEndpointToAnchor(
  line: ArrowElement | LineElement,
  which: 'start' | 'end',
  anchor: Pt,
): [number, number, number, number] {
  // The tuple type is Snapty's declared (if approximate) shape: multi-point
  // polylines keep longer arrays at runtime, exactly as the rest of the
  // codebase handles them.
  const pts = [...line.points] as [number, number, number, number];
  const i = which === 'start' ? 0 : pts.length - 2;
  pts[i] = anchor.x - line.x;
  pts[i + 1] = anchor.y - line.y;
  return pts;
}

/**
 * Re-derive the interior vertices of an elbowed arrow from its (possibly
 * just re-anchored) endpoints. Router-owned vertices are rebuilt from the
 * endpoint positions + the side headings implied by the bindings, so a bound
 * elbow keeps its orthogonal shape as the target moves/resizes/rotates.
 * Returns the element unchanged when it is not an elbowed arrow.
 */
function rerouteElbow(
  el: ArrowElement | LineElement,
): ArrowElement | LineElement {
  if (el.type !== 'arrow' || !el.elbowed) return el;
  const pts = el.points;
  const n = pts.length;
  const routed = elbowPointsLocal(
    { x: el.x, y: el.y },
    { x: el.x + pts[0], y: el.y + pts[1] },
    { x: el.x + pts[n - 2], y: el.y + pts[n - 1] },
    headingFromFixedPoint(el.startBinding?.fixedPoint),
    headingFromFixedPoint(el.endBinding?.fixedPoint),
  );
  return { ...el, points: routed as [number, number, number, number] };
}

/**
 * Recompute the endpoints of every arrow/line bound to `movedId` so they
 * track the element's current geometry (move, resize, rotate). Returns a new
 * elements array; no-op when `movedId` is not bindable or nothing binds it.
 * Elbowed arrows re-route their interior in the same pass.
 */
export function recomputeBindings(
  elements: EditorElement[],
  movedId: string,
  imageSize: { width: number; height: number },
): EditorElement[] {
  const target = elements.find((el) => el.id === movedId);
  if (!target || !isBindableElement(target)) return elements;
  return elements.map((el) => {
    if (!isLineLike(el)) return el;
    let next = el;
    if (el.startBinding?.elementId === movedId) {
      const anchor = anchorForBinding(target, el.startBinding.fixedPoint, el.startBinding.mode, imageSize);
      next = { ...next, points: setEndpointToAnchor(next, 'start', anchor) };
    }
    if (el.endBinding?.elementId === movedId) {
      const anchor = anchorForBinding(target, el.endBinding.fixedPoint, el.endBinding.mode, imageSize);
      next = { ...next, points: setEndpointToAnchor(next, 'end', anchor) };
    }
    if (next !== el) next = rerouteElbow(next);
    return next;
  });
}

/**
 * Live binding — imperative counterpart of `recomputeBindings`.
 *
 * Returns new points for every arrow/line bound to `targetId`, computed
 * against the target's LIVE geometry (the Konva node's current position,
 * scale and rotation during a drag / resize / rotate gesture) instead of the
 * committed store element. Callers patch the arrow nodes directly so bound
 * arrows track the target on every frame; the store is only touched at
 * gesture commit. Arrows being moved together with the target (multi-select)
 * are skipped via `skipArrowIds` so movement is never double-applied.
 */
export function computeBoundArrowUpdates(
  elements: EditorElement[],
  targetId: string,
  liveTarget: EditorElement,
  imageSize: { width: number; height: number },
  skipArrowIds?: ReadonlySet<string>,
): Array<{ arrow: ArrowElement | LineElement; points: number[] }> {
  const out: Array<{ arrow: ArrowElement | LineElement; points: number[] }> = [];
  for (const el of elements) {
    if (!isLineLike(el) || skipArrowIds?.has(el.id)) continue;
    const pts = [...el.points];
    let changed = false;
    if (el.startBinding?.elementId === targetId) {
      const anchor = anchorForBinding(liveTarget, el.startBinding.fixedPoint, el.startBinding.mode, imageSize);
      pts[0] = anchor.x - el.x;
      pts[1] = anchor.y - el.y;
      changed = true;
    }
    if (el.endBinding?.elementId === targetId) {
      const anchor = anchorForBinding(liveTarget, el.endBinding.fixedPoint, el.endBinding.mode, imageSize);
      pts[pts.length - 2] = anchor.x - el.x;
      pts[pts.length - 1] = anchor.y - el.y;
      changed = true;
    }
    if (changed && el.type === 'arrow' && el.elbowed) {
      // Elbow interior is router-owned: re-derive it from the re-anchored
      // endpoints on the same frame the endpoint moved.
      const n = pts.length;
      const routed = elbowPointsLocal(
        { x: el.x, y: el.y },
        { x: el.x + pts[0], y: el.y + pts[1] },
        { x: el.x + pts[n - 2], y: el.y + pts[n - 1] },
        headingFromFixedPoint(el.startBinding?.fixedPoint),
        headingFromFixedPoint(el.endBinding?.fixedPoint),
      );
      pts.splice(0, pts.length, ...routed);
    }
    if (changed) out.push({ arrow: el, points: pts });
  }
  return out;
}

/**
 * Rebuild a store element from its Konva node's LIVE attrs so binding anchors
 * follow what is actually on screen mid-gesture (drag position, Transformer
 * scale, rotation). The node's scale is baked into the element's logical box
 * because `boundsOf`/`anchorForBinding` consume width/height.
 */
export function liveElementFromNode(el: EditorElement, node: Konva.Node): EditorElement {
  const scaleX = node.scaleX?.() ?? 1;
  const scaleY = node.scaleY?.() ?? 1;
  const rotation = node.rotation?.() ?? ((el as { rotation?: number }).rotation ?? 0);
  let out: EditorElement = { ...el, x: node.x(), y: node.y(), rotation, scaleX: 1, scaleY: 1 };
  if (out.type === 'step') {
    const step = out as StepElement;
    out = { ...step, radius: Math.max(8, (step.radius ?? 16) * Math.max(scaleX, scaleY)) } as EditorElement;
  } else if ('width' in out && 'height' in out && (scaleX !== 1 || scaleY !== 1)) {
    const shape = out as { width?: number; height?: number };
    out = { ...out, width: (shape.width ?? 0) * scaleX, height: (shape.height ?? 0) * scaleY } as EditorElement;
  }
  return out;
}

/**
 * Re-pin a line-like element's own bound endpoint(s) after its origin was
 * translated: anchors are absolute, so local points are re-derived from the
 * new origin. Free endpoints keep their local coordinates (their absolute
 * position moves with the drag — the arrow stretches between anchor and
 * pointer, Excalidraw's behavior).
 */
export function pinBoundEndpoints(
  elements: EditorElement[],
  arrowId: string,
  imageSize: { width: number; height: number },
): EditorElement[] {
  const arrow = elements.find((el) => el.id === arrowId);
  if (!arrow || !isLineLike(arrow)) return elements;
  const targets = new Map(elements.filter((el) => isBindableElement(el)).map((el) => [el.id, el]));
  let next = arrow;
  if (arrow.startBinding) {
    const t = targets.get(arrow.startBinding.elementId);
    if (t) {
      const anchor = anchorForBinding(t, arrow.startBinding.fixedPoint, arrow.startBinding.mode, imageSize);
      next = { ...next, points: setEndpointToAnchor(next, 'start', anchor) };
    }
  }
  if (arrow.endBinding) {
    const t = targets.get(arrow.endBinding.elementId);
    if (t) {
      const anchor = anchorForBinding(t, arrow.endBinding.fixedPoint, arrow.endBinding.mode, imageSize);
      next = { ...next, points: setEndpointToAnchor(next, 'end', anchor) };
    }
  }
  return next === arrow ? elements : elements.map((el) => (el.id === arrowId ? next : el));
}

/**
 * Clear bindings that reference removed ids (keep the arrow, now unbound —
 * Excalidraw behavior). Image bindings (IMAGE_BINDING_ID) survive unless the
 * sentinel is in `removedIds`.
 */
export function sweepDanglingBindings(
  elements: EditorElement[],
  removedIds: Set<string>,
): EditorElement[] {
  return elements.map((el) => {
    if (!isLineLike(el)) return el;
    const startBinding = el.startBinding && removedIds.has(el.startBinding.elementId)
      ? null
      : el.startBinding;
    const endBinding = el.endBinding && removedIds.has(el.endBinding.elementId)
      ? null
      : el.endBinding;
    if (startBinding === el.startBinding && endBinding === el.endBinding) return el;
    return { ...el, startBinding, endBinding } as EditorElement;
  });
}

/**
 * Hit-test an endpoint's absolute image position against bindable elements.
 * Returns the binding to create (or null when no shape is within distance).
 * Inside the shape's bounds → `inside`; within `bindingDistanceImage` of the
 * bounds → `orbit` (Excalidraw's drag-to-bind rule).
 */
export function resolveEndpointBinding(
  line: ArrowElement | LineElement,
  which: 'start' | 'end',
  elements: EditorElement[],
  imageSize: { width: number; height: number },
  zoom: number,
  opts?: { forceInside?: boolean },
): FixedPointBinding | null {
  const i = which === 'start' ? 0 : line.points.length - 2;
  const abs: Pt = { x: line.x + line.points[i], y: line.y + line.points[i + 1] };
  const threshold = bindingDistanceImage(zoom);
  let best: { el: EditorElement; d: number } | null = null;
  for (const el of elements) {
    if (!isBindableElement(el)) continue;
    const box = boundsOf(el, imageSize);
    const d = distanceToBox(abs, box);
    if (d <= threshold && (!best || d < best.d)) best = { el, d };
  }
  if (!best) return null;
  const box = boundsOf(best.el, imageSize);
  const inside = abs.x >= box.x && abs.x <= box.x + box.w
    && abs.y >= box.y && abs.y <= box.y + box.h;
  return {
    elementId: best.el.id,
    fixedPoint: [
      clamp01((abs.x - box.x) / (box.w || 1)),
      clamp01((abs.y - box.y) / (box.h || 1)),
    ],
    // Alt-drag forces an inside binding regardless of where the endpoint is
    // (Excalidraw's altKey rule); otherwise inside → 'inside', near → 'orbit'.
    mode: opts?.forceInside || inside ? 'inside' : 'orbit',
  };
}

function distanceToBox(p: Pt, box: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w));
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

/**
 * Global (image-coordinate) position of a binding's FOCUS POINT — the
 * normalized point inside the target, rotated with the shape. Excalidraw
 * renders a dashed line from the arrow endpoint to this point and lets the
 * user drag it to move the attachment around the shape (`arrows/focus.ts`).
 */
export function globalFixedPointForBinding(
  target: EditorElement,
  fixedPoint: [number, number],
  imageSize: { width: number; height: number },
): Pt {
  const box = boundsOf(target, imageSize);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const local = { x: (fixedPoint[0] - 0.5) * box.w, y: (fixedPoint[1] - 0.5) * box.h };
  const radians = ((target as { rotation?: number }).rotation ?? 0) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const world = rot(local, cos, sin);
  return { x: cx + world.x, y: cy + world.y };
}

/**
 * Inverse of {@link globalFixedPointForBinding}: normalize an absolute image
 * point into the target's local box (rotation undone, clamped to 0..1). Used
 * by the focus-point drag to derive the new `fixedPoint` from the pointer.
 */
export function fixedPointFromGlobalPoint(
  target: EditorElement,
  absX: number,
  absY: number,
  imageSize: { width: number; height: number },
): [number, number] {
  const box = boundsOf(target, imageSize);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radians = ((target as { rotation?: number }).rotation ?? 0) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rel = rot({ x: absX - cx, y: absY - cy }, cos, -sin);
  return [
    clamp01(0.5 + rel.x / (box.w || 1)),
    clamp01(0.5 + rel.y / (box.h || 1)),
  ];
}
