/**
 * Multi-label container reflow.
 *
 * Walks every text element whose `containerId` points at `shapeId` and
 * recomputes its anchor (position + width) inside the shape's inner box.
 * Returns a new `EditorElement[]` — does not mutate the input.
 *
 * Replaces the old single-label `reflowAttachedLabel`. The single-label
 * behaviour is preserved by `reflowAttachedLabel` in editor-store.ts calling
 * this with the shape's primary label only.
 */
import type { EditorElement, TextElement } from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { TEXT_PADDING, TEXT_LINE_HEIGHT } from '@/types/editor';
import { labelAnchorForElement } from '@/lib/editor/text-labels';

const MIN_INNER = 20;

export interface ReflowOptions {
  /**
   * The image size in pixels — needed for `labelAnchorForElement` to compute
   * stroke-midpoint anchors for arrow/line labels.
   */
  imageSize: { width: number; height: number };
  /** Tool scale (device-pixel-ratio-like multiplier on the editor). */
  scale?: number;
  /** Per-label override: skip reflow on this label. */
  skipLabelIds?: ReadonlySet<string>;
}

/**
 * Reflow every container-bound text for a shape. Position-only: text
 * `width`/`height` are NOT rewritten here — that is the inline editor's
 * job, via `commitTextReflow`. This function only keeps the existing
 * measured box anchored to the (possibly-resized/rotated) container.
 */
export function reflowAllContainerText(
  elements: EditorElement[],
  shapeId: string,
  options: ReflowOptions,
): EditorElement[] {
  const shape = elements.find((el) => el.id === shapeId);
  if (!shape) return elements;

  const labels = elements.filter(
    (el): el is TextElement =>
      el.type === 'text' &&
      el.containerId === shapeId &&
      !options.skipLabelIds?.has(el.id),
  );
  if (!labels.length) return elements;

  const fontSize = labels[0]?.fontSize ?? 20;
  const scale = options.scale ?? 1;

  const out: EditorElement[] = elements.slice();
  for (const label of labels) {
    const idx = out.findIndex((el) => el.id === label.id);
    if (idx < 0) continue;

    const anchor = labelAnchorForElement(
      shape,
      options.imageSize,
      fontSize,
      scale,
      label,
    );

    const next: TextElement = {
      ...label,
      x: anchor.x,
      y: anchor.y,
      // Keep the measured width (or default to the inner-box width) so the
      // existing wrap stays valid; the inline editor re-measures on commit.
      width: label.width ?? anchor.width,
    };
    out[idx] = next;
  }
  return out;
}

/**
 * Compute the inner-box position + size for a shape's text container, in
 * image units. Convenience for the inline editor and the live resize handler.
 */
export function containerInnerBox(
  shape: EditorElement,
  imageSize: { width: number; height: number },
  scale = 1,
): { x: number; y: number; w: number; h: number } {
  const pad = TEXT_PADDING * scale;
  if (shape.type === 'callout') {
    const cw = Math.abs(shape.width);
    const ch = Math.abs(shape.height);
    const cx = shape.width < 0 ? shape.x + shape.width : shape.x;
    const cy = shape.height < 0 ? shape.y + shape.height : shape.y;
    return {
      x: cx + pad,
      y: cy + pad,
      w: Math.max(MIN_INNER, cw - pad * 2),
      h: Math.max(MIN_INNER, ch - pad * 2),
    };
  }
  const b = getElementBounds(shape, imageSize);
  return {
    x: b.x + pad,
    y: b.y + pad,
    w: Math.max(MIN_INNER, b.w - pad * 2),
    h: Math.max(MIN_INNER, b.h - pad * 2),
  };
}

/**
 * Resolve a label's parent shape by `containerId` first, then falls back to
 * the legacy `groupId`-pair detection. Returns the parent shape, or null.
 */
export function resolveContainerShape(
  text: TextElement,
  elements: EditorElement[],
): EditorElement | null {
  if (text.containerId) {
    const byId = elements.find((el) => el.id === text.containerId);
    if (byId) return byId;
  }
  if (text.groupId) {
    const partners = elements.filter(
      (el) => el.id !== text.id && el.groupId === text.groupId && el.type !== 'text',
    );
    if (partners.length === 1) return partners[0]!;
  }
  return null;
}

/** Back-reference: every text bound to this shape (in `labelIds` order). */
export function containersOf(
  shape: EditorElement & { labelIds?: string[] },
  elements: EditorElement[],
): TextElement[] {
  if (shape.labelIds?.length) {
    const byId = new Map(elements.map((el) => [el.id, el] as const));
    const out: TextElement[] = [];
    for (const id of shape.labelIds) {
      const el = byId.get(id);
      if (el && el.type === 'text') out.push(el as TextElement);
    }
    return out;
  }
  return elements.filter(
    (el): el is TextElement => el.type === 'text' && el.containerId === shape.id,
  );
}

/** Text-line metrics shared between the inline editor and the render path. */
export function textMetricsFor(
  text: TextElement,
): { fontSize: number; lineHeight: number; padding: number } {
  return {
    fontSize: text.fontSize ?? 20,
    lineHeight: text.lineHeight ?? TEXT_LINE_HEIGHT,
    padding: text.padding ?? TEXT_PADDING,
  };
}
