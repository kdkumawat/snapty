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
      accentDim: 'rgba(217,119,6,0.45)',
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
    // Translucent accent for thin selection outlines (Transformer border,
    // dashed path selection): present but quiet, so the object stays the
    // focus and the chrome disappears into the canvas.
    accentDim: `color-mix(in srgb, ${accent} 55%, transparent)`,
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
 *
 * Handles are deliberately small and quiet (≈7px screen, grey): they read as
 * control points, not UI knobs. Hit areas stay generous (hitStrokeWidth in
 * selectionHandleProps) so usability is unaffected.
 */
export function styleSelectionAnchor(anchor: Konva.Rect) {
  const theme = getSelectionTheme();
  const name = anchor.name();
  const isRotate = name === 'rotater';
  const z = Math.max(0.1, useEditorStore.getState().zoom || 1);
  const size = (isRotate ? 9 : 7) / z;

  anchor.width(size);
  anchor.height(size);
  anchor.offsetX(anchor.offsetX() / z);
  anchor.offsetY(anchor.offsetY() / z);
  anchor.cornerRadius(size / 2);
  anchor.fill(theme.surface);
  anchor.stroke('rgba(120, 120, 120, 0.5)');
  anchor.strokeWidth((isRotate ? 1.5 : 1.2) / z);
  anchor.shadowColor(theme.shadow);
  anchor.shadowBlur(2.5 / z);
  anchor.shadowOpacity(0.15);
  anchor.shadowOffset({ x: 0, y: 0.5 / z });
}

/**
 * Shared props for custom endpoint / bend handles — Excalidraw's grab points:
 * small, muted, screen-sized control dots rather than big draggable circles.
 * The hit area stays generous (≈18–22 image px, counter-scaled with the node
 * so it is screen-constant) so the small visuals never cost usability.
 */
export function selectionHandleProps(variant: 'endpoint' | 'bend' | 'rotate' = 'endpoint') {
  const theme = getSelectionTheme();
  const r = variant === 'bend' ? 5.5 : variant === 'rotate' ? 4.5 : 4.5;
  return {
    name: 'edit-handle',
    // Radius/width are IMAGE units; the canvas keeps them screen-sized by
    // scaling every `.edit-handle` node by 1/zoom (see the zoom effect in
    // editor-canvas) — handles stay the same visual size at any zoom.
    radius: r,
    fill: 'rgba(255, 255, 255, 0.92)',
    stroke: 'rgba(110, 110, 110, 0.55)',
    strokeWidth: variant === 'bend' ? 1.4 : 1.2,
    shadowColor: theme.shadow,
    shadowBlur: 3,
    shadowOpacity: 0.16,
    shadowOffset: { x: 0, y: 0.5 },
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
      scaleBy(node, 1.25);
      node.fill('rgba(96, 96, 96, 0.62)');
      node.stroke('rgba(96, 96, 96, 0.8)');
      node.getLayer()?.batchDraw();
    },
    onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const node = e.target as Konva.Shape;
      scaleBy(node, 1);
      node.fill('rgba(255, 255, 255, 0.92)');
      node.stroke('rgba(110, 110, 110, 0.55)');
      node.getLayer()?.batchDraw();
    },
  };
}

/** Midpoint 'ghost' handle that inserts a new vertex when dragged/clicked. */
export function midHandleProps() {
  const theme = getSelectionTheme();
  return {
    name: 'edit-handle',
    radius: 4.5,
    fill: 'rgba(255, 255, 255, 0.9)',
    stroke: 'rgba(110, 110, 110, 0.5)',
    strokeWidth: 1.2,
    shadowColor: theme.shadow,
    shadowBlur: 2.5,
    shadowOpacity: 0.15,
    shadowOffset: { x: 0, y: 0.5 },
    hitStrokeWidth: 16,
    dash: [2.5, 2],
    cursor: 'copy',
  };
}
