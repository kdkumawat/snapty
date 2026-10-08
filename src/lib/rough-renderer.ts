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

/**
 * Excalidraw's constants are authored for stroke widths 1 / 2 / 4 at 1x. Snapty
 * multiplies every size by the image tool scale so annotations stay readable
 * on large screenshots, so the pixel constants below scale with it too.
 */
let roughScale = 1;
export function setRoughScale(scale: number) {
  roughScale = scale > 0 ? scale : 1;
}

// Excalidraw: getDashArrayDashed / getDashArrayDotted.
function dashArray(style: StrokeStyle | undefined, strokeWidth: number): number[] | undefined {
  if (!style || style === 'solid') return undefined;
  if (style === 'dashed') return [8 * roughScale, 8 * roughScale + strokeWidth];
  return [1.5 * roughScale, 6 * roughScale + strokeWidth];
}

function mapFillStyle(fillStyle?: FillStyle): RoughOptions['fillStyle'] {
  switch (fillStyle) {
    case 'cross-hatch': return 'cross-hatch';
    case 'hachure': return 'hachure';
    // 'none' is legacy (transparent background replaces it); paint it solid
    // so an old element with a fill color still shows it.
    default: return 'solid';
  }
}

/** Excalidraw: adjustRoughness. Small shapes get less roughness so they stay legible. */
function adjustRoughness(input: RoughDrawInput, roughness: number): number {
  const pts = input.points;
  const linear = !!pts && pts.length >= 4;
  let w = Math.abs(input.width ?? 0);
  let h = Math.abs(input.height ?? 0);
  if (linear) {
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    w = Math.max(...xs) - Math.min(...xs);
    h = Math.max(...ys) - Math.min(...ys);
  }
  const maxSize = Math.max(w, h) / roughScale;
  const minSize = Math.min(w, h) / roughScale;
  if (
    (minSize >= 20 && maxSize >= 50)
    || (minSize >= 15 && !!input.cornerRadius)
    || (linear && maxSize >= 50)
  ) {
    return roughness;
  }
  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5);
}

/** Excalidraw: generateRoughOptions, value for value. */
function buildOptions(input: RoughDrawInput): RoughOptions {
  const strokeWidth = input.strokeWidth ?? 2;
  const solid = !input.strokeStyle || input.strokeStyle === 'solid';
  const fill = !input.fill || input.fill === 'transparent' ? undefined : input.fill;
  return {
    seed: hashSeed(input.seed),
    stroke: input.stroke || '#e03131',
    strokeLineDash: dashArray(input.strokeStyle, strokeWidth),
    // Non-solid strokes disable multi-stroke (dashes would overlay each
    // other) and get a touch more width to look as heavy as solid ones.
    disableMultiStroke: !solid,
    strokeWidth: solid ? strokeWidth : strokeWidth + 0.5 * roughScale,
    // Explicit so a thicker stroke does not change how fills are hatched.
    fillWeight: strokeWidth / 2,
    hachureGap: strokeWidth * 4,
    roughness: adjustRoughness(input, input.roughness ?? 1),
    preserveVertices: (input.roughness ?? 1) < 2,
    fill,
    fillStyle: fill ? mapFillStyle(input.fillStyle) : undefined,
    ...(input.kind === 'ellipse' ? { curveFitting: 1 } : {}),
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
        // Excalidraw's adaptive radius: fixed, but never more than a
        // quarter of the shorter side.
        const r = Math.min(input.cornerRadius, Math.min(w, h) * 0.25);
        return generator.path(roundedRectPath(x, y, w, h, r), opts);
      }
      return generator.rectangle(x, y, w, h, opts);
    }
    case 'ellipse':
      return generator.ellipse(x + w / 2, y + h / 2, Math.max(1, w), Math.max(1, h), opts);
    case 'diamond': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (input.cornerRadius && input.cornerRadius > 0) {
        // Excalidraw's round diamond: each corner is cut back a quarter of
        // the half-diagonal and bridged with a curve through the corner.
        const vr = (w / 2) * 0.25;
        const hr = (h / 2) * 0.25;
        return generator.path(
          `M ${cx + vr} ${y + hr} L ${x + w - vr} ${cy - hr} `
          + `C ${x + w} ${cy}, ${x + w} ${cy}, ${x + w - vr} ${cy + hr} `
          + `L ${cx + vr} ${y + h - hr} `
          + `C ${cx} ${y + h}, ${cx} ${y + h}, ${cx - vr} ${y + h - hr} `
          + `L ${x + vr} ${cy + hr} `
          + `C ${x} ${cy}, ${x} ${cy}, ${x + vr} ${cy - hr} `
          + `L ${cx - vr} ${y + hr} `
          + `C ${cx} ${y}, ${cx} ${y}, ${cx + vr} ${y + hr}`,
          opts,
        );
      }
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

/** A free-form closed outline (SVG path data) in the shared hand-drawn style. */
export function generateRoughPath(path: string, input: Omit<RoughDrawInput, 'kind'>): Drawable {
  return generator.path(path, buildOptions({ ...input, kind: 'polygon' }));
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

// ---------------------------------------------------------------------------
// Linear elements (arrow / line), ported from Excalidraw's shape.ts + bounds.ts
// ---------------------------------------------------------------------------

export type LinearArrowType = 'sharp' | 'round' | 'elbow';
export type LinearArrowhead = 'none' | 'arrow' | 'bar' | 'dot' | 'triangle';

export interface LinearDrawInput {
  seed: string | number;
  /** Flat local points: [x0, y0, x1, y1, ...]. */
  points: number[];
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  arrowType?: LinearArrowType;
  startArrowhead?: LinearArrowhead;
  endArrowhead?: LinearArrowhead;
}

type Pt = [number, number];

const toPairs = (flat: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < flat.length - 1; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

/** Excalidraw: generateElbowArrowShape. Orthogonal path with rounded corners. */
function elbowPath(points: Pt[], radius: number): string {
  const d = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const next = points[i + 1];
    const p = points[i];
    const dPrev = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const dNext = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const corner = Math.min(radius, dNext / 2, dPrev / 2);
    const inX = dPrev ? (p[0] - prev[0]) / dPrev : 0;
    const inY = dPrev ? (p[1] - prev[1]) / dPrev : 0;
    const outX = dNext ? (next[0] - p[0]) / dNext : 0;
    const outY = dNext ? (next[1] - p[1]) / dNext : 0;
    d.push(`L ${p[0] - inX * corner} ${p[1] - inY * corner}`);
    d.push(`Q ${p[0]} ${p[1]}, ${p[0] + outX * corner} ${p[1] + outY * corner}`);
  }
  const last = points[points.length - 1];
  d.push(`L ${last[0]} ${last[1]}`);
  return d.join(' ');
}

const rotateAround = (x: number, y: number, cx: number, cy: number, rad: number): Pt => [
  (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad) + cx,
  (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad) + cy,
];

// Excalidraw: getArrowheadSize / getArrowheadAngle (px at 1x, degrees).
const headSize = (h: LinearArrowhead) => (h === 'arrow' ? 25 : 15) * roughScale;
const headAngle = (h: LinearArrowhead) => (h === 'bar' ? 90 : h === 'arrow' ? 20 : 25);

/**
 * Excalidraw: getArrowheadPoints. The head follows the shaft's own curve: its
 * direction comes from a point 30% back along the last bezier of the rendered
 * shaft, and it shrinks on short segments so it never outgrows the arrow.
 */
function arrowheadPoints(
  shaft: Drawable,
  points: Pt[],
  position: 'start' | 'end',
  head: LinearArrowhead,
  strokeWidth: number,
): number[] | null {
  const ops = (shaft.sets.find((s) => s.type === 'path')?.ops ?? [])
    .filter((op, i) => i === 0 || op.op === 'bcurveTo' || op.op === 'move');
  if (ops.length < 2) return null;
  const index = position === 'start' ? 1 : ops.length - 1;
  const data = ops[index].data;
  if (data.length !== 6) return null;
  const p3: Pt = [data[4], data[5]];
  const p2: Pt = [data[2], data[3]];
  const p1: Pt = [data[0], data[1]];
  const prev = ops[index - 1];
  const p0: Pt = prev.op === 'move' ? [prev.data[0], prev.data[1]] : [prev.data[4], prev.data[5]];
  const eq = (t: number, i: 0 | 1) => (
    (1 - t) ** 3 * p3[i] + 3 * t * (1 - t) ** 2 * p2[i] + 3 * t ** 2 * (1 - t) * p1[i] + p0[i] * t ** 3
  );
  const [x2, y2] = position === 'start' ? p0 : p3;
  const x1 = eq(0.3, 0);
  const y1 = eq(0.3, 1);
  const distance = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (x2 - x1) / distance;
  const ny = (y2 - y1) / distance;

  const n = points.length;
  const [cx, cy] = position === 'end' ? points[n - 1] : points[0];
  const [px, py] = position === 'end' ? points[n - 2] : points[1];
  const length = Math.hypot(cx - px, cy - py);
  const minSize = Math.min(headSize(head), length * 0.5);
  const xs = x2 - nx * minSize;
  const ys = y2 - ny * minSize;

  if (head === 'dot') {
    return [x2, y2, Math.hypot(ys - y2, xs - x2) + strokeWidth - 2 * roughScale];
  }
  const rad = (headAngle(head) * Math.PI) / 180;
  const [x3, y3] = rotateAround(xs, ys, x2, y2, -rad);
  const [x4, y4] = rotateAround(xs, ys, x2, y2, rad);
  return [x2, y2, x3, y3, x4, y4];
}

/** Excalidraw: getArrowheadShapes for the heads Snapty offers. */
function arrowheadDrawables(
  shaft: Drawable,
  input: LinearDrawInput,
  points: Pt[],
  position: 'start' | 'end',
  head: LinearArrowhead,
  options: RoughOptions,
): Drawable[] {
  if (head === 'none') return [];
  const strokeWidth = input.strokeWidth ?? 2;
  const pts = arrowheadPoints(shaft, points, position, head, strokeWidth);
  if (!pts) return [];
  const stroke = options.stroke as string;

  if (head === 'dot') {
    const [x, y, diameter] = pts;
    const o: RoughOptions = {
      ...options, fill: stroke, fillStyle: 'solid', roughness: Math.min(0.5, options.roughness || 0),
    };
    delete o.strokeLineDash;
    return [generator.circle(x, y, diameter, o)];
  }
  const [x2, y2, x3, y3, x4, y4] = pts;
  if (head === 'triangle') {
    const o: RoughOptions = {
      ...options, fill: stroke, fillStyle: 'solid', roughness: Math.min(1, options.roughness || 0),
    };
    delete o.strokeLineDash;
    return [generator.polygon([[x2, y2], [x3, y3], [x4, y4], [x2, y2]], o)];
  }
  // Excalidraw: getArrowheadLineOptions. Caps stay solid unless dotted.
  const o: RoughOptions = { ...options, roughness: Math.min(1, options.roughness || 0) };
  if (input.strokeStyle === 'dotted') {
    const dash = dashArray('dotted', strokeWidth - roughScale)!;
    o.strokeLineDash = [dash[0], dash[1] - roughScale];
  } else {
    delete o.strokeLineDash;
  }
  if (head === 'bar') return [generator.line(x3, y3, x4, y4, o)];
  return [generator.line(x3, y3, x2, y2, o), generator.line(x4, y4, x2, y2, o)];
}

/**
 * The shaft plus arrowheads for an arrow or line, exactly as Excalidraw builds
 * them: a linear path for sharp, a curve through the points for round, a
 * rounded-corner path for elbow.
 */
export function generateLinearDrawables(input: LinearDrawInput): Drawable[] {
  const points = toPairs(input.points);
  if (points.length < 2) return [];
  const type = input.arrowType ?? 'sharp';
  const options = buildOptions({ ...input, kind: 'linearPath' });
  let shaft: Drawable;
  if (type === 'elbow') {
    // Excalidraw passes continuousPath=true here, which keeps vertices exact.
    shaft = generator.path(elbowPath(points, 16 * roughScale), { ...options, preserveVertices: true });
  } else if (type === 'round') {
    shaft = generator.curve(points, options);
  } else {
    shaft = generator.linearPath(points, options);
  }
  return [
    shaft,
    ...arrowheadDrawables(shaft, input, points, 'start', input.startArrowhead ?? 'none', options),
    ...arrowheadDrawables(shaft, input, points, 'end', input.endArrowhead ?? 'none', options),
  ];
}
