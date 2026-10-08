import type { MagnifierElement } from '@/types/editor';
import type { Bounds } from '@/lib/editor/snap-guides';
import { controlPoint } from '@/lib/editor/curve';

export type ImageSize = { width: number; height: number };

export type MagnifierMetrics = {
  w: number;
  h: number;
  /** Source radii - independent, so a magnifier can be elliptical. */
  rx: number;
  ry: number;
  mag: number;
  previewRx: number;
  previewRy: number;
  gap: number;
  /** Center-to-center distance keeping the source + bubble separated by `gap`. */
  dist: number;
};

export const MIN_MAGNIFICATION = 1.2;
export const MAX_MAGNIFICATION = 8;
/** A new magnifier's bubble starts no larger than this on its long side. */
const START_BUBBLE_RADIUS = 150;

/** Zoom for a freshly drawn magnifier: the preferred zoom, eased down so a
 *  big source does not start with a bubble that swallows the screenshot. */
export function startMagnification(width: number, height: number, preferred: number): number {
  const r = Math.max(4, Math.abs(width) / 2, Math.abs(height) / 2);
  return Math.max(1.5, Math.min(preferred, START_BUBBLE_RADIUS / r));
}

/**
 * Updates for resizing the SOURCE ring to a new box while leaving the bubble
 * exactly as it is: same absolute centre, same size. The zoom changes
 * instead (a smaller source shows more magnified), which is what two
 * independent shapes joined by an arrow would do.
 */
export function resizeSourceKeepingBubble(
  el: MagnifierElement,
  box: { x: number; y: number; width: number; height: number },
  imageSize?: ImageSize,
): Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewOffset'> {
  const m = magnifierMetrics(el);
  const off = resolvePreviewOffset(el, imageSize);
  const c = magnifierSourceCenter(el);
  const bubbleX = c.cx + off.ox;
  const bubbleY = c.cy + off.oy;
  const bubbleR = Math.max(m.previewRx, m.previewRy);
  const r = Math.max(4, box.width / 2, box.height / 2);
  return {
    ...box,
    magnification: Math.max(MIN_MAGNIFICATION, Math.min(MAX_MAGNIFICATION, bubbleR / r)),
    previewOffset: { x: bubbleX - (box.x + box.width / 2), y: bubbleY - (box.y + box.height / 2) },
  };
}

/** Metrics shared by rendering, selection bounds and export bounds. */
export function magnifierMetrics(
  el: Pick<MagnifierElement, 'width' | 'height' | 'magnification'>,
): MagnifierMetrics {
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  const rx = Math.max(4, w / 2);
  const ry = Math.max(4, h / 2);
  // The bubble is sized by dragging its handles, so the zoom range is wide.
  const mag = Math.max(MIN_MAGNIFICATION, Math.min(MAX_MAGNIFICATION, el.magnification ?? 2.25));
  const previewRx = rx * mag;
  const previewRy = ry * mag;
  // Room for a visible arrow (and a short label) between ring and bubble.
  const gap = Math.max(56, (rx + ry) * 0.3);
  const dist = gap + Math.max(previewRx, previewRy) + Math.max(rx, ry);
  return { w, h, rx, ry, mag, previewRx, previewRy, gap, dist };
}

/** Absolute top-left of the source bounding box. */
export function magnifierSourceTopLeft(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number } {
  const gx = el.width < 0 ? el.x + el.width : el.x;
  const gy = el.height < 0 ? el.y + el.height : el.y;
  return { x: gx, y: gy };
}

/** Absolute center of the source ellipse. */
export function magnifierSourceCenter(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height'>,
): { cx: number; cy: number } {
  const { w, h } = magnifierMetrics(el);
  const { x, y } = magnifierSourceTopLeft(el);
  return { cx: x + w / 2, cy: y + h / 2 };
}

/** Bubble offset from the source center along `angle` (absolute units). */
export function previewOffset(angle: number, m: MagnifierMetrics): { ox: number; oy: number } {
  return { ox: Math.cos(angle) * m.dist, oy: Math.sin(angle) * m.dist };
}

/**
 * Bubble placement used by an element, in priority order:
 *  1. an explicit free vector (`previewOffset` - the user dragged the bubble),
 *  2. the old fixed-orbit placement (`previewAngle`, from the pre-vector era),
 *  3. a deterministic default direction.
 * Elements persisted before free placement render byte-identically until the
 * bubble is dragged, which then writes a vector that takes precedence.
 */
export function resolvePreviewOffset(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewAngle' | 'previewOffset'>,
  imageSize?: ImageSize,
): { ox: number; oy: number } {
  // The element stores the vector as {x, y}; callers here work in {ox, oy}.
  if (el.previewOffset && Number.isFinite(el.previewOffset.x) && Number.isFinite(el.previewOffset.y)) {
    return { ox: el.previewOffset.x, oy: el.previewOffset.y };
  }
  const m = magnifierMetrics(el);
  const angle =
    typeof el.previewAngle === 'number'
      ? el.previewAngle
      : defaultPreviewAngle(el, imageSize);
  return previewOffset(angle, m);
}

/** Preferred bubble directions, in order of preference (radians, 0 = right, -y = up). */
const CANDIDATE_ANGLES = [
  -Math.PI / 4, // up-right
  (3 * Math.PI) / 4, // up-left
  Math.PI / 4, // down-right
  (5 * Math.PI) / 4, // down-left
  -Math.PI / 2, // up
  0, // right
  Math.PI / 2, // down
  Math.PI, // left
];

function previewFits(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification'>,
  angle: number,
  m: MagnifierMetrics,
  imageSize: ImageSize,
): boolean {
  const { cx, cy } = magnifierSourceCenter(el);
  const off = previewOffset(angle, m);
  const px = cx + off.ox;
  const py = cy + off.oy;
  const margin = 6;
  return (
    px - m.previewRx >= margin &&
    py - m.previewRy >= margin &&
    px + m.previewRx <= imageSize.width - margin &&
    py + m.previewRy <= imageSize.height - margin
  );
}

/**
 * Deterministic default bubble direction that best fits within the image.
 * Falls back to the direction pointing toward the image center.
 */
export function defaultPreviewAngle(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification'>,
  imageSize?: ImageSize,
): number {
  const m = magnifierMetrics(el);
  if (imageSize) {
    for (const a of CANDIDATE_ANGLES) {
      if (previewFits(el, a, m, imageSize)) return a;
    }
  }
  const { cx, cy } = magnifierSourceCenter(el);
  const centerX = (imageSize?.width ?? cx * 2) / 2;
  const centerY = (imageSize?.height ?? cy * 2) / 2;
  // Nothing fits whole: head for the middle of the image, where the most
  // room is, so the bubble stays on the screenshot instead of hanging off it.
  if (Math.hypot(centerX - cx, centerY - cy) < 1) return -Math.PI / 4;
  return Math.atan2(centerY - cy, centerX - cx);
}

/** Bubble direction actually used: the persisted angle, or a deterministic default. */
export function resolvePreviewAngle(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewAngle'>,
  imageSize?: ImageSize,
): number {
  if (typeof el.previewAngle === 'number') return el.previewAngle;
  return defaultPreviewAngle(el, imageSize);
}

/**
 * The source ring and the bubble move independently, like two shapes joined
 * by a bound arrow. `previewOffset` is stored relative to the source, so when
 * a commit moves the source on its own the offset is rewritten to leave the
 * bubble where it was. A magnifier moved together with other elements stays
 * rigid.
 */
export function pinMagnifierBubbles<T extends { id: string; type: string; x: number; y: number }>(
  prev: T[], next: T[], imageSize?: ImageSize,
): T[] {
  if (prev === next) return next;
  const before = new Map(prev.map((el) => [el.id, el]));
  const moved = (a: T, b: T) => a.x !== b.x || a.y !== b.y;
  let out: T[] | null = null;
  next.forEach((el, i) => {
    if (el.type !== 'magnifier') return;
    const old = before.get(el.id);
    if (!old || old === el || !moved(old, el)) return;
    const o = old as unknown as MagnifierElement;
    const c = el as unknown as MagnifierElement;
    // A resize also shifts x/y; only a pure move pins. An explicit bubble
    // drag (a new previewOffset object) is left exactly as given.
    if (o.width !== c.width || o.height !== c.height || o.previewOffset !== c.previewOffset) return;
    const group = (el as { groupId?: string }).groupId;
    const others = next.some((x) => {
      // Its own label travels with it and does not make this a group move.
      if (x.id === el.id || (group && (x as { groupId?: string }).groupId === group)) return false;
      const p = before.get(x.id);
      return !!p && p !== x && moved(p, x);
    });
    if (others) return;
    const off = resolvePreviewOffset(o, imageSize);
    out = out ?? next.slice();
    out[i] = { ...el, previewOffset: { x: off.ox - (el.x - old.x), y: off.oy - (el.y - old.y) } } as T;
  });
  return out ?? next;
}

/** Absolute center of the preview bubble. */
export function magnifierPreviewCenter(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewAngle' | 'previewOffset'>,
  imageSize?: ImageSize,
): { px: number; py: number } {
  const { cx, cy } = magnifierSourceCenter(el);
  const off = resolvePreviewOffset(el, imageSize);
  return { px: cx + off.ox, py: cy + off.oy };
}

/** Union bounds covering the source box + the positioned bubble ellipse. */
/**
 * Point on an ellipse rim (radii inflated by `pad`) in the direction of
 * `(dx, dy)`, in element-local coordinates.
 */
function ellipseRimPoint(
  cx: number, cy: number, rx: number, ry: number, dx: number, dy: number, pad = 3,
): { x: number; y: number } {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Ray / ellipse intersection: t such that (t*ux/rx)^2 + (t*uy/ry)^2 = 1.
  const t = 1 / Math.sqrt(Math.pow(ux / (rx + pad), 2) + Math.pow(uy / (ry + pad), 2));
  return { x: cx + ux * t, y: cy + uy * t };
}

/**
 * Leader line geometry in element-local coordinates: from the source rim to
 * the bubble rim. When the leader is bent, the anchors slide around the rims
 * toward the control point so the curve leaves the source and enters the
 * bubble at a natural angle instead of crossing the rim diagonally. The
 * control point (`cx/cy`) is the point the drawn curve passes through, so the
 * bend handle placed there always sits exactly on the line.
 */
export function leaderGeometry(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewAngle' | 'previewOffset' | 'leaderBend'>,
  imageSize?: ImageSize,
): { sx: number; sy: number; ex: number; ey: number; cx: number; cy: number; bent: boolean } {
  const m = magnifierMetrics(el);
  const off = resolvePreviewOffset(el, imageSize);
  const bend = el.leaderBend ?? 0;
  const srcCx = m.w / 2;
  const srcCy = m.h / 2;
  const previewCx = srcCx + off.ox;
  const previewCy = srcCy + off.oy;

  // Anchor on the straight chord first (identical to the legacy rendering),
  // then re-anchor toward the control point when bent.
  const s0 = ellipseRimPoint(srcCx, srcCy, m.rx, m.ry, off.ox, off.oy);
  const e0 = ellipseRimPoint(previewCx, previewCy, m.previewRx, m.previewRy, -off.ox, -off.oy);
  if (!bend) {
    return {
      sx: s0.x, sy: s0.y, ex: e0.x, ey: e0.y,
      cx: (s0.x + e0.x) / 2, cy: (s0.y + e0.y) / 2,
      bent: false,
    };
  }
  const c = controlPoint(s0.x, s0.y, e0.x, e0.y, bend);
  const s = ellipseRimPoint(srcCx, srcCy, m.rx, m.ry, c.x - srcCx, c.y - srcCy);
  const e = ellipseRimPoint(previewCx, previewCy, m.previewRx, m.previewRy, c.x - previewCx, c.y - previewCy);
  return { sx: s.x, sy: s.y, ex: e.x, ey: e.y, cx: c.x, cy: c.y, bent: true };
}

export function magnifierBounds(
  el: Pick<MagnifierElement, 'x' | 'y' | 'width' | 'height' | 'magnification' | 'previewAngle' | 'previewOffset' | 'leaderBend'>,
  imageSize?: ImageSize,
  pad = 0,
): Bounds {
  const m = magnifierMetrics(el);
  const { x, y } = magnifierSourceTopLeft(el);
  const { px, py } = magnifierPreviewCenter(el, imageSize);
  let minX = Math.min(x, px - m.previewRx) - pad;
  let minY = Math.min(y, py - m.previewRy) - pad;
  let maxX = Math.max(x + m.w, px + m.previewRx) + pad;
  let maxY = Math.max(y + m.h, py + m.previewRy) + pad;
  // A bent leader bulges past the straight chord, so fold its control point
  // into the bounds or the selection/marquee/export clip the curve.
  const g = leaderGeometry(el, imageSize);
  if (g.bent) {
    minX = Math.min(minX, x + g.cx - pad);
    minY = Math.min(minY, y + g.cy - pad);
    maxX = Math.max(maxX, x + g.cx + pad);
    maxY = Math.max(maxY, y + g.cy + pad);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
