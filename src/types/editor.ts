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

export type DeviceFrame = 'none' | 'browser' | 'iphone' | 'macbook';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'none';

export type Arrowhead = 'none' | 'arrow' | 'bar' | 'dot' | 'triangle';

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
}

export interface LineElement extends BaseElement {
  type: 'line';
  points: [number, number, number, number];
  stroke?: string;
  strokeWidth?: number;
  startArrowhead?: Arrowhead;
  endArrowhead?: Arrowhead;
}

export interface PencilElement extends BaseElement {
  type: 'pencil' | 'highlighter';
  points: number[];
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
  padding?: number;
  align?: 'left' | 'center' | 'right';
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
  gridEnabled: boolean;
  transparentExport?: boolean;
}

export const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#ffffff', '#000000',
];

export const DEFAULT_STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 10, 16];

export const DEFAULT_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72];

export const ROUGHNESS_PRESETS: Record<RoughnessPreset, number> = {
  architect: 0.4,
  artist: 1.4,
  cartoonist: 2.6,
};

/** Handwritten-style font stack for text annotations */
export const HANDWRITTEN_FONT =
  'var(--font-handwritten), "Caveat", "Segoe Print", "Comic Sans MS", cursive';

export interface MagnifierElement extends BaseElement {
  type: 'magnifier';
  width: number;
  height: number;
  /** How much to enlarge the captured region (default 2) */
  magnification?: number;
  stroke?: string;
  strokeWidth?: number;
}
