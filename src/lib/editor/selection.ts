import type { EditorElement } from '@/types/editor';
import type { Bounds } from '@/lib/editor/snap-guides';

export function getElementBounds(el: EditorElement): Bounds {
  const stroke = ('strokeWidth' in el ? Number((el as { strokeWidth?: number }).strokeWidth) : 0) || 0;
  const pad = stroke / 2;

  switch (el.type) {
    case 'rectangle':
    case 'rounded-rect':
    case 'blur':
    case 'pixelate':
    case 'spotlight':
    case 'diamond':
    case 'circle': {
      const w = Math.abs((el as { width: number }).width);
      const h = Math.abs((el as { height: number }).height);
      const x = (el as { width: number }).width < 0 ? el.x + (el as { width: number }).width : el.x;
      const y = (el as { height: number }).height < 0 ? el.y + (el as { height: number }).height : el.y;
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case 'arrow':
    case 'line': {
      const pts = (el as { points: number[] }).points;
      const xs = [el.x, el.x + (pts?.[2] ?? 0)];
      const ys = [el.y, el.y + (pts?.[3] ?? 0)];
      return {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        w: Math.max(...xs) - Math.min(...xs) + pad * 2,
        h: Math.max(...ys) - Math.min(...ys) + pad * 2,
      };
    }
    case 'pencil':
    case 'highlighter': {
      const pts = (el as { points: number[] }).points || [];
      if (pts.length < 2) return { x: el.x, y: el.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case 'text': {
      const t = el as { width?: number; fontSize?: number; text?: string };
      const w = t.width || Math.max(40, (t.text?.length || 1) * (t.fontSize || 24) * 0.55);
      const h = (t.fontSize || 24) * 1.4;
      return { x: el.x - pad, y: el.y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case 'step': {
      const r = (el as { radius?: number }).radius || 16;
      return { x: el.x - r, y: el.y - r, w: r * 2, h: r * 2 };
    }
    case 'magnifier': {
      const w = Math.abs((el as { width: number }).width);
      const h = Math.abs((el as { height: number }).height);
      const x = (el as { width: number }).width < 0 ? el.x + (el as { width: number }).width : el.x;
      const y = (el as { height: number }).height < 0 ? el.y + (el as { height: number }).height : el.y;
      const mag = (el as { magnification?: number }).magnification ?? 2.25;
      const gap = 18;
      const previewW = w * mag;
      const previewH = h * mag;
      const maxX = x + w + gap + previewW;
      const maxY = y + h + gap + previewH;
      return { x: x - pad, y: y - pad, w: maxX - x + pad * 2, h: maxY - y + pad * 2 };
    }
  }
  return { x: (el as EditorElement).x, y: (el as EditorElement).y, w: 0, h: 0 };
}

export function boundsIntersect(a: Bounds, b: Bounds) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
