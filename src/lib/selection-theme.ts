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
      accentSoft: 'rgba(217,119,6,0.45)',
      accentDim: 'rgba(217,119,6,0.45)',
    };
  }
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const accent = cs.getPropertyValue('--brand').trim() || cs.getPropertyValue('--accent').trim() || 'oklch(0.625 0.2 50)';
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
 * Konva Transformer anchor styling. The Transformer cancels its parents'
 * scale, so anchor geometry is already in screen px at any zoom.
 */
export function styleSelectionAnchor(anchor: Konva.Rect) {
  const theme = getSelectionTheme();
  const name = anchor.name();
  const isRotate = name.split(' ')[0] === 'rotater';
  // Excalidraw: 8px handles, rounded squares for resize, a circle for rotate.
  const size = 8;

  anchor.width(size);
  anchor.height(size);
  anchor.cornerRadius(isRotate ? size / 2 : 2);
  anchor.fill('#ffffff');
  anchor.stroke(theme.accent);
  anchor.strokeWidth(1);
  anchor.shadowOpacity(0);
  // Side anchors stay grabbable but invisible: Excalidraw shows corners only
  // on desktop and lets the frame edge do the rest.
  anchor.opacity(/^(top|bottom)-center$|^middle-/.test(name.split(' ')[0]) ? 0 : 1);
}

/**
 * Shared props for custom endpoint / bend handles — Excalidraw's grab points:
 * small, muted, screen-sized control dots rather than big draggable circles.
 * The hit area stays generous (≈18–22 image px, counter-scaled with the node
 * so it is screen-constant) so the small visuals never cost usability.
 */
export function selectionHandleProps(variant: 'endpoint' | 'bend' | 'rotate' = 'endpoint') {
  const theme = getSelectionTheme();
  return {
    name: 'edit-handle',
    // Radius/width are IMAGE units; the canvas keeps them screen-sized by
    // scaling every `.edit-handle` node by 1/zoom (see the zoom effect in
    // editor-canvas) — handles stay the same visual size at any zoom.
    // Excalidraw's point handle: white dot, selection-colored ring.
    radius: 4.5,
    fill: '#ffffff',
    stroke: theme.accent,
    strokeWidth: 1,
    hitStrokeWidth: variant === 'endpoint' ? 20 : 24,
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
      node.getLayer()?.batchDraw();
    },
    onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const node = e.target as Konva.Shape;
      scaleBy(node, 1);
      node.getLayer()?.batchDraw();
    },
  };
}

/** Midpoint 'ghost' handle that inserts a new vertex when dragged/clicked. */
export function midHandleProps() {
  const theme = getSelectionTheme();
  return {
    name: 'edit-handle',
    // Excalidraw's segment midpoint: a soft filled dot in the selection color.
    radius: 4,
    fill: theme.accent,
    opacity: 0.5,
    hitStrokeWidth: 16,
    cursor: 'pointer',
  };
}
