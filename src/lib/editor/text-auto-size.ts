/**
 * Auto-grow / auto-shrink a shape to fit its container text, or auto-grow
 * the text to fit the shape. Used by the inline editor and by the post-
 * commit reflow path.
 *
 * Excalidraw behaviour: a shape with text is at least as large as its text
 * (min-size), and a free text element grows in width to fit its longest line.
 */
import type { TextElement, ShapeElement, CircleElement, DiamondElement, CalloutElement } from '@/types/editor';

type AnyShape = ShapeElement | CircleElement | DiamondElement | CalloutElement;

export interface AutoSizeResult {
  /** New width (image units). */
  width: number;
  /** New height (image units). */
  height: number;
}

const MIN_BOX = 24;

/**
 * Compute the size a shape must be to fit its measured text. The shape can
 * still be larger if the user resized it manually; this is the floor.
 */
export function shapeSizeToFitText(
  text: { width?: number; height?: number; padding?: number },
  shape: AnyShape,
): AutoSizeResult {
  const padding = text.padding ?? 4;
  const textW = text.width ?? 0;
  const textH = text.height ?? 0;
  return {
    width: Math.max(MIN_BOX, shape.width, textW + padding * 2),
    height: Math.max(MIN_BOX, shape.height, textH + padding * 2),
  };
}

/**
 * Compute the size a free text element should be to fit its measured
 * `lines`, given the same font metrics. Returns the new element patch.
 */
export function textSizeToFitLines(
  lines: string[],
  fontSize: number,
  lineHeight: number,
  padding: number,
  measuredMaxWidth: number,
): AutoSizeResult {
  const width = Math.max(MIN_BOX, measuredMaxWidth + padding * 2);
  const height = Math.max(MIN_BOX, lines.length * fontSize * lineHeight + padding * 2);
  return { width, height };
}

/**
 * Apply auto-size policy: if `policy` is `'grow'`, expand the shape to fit
 * the text; if `'shrink'`, shrink the shape to fit; if `'fixed'`, do nothing.
 */
export function applyAutoSize(
  shape: AnyShape,
  text: { width?: number; height?: number; padding?: number },
  policy: 'grow' | 'shrink' | 'fixed' = 'grow',
): AnyShape {
  if (policy === 'fixed') return shape;
  const target = shapeSizeToFitText(text, shape);
  if (policy === 'grow' &&
      (target.width <= shape.width && target.height <= shape.height)) {
    return shape;
  }
  if (policy === 'shrink' &&
      (target.width >= shape.width && target.height >= shape.height)) {
    return shape;
  }
  return { ...shape, width: target.width, height: target.height };
}
