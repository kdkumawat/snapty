import type { EditorElement, StyleProps } from '@/types/editor';

const STYLE_KEYS: (keyof StyleProps)[] = [
  'stroke', 'fill', 'strokeWidth', 'strokeStyle', 'fillStyle', 'roughness',
  'opacity', 'shadowEnabled', 'cornerRadius', 'startArrowhead', 'endArrowhead',
  'fontSize', 'fontFamily', 'fontStyle',
];

export function extractStyle(el: EditorElement): StyleProps {
  const style: StyleProps = {};
  const raw = el as unknown as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    const val = raw[key];
    if (val !== undefined) (style as Record<string, unknown>)[key] = val;
  }
  return style;
}

export function applyStyle(el: EditorElement, style: StyleProps): EditorElement {
  return { ...el, ...style } as EditorElement;
}

let clipboardStyle: StyleProps | null = null;

export function copyStyleToClipboard(el: EditorElement) {
  clipboardStyle = extractStyle(el);
  return clipboardStyle;
}

export function pasteStyleFromClipboard(el: EditorElement): EditorElement | null {
  if (!clipboardStyle) return null;
  return applyStyle(el, clipboardStyle);
}

export function hasClipboardStyle() {
  return clipboardStyle !== null;
}

export function getClipboardStyle() {
  return clipboardStyle;
}
