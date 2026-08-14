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
  // Pencil: Excalidraw's default feel — width varies a little with speed
  // (simulated pressure, since mice have none) and the curve is smoothed.
  return {
    size: strokeWidth,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: true,
    last: true,
  };
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

/**
 * Compute the smooth filled outline (flat points) for a raw freehand stroke.
 * With fewer than 2 samples the stroke is a dot; perfect-freehand needs at
 * least a couple of points to trace a contour.
 *
 * Rounded, un-tapered ends (like Excalidraw's default freehand): a taper on
 * short strokes clips them visibly, and annotation scribbles are often short.
 */
export function freehandOutline(
  points: number[],
  tool: FreehandTool,
  strokeWidth: number,
): number[] {
  const pairs = toPairs(points);
  if (pairs.length < 2) {
    return flatten(pairs);
  }
  const opts: StrokeOptions = {
    ...strokeOptionsFor(tool, strokeWidth),
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  };
  const outline = getStroke(pairs, opts);
  return flatten(outline);
}

/**
 * Whether a freehand stroke has enough samples for a real outline (vs a dot
 * or a two-point stub). Mirrors the commit guard in the canvas.
 */
export function freehandStrokeValid(points: number[]): boolean {
  return points.length > 4;
}
