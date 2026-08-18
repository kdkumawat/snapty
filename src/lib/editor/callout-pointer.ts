/**
 * Callout pointer geometry: computes the triangle path for a callout's
 * pointer/tail extending from the box body.
 *
 * The box is at (0, 0) with the given width/height (normalized positive).
 * Returns the 3 triangle vertices (tip + 2 base points) in box-local coords,
 * or null if the direction is not valid.
 */
import type { CalloutPointerDirection } from '@/types/editor';

export interface CalloutPointerPath {
  tip: { x: number; y: number };
  base1: { x: number; y: number };
  base2: { x: number; y: number };
}

/**
 * Compute the callout pointer triangle for a given box and pointer config.
 * All coords are in the box's local coordinate system (0,0 top-left).
 */
export function computeCalloutPointerPath(
  w: number,
  h: number,
  direction: CalloutPointerDirection,
  offset: number,
  pointerLength: number,
  pointerWidth: number,
): CalloutPointerPath {
  const halfW = pointerWidth / 2;
  const clampedOffset = Math.max(0, Math.min(1, offset));

  switch (direction) {
    case 'bottom': {
      const px = clampedOffset * w;
      const py = h;
      return {
        tip: { x: px, y: py + pointerLength },
        base1: { x: px - halfW, y: py },
        base2: { x: px + halfW, y: py },
      };
    }
    case 'top': {
      const px = clampedOffset * w;
      return {
        tip: { x: px, y: -pointerLength },
        base1: { x: px + halfW, y: 0 },
        base2: { x: px - halfW, y: 0 },
      };
    }
    case 'right': {
      const py = clampedOffset * h;
      return {
        tip: { x: w + pointerLength, y: py },
        base1: { x: w, y: py - halfW },
        base2: { x: w, y: py + halfW },
      };
    }
    case 'left': {
      const py = clampedOffset * h;
      return {
        tip: { x: -pointerLength, y: py },
        base1: { x: 0, y: py + halfW },
        base2: { x: 0, y: py - halfW },
      };
    }
    case 'bottom-right': {
      return {
        tip: { x: w + pointerLength, y: h + pointerLength },
        base1: { x: w - halfW, y: h },
        base2: { x: w, y: h - halfW },
      };
    }
    case 'bottom-left': {
      return {
        tip: { x: -pointerLength, y: h + pointerLength },
        base1: { x: halfW, y: h },
        base2: { x: 0, y: h - halfW },
      };
    }
    case 'top-right': {
      return {
        tip: { x: w + pointerLength, y: -pointerLength },
        base1: { x: w, y: halfW },
        base2: { x: w - halfW, y: 0 },
      };
    }
    case 'top-left': {
      return {
        tip: { x: -pointerLength, y: -pointerLength },
        base1: { x: halfW, y: 0 },
        base2: { x: 0, y: halfW },
      };
    }
  }
}

/**
 * Compute the bounding box of a callout including the pointer,
 * so selection bounds and hit testing account for the pointer area.
 */
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
