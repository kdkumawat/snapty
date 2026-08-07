import type Konva from 'konva';

/** Read themed selection colors from CSS variables (client only). */
export function getSelectionTheme() {
  if (typeof document === 'undefined') {
    return {
      accent: '#d97706',
      accentFg: '#ffffff',
      surface: '#ffffff',
      border: 'rgba(0,0,0,0.12)',
      shadow: 'rgba(0,0,0,0.18)',
    };
  }
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const accent = cs.getPropertyValue('--accent').trim() || 'oklch(0.625 0.2 50)';
  const accentFg = cs.getPropertyValue('--accent-foreground').trim() || '#fff';
  const surface = cs.getPropertyValue('--background').trim() || '#fff';
  const border = cs.getPropertyValue('--border').trim() || 'rgba(0,0,0,0.12)';
  return {
    accent,
    accentFg,
    surface,
    border,
    shadow: 'rgba(0,0,0,0.22)',
  };
}

/** Premium Konva Transformer anchor styling. */
export function styleSelectionAnchor(anchor: Konva.Rect) {
  const theme = getSelectionTheme();
  const name = anchor.name();
  const isRotate = name === 'rotater';
  const size = isRotate ? 12 : 10;

  anchor.width(size);
  anchor.height(size);
  anchor.offsetX(size / 2);
  anchor.offsetY(size / 2);
  anchor.cornerRadius(size / 2);
  anchor.fill(theme.surface);
  anchor.stroke(theme.accent);
  anchor.strokeWidth(isRotate ? 2 : 1.75);
  anchor.shadowColor(theme.shadow);
  anchor.shadowBlur(6);
  anchor.shadowOpacity(0.35);
  anchor.shadowOffset({ x: 0, y: 1 });
}

/** Shared props for custom endpoint / bend handles. */
export function selectionHandleProps(variant: 'endpoint' | 'bend' | 'rotate' = 'endpoint') {
  const theme = getSelectionTheme();
  const r = variant === 'bend' ? 7 : variant === 'rotate' ? 6 : 5;
  return {
    radius: r,
    fill: theme.surface,
    stroke: theme.accent,
    strokeWidth: variant === 'bend' ? 2 : 1.75,
    shadowColor: theme.shadow,
    shadowBlur: 8,
    shadowOpacity: 0.35,
    shadowOffset: { x: 0, y: 1 },
    hitStrokeWidth: variant === 'endpoint' ? 16 : 20,
  };
}
