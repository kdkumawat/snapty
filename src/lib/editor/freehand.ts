'use client';

import { getStroke, type StrokeOptions } from 'perfect-freehand';

/**
 * Freehand smoothing for pencil / highlighter strokes — powered by
 * perfect-freehand, the same library Excalidraw uses. It converts a raw
 * polyline of pointer samples into a smooth, filled outline polygon (a
 * closed contour with variable width), so strokes look fluid while drawing
 * and after commit instead of jagged.
 *
 * The raw points stay in the element (bounds, hit-testing, and SVG export
 * all read them); the outline is computed at render time via
 * {@link freehandOutline}.
 *
 * Two refinements over the original implementation, matching Excalidraw:
 *
 * - **Real pressure.** `PencilElement.pressures` (parallel to `points`) is
 *   threaded into perfect-freehand as `[x, y, pressure]` triplets with
 *   `simulatePressure: false` when the stroke came from a stylus; mouse and
 *   touch strokes keep simulated pressure (velocity-based), which is where
 *   the signature thinning comes from.
 * - **Outline caching.** Elements are immutable (the store invariant: no
 *   code may mutate an element or its nested arrays in place), so a stroke's
 *   `points` array reference is stable across renders. That lets us memoize
 *   the computed outline in a `WeakMap` keyed by the points array — committed
 *   strokes become O(1) to render instead of re-running perfect-freehand on
 *   every React render (the visible draw lag while panning/zooming).
 */

export type FreehandTool = 'pencil' | 'highlighter';

/** Map a tool + its stroke width to perfect-freehand options. */
function strokeOptionsFor(tool: FreehandTool, strokeWidth: number): StrokeOptions {
  if (tool === 'highlighter') {
    // A marker: uniform width, no thinning (pressure/speed changes don't
    // narrow it), just soft smoothing around the polyline.
    return {
      size: strokeWidth,
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.4,
      simulatePressure: true,
      last: true,
    };
  }
  // Pencil: width tracks the chosen stroke width closely (thinning 0.25) so
  // a pencil at "3" reads the same thickness as an arrow or rectangle at "3"
  // — Excalidraw's default thinning (0.6) renders fast strokes at roughly
  // half the nominal width (measured 1.6px vs 3px at size 3), which looks
  // thinner than every other tool. The reduced thinning keeps the speed-based
  // hand-drawn variance without collapsing fast scribbles. Smoothing and
  // streamline still match Excalidraw (issue #4802).
  return {
    size: strokeWidth,
    thinning: 0.25,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
    last: true,
  };
}

/** Maximum samples kept per stroke; past this the stroke is decimated. */
const MAX_STROKE_SAMPLES = 2000;
/** Skip samples closer than this (image px) to the previous one. */
const MIN_SAMPLE_DISTANCE = 1;

/**
 * Append one pointer sample to a live stroke, enforcing the payload budget:
 * pressures are rounded to 2 decimals, near-duplicate samples are skipped,
 * and past {@link MAX_STROKE_SAMPLES} the stroke is decimated uniformly
 * (invisible at that density — perfect-freehand smooths anyway). Returns the
 * same arrays when the sample is dropped so the draft keeps its identity.
 */
export function appendFreehandSample(
  points: number[],
  pressures: number[],
  x: number,
  y: number,
  pressure: number,
): { points: number[]; pressures: number[] } {
  const p = Math.round(Math.min(1, Math.max(0, pressure)) * 100) / 100;
  const n = points.length;
  if (n >= 2) {
    const lx = points[n - 2];
    const ly = points[n - 1];
    if (Math.hypot(x - lx, y - ly) < MIN_SAMPLE_DISTANCE) {
      return { points, pressures };
    }
  }
  const pts = [...points, x, y];
  const prs = [...pressures, p];
  if (prs.length > MAX_STROKE_SAMPLES) {
    const keepEvery = Math.ceil(prs.length / MAX_STROKE_SAMPLES);
    const outPts: number[] = [];
    const outPrs: number[] = [];
    for (let i = 0; i < prs.length; i += keepEvery) {
      outPts.push(pts[i * 2], pts[i * 2 + 1]);
      outPrs.push(prs[i]);
    }
    return { points: outPts, pressures: outPrs };
  }
  return { points: pts, pressures: prs };
}

/**
 * Append one pointer sample to a live stroke **in place** (no array copy).
 *
 * The transient draft keeps its points/pressures in mutable refs during a
 * gesture; this mutates those buffers directly and returns whether a sample
 * was actually added (a near-duplicate sample is dropped). Same payload
 * budget as {@link appendFreehandSample} (min distance, uniform decimation
 * past MAX_STROKE_SAMPLES) but zero allocations per pointermove, so 120 Hz
 * pen input doesn't churn the GC while drawing.
 *
 * The final committed element snapshots the buffers with `slice()`, which
 * restores the immutability the outline WeakMap cache relies on.
 */
export function appendFreehandSampleInPlace(
  points: number[],
  pressures: number[],
  x: number,
  y: number,
  pressure: number,
): boolean {
  const p = Math.round(Math.min(1, Math.max(0, pressure)) * 100) / 100;
  const n = points.length;
  if (n >= 2) {
    const lx = points[n - 2];
    const ly = points[n - 1];
    if (Math.hypot(x - lx, y - ly) < MIN_SAMPLE_DISTANCE) return false;
  }
  points.push(x, y);
  pressures.push(p);
  const count = pressures.length;
  if (count > MAX_STROKE_SAMPLES) {
    const keepEvery = Math.ceil(count / MAX_STROKE_SAMPLES);
    let write = 0;
    for (let read = 0; read < count; read += keepEvery) {
      points[write * 2] = points[read * 2];
      points[write * 2 + 1] = points[read * 2 + 1];
      pressures[write] = pressures[read];
      write++;
    }
    points.length = write * 2;
    pressures.length = write;
  }
  return true;
}

/**
 * Flatten an array of [x, y] pairs into the flat `[x0,y0,x1,y1,...]` layout
 * Konva `Line.points` expects.
 */
function flatten(pairs: Array<[number, number]>): number[] {
  const out = new Array<number>(pairs.length * 2);
  for (let i = 0; i < pairs.length; i++) {
    out[i * 2] = pairs[i][0];
    out[i * 2 + 1] = pairs[i][1];
  }
  return out;
}

/** Convert flat points into [x, y] pairs. */
function toPairs(points: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push([points[i], points[i + 1]]);
  }
  return pairs;
}

export interface FreehandShapeOptions {
  /** Per-sample pressures parallel to `points`; used when the device is a pen. */
  pressures?: number[];
  /** False when the stroke was captured with real pressure (stylus). */
  simulatePressure?: boolean;
}

/**
 * Compute the smooth filled outline (flat points) for a raw freehand stroke.
 * With fewer than 2 samples the stroke is a dot; perfect-freehand needs at
 * least a couple of points to trace a contour.
 *
 * Rounded, un-tapered ends (like Excalidraw's default freehand): a taper on
 * short strokes clips them visibly, and annotation scribbles are often short.
 *
 * Raw computation — see {@link freehandOutline} for the cached wrapper.
 */
export function computeFreehandOutline(
  points: number[],
  tool: FreehandTool,
  strokeWidth: number,
  opts?: FreehandShapeOptions,
): number[] {
  const pairs = toPairs(points);
  if (pairs.length < 2) {
    return flatten(pairs);
  }
  const realPressure =
    opts?.simulatePressure === false
    && !!opts.pressures
    && opts.pressures.length === pairs.length;
  const strokePoints: Array<[number, number] | [number, number, number]> = realPressure
    ? pairs.map(([x, y], i) => [x, y, opts!.pressures![i]] as [number, number, number])
    : pairs;
  const options: StrokeOptions = {
    ...strokeOptionsFor(tool, strokeWidth),
    simulatePressure: realPressure ? false : true,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  };
  const outline = getStroke(strokePoints, options);
  return flatten(outline);
}

/**
 * Memoized {@link computeFreehandOutline}. Elements are immutable and their
 * `points` arrays are never mutated, so the points array reference is a
 * stable cache key: committed strokes compute their outline once and every
 * later render (pan, zoom, redo, selection) is a cache hit. Only the live
 * draft — whose points array is new each frame — misses and recomputes.
 */
const outlineCache = new WeakMap<number[], Map<string, number[]>>();

export function freehandOutline(
  points: number[],
  tool: FreehandTool,
  strokeWidth: number,
  opts?: FreehandShapeOptions,
): number[] {
  const key = `${tool}:${strokeWidth}:${opts?.simulatePressure === false ? 'real' : 'sim'}`;
  let byKey = outlineCache.get(points);
  if (!byKey) {
    byKey = new Map<string, number[]>();
    outlineCache.set(points, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const outline = computeFreehandOutline(points, tool, strokeWidth, opts);
  // Guard against a single points array being re-styled many times (e.g. a
  // slider drag over the selected stroke changes strokeWidth every tick).
  if (byKey.size > 8) byKey.clear();
  byKey.set(key, outline);
  return outline;
}

/**
 * Whether a freehand stroke has enough samples for a real outline (vs a dot
 * or a two-point stub). Mirrors the commit guard in the canvas.
 */
export function freehandStrokeValid(points: number[]): boolean {
  return points.length > 4;
}
