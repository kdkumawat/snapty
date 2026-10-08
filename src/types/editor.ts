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
  | 'callout'
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
  /**
   * Explicit container binding. For text elements, this is the shape the
   * text lives inside. Replaces the legacy `groupId`-pair detection for
   * label/inside-shape relationships. Read path:
   * `el.containerId ?? findPartnerByGroupId(el)`.
   */
  containerId?: string;
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
  /** Spotlight only: how strongly everything outside the region is dimmed (0-1). */
  dim?: number;
  imageDataURL?: string;
  /**
   * IDs of text elements bound to this shape (text living inside it, or
   * standalone labels on it). Back-reference to `TextElement.containerId`.
   * Derived at runtime if absent: every text whose `containerId === id`.
   * Order = z-stacking.
   */
  labelIds?: string[];
}

export interface DiamondElement extends BaseElement {
  type: 'diamond';
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  labelIds?: string[];
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: [number, number, number, number];
  /** Curvature for Shottr-style bendable arrows. 0 is a straight arrow. */
  bend?: number;
  /**
   * Orthogonal "elbow" routing (Excalidraw's elbow arrows). When true, the
   * interior `points` are routed orthogonal vertices between the two
   * endpoints; the arrow renders as a straight-segment polyline (tension 0)
   * and `recomputeBindings` re-routes the interior when a bound target
   * moves/resizes/rotates.
   */
  elbowed?: boolean;
  /** Excalidraw's "curved" arrow type: the shaft is a curve through `points`. */
  curved?: boolean;
  /**
   * User-fixed segments that survive re-routing (Excalidraw compat). Kept
   * for data-model compatibility; the current router derives all interior
   * vertices, so this stays empty unless authored externally.
   */
  fixedSegments?: { start: [number, number]; end: [number, number]; index: number }[];
  /** Binding fixed-point headings used by the elbow router (cached). */
  startHeading?: 'n' | 's' | 'e' | 'w' | null;
  /** Binding fixed-point headings used by the elbow router (cached). */
  endHeading?: 'n' | 's' | 'e' | 'w' | null;
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
  curved?: boolean;
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
  labelIds?: string[];
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
  /** What the badge shows: a number, or a letter for letter-style steps. */
  stepNumber: number | string;
  radius?: number;
  fill?: string;
  fontSize?: number;
  /** Finger emoji drawn beside the badge, pointing away from it at the target. */
  pointer?: string;
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
  | CalloutElement
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

/**
 * Excalidraw's palette (open-color, 5 shades per hue) and quick picks, copied
 * from packages/common/src/colors.ts.
 */
export const COLOR_PALETTE = {
  transparent: 'transparent',
  black: '#1e1e1e',
  white: '#ffffff',
  gray: ['#f8f9fa', '#e9ecef', '#ced4da', '#868e96', '#343a40'],
  red: ['#fff5f5', '#ffc9c9', '#ff8787', '#fa5252', '#e03131'],
  pink: ['#fff0f6', '#fcc2d7', '#f783ac', '#e64980', '#c2255c'],
  grape: ['#f8f0fc', '#eebefa', '#da77f2', '#be4bdb', '#9c36b5'],
  violet: ['#f3f0ff', '#d0bfff', '#9775fa', '#7950f2', '#6741d9'],
  blue: ['#e7f5ff', '#a5d8ff', '#4dabf7', '#228be6', '#1971c2'],
  cyan: ['#e3fafc', '#99e9f2', '#3bc9db', '#15aabf', '#0c8599'],
  teal: ['#e6fcf5', '#96f2d7', '#38d9a9', '#12b886', '#099268'],
  green: ['#ebfbee', '#b2f2bb', '#69db7c', '#40c057', '#2f9e44'],
  yellow: ['#fff9db', '#ffec99', '#ffd43b', '#fab005', '#f08c00'],
  orange: ['#fff4e6', '#ffd8a8', '#ffa94d', '#fd7e14', '#e8590c'],
  bronze: ['#f8f1ee', '#eaddd7', '#d2bab0', '#a18072', '#846358'],
} as const;

/** Picker grid order: a 5-column grid, single colors first, then the hues. */
export const PALETTE_ORDER = [
  'transparent', 'white', 'gray', 'black', 'bronze',
  'cyan', 'blue', 'violet', 'grape', 'pink',
  'green', 'teal', 'yellow', 'orange', 'red',
] as const satisfies readonly (keyof typeof COLOR_PALETTE)[];

/** Shade shown in the grid: strokes use the darkest, backgrounds a light one. */
export const STROKE_SHADE = 4;
export const BACKGROUND_SHADE = 1;

/** Emoji stamps the Number tool can place instead of a numbered badge. */
/** Fingers that can carry a numbered badge: the step lands with the fingertip on the click. */
export const STEP_FINGERS = ['👉', '👆'] as const;
/** Where the finger sits relative to the badge centre, in badge radii: box origin and fingertip. */
export function stepFingerBox(pointer: string, r: number) {
  const size = r * 2;
  const near = r * 1.3;
  return pointer === '👆'
    ? { x: -r, y: -near - size, size, tipX: 0, tipY: -near - size }
    : { x: near, y: -r, size, tipX: near + size, tipY: 0 };
}
export const STEP_STAMPS = ['👉', '👆', '✅', '❌', '⚠️', '❓', '⭐', '🔥'] as const;

/** Marker yellow: the highlighter's default and its quick-pick swatch. */
export const HIGHLIGHTER_COLOR = COLOR_PALETTE.yellow[2];

// Screenshot order: the colors people annotate with first.
export const STROKE_PICKS = [
  COLOR_PALETTE.red[STROKE_SHADE],
  HIGHLIGHTER_COLOR,
  COLOR_PALETTE.green[STROKE_SHADE],
  COLOR_PALETTE.blue[STROKE_SHADE],
  COLOR_PALETTE.black,
  COLOR_PALETTE.white,
];

export const BACKGROUND_PICKS = [
  COLOR_PALETTE.transparent,
  COLOR_PALETTE.red[BACKGROUND_SHADE],
  COLOR_PALETTE.green[BACKGROUND_SHADE],
  COLOR_PALETTE.blue[BACKGROUND_SHADE],
  COLOR_PALETTE.yellow[BACKGROUND_SHADE],
];

/**
 * Snapty's deliberate deviation from Excalidraw's defaults: a new stroke is
 * red and bold, because near-black thin lines disappear on most screenshots.
 */
export const DEFAULT_STROKE_COLOR = COLOR_PALETTE.red[STROKE_SHADE];

// Excalidraw's presets (ROUGHNESS, STROKE_WIDTH, FONT_SIZES). Stroke width and
// font size are authored at 1x and multiplied by the image tool scale.
export const ROUGHNESS_PRESETS: Record<RoughnessPreset, number> = {
  architect: 0,
  artist: 1,
  cartoonist: 2,
};

export const STROKE_WIDTHS = { thin: 1, bold: 2, extraBold: 4 } as const;

export const FONT_SIZE_PRESETS = { S: 16, M: 20, L: 28, XL: 36 } as const;

/** Excalidraw's DEFAULT_ADAPTIVE_RADIUS for "round" edges. */
export const ROUND_CORNER_RADIUS = 32;

// Excalidraw's three text faces, self-hosted from public/fonts (see globals.css).
export const FONT_HAND_DRAWN = 'Excalifont, sans-serif';
export const FONT_NORMAL = 'Nunito, sans-serif';
export const FONT_CODE = '"Comic Shanns", monospace';

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

export type CalloutPointerDirection = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left';

export interface CalloutElement extends BaseElement {
  type: 'callout';
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  /**
   * Direction the pointer (tail) extends outward from the box.
   * 'bottom' means the pointer points downward below the box,
   * 'top' means upward above the box, etc.
   */
  pointerDirection: CalloutPointerDirection;
  /**
   * Position of the pointer along the edge it sits on, as a fraction (0..1).
   * 0 = left/top edge start, 1 = right/bottom edge end.
   * For 'top' and 'bottom' directions: 0 = left corner, 1 = right corner.
   * For 'left' and 'right' directions: 0 = top corner, 1 = bottom corner.
   * For diagonal directions (e.g. 'top-right'), the pointer sits at the corner.
   */
  pointerOffset: number;
  /**
   * How far the pointer extends outward from the box edge (image px).
   * Defaults to 16 (scaled by image tool scale).
   */
  pointerLength?: number;
  /**
   * Width of the base of the triangular pointer (image px).
   * Defaults to 20 (scaled by image tool scale).
   */
  pointerWidth?: number;
  /**
   * Free pointer tip, relative to the centre of the body (image px, in the
   * body's unrotated frame). When set it wins over direction/offset/length:
   * the tail runs from the nearest side of the body straight to this point,
   * so a callout can point at exactly what the user pressed on.
   */
  pointerTip?: { x: number; y: number };
  labelIds?: string[];
}

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

/** Round spotlights use a small radius: the shared shape radius turns small ones into pills. */
export const SPOTLIGHT_RADIUS = 8;
