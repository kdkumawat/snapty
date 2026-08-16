export type ToolType =
  | 'select'
  | 'hand'
  | 'magnifier'
  | 'arrow'
  | 'rectangle'
  | 'rounded-rect'
  | 'circle'
  | 'diamond'
  | 'line'
  | 'pencil'
  | 'highlighter'
  | 'text'
  | 'blur'
  | 'pixelate'
  | 'spotlight'
  | 'step'
  | 'eraser'
  | 'crop';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg';

export type BgStyle = 'none' | 'solid' | 'gradient' | 'glass';

export type DeviceFrame = 'none' | 'browser' | 'iphone' | 'ipad' | 'android' | 'macbook';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'none';

export type Arrowhead = 'none' | 'arrow' | 'bar' | 'dot' | 'triangle';

/**
 * Where one end of an arrow/line is anchored to a bindable element
 * (rectangle, circle, diamond, text, step, magnifier). Mirrors Excalidraw's
 * `FixedPointBinding` so endpoints stay glued to a shape as it moves,
 * resizes, or rotates (see excalidraw-parity-spec.md §5.1 / §6.2).
 */
export interface FixedPointBinding {
  elementId: string;
  /** Normalized (0..1) position of the endpoint within the target element. */
  fixedPoint: [number, number];
  /**
   * 'inside' — the endpoint is placed on the shape's outline, along the ray
   * from the shape center through the fixedPoint (arrowhead points at the
   * edge). 'orbit' — held just OUTSIDE the outline so the arrowhead hugs the
   * edge. 'skip' — reserved for multi-point intermediates that must not pin
   * the arrowhead (not produced by Snapty's current gestures).
   */
  mode: 'inside' | 'orbit' | 'skip';
}

/**
 * Reserved `elementId` for a binding to the screenshot itself (an image
 * region) instead of an annotation shape. Supported by the data model and
 * crop remapping; not yet created by drawing gestures.
 */
export const IMAGE_BINDING_ID = '__image__';

export type RoughnessPreset = 'architect' | 'artist' | 'cartoonist';

export interface StyleProps {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  roughness?: number;
  opacity?: number;
  shadowEnabled?: boolean;
  cornerRadius?: number;
  startArrowhead?: Arrowhead;
  endArrowhead?: Arrowhead;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
}

export interface BaseElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  draggable?: boolean;
  locked?: boolean;
  groupId?: string;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  roughness?: number;
  shadowEnabled?: boolean;
}

export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'rounded-rect' | 'blur' | 'pixelate' | 'spotlight';
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  blurRadius?: number;
  pixelSize?: number;
  imageDataURL?: string;
}

export interface DiamondElement extends BaseElement {
  type: 'diamond';
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: [number, number, number, number];
  /** Curvature for Shottr-style bendable arrows. 0 is a straight arrow. */
  bend?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  pointerLength?: number;
  pointerWidth?: number;
  startArrowhead?: Arrowhead;
  endArrowhead?: Arrowhead;
  /** Anchor of the start point to a bindable element (null = free). */
  startBinding?: FixedPointBinding | null;
  /** Anchor of the end point to a bindable element (null = free). */
  endBinding?: FixedPointBinding | null;
}

export interface LineElement extends BaseElement {
  type: 'line';
  points: [number, number, number, number];
  /** Curvature, same convention as {@link ArrowElement.bend}. 0 is straight. */
  bend?: number;
  stroke?: string;
  strokeWidth?: number;
  startArrowhead?: Arrowhead;
  endArrowhead?: Arrowhead;
  /** Anchor of the start point to a bindable element (null = free). */
  startBinding?: FixedPointBinding | null;
  /** Anchor of the end point to a bindable element (null = free). */
  endBinding?: FixedPointBinding | null;
}

export interface PencilElement extends BaseElement {
  type: 'pencil' | 'highlighter';
  points: number[];
  /**
   * Per-sample pressure, parallel to `points` (one entry per point pair).
   * Present when the stroke was captured with a real pressure source
   * (stylus/pen); otherwise omitted and pressure is simulated.
   */
  pressures?: number[];
  /**
   * True when the stroke had no real pressure source (mouse/touch), so
   * perfect-freehand simulates pressure from pointer velocity.
   */
  simulatePressure?: boolean;
  stroke?: string;
  strokeWidth?: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  tension?: number;
}

export interface CircleElement extends BaseElement {
  type: 'circle';
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  /** Inner-box height when the text is an attached container label. */
  height?: number;
  padding?: number;
  /** Must match the edit overlay's line-height or multi-line text reflows on commit. */
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  /** Vertical placement inside a container shape. Defaults to 'middle'. */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /**
   * Position of a label attached to a line/arrow as a fraction (0..1) along
   * the path; 0.5 = midpoint. Lets the label slide along the arrow.
   */
  labelOffset?: number;
  /**
   * Signed perpendicular offset (image px) of a line/arrow label from the
   * stroke; positive = right side of travel direction. Lets a label sit
   * beside the line instead of on it. Preserved through reflow like
   * `labelOffset`, so bends/moves keep the label off the stroke.
   */
  labelOffsetY?: number;
}

export interface StepElement extends BaseElement {
  type: 'step';
  stepNumber: number;
  radius?: number;
  fill?: string;
  fontSize?: number;
}

export type EditorElement =
  | ShapeElement
  | DiamondElement
  | ArrowElement
  | LineElement
  | PencilElement
  | CircleElement
  | TextElement
  | StepElement
  | MagnifierElement;

export interface CanvasStyle {
  padding: number;
  borderRadius: number;
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  bgStyle: BgStyle;
  bgColor: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  deviceFrame: DeviceFrame;
  /** URL shown in the browser-chrome frame. Empty = default. */
  frameUrl?: string;
  gridEnabled: boolean;
  transparentExport?: boolean;
}

export const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#ffffff', '#000000',
];

export const DEFAULT_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72];

export const ROUGHNESS_PRESETS: Record<RoughnessPreset, number> = {
  architect: 0.4,
  artist: 1.4,
  cartoonist: 2.6,
};

/** Handwritten-style font stack for text annotations (DOM / CSS). */
export const HANDWRITTEN_FONT =
  'var(--font-handwritten), "Caveat", "Segoe Print", "Comic Sans MS", cursive';

/**
 * Canvas (Konva) cannot resolve CSS `var()` in font-family. Use this literal
 * stack so committed text matches the HTML edit overlay.
 */
export const CANVAS_HANDWRITTEN_FONT =
  '"Caveat", "Segoe Print", "Comic Sans MS", cursive';

/** Plain sans stack, the alternative to {@link HANDWRITTEN_FONT}. */
export const STANDARD_FONT = 'system-ui, sans-serif';

/** Resolve a stored font stack for Konva `Text` nodes. */
export function fontFamilyForCanvas(family?: string): string {
  const f = family ?? HANDWRITTEN_FONT;
  if (f === STANDARD_FONT) return STANDARD_FONT;
  if (
    f.includes('var(--font-handwritten)')
    || f.includes('Kalam')
    || f.includes('Caveat') // legacy sessions stored the old stack
    || f.includes('cursive')
    || f === HANDWRITTEN_FONT
  ) {
    return CANVAS_HANDWRITTEN_FONT;
  }
  return f;
}

/** Numeric badge label font (step tool). Kept separate: digits need a stable sans. */
export const BADGE_FONT = '-apple-system, BlinkMacSystemFont, sans-serif';

/**
 * Text box metrics shared by the Konva `Text` node and the HTML textarea
 * overlay used to edit it. They must agree or the text jumps on commit: the
 * overlay used to apply 4 *CSS* px of padding while Konva applied 4 *image*
 * units, so the drift grew with zoom.
 */
export const TEXT_PADDING = 4;
export const TEXT_LINE_HEIGHT = 1.25;

export interface MagnifierElement extends BaseElement {
  type: 'magnifier';
  width: number;
  height: number;
  /** How much to enlarge the captured region (default 2) */
  magnification?: number;
  /**
   * Legacy fixed-orbit placement: bubble direction from the source in radians,
   * at an auto-computed distance. Superseded by `previewOffset`, still honoured
   * so magnifiers saved before free placement render unchanged.
   */
  previewAngle?: number;
  /** Free bubble placement: offset from the source center, in image units. */
  previewOffset?: { x: number; y: number };
  /** Bend of the leader line (0 = straight, ±1 = full curve). */
  leaderBend?: number;
  stroke?: string;
  strokeWidth?: number;
}
