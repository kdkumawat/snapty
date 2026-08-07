/** Seeded PRNG for stable hand-drawn jitter per element id. */
export function createSeededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    return (h & 0xfffffff) / 0x10000000;
  };
}

export function jitterPoint(
  x: number,
  y: number,
  rnd: () => number,
  amplitude: number,
  stability = 1,
): [number, number] {
  const t = stability;
  return [
    x + (rnd() - 0.5) * amplitude * t,
    y + (rnd() - 0.5) * amplitude * t,
  ];
}

export function handDrawnAmplitude(strokeWidth = 2, min = 0.8, max = 7): number {
  return Math.max(min, Math.min(max, strokeWidth * 1.35));
}

/** Jittered closed rectangle path (4 corners). */
export function handDrawnRectPoints(
  w: number,
  h: number,
  seed: string,
  strokeWidth = 2,
): number[] {
  const rnd = createSeededRandom(seed);
  const amp = handDrawnAmplitude(strokeWidth);
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return corners.flatMap(([x, y]) => jitterPoint(x, y, rnd, amp));
}

/** Approximate ellipse as a smooth closed polygon. */
export function handDrawnEllipsePoints(
  rx: number,
  ry: number,
  seed: string,
  strokeWidth = 2,
  steps = 28,
): number[] {
  const rnd = createSeededRandom(seed);
  const amp = handDrawnAmplitude(strokeWidth, 0.8, 6);
  const points: number[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const [x, y] = jitterPoint(
      Math.cos(a) * rx,
      Math.sin(a) * ry,
      rnd,
      amp,
      0.85,
    );
    points.push(x, y);
  }
  return points;
}

/** Jitter polyline points; endpoints can be stabilized. */
export function handDrawnPolyline(
  pts: number[],
  seed: string,
  strokeWidth = 2,
  endpointStability = 0.25,
): number[] {
  const rnd = createSeededRandom(seed);
  const amp = handDrawnAmplitude(strokeWidth);
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const isEnd = i === 0 || i === n - 1;
    const stability = isEnd ? endpointStability : 1;
    const [x, y] = jitterPoint(
      pts[i * 2],
      pts[i * 2 + 1],
      rnd,
      amp,
      stability,
    );
    out.push(x, y);
  }
  return out;
}

/** Add organic wobble while freehand drawing (live stroke). */
export function wobbleFreehandPoint(
  x: number,
  y: number,
  index: number,
  strokeWidth: number,
): [number, number] {
  const t = index * 0.31;
  const amp = Math.min(2.2, strokeWidth * 0.35);
  return [
    x + Math.sin(t * 1.7) * amp * 0.35,
    y + Math.cos(t * 1.3) * amp * 0.35,
  ];
}
