import rough from 'roughjs/bin/rough';
import type { Drawable, Options as RoughOptions } from 'roughjs/bin/core';
import type { FillStyle, StrokeStyle } from '@/types/editor';

export type RoughShapeKind =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'linearPath'
  | 'polygon'
  | 'arrow';

export interface RoughDrawInput {
  kind: RoughShapeKind;
  seed: string | number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  roughness?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  points?: number[];
  /** Arrowhead size in px (end) */
  arrowheadSize?: number;
}

function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

function dashArray(style: StrokeStyle | undefined, strokeWidth: number): number[] | undefined {
  if (!style || style === 'solid') return undefined;
  if (style === 'dashed') return [strokeWidth * 4, strokeWidth * 3];
  return [strokeWidth, strokeWidth * 1.8];
}

function mapFillStyle(fillStyle?: FillStyle): RoughOptions['fillStyle'] {
  switch (fillStyle) {
    case 'solid': return 'solid';
    case 'cross-hatch': return 'cross-hatch';
    case 'none': return undefined;
    case 'hachure':
    default:
      return 'hachure';
  }
}

/** Excalidraw-like rough options, multi-stroke + bowing for sketch feel. */
function buildOptions(input: RoughDrawInput): RoughOptions {
  const strokeWidth = input.strokeWidth ?? 2;
  const roughness = input.roughness ?? 1;
  const fill = !input.fill || input.fill === 'transparent' || input.fillStyle === 'none'
    ? undefined
    : input.fill;
  return {
    seed: hashSeed(input.seed),
    stroke: input.stroke || '#ef4444',
    strokeWidth,
    fill,
    fillStyle: fill ? mapFillStyle(input.fillStyle) : undefined,
    fillWeight: strokeWidth * 0.5,
    hachureGap: Math.max(4, strokeWidth * 3),
        roughness,
    strokeLineDash: dashArray(input.strokeStyle, strokeWidth),
    // Multi-stroke is the Excalidraw signature look
    disableMultiStroke: roughness < 0.5,
    disableMultiStrokeFill: roughness < 0.5,
    // Crisp corners + gentler bowing for a cleaner, Excalidraw-style sketch
    preserveVertices: true,
    bowing: roughness < 0.5 ? 0 : Math.max(0.5, roughness * 0.8),
  };
}

const generator = rough.generator();

export function arrowHeadPoints(
  x1: number, y1: number, x2: number, y2: number, size: number,
): [number, number][] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - size * Math.cos(angle - a), y2 - size * Math.sin(angle - a)],
    [x2 - size * Math.cos(angle + a), y2 - size * Math.sin(angle + a)],
  ];
}

export function generateRoughDrawable(input: RoughDrawInput): Drawable {
  const opts = buildOptions(input);
  const x = input.x ?? 0;
  const y = input.y ?? 0;
  const w = Math.abs(input.width ?? 0);
  const h = Math.abs(input.height ?? 0);

  switch (input.kind) {
    case 'rectangle': {
      if (input.cornerRadius && input.cornerRadius > 0) {
        const r = Math.min(input.cornerRadius, w / 2, h / 2);
        return generator.path(roundedRectPath(x, y, w, h, r), opts);
      }
      return generator.rectangle(x, y, w, h, opts);
    }
    case 'ellipse':
      return generator.ellipse(x + w / 2, y + h / 2, Math.max(1, w), Math.max(1, h), opts);
    case 'diamond': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      return generator.polygon([
        [cx, y],
        [x + w, cy],
        [cx, y + h],
        [x, cy],
      ], opts);
    }
    case 'line': {
      const pts = input.points || [0, 0, 0, 0];
      return generator.line(pts[0], pts[1], pts[2], pts[3], opts);
    }
    case 'arrow': {
      // Line only, arrowhead drawn as separate drawable via generateArrowHead
      const pts = input.points || [0, 0, 0, 0];
      return generator.line(pts[0], pts[1], pts[2], pts[3], opts);
    }
    case 'linearPath': {
      const pts = input.points || [];
      const pairs: [number, number][] = [];
      for (let i = 0; i < pts.length - 1; i += 2) pairs.push([pts[i], pts[i + 1]]);
      if (pairs.length < 2) return generator.line(0, 0, 0, 0, opts);
      return generator.linearPath(pairs, opts);
    }
    case 'polygon': {
      const pts = input.points || [];
      const pairs: [number, number][] = [];
      for (let i = 0; i < pts.length - 1; i += 2) pairs.push([pts[i], pts[i + 1]]);
      return generator.polygon(pairs, opts);
    }
    default:
      return generator.rectangle(x, y, w, h, opts);
  }
}

export function generateArrowHead(input: RoughDrawInput): Drawable | null {
  const size = input.arrowheadSize ?? Math.max(10, (input.strokeWidth || 2) * 4);
  if (size <= 0) return null;
  const pts = input.points || [0, 0, 0, 0];
  const head = arrowHeadPoints(pts[0], pts[1], pts[2], pts[3], size);
  const opts = buildOptions({
    ...input,
    fill: input.stroke || '#ef4444',
    fillStyle: 'solid',
    seed: `${input.seed}-head`,
  });
  return generator.polygon(head, opts);
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

export function paintDrawable(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable,
  opacity = 1,
) {
  ctx.save();
  ctx.globalAlpha *= opacity;
  for (const set of drawable.sets) {
    ctx.save();
    if (set.type === 'path') {
      ctx.beginPath();
      roughDrawOps(ctx, set.ops);
      ctx.strokeStyle = drawable.options.stroke || '#000';
      ctx.lineWidth = drawable.options.strokeWidth || 1;
      const dash = drawable.options.strokeLineDash;
      if (dash) ctx.setLineDash(dash as number[]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    } else if (set.type === 'fillPath') {
      ctx.beginPath();
      roughDrawOps(ctx, set.ops);
      ctx.fillStyle = drawable.options.fill || 'transparent';
      ctx.fill();
    } else if (set.type === 'fillSketch') {
      ctx.beginPath();
      roughDrawOps(ctx, set.ops);
      ctx.strokeStyle = drawable.options.fill || drawable.options.stroke || '#000';
      ctx.lineWidth = Math.max(0.5, (drawable.options.strokeWidth || 1) * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function roughDrawOps(
  ctx: CanvasRenderingContext2D,
  ops: { op: string; data: number[] }[],
) {
  for (const op of ops) {
    const d = op.data;
    switch (op.op) {
      case 'move':
        ctx.moveTo(d[0], d[1]);
        break;
      case 'lineTo':
        ctx.lineTo(d[0], d[1]);
        break;
      case 'bcurveTo':
        ctx.bezierCurveTo(d[0], d[1], d[2], d[3], d[4], d[5]);
        break;
      default:
        break;
    }
  }
}

export function drawableToSvgPaths(drawable: Drawable): { d: string; type: string }[] {
  return drawable.sets.map((set) => {
    let d = '';
    for (const op of set.ops) {
      const data = op.data;
      if (op.op === 'move') d += `M ${data[0]} ${data[1]} `;
      else if (op.op === 'lineTo') d += `L ${data[0]} ${data[1]} `;
      else if (op.op === 'bcurveTo') {
        d += `C ${data[0]} ${data[1]}, ${data[2]} ${data[3]}, ${data[4]} ${data[5]} `;
      }
    }
    return { d: d.trim(), type: set.type };
  });
}
