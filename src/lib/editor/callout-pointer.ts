/**
 * Callout shape geometry: computes a single continuous SVG path for a
 * callout — a rounded rectangle with a smooth pointer/tail that blends
 * seamlessly into the body (Shottr-style speech bubble).
 *
 * The path is a single closed contour: the outline traces the rounded rect,
 * but on the pointer side it smoothly curves out to the tip and back,
 * producing a unified filled silhouette with no internal seams.
 */
import type { CalloutPointerDirection } from '@/types/editor';

/** Pointer tip relative to the centre of the body. */
export type CalloutTip = { x: number; y: number };

/**
 * The tip a callout points at, relative to its body centre. Every callout is
 * drawn from this one value: callouts saved before free tips existed derive
 * it from their old direction / offset / length fields, and convert for good
 * the first time they are moved, resized or re-aimed.
 */
export function calloutTipOf(co: {
  width: number; height: number; pointerTip?: CalloutTip;
  pointerDirection?: CalloutPointerDirection; pointerOffset?: number; pointerLength?: number; pointerWidth?: number;
}): CalloutTip {
  if (co.pointerTip) return co.pointerTip;
  const w = Math.abs(co.width);
  const h = Math.abs(co.height);
  const t = calloutPointerTip(w, h, co.pointerDirection ?? 'bottom-left', co.pointerOffset ?? 0.5, co.pointerLength ?? 24, co.pointerWidth ?? 20);
  return { x: t.x - w / 2, y: t.y - h / 2 };
}

/**
 * Keep callout tips on their targets. When a commit moves or resizes a
 * callout's body on its own, the tip (stored relative to the body centre)
 * is rewritten so its absolute position does not change: the bubble moves,
 * the thing it points at does not. A callout that travels with other
 * elements (multi-select drag, select-all nudge) keeps its tail rigid.
 */
export function pinCalloutTips<T extends { id: string; type: string; x: number; y: number; groupId?: string }>(prev: T[], next: T[]): T[] {
  if (prev === next) return next;
  const before = new Map(prev.map((el) => [el.id, el]));
  type Box = T & { width: number; height: number; pointerTip?: CalloutTip };
  const moved = (a: T, b: T) => a.x !== b.x || a.y !== b.y;
  let out: T[] | null = null;
  next.forEach((el, i) => {
    if (el.type !== 'callout') return;
    const old = before.get(el.id) as Box | undefined;
    const cur = el as Box;
    if (!old || old === cur) return;
    const geometryChanged = moved(old, cur) || old.width !== cur.width || old.height !== cur.height;
    // An explicit re-aim (a new pointerTip object) is left exactly as given.
    if (!geometryChanged || old.pointerTip !== cur.pointerTip) return;
    const others = next.some((o) => {
      if (o.id === el.id || (el.groupId && o.groupId === el.groupId)) return false;
      const p = before.get(o.id);
      return !!p && p !== o && moved(p, o);
    });
    if (others) return;
    const tip = calloutTipOf(old as never);
    const absX = old.x + old.width / 2 + tip.x;
    const absY = old.y + old.height / 2 + tip.y;
    out = out ?? next.slice();
    out[i] = { ...cur, pointerTip: { x: absX - (cur.x + cur.width / 2), y: absY - (cur.y + cur.height / 2) } };
  });
  return out ?? next;
}

/**
 * Callout with a free tip: a rounded rectangle whose tail leaves the side
 * facing the tip and runs straight to it. The tail's base slides along that
 * side to follow the tip, staying clear of the rounded corners. A tip inside
 * the body yields a plain rounded rectangle (nothing to point at).
 */
function freeCalloutPath(w: number, h: number, tip: CalloutTip, pointerWidth: number, cornerRadius: number): string {
  // Leave a straight run on every side wide enough for the tail's base, so a
  // pill-shaped body never has the tail crossing a corner arc.
  const r = Math.max(0, Math.min(cornerRadius, w / 2, h / 2, (Math.min(w, h) - pointerWidth) / 2));
  const tx = w / 2 + tip.x;
  const ty = h / 2 + tip.y;
  const inside = tx >= 0 && tx <= w && ty >= 0 && ty <= h;
  // The side the centre-to-tip ray leaves through.
  const horizontal = Math.abs(tip.x) * h > Math.abs(tip.y) * w;
  const side = inside ? null : horizontal ? (tip.x > 0 ? 'right' : 'left') : (tip.y > 0 ? 'bottom' : 'top');
  // Base centre: where that ray crosses the side, kept off the corners.
  const base = (len: number, along: number) => {
    const room = Math.max(0, len - r * 2);
    const half = Math.min(pointerWidth / 2, room > 0 ? room / 2 : len / 4);
    const lo = (room > 0 ? r : 0) + half;
    const hi = len - lo;
    return { c: Math.max(lo, Math.min(hi, along)), half };
  };
  const bx = base(w, w / 2 + (tip.y !== 0 ? tip.x * ((h / 2) / Math.abs(tip.y)) : 0));
  const by = base(h, h / 2 + (tip.x !== 0 ? tip.y * ((w / 2) / Math.abs(tip.x)) : 0));
  const p: string[] = [`M ${r} 0`];
  if (side === 'top') p.push(`L ${bx.c - bx.half} 0`, `L ${tx} ${ty}`, `L ${bx.c + bx.half} 0`);
  p.push(`L ${w - r} 0`, `A ${r} ${r} 0 0 1 ${w} ${r}`);
  if (side === 'right') p.push(`L ${w} ${by.c - by.half}`, `L ${tx} ${ty}`, `L ${w} ${by.c + by.half}`);
  p.push(`L ${w} ${h - r}`, `A ${r} ${r} 0 0 1 ${w - r} ${h}`);
  if (side === 'bottom') p.push(`L ${bx.c + bx.half} ${h}`, `L ${tx} ${ty}`, `L ${bx.c - bx.half} ${h}`);
  p.push(`L ${r} ${h}`, `A ${r} ${r} 0 0 1 0 ${h - r}`);
  if (side === 'left') p.push(`L 0 ${by.c + by.half}`, `L ${tx} ${ty}`, `L 0 ${by.c - by.half}`);
  p.push(`L 0 ${r}`, `A ${r} ${r} 0 0 1 ${r} 0`, 'Z');
  return p.join(' ');
}

/**
 * Generate the SVG path for a callout shape.
 * The path starts at the top-left and traces clockwise.
 *
 * @param w - Box width (positive)
 * @param h - Box height (positive)
 * @param direction - Direction the pointer extends outward
 * @param offset - Position along the edge (0..1)
 * @param pointerLength - How far the pointer extends outward
 * @param pointerWidth - Width of the pointer base
 * @param cornerRadius - Corner radius of the rounded rect body
 * @returns SVG path string (M ... Z)
 */
export function calloutPath(
  w: number,
  h: number,
  direction: CalloutPointerDirection,
  offset: number,
  pointerLength: number,
  pointerWidth: number,
  cornerRadius: number,
  tip?: CalloutTip,
): string {
  if (tip) return freeCalloutPath(w, h, tip, pointerWidth, cornerRadius);
  const r = Math.min(cornerRadius, w / 2, h / 2);
  const halfW = pointerWidth / 2;
  const t = Math.max(0, Math.min(1, offset));

  // Smooth curve factor for pointer base (higher = sharper transition)
  const curve = Math.min(pointerLength * 0.5, halfW * 0.8);

  const parts: string[] = [];

  switch (direction) {
    case 'bottom': {
      const px = t * w;
      parts.push(`M ${r} 0`);
      // Top edge
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      // Right edge
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      // Bottom edge with pointer (right to left)
      parts.push(`L ${px + halfW} ${h}`);
      // Smooth curve into pointer
      parts.push(`Q ${px + halfW * 0.3} ${h + curve} ${px} ${h + pointerLength}`);
      // Smooth curve back to body
      parts.push(`Q ${px - halfW * 0.3} ${h + curve} ${px - halfW} ${h}`);
      // Bottom edge continues
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      // Left edge
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'top': {
      const px = t * w;
      parts.push(`M ${r} 0`);
      // Top edge with pointer (left to right)
      parts.push(`L ${px - halfW} 0`);
      // Smooth curve into pointer
      parts.push(`Q ${px - halfW * 0.3} ${-curve} ${px} ${-pointerLength}`);
      // Smooth curve back to body
      parts.push(`Q ${px + halfW * 0.3} ${-curve} ${px + halfW} 0`);
      // Top edge continues
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      // Right edge
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      // Bottom edge
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      // Left edge
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'right': {
      const py = t * h;
      parts.push(`M ${r} 0`);
      // Top edge
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      // Right edge with pointer (top to bottom)
      parts.push(`L ${w} ${py - halfW}`);
      // Smooth curve into pointer
      parts.push(`Q ${w + curve} ${py - halfW * 0.3} ${w + pointerLength} ${py}`);
      // Smooth curve back to body
      parts.push(`Q ${w + curve} ${py + halfW * 0.3} ${w} ${py + halfW}`);
      // Right edge continues
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      // Bottom edge
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      // Left edge
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'left': {
      const py = t * h;
      parts.push(`M ${r} 0`);
      // Top edge
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      // Right edge
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      // Bottom edge
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      // Left edge with pointer (bottom to top)
      parts.push(`L 0 ${py + halfW}`);
      // Smooth curve into pointer
      parts.push(`Q ${-curve} ${py + halfW * 0.3} ${-pointerLength} ${py}`);
      // Smooth curve back to body
      parts.push(`Q ${-curve} ${py - halfW * 0.3} 0 ${py - halfW}`);
      // Left edge continues
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'bottom-right': {
      // Pointer at bottom-right corner
      const baseX1 = w - halfW;
      const baseY2 = h - halfW;
      const tipX = w + pointerLength * 0.707;
      const tipY = h + pointerLength * 0.707;

      parts.push(`M ${r} 0`);
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      parts.push(`L ${w} ${baseY2}`);
      // Smooth curve into corner pointer
      parts.push(`Q ${w + curve * 0.5} ${baseY2 - curve * 0.3} ${tipX} ${tipY}`);
      // Smooth curve back to body
      parts.push(`Q ${baseX1 + curve * 0.3} ${h + curve * 0.5} ${baseX1} ${h}`);
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'bottom-left': {
      // Pointer at bottom-left corner
      const baseX1 = halfW;
      const baseX2 = 0;
      const baseY2 = h - halfW;
      const tipX = -pointerLength * 0.707;
      const tipY = h + pointerLength * 0.707;

      parts.push(`M ${r} 0`);
      parts.push(`L ${w - r} 0`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${r}`);
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      parts.push(`L ${baseX1} ${h}`);
      // Smooth curve into corner pointer
      parts.push(`Q ${baseX1 - curve * 0.3} ${h + curve * 0.5} ${tipX} ${tipY}`);
      // Smooth curve back to body
      parts.push(`Q ${-curve * 0.5} ${baseY2 - curve * 0.3} ${baseX2} ${baseY2}`);
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'top-right': {
      // Pointer at top-right corner
      const baseX1 = w;
      const baseY1 = halfW;
      const baseX2 = w - halfW;
      const tipX = w + pointerLength * 0.707;
      const tipY = -pointerLength * 0.707;

      parts.push(`M ${r} 0`);
      parts.push(`L ${baseX2} 0`);
      // Smooth curve into corner pointer
      parts.push(`Q ${baseX2 + curve * 0.3} ${-curve * 0.5} ${tipX} ${tipY}`);
      // Smooth curve back to body
      parts.push(`Q ${w + curve * 0.5} ${baseY1 - curve * 0.3} ${baseX1} ${baseY1}`);
      parts.push(`L ${w} ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} ${h}`);
      parts.push(`L ${r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 0 ${h - r}`);
      parts.push(`L 0 ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} 0`);
      break;
    }
    case 'top-left': {
      // Pointer at top-left corner
      const baseX1 = halfW;
      const baseY1 = 0;
      const baseX2 = 0;
      const baseY2 = halfW;
      const tipX = -pointerLength * 0.707;
      const tipY = -pointerLength * 0.707;

      parts.push(`M ${baseX1} ${baseY1}`);
      // Smooth curve into corner pointer
      parts.push(`Q ${baseX1 - curve * 0.3} ${-curve * 0.5} ${tipX} ${tipY}`);
      // Smooth curve back to body
      parts.push(`Q ${-curve * 0.5} ${baseY2 - curve * 0.3} ${baseX2} ${baseY2}`);
      // Continue left edge down
      parts.push(`L 0 ${h - r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${r} ${h}`);
      // Bottom edge
      parts.push(`L ${w - r} ${h}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w} ${h - r}`);
      // Right edge
      parts.push(`L ${w} ${r}`);
      parts.push(`A ${r} ${r} 0 0 1 ${w - r} 0`);
      // Top edge back to pointer base
      parts.push(`L ${baseX1} ${baseY1}`);
      break;
    }
  }

  parts.push('Z');
  return parts.join(' ');
}

/**
 * Compute the bounding box of a callout including the pointer,
 * so selection bounds and hit testing account for the pointer area.
 */
/**
 * Compute just the pointer tip position for the selection overlay handle.
 * All coords are in the box's local coordinate system (0,0 top-left).
 */
export function calloutPointerTip(
  w: number,
  h: number,
  direction: CalloutPointerDirection,
  offset: number,
  pointerLength: number,
  _pointerWidth: number,
  tip?: CalloutTip,
): { x: number; y: number } {
  if (tip) return { x: w / 2 + tip.x, y: h / 2 + tip.y };
  const t = Math.max(0, Math.min(1, offset));

  switch (direction) {
    case 'top':
      return { x: t * w, y: -pointerLength };
    case 'bottom':
      return { x: t * w, y: h + pointerLength };
    case 'left':
      return { x: -pointerLength, y: t * h };
    case 'right':
      return { x: w + pointerLength, y: t * h };
    case 'top-left':
      return { x: -pointerLength * 0.707, y: -pointerLength * 0.707 };
    case 'top-right':
      return { x: w + pointerLength * 0.707, y: -pointerLength * 0.707 };
    case 'bottom-left':
      return { x: -pointerLength * 0.707, y: h + pointerLength * 0.707 };
    case 'bottom-right':
      return { x: w + pointerLength * 0.707, y: h + pointerLength * 0.707 };
  }
}

export function calloutFullBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  direction: CalloutPointerDirection,
  pointerLength: number,
  tip?: CalloutTip,
): { x: number; y: number; w: number; h: number } {
  let minX = x;
  let minY = y;
  let maxX = x + w;
  let maxY = y + h;
  if (tip) {
    const tx = x + w / 2 + tip.x;
    const ty = y + h / 2 + tip.y;
    minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
    minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  switch (direction) {
    case 'bottom':
      maxY = y + h + pointerLength;
      break;
    case 'top':
      minY = y - pointerLength;
      break;
    case 'right':
      maxX = x + w + pointerLength;
      break;
    case 'left':
      minX = x - pointerLength;
      break;
    case 'bottom-right':
      maxX = x + w + pointerLength;
      maxY = y + h + pointerLength;
      break;
    case 'bottom-left':
      minX = x - pointerLength;
      maxY = y + h + pointerLength;
      break;
    case 'top-right':
      maxX = x + w + pointerLength;
      minY = y - pointerLength;
      break;
    case 'top-left':
      minX = x - pointerLength;
      minY = y - pointerLength;
      break;
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}


/**
 * Given where the user clicked (origin) and the resulting box dimensions,
 * compute the pointer direction so the pointer points TOWARD the click origin.
 * This gives a natural "this callout is pointing at the thing I clicked" feel.
 */
export function directionFromClickToBox(
  originX: number, originY: number,
  boxX: number, boxY: number, boxW: number, boxH: number,
): CalloutPointerDirection {
  // Center of the box
  const cx = boxX + boxW / 2;
  const cy = boxY + boxH / 2;
  // Direction from box center toward the click origin
  const dx = originX - cx;
  const dy = originY - cy;

  // If the click is essentially at the center, default to bottom-left
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'bottom-left';

  const angle = Math.atan2(dy, dx); // radians, -PI..PI

  // Snap to 8 directions based on angle sectors (45° each)
  // Right = 0, Bottom = PI/2, Left = PI/-PI, Top = -PI/2
  if (angle >= -Math.PI / 8 && angle < Math.PI / 8) return 'right';
  if (angle >= Math.PI / 8 && angle < 3 * Math.PI / 8) return 'bottom-right';
  if (angle >= 3 * Math.PI / 8 && angle < 5 * Math.PI / 8) return 'bottom';
  if (angle >= 5 * Math.PI / 8 || angle < -5 * Math.PI / 8) return 'left';
  if (angle >= -3 * Math.PI / 8 && angle < -Math.PI / 8) return 'top-right';
  // Remaining sector
  if (angle >= -5 * Math.PI / 8 && angle < -3 * Math.PI / 8) return 'top';
  // top-left covers the rest
  return 'top-left';
}
