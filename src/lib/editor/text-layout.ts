import type { TextElement } from '@/types/editor';
import { TEXT_PADDING, TEXT_LINE_HEIGHT, fontFamilyForCanvas } from '@/types/editor';

/**
 * Text measuring shared by selection bounds, binding anchors, label placement
 * and the SVG export, so every one of them sees the same box the Konva `Text`
 * node draws (lines, wrap, padding). Kept apart from text-labels/selection
 * because those two import each other.
 */

type TextLike = Partial<
  Pick<TextElement, 'text' | 'fontSize' | 'fontFamily' | 'fontStyle' | 'padding' | 'lineHeight' | 'width'>
>;

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Real rendered width of the widest line of a text element (no padding). */
export function measureTextWidth(t: TextLike, text = t.text ?? ''): number {
  const fs = t.fontSize ?? 24;
  const lines = text.split('\n');
  if (measureCtx === undefined) {
    measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return Math.max(...lines.map((l) => l.length)) * fs * 0.58;
  measureCtx.font = `${t.fontStyle?.includes('italic') ? 'italic ' : ''}${t.fontStyle?.includes('bold') ? 'bold ' : ''}${fs}px ${fontFamilyForCanvas(t.fontFamily)}`;
  return Math.max(...lines.map((l) => measureCtx!.measureText(l).width));
}

/**
 * Lines (after newlines and, when `wrapWidth` is given, greedy word wrap) and
 * the padded box of a text. `w` is the widest line + padding, capped at
 * `wrapWidth`; `h` is every line at the element's line height + padding.
 * ponytail: a single word wider than the box is not broken (Konva breaks it by
 * character); the box then reads a few px off for such words only.
 */
export function layoutText(
  t: TextLike,
  text = t.text ?? '',
  wrapWidth: number | undefined = t.width,
): { lines: string[]; w: number; h: number } {
  const fs = t.fontSize ?? 24;
  const pad = t.padding ?? TEXT_PADDING;
  const lh = t.lineHeight ?? TEXT_LINE_HEIGHT;
  const inner = wrapWidth ? wrapWidth - pad * 2 : Infinity;
  const lines: string[] = [];
  let widest = 0;
  for (const para of text.split('\n')) {
    const paraW = measureTextWidth(t, para);
    if (paraW <= inner) {
      lines.push(para);
      widest = Math.max(widest, paraW);
      continue;
    }
    let cur = '';
    for (const word of para.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && measureTextWidth(t, next) > inner) {
        lines.push(cur);
        widest = Math.max(widest, measureTextWidth(t, cur));
        cur = word;
      } else {
        cur = next;
      }
    }
    lines.push(cur);
    widest = Math.max(widest, measureTextWidth(t, cur));
  }
  const w = wrapWidth ? Math.min(wrapWidth, widest + pad * 2) : widest + pad * 2;
  return { lines, w, h: lines.length * fs * lh + pad * 2 };
}

/**
 * The box a text element really occupies (no stroke): its explicit width and
 * height when it has them, otherwise sized to its lines. Labels attached to a
 * shape ignore a stored height (it is the shape's inner box, not the text's).
 */
export function textBox(t: TextElement): { w: number; h: number } {
  const lay = layoutText(t);
  return {
    w: t.width || Math.max(1, lay.w),
    h: t.height && !t.groupId ? t.height : lay.h,
  };
}
