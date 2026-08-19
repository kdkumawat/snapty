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
): string {
  const r = Math.min(cornerRadius, w / 2, h / 2);
  const halfW = pointerWidth / 2;
  const t = Math.max(0, Math.min(1, offset));

  // Smooth curve factor for pointer base (higher = sharper transition)
  const curve = Math.min(pointerLength * 0.5, halfW * 0.8);

  // Helper: rounded rect corner arc SVG
  const arc = (cx: number, cy: number) =>
    `A ${r} ${r} 0 0 1 ${cx + r * (cx < w / 2 ? 1 : -1)} ${cy + r * (cy < h / 2 ? 1 : -1)}`;

  // Build the rounded rect corners
  const topRight = `A ${r} ${r} 0 0 1 ${w - r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r}`;
  const bottomRight = `A ${r} ${r} 0 0 1 ${w} ${h - r} L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}`;
  const bottomLeft = `A ${r} ${r} 0 0 1 ${r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 0 ${h - r}`;
  const topLeft = `A ${r} ${r} 0 0 1 0 ${r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0`;

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
      const baseY1 = h;
      const baseX2 = w;
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
      const baseY1 = h;
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
      const baseY2 = 0;
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
  pointerWidth: number,
): { x: number; y: number } {
  const halfW = pointerWidth / 2;
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
): { x: number; y: number; width: number; height: number } {
  let minX = x;
  let minY = y;
  let maxX = x + w;
  let maxY = y + h;

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
    width: maxX - minX,
    height: maxY - minY,
  };
}
