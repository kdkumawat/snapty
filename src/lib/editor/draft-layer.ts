'use client';

/**
 * Imperative transient interaction layer ("draft layer").
 *
 * Everything a drawing gesture shows before it is committed lives here as
 * raw Konva nodes driven directly from pointer events — no React state, no
 * Zustand writes, no re-render of the annotation scene. The canvas keeps the
 * authoritative geometry in refs; this controller only mirrors it onto a
 * dedicated Konva `Layer` that sits above the annotation layer.
 *
 * One `requestAnimationFrame`-coalesced `batchDraw()` is scheduled per update
 * burst, so a 120 Hz pointer stream costs one canvas draw per frame, and the
 * draw only touches this overlay layer — committed elements are never
 * re-rasterized while drawing.
 */

import Konva from 'konva';
import type { FillStyle, StrokeStyle } from '@/types/editor';
import { calloutPath } from './callout-pointer';
import { computeFreehandOutline, type FreehandTool } from './freehand';
import { handDrawnPolyline } from '../hand-drawn';
import { routeElbow } from './elbow';
import {
  generateRoughDrawable,
  generateArrowHead,
  paintDrawable,
} from '../rough-renderer';
import type { GuideLine } from './snap-guides';
import type { BindingPreview } from './binding-preview';
import { getSelectionTheme } from '@/lib/selection-theme';

export type DraftBoxKind =
  | 'rectangle'
  | 'rounded-rect'
  | 'ellipse'
  | 'diamond'
  | 'blur'
  | 'pixelate'
  | 'spotlight'
  | 'crop'
  | 'callout';

export interface DraftBoxStyle {
  stroke?: string;
  fill?: string;
  strokeWidth: number;
  cornerRadius?: number;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  roughness?: number;
  opacity: number;
}

export interface DraftSegmentStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  opacity: number;
  /** Arrowhead size in px (0 = no head). */
  headSize?: number;
  /** Arrowhead width in px (defaults to headSize). */
  pointerWidth?: number;
  showStartHead?: boolean;
}

/** Geometry of the current box/segment draft, in image coordinates. */
export interface DraftBoxGeo {
  kind: DraftBoxKind;
  /** Origin of the drag (start point). */
  ox: number;
  oy: number;
  /** Signed width/height from the origin (negative = dragged up/left). */
  w: number;
  h: number;
  /** True when drawing from the center (alt-drag). */
  centered?: boolean;
  /** Extra data for callout pointer properties. */
  extra?: {
    pointerDirection?: import('@/types/editor').CalloutPointerDirection;
    pointerLength?: number;
    pointerWidth?: number;
    pointerOffset?: number;
  };
}

export interface DraftSegmentGeo {
  kind: 'arrow' | 'line';
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** Orthogonal (elbow) routing for the arrow draft preview. */
  elbowed?: boolean;
}

/**
 * Mutable scene data for a rough-drawn draft node. The Konva.Shape is reused
 * across pointer moves and its sceneFunc reads this holder, so a live draft
 * only regenerates the rough drawable per frame — it never destroys/re-adds
 * the node (that churn stalls the draft preview while drawing).
 */
type RoughDraftScene = {
  drawable: ReturnType<typeof generateRoughDrawable>;
  head: ReturnType<typeof generateArrowHead> | null;
  startHead: ReturnType<typeof generateArrowHead> | null;
};

type DraftState =
  | { type: 'freehand'; tool: FreehandTool; strokeWidth: number; color: string; opacity: number; simulatePressure: boolean; node: Konva.Line; pendingPoints: number[] | null; pendingPressures: number[] | null }
  | { type: 'box'; geo: DraftBoxGeo; style: DraftBoxStyle; seed: string; handDrawn: boolean; node: Konva.Shape | null; rough: RoughDraftScene | null; calloutPathD: string | null }
  | { type: 'segment'; kind: 'arrow' | 'line'; geo: DraftSegmentGeo; style: DraftSegmentStyle; seed: string; handDrawn: boolean; node: Konva.Shape | null; rough: RoughDraftScene | null };

function normalizeBox(geo: DraftBoxGeo): { x: number; y: number; w: number; h: number } {
  let x = geo.ox;
  let y = geo.oy;
  let w = geo.w;
  let h = geo.h;
  if (geo.centered) {
    x = geo.ox - geo.w;
    y = geo.oy - geo.h;
    w = geo.w * 2;
    h = geo.h * 2;
  }
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

/** Paint a roughjs drawable (+ optional arrowhead) onto a Konva shape. */
function roughSceneFunc(
  ctx: CanvasRenderingContext2D,
  shape: Konva.Shape,
  drawable: ReturnType<typeof generateRoughDrawable> | null,
  head?: ReturnType<typeof generateArrowHead> | null,
  startHead?: ReturnType<typeof generateArrowHead> | null,
) {
  if (drawable) paintDrawable(ctx, drawable, 1);
  if (head) paintDrawable(ctx, head, 1);
  if (startHead) paintDrawable(ctx, startHead, 1);
  // Keep Konva's transform bookkeeping happy (shadows, hit, etc.).
  (ctx as any).fillStrokeShape?.(shape);
}

export class DraftLayer {
  private layer: Konva.Layer | null = null;
  private nodes: Konva.Shape[] = [];
  /** Overlay chrome (marquee / eraser rect / guides / binding preview /
   *  hover outline). Kept separate from `nodes` (the active draft) so a
   *  chrome update during a drawing gesture never destroys the draft. */
  private chrome: Konva.Shape[] = [];
  private rafId: number | null = null;
  private dirty = false;
  private draft: DraftState | null = null;
  private guides: GuideLine[] | null = null;
  private marquee: { x: number; y: number; w: number; h: number; accent?: string; fill?: string } | null = null;
  private eraser: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private bindingPreview: { preview: BindingPreview; accent: string; zoom: number } | null = null;
  private hoverOutline: { x: number; y: number; w: number; h: number } | null = null;
  private labelAnchor: { x: number; y: number; zoom: number } | null = null;
  // Pooled chrome nodes: marquee/eraser/guides/binding-preview are updated on
  // every pointermove during a gesture, so their Konva nodes are reused
  // in-place instead of being destroyed and recreated per frame.
  private marqueeNode: Konva.Rect | null = null;
  private eraserNode: Konva.Rect | null = null;
  private guideNodes: Konva.Line[] = [];
  private bindingRectNode: Konva.Rect | null = null;
  private bindingDotNode: Konva.Circle | null = null;
  private hoverNode: Konva.Rect | null = null;
  private labelRingNode: Konva.Circle | null = null;
  private labelDotNode: Konva.Circle | null = null;

  attach(layer: Konva.Layer) {
    this.layer = layer;
  }

  detach() {
    this.cancelRaf();
    this.clear();
    this.layer = null;
  }

  private cancelRaf() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dirty = false;
  }

  /** Schedule one layer redraw per animation frame. */
  private draw() {
    if (this.dirty || !this.layer) return;
    this.dirty = true;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.dirty = false;
      // Freehand outline computation is coalesced here: perfect-freehand is
      // the expensive part of the stroke hot path, and a 120Hz pointer stream
      // recomputed it up to twice per displayed frame. Only the latest sample
      // buffer matters visually, so compute at most one outline per frame.
      const d = this.draft;
      if (d && d.type === 'freehand' && d.pendingPoints) {
        d.node.points(computeFreehandOutline(
          d.pendingPoints,
          d.tool,
          d.strokeWidth,
          { pressures: d.pendingPressures ?? undefined, simulatePressure: d.simulatePressure },
        ));
        d.pendingPoints = null;
        d.pendingPressures = null;
      }
      this.layer?.batchDraw();
    });
  }

  /** Remove all transient nodes and stop scheduling. */
  clear() {
    this.cancelRaf();
    for (const n of this.nodes) n.destroy();
    this.nodes = [];
    for (const n of this.chrome) n.destroy();
    this.chrome = [];
    this.draft = null;
    this.guides = null;
    this.marquee = null;
    this.eraser = null;
    this.bindingPreview = null;
    this.hoverOutline = null;
    this.labelAnchor = null;
    this.marqueeNode = null;
    this.eraserNode = null;
    this.guideNodes = [];
    this.bindingRectNode = null;
    this.bindingDotNode = null;
    this.hoverNode = null;
    this.labelRingNode = null;
    this.labelDotNode = null;
    if (this.layer) {
      // batchDraw now so the overlay never shows a stale frame.
      this.layer.batchDraw();
    }
  }

  private replaceNode(node: Konva.Shape) {
    for (const n of this.nodes) n.destroy();
    this.nodes = [node];
    if (this.draft) (this.draft as { node: Konva.Shape | null }).node = node;
    if (this.layer) this.layer.add(node);
  }

  /** Replace the overlay chrome nodes (never touches the active draft). */
  private setChrome(nodes: Konva.Shape[]) {
    // Pooled nodes surviving into the new set keep their layer membership;
    // only the ones dropped are destroyed (per-frame rebuilds stay cheap).
    const keep = new Set<Konva.Shape>(nodes);
    for (const n of this.chrome) {
      if (!keep.has(n)) n.destroy();
    }
    if (this.layer) {
      for (const n of nodes) {
        if (!n.getLayer()) this.layer.add(n);
      }
    }
    this.chrome = nodes;
  }

  // ------------------------------------------------------------------ freehand

  beginFreehand(
    tool: FreehandTool,
    strokeWidth: number,
    color: string,
    opacity: number,
    simulatePressure: boolean,
  ) {
    const node = new Konva.Line({
      points: [],
      closed: true,
      fill: color,
      stroke: 'transparent',
      strokeWidth: 0.01,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    });
    this.replaceNode(node);
    this.draft = { type: 'freehand', tool, strokeWidth, color, opacity, simulatePressure, node, pendingPoints: null, pendingPressures: null };
  }

  updateFreehand(points: number[], pressures: number[] | undefined, simulatePressure: boolean) {
    const d = this.draft;
    if (!d || d.type !== 'freehand') return;
    d.simulatePressure = simulatePressure;
    // Stage the latest sample buffer; the outline is computed once per
    // animation frame inside draw() instead of on every pointermove.
    d.pendingPoints = points;
    d.pendingPressures = pressures ?? null;
    this.draw();
  }

  // ------------------------------------------------------------------ box

  beginBox(geo: DraftBoxGeo, style: DraftBoxStyle, seed: string, handDrawn: boolean) {
    this.draft = { type: 'box', geo, style, seed, handDrawn, node: null, rough: null, calloutPathD: null };
    this.rebuildBox();
  }

  updateBox(geo: DraftBoxGeo) {
    const d = this.draft;
    if (!d || d.type !== 'box') return;
    d.geo = geo;
    this.rebuildBox();
  }

  /** Rebuild (or in-place update) the draft box node for the current geometry. */
  private rebuildBox() {
    const d = this.draft;
    if (!d || d.type !== 'box') return;
    const { x, y, w, h } = normalizeBox(d.geo);
    const s = d.style;
    const opacity = s.opacity;

    if (d.handDrawn && (d.geo.kind === 'rectangle' || d.geo.kind === 'rounded-rect' || d.geo.kind === 'ellipse' || d.geo.kind === 'diamond')) {
      const kind = d.geo.kind === 'ellipse' ? 'ellipse' : d.geo.kind === 'diamond' ? 'diamond' : 'rectangle';
      // The rough drawable is painted in node-local coordinates, so it must
      // be generated at (0,0) while the Konva node carries the position —
      // same convention as the committed RoughKonvaShape. Generating it at
      // absolute (x,y) AND placing the node at (x,y) doubled the offset, so
      // the draft preview visibly trailed the pointer while drawing.
      const drawable = generateRoughDrawable({
        kind,
        seed: d.seed,
        stroke: s.stroke,
        fill: s.fill,
        strokeWidth: s.strokeWidth,
        strokeStyle: s.strokeStyle,
        fillStyle: s.fillStyle,
        roughness: s.roughness ?? 1.25,
        x: 0,
        y: 0,
        width: Math.max(1, w),
        height: Math.max(1, h),
        cornerRadius: s.cornerRadius,
      });
      const existing = d.node && d.node.getClassName() === 'Shape' ? (d.node as Konva.Shape) : null;
      if (existing && d.rough) {
        // Reuse the node in place: only the drawable + geometry attrs change.
        // Destroying and re-adding a node per pointermove (the old behavior)
        // stalled the draft preview while drawing.
        d.rough.drawable = drawable;
        existing.setAttrs({
          x,
          y,
          width: Math.max(1, w),
          height: Math.max(1, h),
          opacity,
        });
      } else {
        const scene: RoughDraftScene = { drawable, head: null, startHead: null };
        const node = new Konva.Shape({
          x,
          y,
          width: Math.max(1, w),
          height: Math.max(1, h),
          opacity,
          listening: false,
          sceneFunc: (ctx, shape) => {
            roughSceneFunc(ctx as unknown as CanvasRenderingContext2D, shape as Konva.Shape, scene.drawable);
          },
        });
        d.rough = scene;
        this.replaceNode(node);
      }
      this.draw();
      return;
    }

    if (d.geo.kind === 'ellipse') {
      const node = d.node && d.node.getClassName() === 'Ellipse' ? (d.node as Konva.Ellipse) : null;
      if (node) {
        node.setAttrs({
          x: x + w / 2,
          y: y + h / 2,
          radiusX: Math.max(2.5, w / 2),
          radiusY: Math.max(2.5, h / 2),
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          dash: dashOf(s.strokeStyle),
          opacity,
        });
      } else {
        const ellipse = new Konva.Ellipse({
          x: x + w / 2,
          y: y + h / 2,
          radiusX: Math.max(2.5, w / 2),
          radiusY: Math.max(2.5, h / 2),
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          dash: dashOf(s.strokeStyle),
          opacity,
          listening: false,
        });
        this.replaceNode(ellipse);
      }
      this.draw();
      return;
    }

    if (d.geo.kind === 'diamond') {
      const node = d.node && d.node.getClassName() === 'Line' ? (d.node as Konva.Line) : null;
      if (node) {
        node.setAttrs({
          x,
          y,
          points: [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2],
          closed: true,
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          opacity,
        });
      } else {
        const diamond = new Konva.Line({
          x,
          y,
          points: [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2],
          closed: true,
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          opacity,
          listening: false,
        });
        this.replaceNode(diamond);
      }
      this.draw();
      return;
    }

    // Callout: single continuous silhouette (Shottr-style).
    if (d.geo.kind === 'callout') {
      const cornerR = Math.max(0, s.cornerRadius ?? 12);
      const pointerLen = d.geo.extra?.pointerLength ?? 24;
      const pointerW = d.geo.extra?.pointerWidth ?? 20;
      const pDir = (d.geo.extra?.pointerDirection ?? 'bottom-left') as import('@/types/editor').CalloutPointerDirection;
      const pOffset = d.geo.extra?.pointerOffset ?? 0.5;
      const pathD = calloutPath(w, h, pDir, pOffset, pointerLen, pointerW, cornerR);

      const existing = d.node && d.node.getClassName() === 'Shape' ? (d.node as Konva.Shape) : null;
      if (existing && d.calloutPathD !== null) {
        // Reuse the node in place; the sceneFunc reads the swapped path.
        d.calloutPathD = pathD;
        existing.setAttrs({
          x,
          y,
          width: Math.max(1, w),
          height: Math.max(1, h),
          opacity,
        });
      } else {
        const holder = { pathD };
        const node = new Konva.Shape({
          x, y,
          width: Math.max(1, w),
          height: Math.max(1, h),
          opacity,
          listening: false,
          sceneFunc: (ctx, _shape) => {
            const c = ctx as unknown as CanvasRenderingContext2D;
            const svgPath = new Path2D(holder.pathD);
            if (s.fill && s.fill !== 'transparent') {
              c.fillStyle = s.fill;
              c.fill(svgPath);
            }
            if (s.stroke && s.strokeWidth) {
              c.strokeStyle = s.stroke;
              c.lineWidth = s.strokeWidth;
              c.setLineDash(dashOf(s.strokeStyle) ?? []);
              c.stroke(svgPath);
            }
          },
        });
        d.calloutPathD = pathD;
        this.replaceNode(node);
      }
      this.draw();
      return;
    }

    // Dashed "effect" marquees (blur / pixelate / spotlight / crop) keep the
    // exact dash the React drafts used (crop was [8,4]; effects were [6,4]).
    const isEffect = ['blur', 'pixelate', 'spotlight', 'crop'].includes(d.geo.kind);
    const node = d.node && d.node.getClassName() === 'Rect' ? (d.node as Konva.Rect) : null;
    const attrs: Record<string, unknown> = {
      x,
      y,
      width: Math.max(1, w),
      height: Math.max(1, h),
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      cornerRadius: d.geo.kind === 'rounded-rect' ? (s.cornerRadius ?? 0) : 0,
      opacity,
    };
    if (isEffect) attrs.dash = d.geo.kind === 'crop' ? [8, 4] : [6, 4];
    else attrs.dash = dashOf(s.strokeStyle);
    if (node) node.setAttrs(attrs);
    else {
      const rect = new Konva.Rect({ ...attrs, listening: false });
      this.replaceNode(rect);
    }
    this.draw();
  }

  // ------------------------------------------------------------------ segment

  beginSegment(
    kind: 'arrow' | 'line',
    geo: DraftSegmentGeo,
    style: DraftSegmentStyle,
    seed: string,
    handDrawn: boolean,
  ) {
    this.draft = { type: 'segment', kind, geo, style, seed, handDrawn, node: null, rough: null };
    this.rebuildSegment();
  }

  updateSegment(geo: DraftSegmentGeo) {
    const d = this.draft;
    if (!d || d.type !== 'segment') return;
    d.geo = geo;
    this.rebuildSegment();
  }

  private rebuildSegment() {
    const d = this.draft;
    if (!d || d.type !== 'segment') return;
    const { sx, sy, ex, ey } = d.geo;
    const s = d.style;
    // Elbow arrows preview their routed polyline, not the raw chord: the
    // committed element is routed too, so the preview and the result always
    // agree (same rule the drawing-preview sync pass applied to pointer
    // offset).
    let pts = [sx, sy, ex, ey];
    if (d.geo.elbowed && d.kind === 'arrow') {
      const interior = routeElbow({ x: sx, y: sy }, { x: ex, y: ey });
      pts = [sx, sy];
      for (const p of interior) pts.push(p.x, p.y);
      pts.push(ex, ey);
    }
    const headSize = s.headSize ?? 0;

    if (d.handDrawn) {
      // Multi-point (routed) drafts skip the rough drawable — the committed
      // hand-drawn elbow renders as a jittered plain Arrow, so the preview
      // mirrors that instead of approximating with a rough line.
      if (pts.length > 4) {
        const jittered = handDrawnPolyline(pts, d.seed, s.strokeWidth, 0.2);
        const node = d.node && d.node.getClassName() === 'Arrow' ? (d.node as Konva.Arrow) : null;
        const attrs = {
          points: jittered,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          fill: s.fill,
          pointerLength: d.kind === 'arrow' ? headSize : 0,
          pointerWidth: d.kind === 'arrow' ? (s.pointerWidth ?? headSize) : 0,
          dash: dashOf(s.strokeStyle),
          opacity: s.opacity,
        };
        if (node) node.setAttrs(attrs);
        else {
          const arrow = new Konva.Arrow({ ...attrs, listening: false });
          this.replaceNode(arrow);
        }
        this.draw();
        return;
      }
      const drawable = generateRoughDrawable({
        kind: 'line',
        seed: d.seed,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeStyle: s.strokeStyle,
        roughness: s.roughness ?? 1.25,
        points: pts,
      });
      const head = d.kind === 'arrow' && headSize > 0
        ? generateArrowHead({
            kind: 'arrow',
            seed: `${d.seed}-head`,
            stroke: s.stroke,
            strokeWidth: s.strokeWidth,
            strokeStyle: s.strokeStyle,
            roughness: s.roughness ?? 1.25,
            points: pts,
            arrowheadSize: headSize,
          } as Parameters<typeof generateArrowHead>[0])
        : null;
      const startHead = d.kind === 'arrow' && s.showStartHead && headSize > 0
        ? generateArrowHead({
            kind: 'arrow',
            seed: `${d.seed}-start`,
            stroke: s.stroke,
            strokeWidth: s.strokeWidth,
            strokeStyle: s.strokeStyle,
            roughness: s.roughness ?? 1.25,
            points: [ex, ey, sx, sy],
            arrowheadSize: headSize,
          } as Parameters<typeof generateArrowHead>[0])
        : null;
      const existing = d.node && d.node.getClassName() === 'Shape' ? (d.node as Konva.Shape) : null;
      if (existing && d.rough) {
        // Reuse the node in place: only the drawables change per pointermove
        // (node churn here stalled the hand-drawn arrow/line draft).
        d.rough.drawable = drawable;
        d.rough.head = head;
        d.rough.startHead = startHead;
      } else {
        const scene: RoughDraftScene = { drawable, head, startHead };
        const node = new Konva.Shape({
          opacity: s.opacity,
          listening: false,
          sceneFunc: (ctx, shape) => {
            roughSceneFunc(ctx as unknown as CanvasRenderingContext2D, shape as Konva.Shape, scene.drawable, scene.head, scene.startHead);
          },
        });
        d.rough = scene;
        this.replaceNode(node);
      }
      this.draw();
      return;
    }

    if (d.kind === 'arrow' && headSize > 0) {
      const node = d.node && d.node.getClassName() === 'Arrow' ? (d.node as Konva.Arrow) : null;
      if (node) {
        node.setAttrs({
          points: pts,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          fill: s.fill,
          pointerLength: headSize,
          pointerWidth: s.pointerWidth ?? headSize,
          dash: dashOf(s.strokeStyle),
          opacity: s.opacity,
        });
      } else {
        const arrow = new Konva.Arrow({
          points: pts,
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          fill: s.fill,
          pointerLength: headSize,
          pointerWidth: s.pointerWidth ?? headSize,
          dash: dashOf(s.strokeStyle),
          opacity: s.opacity,
          listening: false,
        });
        this.replaceNode(arrow);
      }
      this.draw();
      return;
    }

    const node = d.node && d.node.getClassName() === 'Line' ? (d.node as Konva.Line) : null;
    if (node) {
      node.setAttrs({
        points: pts,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        dash: dashOf(s.strokeStyle),
        opacity: s.opacity,
      });
    } else {
      const line = new Konva.Line({
        points: pts,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        dash: dashOf(s.strokeStyle),
        opacity: s.opacity,
        listening: false,
      });
      this.replaceNode(line);
    }
    this.draw();
  }

  // ------------------------------------------------------------- chrome items

  showMarquee(x: number, y: number, w: number, h: number, accent: string, fill: string) {
    this.marquee = { x, y, w, h, accent, fill };
    this.rebuildChrome();
  }

  clearMarquee() {
    this.marquee = null;
    this.rebuildChrome();
  }

  showEraser(x1: number, y1: number, x2: number, y2: number) {
    this.eraser = { x1, y1, x2, y2 };
    this.rebuildChrome();
  }

  clearEraser() {
    this.eraser = null;
    this.rebuildChrome();
  }

  showGuides(guides: GuideLine[]) {
    this.guides = guides;
    this.rebuildChrome();
  }

  clearGuides() {
    this.guides = null;
    this.rebuildChrome();
  }

  // ------------------------------------------------------- binding preview

  /**
   * Show the live arrow-binding preview (Excalidraw's suggestedBinding): a
   * subtle accent outline around the candidate target + a dot on the exact
   * attachment point. Rebuilt on every endpoint move; zoom keeps the stroke
   * and dot at a constant screen size.
   */
  showBindingPreview(preview: BindingPreview, accent: string, zoom: number) {
    this.bindingPreview = { preview, accent, zoom };
    this.rebuildChrome();
  }

  clearBindingPreview() {
    this.bindingPreview = null;
    this.rebuildChrome();
  }

  /** Subtle hover feedback: a thin outline around the element under the
   *  pointer (Excalidraw's hover state). Rendered imperatively — no React. */
  showHoverOutline(bounds: { x: number; y: number; w: number; h: number }) {
    this.hoverOutline = bounds;
    this.rebuildChrome();
  }

  clearHoverOutline() {
    this.hoverOutline = null;
    this.rebuildChrome();
  }

  /**
   * Text-tool attach preview: a quiet dashed ring + center dot on a line/arrow
   * stroke marking where a click would attach a text label. Screen-constant
   * size via zoom (like the binding-preview dot); driven imperatively so a
   * moving pointer never touches React.
   */
  showLabelAnchor(x: number, y: number, zoom: number) {
    this.labelAnchor = { x, y, zoom };
    this.rebuildChrome();
  }

  clearLabelAnchor() {
    this.labelAnchor = null;
    this.rebuildChrome();
  }

  /** Rebuild marquee + eraser + guides nodes (called when one is cleared). */
  private rebuildChrome() {
    const nodes: Konva.Shape[] = [];
    if (this.marquee) {
      const m = this.marquee;
      const attrs = {
        x: m.x,
        y: m.y,
        width: Math.max(1, m.w),
        height: Math.max(1, m.h),
        fill: m.fill ?? 'rgba(234,88,12,0.08)',
        stroke: m.accent ?? '#ea580c',
      };
      if (this.marqueeNode && this.marqueeNode.getLayer()) {
        this.marqueeNode.setAttrs(attrs);
      } else {
        this.marqueeNode = new Konva.Rect({ ...attrs, strokeWidth: 1, dash: [6, 4], listening: false });
      }
      nodes.push(this.marqueeNode);
    }
    if (this.eraser) {
      const e = this.eraser;
      const attrs = {
        x: Math.min(e.x1, e.x2),
        y: Math.min(e.y1, e.y2),
        width: Math.max(1, Math.abs(e.x2 - e.x1)),
        height: Math.max(1, Math.abs(e.y2 - e.y1)),
      };
      if (this.eraserNode && this.eraserNode.getLayer()) {
        this.eraserNode.setAttrs(attrs);
      } else {
        this.eraserNode = new Konva.Rect({
          ...attrs,
          fill: 'rgba(239,68,68,0.06)', stroke: '#ef4444', strokeWidth: 1.5, dash: [6, 4],
          listening: false,
        });
      }
      nodes.push(this.eraserNode);
    }
    if (this.guides) {
      for (let i = 0; i < this.guides.length; i++) {
        const g = this.guides[i];
        const points = g.orientation === 'vertical'
          ? [g.position, g.start, g.position, g.end]
          : [g.start, g.position, g.end, g.position];
        let node = this.guideNodes[i];
        if (node && node.getLayer()) {
          node.points(points);
        } else {
          node = new Konva.Line({
            points,
            stroke: '#F97316', strokeWidth: 1, dash: [4, 4], listening: false,
          });
          this.guideNodes[i] = node;
        }
        nodes.push(node);
      }
    }
    if (this.bindingPreview) {
      const { preview, accent, zoom } = this.bindingPreview;
      const z = zoom > 0 ? zoom : 1;
      const b = preview.bounds;
      const rectAttrs = {
        x: b.x,
        y: b.y,
        width: Math.max(1, b.w),
        height: Math.max(1, b.h),
        stroke: accent,
        strokeWidth: 1.5 / z,
        dash: [6 / z, 4 / z],
        listening: false,
      };
      if (this.bindingRectNode && this.bindingRectNode.getLayer()) {
        this.bindingRectNode.setAttrs(rectAttrs);
      } else {
        this.bindingRectNode = new Konva.Rect(rectAttrs);
      }
      nodes.push(this.bindingRectNode);
      const dotAttrs = {
        x: preview.anchor.x,
        y: preview.anchor.y,
        radius: 3.5 / z,
        fill: accent,
        stroke: '#ffffff',
        strokeWidth: 1 / z,
        listening: false,
      };
      if (this.bindingDotNode && this.bindingDotNode.getLayer()) {
        this.bindingDotNode.setAttrs(dotAttrs);
      } else {
        this.bindingDotNode = new Konva.Circle(dotAttrs);
      }
      nodes.push(this.bindingDotNode);
    }
    if (this.labelAnchor) {
      const { x, y, zoom } = this.labelAnchor;
      const z = zoom > 0 ? zoom : 1;
      const theme = getSelectionTheme();
      const ringAttrs = {
        x, y, radius: 6 / z,
        stroke: theme.accentSoft,
        strokeWidth: 1 / z,
        dash: [3 / z, 2 / z],
        listening: false,
      };
      if (this.labelRingNode && this.labelRingNode.getLayer()) {
        this.labelRingNode.setAttrs(ringAttrs);
      } else {
        this.labelRingNode = new Konva.Circle(ringAttrs);
      }
      nodes.push(this.labelRingNode);
      const dotAttrs = {
        x, y, radius: 1.75 / z,
        fill: theme.accentSoft,
        listening: false,
      };
      if (this.labelDotNode && this.labelDotNode.getLayer()) {
        this.labelDotNode.setAttrs(dotAttrs);
      } else {
        this.labelDotNode = new Konva.Circle(dotAttrs);
      }
      nodes.push(this.labelDotNode);
    }
    // While a binding preview is up, the target highlight carries the hover
    // signal; a second outline on the same shape would just look noisy.
    if (this.hoverOutline && !this.bindingPreview) {
      const h = this.hoverOutline;
      const theme = getSelectionTheme();
      const attrs = {
        x: h.x,
        y: h.y,
        width: Math.max(1, h.w),
        height: Math.max(1, h.h),
        stroke: theme.accentSoft,
        strokeWidth: 1.5,
        cornerRadius: 2,
        listening: false,
      };
      if (this.hoverNode && this.hoverNode.getLayer()) {
        this.hoverNode.setAttrs(attrs);
      } else {
        this.hoverNode = new Konva.Rect(attrs);
      }
      nodes.push(this.hoverNode);
    }
    this.setChrome(nodes);
    // Dropped guide nodes were destroyed by setChrome; shrink the pool to
    // match so stale references never accumulate.
    this.guideNodes.length = this.guides?.length ?? 0;
    this.draw();
  }
}

function dashOf(style: StrokeStyle | undefined): number[] | undefined {
  if (!style || style === 'solid') return undefined;
  if (style === 'dashed') return [8, 6];
  return [2, 4];
}
