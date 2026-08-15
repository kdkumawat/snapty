import type Konva from 'konva';
import { useEditorStore } from '@/store/editor-store';

/** Read themed selection colors from CSS variables (client only). */
export function getSelectionTheme() {
  if (typeof document === 'undefined') {
    return {
      accent: '#d97706',
      accentFg: '#ffffff',
      surface: '#ffffff',
      border: 'rgba(0,0,0,0.12)',
      shadow: 'rgba(0,0,0,0.18)',
      accentSoft: 'rgba(217,119,6,0.45)',
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
    // Very light version of the accent for the selection dots/handles - a
    // translucent tint so the handles read as quiet instead of loud.
    accentSoft: `color-mix(in srgb, ${accent} 40%, white)`,
  };
}

/**
 * Premium Konva Transformer anchor styling, kept screen-constant at any zoom:
 * the Transformer lives inside the zoomed stage, so its anchor geometry is
 * divided by the current zoom. The offsets were just set by the Transformer
 * (anchorSize/2 + padding, image units), so dividing them keeps the visual
 * gap between anchor and selection box constant too. Runs on every
 * Transformer update (attach / drag / resize), so zoom changes are picked up
 * the moment the store reports them.
 */
export function styleSelectionAnchor(anchor: Konva.Rect) {
  const theme = getSelectionTheme();
  const name = anchor.name();
  const isRotate = name === 'rotater';
  const z = Math.max(0.1, useEditorStore.getState().zoom || 1);
  const size = (isRotate ? 12 : 10) / z;

  anchor.width(size);
  anchor.height(size);
  anchor.offsetX(anchor.offsetX() / z);
  anchor.offsetY(anchor.offsetY() / z);
  anchor.cornerRadius(size / 2);
  anchor.fill(theme.surface);
  anchor.stroke(theme.accentSoft);
  anchor.strokeWidth((isRotate ? 2 : 1.75) / z);
  anchor.shadowColor(theme.shadow);
  anchor.shadowBlur(6 / z);
  anchor.shadowOpacity(0.35);
  anchor.shadowOffset({ x: 0, y: 1 / z });
}

/**
 * Shared props for custom endpoint / bend handles, sized like Excalidraw's
 * grab points (screen-comfortable and easy to hit at high zoom-out).
 */
export function selectionHandleProps(variant: 'endpoint' | 'bend' | 'rotate' = 'endpoint') {
  const theme = getSelectionTheme();
  const r = variant === 'bend' ? 9 : variant === 'rotate' ? 6 : 7;
  return {
    name: 'edit-handle',
    // Radius/width are IMAGE units; the canvas keeps them screen-sized by
    // scaling every `.edit-handle` node by 1/zoom (see the zoom effect in
    // editor-canvas) — handles stay the same visual size at any zoom.
    radius: r,
    fill: theme.surface,
    stroke: theme.accentSoft,
    strokeWidth: variant === 'bend' ? 2 : 1.75,
    shadowColor: theme.shadow,
    shadowBlur: 8,
    shadowOpacity: 0.35,
    shadowOffset: { x: 0, y: 1 },
    hitStrokeWidth: variant === 'endpoint' ? 18 : 22,
    cursor: 'grab',
  };
}

/**
 * Excalidraw-style handle feedback: subtle. The grab circle grows a touch and
 * greys out while the pointer hovers it - just enough to say "grabbable"
 * without shouting, exactly like Excalidraw's quiet handle hover.
 *
 * Handles are scaled to `1/zoom` for screen-constant sizing (see the zoom
 * effect in editor-canvas); the base scale is stored on each node as
 * `handleBaseScale`, and hover multiplies that base instead of overwriting it.
 */
export function handleHoverEvents() {
  const scaleBy = (node: Konva.Shape, f: number) => {
    const base = (node.getAttr('handleBaseScale') as number | undefined) ?? 1;
    node.scale({ x: base * f, y: base * f });
  };
  return {
    onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const node = e.target as Konva.Shape;
      scaleBy(node, 1.15);
      node.fill('rgba(128, 128, 128, 0.55)');
      node.getLayer()?.batchDraw();
    },
    onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const node = e.target as Konva.Shape;
      scaleBy(node, 1);
      node.fill(getSelectionTheme().surface);
      node.getLayer()?.batchDraw();
    },
  };
}

/** Midpoint 'ghost' handle that inserts a new vertex when dragged/clicked. */
export function midHandleProps() {
  const theme = getSelectionTheme();
  return {
    name: 'edit-handle',
    radius: 6,
    fill: theme.surface,
    stroke: theme.accentSoft,
    strokeWidth: 1.5,
    shadowColor: theme.shadow,
    shadowBlur: 6,
    shadowOpacity: 0.3,
    shadowOffset: { x: 0, y: 1 },
    hitStrokeWidth: 16,
    dash: [3, 2],
    cursor: 'copy',
  };
}
