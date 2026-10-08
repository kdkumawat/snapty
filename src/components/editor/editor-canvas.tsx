'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import {
  Stage, Layer, Rect, Ellipse, Line, Text, Group,
  Image as KonvaImage, Circle, Transformer,
} from 'react-konva';
import Konva from 'konva';
import { useTheme } from 'next-themes';
import OcrPanel from '@/components/editor/panels/ocr-panel';
import { useEditorStore, generateId, getImageToolScale } from '@/store/editor-store';
import { loadImageFileIntoEditor } from '@/lib/image-load';
import {
  handDrawnPolyline,
  handDrawnEllipsePoints,
  wobbleFreehandPoint,
} from '@/lib/hand-drawn';
import { appendFreehandSampleInPlace, freehandOutline } from '@/lib/editor/freehand';
import { DraftLayer, type DraftBoxGeo, type DraftBoxStyle, type DraftSegmentGeo, type DraftSegmentStyle } from '@/lib/editor/draft-layer';
import { PerfProbe } from '@/lib/editor/perf';
import {
  anchorForBinding,
  computeBoundArrowUpdates,
  fixedPointFromGlobalPoint,
  globalFixedPointForBinding,
  isBindableElement,
  liveElementFromNode,
  resolveEndpointBinding,
} from '@/lib/editor/binding';
import { elbowPointsLocal, headingFromFixedPoint } from '@/lib/editor/elbow';
import { removeVertexAt } from '@/lib/editor/linear-editor';
import { snapEndpointForBinding } from '@/lib/editor/binding-preview';
import {
  labelAnchorForElement,
  pathLabelClipRect,
  measureTextWidth,
  createAttachedLabel,
  clipPolylineAgainstRect,
  pointAlongPath,
  projectPointToPath,
  isLabelPairGroup,
  selectionTargetForClick,
  isClosedShape,
  labelPairPartner,
} from '@/lib/editor/text-labels';
import { resolveContainerShape } from '@/lib/editor/container-reflow';
import { setPastePoint } from '@/lib/editor/annotation-clipboard';
import TextEditOverlay from '@/components/editor/canvas/text-edit-overlay';
import { getSelectionTheme, styleSelectionAnchor, selectionHandleProps, handleHoverEvents, midHandleProps } from '@/lib/selection-theme';
import RoughKonvaShape from '@/components/editor/canvas/rough-konva-shape';
import SpotlightDim from '@/components/editor/canvas/spotlight-dim';
import CachedKonvaImage from '@/components/editor/canvas/cached-konva-image';
import MagnifierKonva from '@/components/editor/canvas/magnifier-konva';
import DeviceFrameKonva from '@/components/editor/canvas/device-frame-konva';
import ShapeSelectionOverlay, { isShapeOverlayType } from '@/components/editor/canvas/shape-selection-overlay';

import { DEVICE_FRAME_INSETS } from '@/lib/editor/device-frames';
import { calloutTipOf, directionFromClickToBox } from '@/lib/editor/callout-pointer';
import CalloutKonvaShape from '@/components/editor/canvas/callout-konva-shape';
import { resolvePreviewOffset, resizeSourceKeepingBubble, startMagnification } from '@/lib/editor/magnifier-geometry';
import { arrowHeadPoints } from '@/lib/rough-renderer';
import LinearKonvaShape, { LINEAR_SHAPE_ATTR } from '@/components/editor/canvas/linear-konva-shape';
import SelectionOverlayV2 from '@/components/editor/canvas/selection-overlay-v2';
import ShapeContextMenu from '@/components/editor/canvas/shape-context-menu';
import { getElementBounds } from '@/lib/editor/selection';
import { hydrateSettingsFromElement, hydrateSettingsFromSelection } from '@/lib/editor/settings-sync';
import {
  renderPoints, bendFromCurveAt,
  tangentAtStart, tangentAtEnd,
} from '@/lib/editor/curve';
import type {
  EditorElement, ShapeElement, ArrowElement, LineElement, FixedPointBinding,
  PencilElement, CircleElement, TextElement, StepElement, DiamondElement,
  CalloutElement, CalloutPointerDirection, MagnifierElement, ToolType,
} from '@/types/editor';
import {
  HANDWRITTEN_FONT, BADGE_FONT, TEXT_PADDING, TEXT_LINE_HEIGHT, fontFamilyForCanvas, STEP_STAMPS, STEP_FINGERS, stepFingerBox, SPOTLIGHT_RADIUS,
} from '@/types/editor';
import { cn } from '@/lib/utils';

/** Letter badge label: 1 = A ... 26 = Z, 27 = AA. */
function letterLabel(n: number): string {
  let out = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  return out || '0';
}

/** Find a top-level annotation node by id (safe for ids that start with digits). */
function findAnnotationNode(stage: Konva.Stage, id: string): Konva.Node | undefined {
  const layer = stage.findOne('.annotation-layer') as Konva.Layer | undefined;
  if (!layer) return undefined;
  return layer.getChildren((node) => node.id() === id)[0];
}

/** True when the event target is a Transformer anchor, border, or rotation handle. */
function isTransformerTarget(target: Konva.Node): boolean {
  let node: Konva.Node | null = target;
  while (node) {
    if (node.getClassName?.() === 'Transformer') return true;
    node = node.getParent();
  }
  return false;
}

/**
 * Points the linear renderer draws through. Legacy 2-point arrows with a
 * `bend` become a 3-point curve through the bend's on-curve midpoint, which is
 * how Excalidraw models a curved arrow (roundness over real points).
 */
function linearShapePoints(points: number[], bend: number): number[] {
  if (!bend || points.length !== 4) return points;
  const mid = pointAlongPath({ points, bend } as ArrowElement, 0.5);
  return [points[0], points[1], mid.x, mid.y, points[2], points[3]];
}

/** Excalidraw's arrow type for an element: sharp, round (curved) or elbow. */
function linearArrowType(el: ArrowElement | LineElement): 'sharp' | 'round' | 'elbow' {
  if ((el as ArrowElement).elbowed) return 'elbow';
  return el.curved || (el.bend ?? 0) !== 0 ? 'round' : 'sharp';
}

/**
 * Excalidraw centres a new text line vertically on the click; the editor's
 * y is the top of the box, so lift it by half a line plus the padding.
 */
function textClickY(y: number): number {
  const st = useEditorStore.getState();
  const scale = getImageToolScale(st.imageSize.width, st.imageSize.height);
  return y - (st.fontSize * scale * TEXT_LINE_HEIGHT) / 2 - TEXT_PADDING;
}

/**
 * Seat a callout's body for the current pointer: centred on the pointer once
 * it has travelled clear of the press point, otherwise at a default spot up
 * and to the right so a plain click still yields a readable bubble. The tail
 * tip stays on the press point either way.
 */
function placeCalloutBody(geo: DraftBoxGeo, pos: { x: number; y: number }) {
  const ex = geo.extra;
  if (!ex?.tipAbs) return;
  const w = ex.bodyW ?? geo.w;
  const h = ex.bodyH ?? geo.h;
  const tip = ex.tipAbs;
  const dragged = Math.hypot(pos.x - tip.x, pos.y - tip.y) > Math.min(w, h) * 0.6;
  let cx = pos.x;
  let cy = pos.y;
  if (!dragged) {
    // Click only: up and to the right, flipped to whichever side keeps the
    // bubble on the screenshot.
    const image = useEditorStore.getState().imageSize;
    const fits = (x: number, y: number) =>
      x - w / 2 >= 0 && x + w / 2 <= image.width && y - h / 2 >= 0 && y + h / 2 <= image.height;
    const spots = [[1, -1], [-1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: tip.x + sx * w * 0.75, y: tip.y + sy * h * 1.4 }));
    const spot = spots.find((c) => fits(c.x, c.y)) ?? spots[0];
    cx = spot.x;
    cy = spot.y;
  }
  geo.ox = cx - w / 2;
  geo.oy = cy - h / 2;
  geo.w = w;
  geo.h = h;
  ex.pointerTip = { x: tip.x - cx, y: tip.y - cy };
}

/** Excalidraw's selection-box tint. */
const MARQUEE_FILL = 'rgba(0, 0, 200, 0.04)';

/** Excalidraw's SHIFT_LOCKING_ANGLE: Shift snaps linear points to 15° steps. */
const SHIFT_LOCKING_ANGLE = Math.PI / 12;

/** Distance from a point to a segment (for vertex insertion on polylines). */
function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Dash pattern for dashed/dotted strokes (matches the other shapes' styling). */
function strokeDash(strokeStyle?: string): number[] | undefined {
  return strokeStyle === 'dashed' ? [8, 6] : strokeStyle === 'dotted' ? [2, 4] : undefined;
}

/**
 * Tool cursors: the eraser has its own glyph (base64 so browsers don't drop
 * it); every drawing tool uses the native crosshair, text the I-beam, the
 * selection tool the arrow (move over an annotation), hand grab/grabbing.
 */
const ERASER_CURSOR = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect x="7" y="9" width="16" height="14" rx="2" transform="rotate(-28 15 16)" fill="#ffffff"/>
        <rect x="8" y="10" width="14" height="12" rx="2" transform="rotate(-28 15 16)" fill="#f87171"/>
        <rect x="10" y="12" width="10" height="5" rx="1" transform="rotate(-28 15 16)" fill="#fecaca"/>
      </svg>`;
  return `url("data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(svg) : ''}") 16 16, crosshair`;
})();

function getToolCursorCSS(tool: ToolType, isDragging: boolean, overAnnotation: boolean): string {
  switch (tool) {
    case 'select':
      return overAnnotation ? 'move' : 'default';
    case 'hand':
      return isDragging ? 'grabbing' : 'grab';
    case 'text':
      return 'text';
    case 'eraser':
      return ERASER_CURSOR;
    default:
      return 'crosshair';
  }
}

// Create a Figma-like dot grid pattern. The dot color is passed in (resolved
// from the theme) rather than hardcoded, which used to leave it light grey and
// effectively invisible on dark screenshots.
function createGridPattern(dotColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const gap = 20;
  canvas.width = gap;
  canvas.height = gap;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(gap / 2, gap / 2, 1, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const EditorCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const drawOriginRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Transient drawing state lives in refs + imperative Konva nodes on the
   * interaction layer, never in React state — pointermove does not re-render
   * the editor or rebuild the annotation scene.
   */
  // Freehand sample buffers: mutated in place during the gesture, snapshotted
  // (slice) at commit so the committed element stays immutable (the outline
  // WeakMap cache depends on that).
  const freehandDraftRef = useRef<{
    id: string;
    tool: 'pencil' | 'highlighter';
    strokeWidth: number;
    color: string;
    opacity: number;
    simulatePressure: boolean;
    base: Partial<EditorElement>;
  } | null>(null);
  const freehandPointsRef = useRef<number[] | null>(null);
  const freehandPressuresRef = useRef<number[] | null>(null);
  // Geometry of the in-progress box / segment draft (image coordinates).
  const draftBoxGeoRef = useRef<DraftBoxGeo | null>(null);
  const draftBoxStyleRef = useRef<{
    id: string;
    type: EditorElement['type'];
    style: DraftBoxStyle;
    extra: Record<string, unknown>;
  } | null>(null);
  const draftSegmentGeoRef = useRef<DraftSegmentGeo | null>(null);
  const draftSegmentStyleRef = useRef<{
    id: string;
    kind: 'arrow' | 'line';
    style: DraftSegmentStyle;
    extra: Record<string, unknown>;
  } | null>(null);
  // The magnifier is the one tool whose live draft is a real component (live
  // zoom bubble + crosshair) — it alone keeps the React draft path.
  const [drawingElement, setDrawingElement] = useState<EditorElement | null>(null);
  const pendingDrawRef = useRef<EditorElement | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const queueDrawingUpdate = (el: EditorElement) => {
    pendingDrawRef.current = el;
    if (drawRafRef.current === null) {
      drawRafRef.current = requestAnimationFrame(() => {
        drawRafRef.current = null;
        const next = pendingDrawRef.current;
        pendingDrawRef.current = null;
        if (next) setDrawingElement(next);
      });
    }
  };
  const clearDrawingDraft = () => {
    pendingDrawRef.current = null;
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    setDrawingElement(null);
  };
  // Imperative overlay: everything transient (drafts, marquee, eraser rect,
  // snapping guides) is drawn here with raw Konva nodes.
  const interactionLayerRef = useRef<Konva.Layer>(null);
  const annotationLayerRef = useRef<Konva.Layer>(null);
  const draftLayerRef = useRef<DraftLayer | null>(null);
  const perfProbeRef = useRef<PerfProbe | null>(null);
  /**
   * During drag, `updateElementSilent` writes to the store on every pointermove,
   * triggering a React re-render + Konva attribute sync 60+ times/sec.  Throttle
   * these writes to once per animation frame so only one React pass happens per
   * frame while the visual update stays imperative via Konva node attrs.
   */
  const silentRafRef = useRef<number | null>(null);
  const pendingSilentRef = useRef<Map<string, Partial<EditorElement>>>(new Map());
  /** Throttled `updateElementSilent` — buffers updates and flushes once per rAF. */
  const throttledSilentUpdate = useCallback((id: string, patch: any) => {
    const pending = pendingSilentRef.current;
    const prev = pending.get(id);
    pending.set(id, prev ? { ...prev, ...patch } : patch);
    if (silentRafRef.current != null) return; // already scheduled
    silentRafRef.current = requestAnimationFrame(() => {
      silentRafRef.current = null;
      const batch = pendingSilentRef.current;
      pendingSilentRef.current = new Map();
      const st = useEditorStore.getState();
      for (const [eid, patch] of batch) {
        st.updateElementSilent(eid, patch);
      }
    });
  }, []);
  useEffect(() => {
    const layer = interactionLayerRef.current;
    if (!layer) return;
    const dl = new DraftLayer();
    dl.attach(layer);
    draftLayerRef.current = dl;
    perfProbeRef.current = new PerfProbe();
    return () => {
      dl.detach();
      draftLayerRef.current = null;
      perfProbeRef.current = null;
    };
  }, []);
  const middlePanRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const altDuplicateRef = useRef<string | null>(null);
  /** Cache element ID → Konva node to avoid tree traversal per frame. */
  const nodeCacheRef = useRef<Map<string, Konva.Node>>(new Map());
  const reflowLabelRef = useRef<(el: EditorElement) => void>(() => {});
  const linearHandleDragRef = useRef<{
    id: string;
    locals: { node: Konva.Node; lx: number; ly: number }[];
  } | null>(null);
  /** Last annotation mousedown, for time+position double-click detection. */
  const lastAnnotationTapRef = useRef<{ id: string; x: number; y: number; t: number } | null>(null);
  /**
   * When text editing ends, the browser's click counter can still be rolling
   * (a fast follow-up click arrives with detail 2/3 and reads as a
   * double-click, reopening the editor instead of selecting). Suppress
   * double-tap detection for a short window after the editor closes.
   */
  const textEditEndedAtRef = useRef(0);
  const [textInput, setTextInputState] = useState<{ x: number; y: number; visible: boolean; editId?: string; initialText?: string; pendingNewId?: string }>({ x: 0, y: 0, visible: false });
  // Flag set synchronously so tool hotkeys ignore keys typed before the
  // textarea has mounted and taken focus (see use-keyboard-shortcuts).
  const setTextInput: typeof setTextInputState = (v) => {
    if (typeof v !== 'function') {
      if (v.visible) document.documentElement.dataset.textEdit = '1';
      else delete document.documentElement.dataset.textEdit;
    }
    setTextInputState(v);
  };
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrCopied, setOcrCopied] = useState(false);
  const hoverPreviousToolRef = useRef<ToolType | null>(null);
  const hoveredAnnotationRef = useRef<string | null>(null);
  /** Text-tool attach preview: the line/arrow + path fraction the pointer is over. */
  const textAttachRef = useRef<{ id: string; t: number } | null>(null);
  const lastTextAttachCheckRef = useRef(0);
  /** Temporary select-on-hover without changing toolbar activeTool. */
  const [hoverSelectMode, setHoverSelectModeState] = useState(false);
  const hoverSelectModeRef = useRef(false);
  // Keep the ref in lockstep SYNCHRONOUSLY: the mousedown handler reads the
  // ref to decide marquee vs. draw, and a useEffect lag let a stale hover
  // mode swallow the first mousedown after the pointer left an annotation
  // (drawing right after hovering did nothing).
  const setHoverSelectMode = useCallback((v: boolean) => {
    hoverSelectModeRef.current = v;
    setHoverSelectModeState(v);
  }, []);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const [isHandDragging, setIsHandDragging] = useState(false);
  // Marquee + eraser geometry lives in refs; the overlay renders them via the
  // draft layer, so a moving pointer never re-renders React.
  const marqueeRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeOriginRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeBaseRef = useRef<string[]>([]);
  const marqueeAdditiveRef = useRef(false);
  const isErasingRef = useRef(false);
  // Kept as state only for cursor styling; the hot path reads the ref.
  const [isErasing, setIsErasing] = useState(false);
  const eraserStartRef = useRef<{ x: number; y: number } | null>(null);
  const eraserEndRef = useRef<{ x: number; y: number } | null>(null);
  /** Elements the eraser stroke has touched so far; deleted on release. */
  const eraserTrailRef = useRef<number[]>([]);
  /**
   * While a callout's bubble is dragged on its own, its tail stays on the
   * target: the shape redraws from a tip shifted back by the drag distance.
   * Purely visual (a node attr); the store pins the same tip at commit.
   */
  /**
   * While a magnifier's source ring is dragged on its own, its bubble stays
   * where it is (the two halves move independently, joined by the arrow).
   * The offset is rewritten silently each frame; the commit keeps it.
   */
  const magnifierDragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const pinMagnifierBubbleLive = (id: string, node: Konva.Node) => {
    const st = useEditorStore.getState();
    const el = st.elements.find((x) => x.id === id);
    if (!el || el.type !== 'magnifier') return;
    // Its own label may be selected with it; anything else means a group move.
    const alone = st.selectedElementIds.every((sid) => {
      if (sid === id) return true;
      const other = st.elements.find((x) => x.id === sid);
      return !!other && !!el.groupId && other.groupId === el.groupId;
    });
    if (!alone) return;
    if (magnifierDragRef.current?.id !== id) {
      const off = resolvePreviewOffset(el as MagnifierElement, st.imageSize);
      magnifierDragRef.current = { id, ox: off.ox, oy: off.oy };
    }
    const base = magnifierDragRef.current;
    const dx = node.x() - el.x;
    const dy = node.y() - el.y;
    // Purely imperative, like a shape dragging its bound arrows: the bubble
    // is shifted back by the drag distance, the arrow re-anchors from the
    // attr, and the label follows. The store hears about it once, at release.
    node.setAttr('liveShift', { dx, dy });
    (node as Konva.Group).findOne?.('.mag-bubble')?.position({ x: -dx, y: -dy });
    // After the generic drag code (which slides an attached label along with
    // the node) has run, seat the label on the arrow's new midpoint.
    const liveEl = { ...el, x: node.x(), y: node.y(), previewOffset: { x: base.ox - dx, y: base.oy - dy } } as EditorElement;
    queueMicrotask(() => { reflowLabelRef.current?.(liveEl); node.getLayer()?.batchDraw(); });
  };
  const pinCalloutTipLive = (id: string, node: Konva.Node) => {
    const st = useEditorStore.getState();
    const el = st.elements.find((x) => x.id === id);
    if (!el || el.type !== 'callout') return;
    const alone = st.selectedElementIds.every((sid) => {
      if (sid === id) return true;
      const other = st.elements.find((x) => x.id === sid);
      return !!other && !!el.groupId && other.groupId === el.groupId;
    });
    if (!alone) return;
    const tip = calloutTipOf(el as CalloutElement);
    node.setAttr('tip', { x: tip.x - (node.x() - el.x), y: tip.y - (node.y() - el.y) });
  };
  const eraserHitsRef = useRef<Set<string>>(new Set());
  /**
   * Excalidraw's eraser: everything the pointer path touches is marked for
   * deletion (and faded); holding Alt un-marks instead. Samples along the
   * segment since the last pointer event so a fast drag skips nothing.
   */
  const eraseAlong = (from: { x: number; y: number }, to: { x: number; y: number }, restore: boolean) => {
    const layer = annotationLayerRef.current;
    if (!layer) return;
    const st = useEditorStore.getState();
    const byId = new Map(st.elements.map((el) => [el.id, el]));
    const toScreen = layer.getAbsoluteTransform();
    const step = 4 / st.zoom;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let i = 0; i <= steps; i++) {
      const p = toScreen.point({
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
      // Konva's hit canvas is stroke-accurate, so passing through the empty
      // inside of an outline shape does not erase it (as in Excalidraw).
      let node: Konva.Node | null = layer.getIntersection(p);
      while (node && !byId.has(node.id())) node = node.getParent();
      const hit = node && byId.get(node.id());
      if (!hit) continue;
      // An attached label never outlives its shape: take the whole group.
      const ids = hit.groupId
        ? st.elements.filter((el) => el.groupId === hit.groupId).map((el) => el.id)
        : [hit.id];
      for (const id of ids) {
        if (restore) eraserHitsRef.current.delete(id);
        else eraserHitsRef.current.add(id);
      }
    }
    applyEraserFade(eraserHitsRef.current);
  };
  /**
   * Imperatively fade/restore annotation nodes under the eraser stroke (30%
   * opacity preview, Excalidraw's pending-erasure fade) without a React
   * render — the store's elements are the source of each node's base opacity.
   */
  const applyEraserFade = useCallback((ids: Set<string> | null) => {
    const layer = annotationLayerRef.current ?? (stageRef.current?.findOne('.annotation-layer') as Konva.Layer | undefined);
    if (!layer) return;
    const s = useEditorStore.getState();
    const byId = new Map(s.elements.map((el) => [el.id, el]));
    for (const node of layer.getChildren()) {
      const id = node.id();
      if (!id || !byId.has(id)) continue;
      const base = byId.get(id)?.opacity ?? 1;
      node.opacity(ids?.has(id) ? base * 0.3 : base);
    }
    layer.batchDraw();
  }, []);

  // --- Imperative viewport (zoom/pan) ---
  // Wheel/pan/pinch update the Stage node immediately and only sync the store
  // once per animation frame, so React never runs on the input hot path. The
  // visible viewport always tracks the pointer; the store (and anything
  // subscribed, e.g. the text overlay) lags by at most one frame.
  const pendingViewportRef = useRef<{ zoom: number; x: number; y: number } | null>(null);
  const viewportSyncRafRef = useRef<number | null>(null);
  const syncViewportToStore = () => {
    if (viewportSyncRafRef.current !== null) return;
    viewportSyncRafRef.current = requestAnimationFrame(() => {
      viewportSyncRafRef.current = null;
      const vp = pendingViewportRef.current;
      if (!vp) return;
      pendingViewportRef.current = null;
      const s = useEditorStore.getState();
      if (vp.zoom !== s.zoom || vp.x !== s.stagePosition.x || vp.y !== s.stagePosition.y) {
        s.setZoom(vp.zoom);
        s.setStagePosition({ x: vp.x, y: vp.y });
      }
    });
  };
  useEffect(() => () => {
    if (viewportSyncRafRef.current !== null) {
      cancelAnimationFrame(viewportSyncRafRef.current);
      viewportSyncRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!middlePanRef.current) return;
      const dx = e.clientX - middlePanRef.current.lastX;
      const dy = e.clientY - middlePanRef.current.lastY;
      middlePanRef.current = { lastX: e.clientX, lastY: e.clientY };
      panStageBy(dx, dy);
    };
    const onUp = () => { middlePanRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  /**
   * Imperatively pan the stage by a pointer delta and sync the store once per
   * animation frame. Hoisted function declaration so the middle-pan effect
   * (and any other event source) can share one implementation.
   */
  function panStageBy(dx: number, dy: number) {
    const s = useEditorStore.getState();
    const vp = pendingViewportRef.current ?? { zoom: s.zoom, x: s.stagePosition.x, y: s.stagePosition.y };
    const next = { zoom: vp.zoom, x: vp.x + dx, y: vp.y + dy };
    pendingViewportRef.current = next;
    const st = stageRef.current;
    if (st) {
      st.position({ x: next.x, y: next.y });
      st.batchDraw();
    }
    syncViewportToStore();
  }

  /**
   * Excalidraw's canvas is unbounded: a dragged shape goes wherever the
   * pointer takes it, including past the image. (This used to clamp shapes
   * to the image plus a gutter, which made them jump or stop short.)
   */
  function clampToGutter(_el: EditorElement, x: number, y: number, _imageSize: { width: number; height: number }): { x: number; y: number } {
    return { x, y };
  }

  /*
    OCR is triggered by a window event so the palette and context menu can reach
    it without prop drilling. The handler is held in a ref: with `runOCR` closed
    over directly and `[]` deps, the listener captured the first render's
    `backgroundImage` (always null) and its own guard returned immediately,
    which is why OCR silently did nothing.
  */
  const runOCRRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onOcr = () => { runOCRRef.current(); };
    window.addEventListener('snapty-ocr', onOcr);
    return () => window.removeEventListener('snapty-ocr', onOcr);
  }, []);

  // Use ref for textInput visibility to avoid stale closures in event handlers
  // Text being typed into an arrow/line label, so its gap tracks the caret.
  const [liveLabel, setLiveLabel] = useState<{ id: string; text: string } | null>(null);
  const textInputRef = useRef(textInput);
  useEffect(() => { textInputRef.current = textInput; }, [textInput]);

  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const imageSize = useEditorStore((s) => s.imageSize);
  const zoom = useEditorStore((s) => s.zoom);
  const stagePosition = useEditorStore((s) => s.stagePosition);
  const activeTool = useEditorStore((s) => s.activeTool);
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const fontStyle = useEditorStore((s) => s.fontStyle);
  const textAlign = useEditorStore((s) => s.textAlign);
  const elements = useEditorStore((s) => s.elements);
  // Invalidate the Konva node cache when the elements array changes (add /
  // remove / move) so stale references don't linger.
  useEffect(() => { nodeCacheRef.current.clear(); }, [elements]);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  // Hides the per-element multi-select frames while a resize/rotate is live.
  const [transforming, setTransforming] = useState(false);
  const setHoveredId = useEditorStore((s) => s.setHoveredId);
  const multiSelectGhost = useEditorStore((s) => s.multiSelectGhost);
  const beginMultiSelectDrag = useEditorStore((s) => s.beginMultiSelectDrag);
  const endMultiSelectDrag = useEditorStore((s) => s.endMultiSelectDrag);
  // Shape context menu state (right-click on a specific element)
  const [shapeMenu, setShapeMenu] = useState<{ id: string; pos: { x: number; y: number } } | null>(null);
  /** Multi-point polyline vertex-insertion gesture (midpoint ghost handles).
   *  Holds the working points array for the current drag; committed on end. */
  const midVertexRef = useRef<{ id: string; idx: number; points: number[] } | null>(null);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const gridEnabled = useEditorStore((s) => s.canvasStyle.gridEnabled);
  const addElement = useEditorStore((s) => s.addElement);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateElementSilent = useEditorStore((s) => s.updateElementSilent);
  const commitElementUpdate = useEditorStore((s) => s.commitElementUpdate);
  const resetView = useEditorStore((s) => s.resetView);

  async function runOCR() {
    if (!backgroundImage || ocrBusy) return;
    setOcrOpen(true);
    setOcrBusy(true);
    setOcrText('');
    let worker: { recognize: (image: Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | null = null;
    try {
      const source = document.createElement('canvas');
      source.width = backgroundImage.naturalWidth || backgroundImage.width;
      source.height = backgroundImage.naturalHeight || backgroundImage.height;
      const sourceCtx = source.getContext('2d');
      if (!sourceCtx) throw new Error('Could not prepare OCR image');
      sourceCtx.drawImage(backgroundImage, 0, 0, source.width, source.height);
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        source.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare OCR image')), 'image/png');
      });
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tesseract/lang-data',
        cachePath: 'tesseract-cache',
      });
      const result = await worker.recognize(imageBlob);
      setOcrText(result.data.text.trim());
    } catch (error) {
      console.error('OCR failed:', error);
      setOcrText('OCR could not read this image. Try a higher-resolution screenshot.');
    } finally {
      await worker?.terminate();
      setOcrBusy(false);
    }
  }

  async function copyOCRText() {
    if (!ocrText) return;
    await navigator.clipboard.writeText(ocrText);
    setOcrCopied(true);
    window.setTimeout(() => setOcrCopied(false), 1500);
  }

  // Keep the event listener pointing at the current closure.
  runOCRRef.current = () => { void runOCR(); };

  // A move cursor over an annotation: under the selection tool, and under a
  // drawing tool while hovering borrows it.
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const overAnnotation = useEditorStore((s) => s.hoveredId !== null);
  const cursorCSS = getToolCursorCSS(hoverSelectMode && overAnnotation ? 'select' : activeTool, isHandDragging, overAnnotation);

  // Apply cursor on container + every Konva canvas layer (they override parent cursor)
  useEffect(() => {
    const apply = () => {
      const root = containerRef.current;
      if (root) root.style.cursor = cursorCSS;
      const st = stageRef.current;
      if (!st) return;
      const container = st.container();
      container.style.cursor = cursorCSS;
      container.querySelectorAll('canvas').forEach((c) => {
        (c as HTMLCanvasElement).style.cursor = cursorCSS;
      });
    };
    apply();
    // Konva may recreate canvases after resize / image load; apply after both
    // layout frames so the cursor hotspot remains aligned with the draw point.
    const frame = window.requestAnimationFrame(apply);
    const t = window.setTimeout(apply, 100);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(t); };
  }, [cursorCSS, dimensions, backgroundImage, activeTool]);

  // Grid pattern (created once)
  // Grid pattern. Rebuilt when the theme flips so the dots stay readable on
  // both light and dark screenshots.
  const { resolvedTheme } = useTheme();
  const gridPattern = useMemo(
    () => {
      if (typeof document === 'undefined') return null;
      const fg = getComputedStyle(document.documentElement)
        .getPropertyValue('--foreground')
        .trim() || '#1C1917';
      return createGridPattern(`color-mix(in srgb, ${fg} 20%, transparent)`);
    },
    // resolvedTheme is the trigger; the value itself is read from CSS.
     
    [resolvedTheme],
  );

  // Resize observer for container dimensions - update stage size without auto-resetting zoom
  // (auto resetView on every resize felt jumpy; fit-to-screen remains available on toolbar)
  // When the shell first gains real height (common Mac PWA / flex fix), re-fit the image.
  const lastSizeRef = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const update = () => {
      const width = Math.max(0, Math.floor(c.clientWidth));
      const height = Math.max(0, Math.floor(c.clientHeight));
      if (width === 0 || height === 0) return;
      const prev = lastSizeRef.current;
      const gainedSize = (prev.width === 0 || prev.height === 0) && width > 0 && height > 0;
      const largeChange =
        prev.width > 0
        && (Math.abs(prev.width - width) > 80 || Math.abs(prev.height - height) > 80);
      lastSizeRef.current = { width, height };
      setDimensions({ width, height });
      // First real size or big shell resize (window drag on Mac) - re-fit
      if (gainedSize || largeChange) {
        if (useEditorStore.getState().backgroundImage) {
          requestAnimationFrame(() => useEditorStore.getState().resetView());
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(c);
    // visualViewport covers mobile browser chrome + some desktop PWA resizes
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Reset view when background image changes
  useEffect(() => {
    if (backgroundImage) {
      const timer = setTimeout(() => resetView(), 50);
      return () => clearTimeout(timer);
    }
  }, [backgroundImage, resetView]);

  // Register stage globally for export
  useEffect(() => {
    const registerStage = () => {
      if (stageRef.current) (window as any).__snapty_stage = stageRef.current;
    };
    registerStage();
    const timer = window.setTimeout(registerStage, 100);
    const raf = window.requestAnimationFrame(registerStage);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    };
  }, [backgroundImage]);

  // Update transformer nodes when selection changes (skip line-like shapes, custom handles)
  useEffect(() => {
    const attach = () => {
      const tr = transformerRef.current;
      const st = stageRef.current;
      if (!tr || !st) return;
      if (!selectedElementIds.length) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }
      // The custom shape overlay owns single box-shape selections (dashed
      // outline + its own handles); the Transformer never attaches there.
      const overlayActive = selectedElementIds.length === 1
        && (() => {
          const sole = elements.find((e) => e.id === selectedElementIds[0]);
          return !!sole && !sole.locked && isShapeOverlayType(sole.type);
        })();
      if (overlayActive) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }
      // Freehand strokes get their own path-aware selection (dashed outline
      // on the stroke itself) when single-selected. For multi-select,
      // include every type so select-all drag moves everything (Excalidraw).
      const isMulti = selectedElementIds.length > 1;
      const skipTypes = isMulti
        ? new Set<string>()
        : new Set(['arrow', 'line', 'magnifier', 'pencil', 'highlighter']);
      const nodes = selectedElementIds
        .filter((id) => {
          const el = elements.find((e) => e.id === id);
          if (el?.type === 'text' && el.groupId) return false;
          return el && !skipTypes.has(el.type) && !el.locked;
        })
        .map((id) => findAnnotationNode(st, id))
        .filter(Boolean) as Konva.Node[];
      tr.nodes(nodes);
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
    };
    attach();
    const onReady = () => {
      attach();
      requestAnimationFrame(attach);
    };
    window.addEventListener('snapty-overlay-image-ready', onReady);
    const retries = [16, 50, 120, 250].map((ms) => window.setTimeout(attach, ms));
    return () => {
      window.removeEventListener('snapty-overlay-image-ready', onReady);
      retries.forEach((t) => window.clearTimeout(t));
    };
  }, [selectedElementIds, elements]);

  const textIgnoreBlurRef = useRef(0);

  // --- Text input ---

  // Set while the text editor belongs to a callout that was just drawn.
  const calloutLabelRef = useRef(false);
  const commitText = useCallback(() => {
    if (!textAreaRef.current) return;
    const text = textAreaRef.current.value;
    const st = useEditorStore.getState();
    const ti = textInputRef.current;
    if (ti.editId) {
      // Update existing text annotation
      if (text.trim()) {
        growContainerToFitText(ti.editId, text.trim());
        // A label just attached by this edit lands as ONE undo step (two for a
        // fresh callout, whose creation step it joins); re-committing
        // unchanged text records nothing.
        if (ti.pendingNewId || text.trim() !== ti.initialText) {
          st.updateElement(ti.editId, { text: text.trim() } as Partial<TextElement>);
          if (ti.pendingNewId) st.squashHistory(calloutLabelRef.current ? 2 : 1);
        }
        // Excalidraw: finishing a label leaves its container selected (or the
        // text itself when it stands alone).
        if (st.activeTool === 'select') {
          const edited = st.elements.find((e) => e.id === ti.editId);
          const owner = edited ? (labelPairPartner(edited, st.elements) ?? edited) : null;
          if (owner) st.setSelectedElementIds([owner.id]);
        }
      } else if (ti.pendingNewId) {
        // Nothing typed: step back over the label's own attach step.
        st.undo();
      } else {
        st.removeElements([ti.editId]);
      }
      calloutLabelRef.current = false;
    } else if (text.trim()) {
      const scale = getImageToolScale(st.imageSize.width, st.imageSize.height);
      const id = generateId();
      st.addElement({
        id,
        type: 'text',
        x: ti.x,
        y: ti.y,
        text: text.trim(),
        // Unrounded: the settings <-> element round trip must be lossless.
        fontSize: st.fontSize * scale,
        fontFamily: st.fontFamily || HANDWRITTEN_FONT,
        fontStyle: st.fontStyle || 'normal',
        align: st.textAlign || 'left',
        fill: st.strokeColor,
        opacity: st.opacity,
        padding: TEXT_PADDING,
        lineHeight: TEXT_LINE_HEIGHT,
      } as TextElement);
    }
    setTextInput({ x: 0, y: 0, visible: false });
    // The next click must not read as the tail end of the double-click that
    // opened the editor (the browser keeps counting clicks at the same spot).
    textEditEndedAtRef.current = Date.now();
    lastAnnotationTapRef.current = null;
  }, []);

  const commitTextRef = useRef(commitText);
  useEffect(() => { commitTextRef.current = commitText; }, [commitText]);

  // Container mousedown listener to commit text when clicking outside textarea.
  // Must NOT commit if the click target is inside the konvajs-content div,
  // because the Konva stage mousedown handler will handle it (and call cancelBubble = true).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    function handleContainerMouseDown(e: MouseEvent) {
      if (!textInputRef.current.visible) return;
      if (e.target === textAreaRef.current) return;
      // Skip if target is inside the konvajs-content div (the canvas area)
      const target = e.target as HTMLElement;
      if (target.closest('.konvajs-content')) return;
      commitTextRef.current();
    }
    c.addEventListener('mousedown', handleContainerMouseDown);
    return () => c.removeEventListener('mousedown', handleContainerMouseDown);
  }, []); // No deps - uses refs

  // Get pointer position in canvas (image) coordinates - uses getState() for fresh values
  function getCanvasPoint(): { x: number; y: number } | null {
    const st = stageRef.current;
    if (!st) return null;
    const pos = st.getPointerPosition();
    if (!pos) return null;
    const s = useEditorStore.getState();
    const pad = s.canvasStyle.padding || 0;
    const ins = DEVICE_FRAME_INSETS[s.canvasStyle.deviceFrame];
    const ox = pad + ins.left;
    const oy = pad + ins.top;
    return {
      x: (pos.x - s.stagePosition.x) / s.zoom - ox,
      y: (pos.y - s.stagePosition.y) / s.zoom - oy,
    };
  }

  // Create a blurred or pixelated image data URL for a region.
  // Intensity comes in as an argument rather than being read from the store, so
  // an existing element can be re-baked with its own settings after the fact.
  function createBlurImage(
    x: number, y: number, w: number, h: number, type: 'blur' | 'pixelate',
    intensity?: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      const s = useEditorStore.getState();
      if (!s.backgroundImage) { resolve(''); return; }
      const imgSize = s.imageSize;
      const scale = getImageToolScale(imgSize.width, imgSize.height);
      const ax = Math.max(0, Math.round(x));
      const ay = Math.max(0, Math.round(y));
      const aw = Math.min(Math.round(w), imgSize.width - ax);
      const ah = Math.min(Math.round(h), imgSize.height - ay);
      if (aw <= 0 || ah <= 0) { resolve(''); return; }

      const offscreen = document.createElement('canvas');
      offscreen.width = aw;
      offscreen.height = ah;
      const ctx = offscreen.getContext('2d')!;

      if (type === 'blur') {
        const radius = Math.round((intensity ?? s.blurRadius ?? 12) * scale);
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, aw, ah);
      } else {
        const px = Math.max(2, Math.round((intensity ?? s.pixelSize ?? 10) * scale));
        const sw = Math.max(1, Math.ceil(aw / px));
        const sh = Math.max(1, Math.ceil(ah / px));
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = sw;
        smallCanvas.height = sh;
        smallCanvas.getContext('2d')!.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(smallCanvas, 0, 0, sw, sh, 0, 0, aw, ah);
      }
      resolve(offscreen.toDataURL('image/png'));
    });
  }

  /**
   * Re-bake blur/pixelate regions when their geometry or intensity changes.
   *
   * The effect is rasterised into a PNG at commit time, which keeps raster and
   * SVG export trivially correct but means the bitmap goes stale the moment the
   * region is moved, resized, or its intensity is edited - previously a resized
   * pixelate just stretched its old tile, and the intensity had no UI at all.
   * Debounced so a drag produces one re-bake rather than one per frame, and
   * written silently so a gesture stays a single undo step.
   */
  const rebakeRef = useRef<Map<string, string>>(new Map());
  const rebakeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const targets = elements.filter(
      (el): el is ShapeElement =>
        (el.type === 'blur' || el.type === 'pixelate') && !!(el as ShapeElement).imageDataURL,
    );
    if (!targets.length || !backgroundImage) return;

    // Signature of everything the baked bitmap depends on.
    const signatureOf = (el: ShapeElement) =>
      [
        Math.round(el.x), Math.round(el.y),
        Math.round(Math.abs(el.width)), Math.round(Math.abs(el.height)),
        el.type === 'blur' ? el.blurRadius : el.pixelSize,
      ].join(':');

    const stale = targets.filter((el) => rebakeRef.current.get(el.id) !== signatureOf(el));
    // First sight of an element is not stale: it was just baked at commit time.
    const unseen = stale.filter((el) => !rebakeRef.current.has(el.id));
    unseen.forEach((el) => rebakeRef.current.set(el.id, signatureOf(el)));
    const needsWork = stale.filter((el) => !unseen.includes(el));
    if (!needsWork.length) return;

    if (rebakeTimerRef.current !== null) window.clearTimeout(rebakeTimerRef.current);
    rebakeTimerRef.current = window.setTimeout(() => {
      rebakeTimerRef.current = null;
      void Promise.all(
        needsWork.map(async (el) => {
          const w = Math.abs(el.width);
          const h = Math.abs(el.height);
          const x = el.width < 0 ? el.x + el.width : el.x;
          const y = el.height < 0 ? el.y + el.height : el.y;
          const intensity = el.type === 'blur' ? el.blurRadius : el.pixelSize;
          const url = await createBlurImage(x, y, w, h, el.type as 'blur' | 'pixelate', intensity);
          rebakeRef.current.set(el.id, signatureOf(el));
          if (url) updateElementSilent(el.id, { imageDataURL: url } as Partial<EditorElement>);
        }),
      );
    }, 120);

    return () => {
      if (rebakeTimerRef.current !== null) {
        window.clearTimeout(rebakeTimerRef.current);
        rebakeTimerRef.current = null;
      }
    };
     
  }, [elements, backgroundImage, updateElementSilent]);

  // --- Find annotation element by traversing up from click target ---
  function findAnnotationId(node: Konva.Node): string | null {
    const elements = useEditorStore.getState().elements;
    let current: Konva.Node | null = node;
    while (current) {
      const id = current.id();
      if (id) {
        for (let i = 0; i < elements.length; i++) if (elements[i].id === id) return id;
      }
      current = current.getParent();
    }
    return null;
  }

  // --- Mouse handlers ---

  /**
   * The 3-dot editing handles (start / bend / end) sit ON the stroke, so the
   * second click of a double-click lands on a handle whose cancelBubble would
   * otherwise swallow it. Detect the double-click here and route it to the
   * arrow/line's label editor instead (double-click arrow → edit its label).
   */
  function handleHandleMouseDown(shapeId: string, e: Konva.KonvaEventObject<MouseEvent>) {
    e.cancelBubble = true;
    const s = useEditorStore.getState();
    if (s.annotationsLocked || ['eraser', 'crop', 'hand'].includes(s.activeTool)) return;
    const st = stageRef.current;
    const tapPos = st?.getPointerPosition();
    const prevTap = lastAnnotationTapRef.current;
    const isDbl =
      e.evt.detail >= 2 ||
      (!!prevTap && !!tapPos && e.evt.button !== 1 && e.evt.timeStamp - prevTap.t < 400 &&
        Math.hypot(tapPos.x - prevTap.x, tapPos.y - prevTap.y) < 14);
    if (!isDbl) return;
    const under = s.elements.find((x) => x.id === shapeId);
    if (under && under.type !== 'text' && !under.locked) {
      // Double-clicking an interior polyline VERTEX deletes it (Excalidraw's
      // point deletion) — the vertex handle's own onDblClick does that, so the
      // mousedown must not swallow it by attaching a label here.
      if ((e.target as Konva.Node).name?.().includes('mid-vertex-handle')) return;
      attachTextToAnnotation(under);
    }
  }

  /** Capture the pointer for canvas-owned gestures (draw / marquee / eraser /
   *  crop) so they keep tracking even when the pointer leaves the canvas — a
   *  fast stroke to the edge must not freeze. Konva-owned node drags are left
   *  alone (Konva captures internally). */
  const capturePointer = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = stageRef.current;
    const pe = e.evt as PointerEvent;
    if (!st?.content || typeof pe.pointerId !== 'number') return;
    try {
      if (!st.content.hasPointerCapture?.(pe.pointerId)) st.content.setPointerCapture(pe.pointerId);
    } catch { /* capture unsupported / already released */ }
  };
  const releasePointer = (e?: Konva.KonvaEventObject<unknown>) => {
    const st = stageRef.current;
    const pe = e?.evt as PointerEvent | undefined;
    if (!st?.content || !pe || typeof pe.pointerId !== 'number') return;
    try {
      if (st.content.hasPointerCapture?.(pe.pointerId)) st.content.releasePointerCapture(pe.pointerId);
    } catch { /* noop */ }
  };

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Read ALL values from the store to avoid stale closure issues with React Konva
    const s = useEditorStore.getState();
    const st = stageRef.current;
    // A pressed pointer is no longer hovering: drop the hover outline so it
    // never lingers once a drag/select gesture starts.
    draftLayerRef.current?.clearHoverOutline();

    // Robust double-click detection. The Transformer that appears after the
    // first click can swallow the second click, and a few pixels of drag drift
    // can move the annotation out from under the cursor, so a click within
    // 400ms and ~14px of a previous annotation click also counts as a
    // double-click on that same annotation - even when the native click count
    // or the hit target disagrees.
    const tapPos = st?.getPointerPosition();
    const prevTap = lastAnnotationTapRef.current;
    // The click right after a text edit must be a fresh single click: Chrome
    // keeps counting clicks at the same spot, so it can arrive with detail 2/3
    // and the stale tap below, both of which would re-open the editor instead
    // of selecting. Give the editor close a quiet window.
    const textEditJustEnded = Date.now() - textEditEndedAtRef.current < 400;
    const isDoubleTap = !textEditJustEnded && (e.evt.detail >= 2 || (
      !!prevTap && !!tapPos
      && e.evt.button !== 1
      && e.evt.timeStamp - prevTap.t < 400
      && Math.hypot(tapPos.x - prevTap.x, tapPos.y - prevTap.y) < 14
    ));

    // Let Konva Transformer own corner / edge / rotate handles (any active tool),
    // except when the second click of a double-click lands on the transformer
    // border - that still counts as a double-click on the annotation under it.
    if (isTransformerTarget(e.target)) {
      if (isDoubleTap && prevTap?.id) {
        const under = s.elements.find((x) => x.id === prevTap.id);
        if (under && !under.locked && !s.annotationsLocked) {
          if (under.type === 'text') {
            e.cancelBubble = true;
            openTextEditor(under as TextElement);
            return;
          }
          if (!['eraser', 'crop', 'hand'].includes(s.activeTool)) {
            e.cancelBubble = true;
            attachTextToAnnotation(under);
            return;
          }
        }
      }
      e.cancelBubble = true;
      return;
    }

    // Middle mouse button → pan
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      middlePanRef.current = { lastX: e.evt.clientX, lastY: e.evt.clientY };
      return;
    }

    if (s.annotationsLocked && s.activeTool !== 'hand' && s.activeTool !== 'select') return;

    // If text input is visible, commit it first and stop propagation
    // so the container mousedown listener does NOT double-commit
    if (textInputRef.current.visible) {
      commitTextRef.current();
      e.cancelBubble = true;
      return;
    }

    const isBg = e.target === st
      || e.target.name() === 'background'
      || e.target.id() === 'grid-bg';

    // Double-click empty canvas → create a text box here (Excalidraw behavior:
    // double-click anywhere to start typing). Excluded for tools that own the
    // gesture; falls back to deselect otherwise.
    if (e.evt.detail >= 2 && isBg) {
      // Excalidraw: double-clicking INSIDE an unfilled shape labels it.
      const at = getCanvasPoint();
      if (at && !s.annotationsLocked && !['eraser', 'crop', 'hand'].includes(s.activeTool)) {
        const inside = [...s.elements].reverse().find((el) => {
          if (el.locked || !isClosedShape(el) || el.type === 'callout') return false;
          if (s.elements.some((t) => t.type === 'text' && t.containerId === el.id)) return false;
          const b = getElementBounds(el, s.imageSize);
          const nx = (at.x - (b.x + b.w / 2)) / (b.w / 2);
          const ny = (at.y - (b.y + b.h / 2)) / (b.h / 2);
          if (el.type === 'circle') return nx * nx + ny * ny <= 1;
          if (el.type === 'diamond') return Math.abs(nx) + Math.abs(ny) <= 1;
          return Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
        });
        if (inside) {
          e.cancelBubble = true;
          attachTextToAnnotation(inside);
          return;
        }
      }
      if (
        s.backgroundImage
        && !s.annotationsLocked
        && !['eraser', 'crop', 'hand'].includes(s.activeTool)
      ) {
        const pos = getCanvasPoint();
        if (pos) {
          textIgnoreBlurRef.current = Date.now() + 250;
          setTextInput({ x: pos.x, y: textClickY(pos.y), visible: true });
          e.cancelBubble = true;
          return;
        }
      }
      s.setSelectedElementIds([]);
      return;
    }

    // Excalidraw: only the selection tool (and the text tool, which edits or
    // labels what it clicks) interacts with existing annotations. A drawing
    // tool draws straight over them, so an arrow can start on top of a shape.
    const hitId = findAnnotationId(e.target);
    const clickedId = s.activeTool === 'select' || s.activeTool === 'text' || hoverSelectModeRef.current ? hitId : null;
    if (clickedId && !isBg) {
        const clicked = s.elements.find((x) => x.id === clickedId);
        // Record this tap so a fast follow-up click (even one that lands on the
        // transformer or misses a slightly-dragged node) reads as a double-click.
        if (tapPos) lastAnnotationTapRef.current = { id: clickedId, x: tapPos.x, y: tapPos.y, t: e.evt.timeStamp };
        if (clicked?.locked) return;

        // Text tool: clicking an existing text annotation edits it in place.
        if (s.activeTool === 'text' && clicked?.type === 'text') {
          if (!s.annotationsLocked) {
            e.cancelBubble = true;
            openTextEditor(clicked as TextElement);
            return;
          }
        }

        // Text tool: clicking a line/arrow BODY attaches a label at the exact
        // hovered spot (the anchor-dot preview), not the default midpoint.
        if (s.activeTool === 'text' && (clicked?.type === 'arrow' || clicked?.type === 'line')) {
          if (!s.annotationsLocked) {
            e.cancelBubble = true;
            const atT = textAttachRef.current?.id === clicked.id ? textAttachRef.current.t : undefined;
            textAttachRef.current = null;
            draftLayerRef.current?.clearLabelAnchor();
            attachTextToAnnotation(
              clicked as ArrowElement | LineElement,
              atT,
            );
            return;
          }
        }

        // Double-click a text annotation to edit it in place, from any tool
        // (except eraser/crop/hand). Uses the native click count (or the
        // time/position heuristic above) rather than Konva's dblclick, which a
        // draggable node can swallow - the same pattern as the
        // double-click-to-deselect above.
        if (isDoubleTap && clicked?.type === 'text') {
          if (!s.annotationsLocked && !['eraser', 'crop', 'hand'].includes(s.activeTool)) {
            e.cancelBubble = true;
            openTextEditor(clicked as TextElement);
            return;
          }
        }

        // Double-click any other annotation → attach a text label grouped to it
        // (center of a box, middle of a line/arrow). The editor opens with an
        // empty label; Esc or an empty commit removes it again.
        if (isDoubleTap && clicked && clicked.type !== 'text') {
          if (!s.annotationsLocked && !['eraser', 'crop', 'hand'].includes(s.activeTool)) {
            e.cancelBubble = true;
            attachTextToAnnotation(clicked);
            return;
          }
        }

        // Alt+drag duplicate: mark for duplication on drag start
        if (e.evt.altKey) {
          altDuplicateRef.current = clickedId;
        }

        let nextIds: string[];
        if (e.evt.shiftKey) {
          const targetId = clicked ? selectionTargetForClick(clicked, s.elements) : clickedId;
          const currentIds = s.selectedElementIds;
          nextIds = currentIds.includes(targetId)
            ? currentIds.filter((i) => i !== targetId)
            : [...currentIds, targetId];
        } else if (clicked?.groupId && !isLabelPairGroup(clicked.groupId, s.elements)) {
          nextIds = s.elements.filter((el) => el.groupId === clicked.groupId).map((el) => el.id);
        } else {
          nextIds = [clicked ? selectionTargetForClick(clicked, s.elements) : clickedId];
        }
        s.setSelectedElementIds(nextIds);
        syncSettingsFromSelection(nextIds);
        return;
    }

    // The second click of a double-click drifted just PAST a thin annotation
    // (arrow, line, small badge): count it as a double-click on the annotation
    // from the first click instead of starting a marquee / draw.
    if (!clickedId && isDoubleTap && prevTap?.id) {
      const prev = s.elements.find((x) => x.id === prevTap.id);
      if (prev && !prev.locked && !s.annotationsLocked) {
        if (prev.type === 'text') {
          e.cancelBubble = true;
          openTextEditor(prev as TextElement);
          return;
        }
        if (!['eraser', 'crop', 'hand'].includes(s.activeTool)) {
          e.cancelBubble = true;
          attachTextToAnnotation(prev);
          return;
        }
      }
    }

    // Hand tool: pan only (Stage.draggable)
    if (s.activeTool === 'hand') return;

    const isSelectInteraction = s.activeTool === 'select' || hoverSelectModeRef.current;
    if (isSelectInteraction) {
      const onEmpty = isBg || !clickedId;
      if (onEmpty && s.activeTool !== 'select') {
        // Borrowed selection (hovering under a drawing tool) ends on a press
        // on empty canvas: drop the selection and draw with the real tool.
        hoveredAnnotationRef.current = null;
        hoverPreviousToolRef.current = null;
        setHoverSelectMode(false);
        s.setSelectedElementIds([]);
      } else {
        // Empty area → start marquee selection
        if (onEmpty) {
          const pos = getCanvasPoint();
          if (pos) {
            marqueeOriginRef.current = pos;
            capturePointer(e);
            marqueeAdditiveRef.current = e.evt.shiftKey;
            marqueeRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
            marqueeBaseRef.current = useEditorStore.getState().selectedElementIds;
            draftLayerRef.current?.showMarquee(pos.x, pos.y, 0, 0, getSelectionTheme().accent, MARQUEE_FILL);
            if (!e.evt.shiftKey) s.setSelectedElementIds([]);
          }
        }
        return;
      }
    }

    // Eraser tool: start dotted selection drag
    if (s.activeTool === 'eraser') {
      const pos = getCanvasPoint();
      if (!pos) return;
      isErasingRef.current = true;
      capturePointer(e);
      setIsErasing(true);
      eraserStartRef.current = pos;
      eraserEndRef.current = pos;
      eraserHitsRef.current = new Set();
      eraserTrailRef.current = [pos.x, pos.y];
      eraseAlong(pos, pos, e.evt.altKey);
      return;
    }

    // Crop tool: drag a region to crop the image (imperative overlay marquee —
    // never committed as an annotation).
    if (s.activeTool === 'crop') {
      const pos = getCanvasPoint();
      if (!pos) return;
      setIsDrawing(true);
      capturePointer(e);
      const geo: DraftBoxGeo = { kind: 'crop', ox: pos.x, oy: pos.y, w: 0, h: 0 };
      draftBoxGeoRef.current = geo;
      draftLayerRef.current?.beginBox(geo, {
        stroke: '#3b82f6',
        fill: 'rgba(59,130,246,0.15)',
        strokeWidth: Math.max(1, Math.round(2 * getImageToolScale(s.imageSize.width, s.imageSize.height))),
        opacity: 1,
      }, '__crop_marquee__', false);
      return;
    }

    // Text tool: show text input at click position
    if (s.activeTool === 'text') {
      const pos = getCanvasPoint();
      if (!pos) return;
      textIgnoreBlurRef.current = Date.now() + 250;
      setTextInput({ x: pos.x, y: textClickY(pos.y), visible: true });
      e.cancelBubble = true;
      return;
    }

    const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
    // Unrounded: settings are canonical, elements are settings*scale, and
    // hydration divides straight back out. Rounding either leg made repeated
    // select/deselect drift the value.
    const sw = Math.max(0.5, s.strokeWidth * scale);
    const hw = Math.max(2, (s.highlighterWidth || 24) * scale);
    const pointerSize = Math.max(8, 12 * scale);

    // Step tool: place a numbered step circle
    if (s.activeTool === 'step') {
      const pos = getCanvasPoint();
      if (!pos) return;
      const r = Math.max(8, s.stepRadius * scale);
      const num = s.stepCounter;
      const id = generateId();
      if ((STEP_STAMPS as readonly string[]).includes(s.stepStyle)) {
        // A stamp is a bare emoji: a text element sized like the badge that
        // leaves the counter alone.
        const fs = r * 1.7;
        s.addElement({
          id,
          type: 'text',
          x: pos.x - fs * 0.6 - TEXT_PADDING,
          y: pos.y - (fs * TEXT_LINE_HEIGHT) / 2 - TEXT_PADDING,
          text: s.stepStyle,
          fontSize: fs,
          fontFamily: s.fontFamily || HANDWRITTEN_FONT,
          fontStyle: 'normal',
          align: 'left',
          fill: s.strokeColor,
          opacity: s.opacity,
          padding: TEXT_PADDING,
          lineHeight: TEXT_LINE_HEIGHT,
        } as TextElement);
        return;
      }
      // "👉number" and friends: a finger carrying the badge, its tip on the click.
      const finger = STEP_FINGERS.find((f) => s.stepStyle !== f && s.stepStyle.startsWith(f));
      const tip = finger ? stepFingerBox(finger, r) : { tipX: 0, tipY: 0 };
      s.addElement({
        id,
        type: 'step',
        x: pos.x - tip.tipX,
        y: pos.y - tip.tipY,
        pointer: finger,
        stepNumber: s.stepStyle.endsWith('letter') ? letterLabel(num) : num,
        radius: r,
        fill: s.strokeColor,
        fontSize: r * 0.8,
        opacity: s.opacity,
      } as StepElement);
      return;
    }

    // Shape / drawing tools
    const pos = getCanvasPoint();
    if (!pos) return;
    setIsDrawing(true);
    capturePointer(e);
    drawOriginRef.current = { x: pos.x, y: pos.y };
    const base: Partial<EditorElement> = {
      id: generateId(),
      opacity: s.opacity,
      strokeStyle: s.strokeStyle,
      fillStyle: s.fillStyle,
      roughness: s.roughness,
    };

    if (s.activeTool === 'pencil' || s.activeTool === 'highlighter') {
      // First sample: record pen pressure when a stylus is the source, else
      // a neutral 0.5 that perfect-freehand ignores (simulated pressure).
      // The stroke lives in mutable refs + the imperative overlay; nothing
      // touches React state until pointerup commits it.
      const evt = e.evt as PointerEvent;
      const downIsPen = evt.pointerType === 'pen' && evt.pressure > 0;
      const strokeWidth = s.activeTool === 'highlighter' ? hw : sw;
      const color = s.activeTool === 'highlighter' ? s.highlighterColor : s.strokeColor;
      const opacity = s.activeTool === 'highlighter' ? 0.4 : (base.opacity ?? 1);
      const points = [pos.x, pos.y];
      const pressures = [downIsPen ? Math.round(Math.min(1, Math.max(0, evt.pressure)) * 100) / 100 : 0.5];
      freehandDraftRef.current = {
        id: base.id as string,
        tool: s.activeTool,
        strokeWidth,
        color,
        opacity,
        simulatePressure: !downIsPen,
        base,
      };
      freehandPointsRef.current = points;
      freehandPressuresRef.current = pressures;
      draftLayerRef.current?.beginFreehand(s.activeTool, strokeWidth, color, opacity, !downIsPen);
      draftLayerRef.current?.updateFreehand(points, pressures, !downIsPen);
    } else if (s.activeTool === 'arrow' || s.activeTool === 'line') {
      const geo: DraftSegmentGeo = {
        kind: s.activeTool,
        sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y,
        // Elbow routing only exists for arrows (lines stay straight).
        elbowed: s.activeTool === 'arrow' && s.arrowPath === 'elbow',
        curved: s.activeTool === 'arrow' && s.arrowPath === 'curved',
      };
      const headSize = (s.endArrowhead ?? 'arrow') !== 'none' ? pointerSize : 0;
      draftSegmentGeoRef.current = geo;
      draftSegmentStyleRef.current = {
        id: base.id as string,
        kind: s.activeTool,
        style: {
          stroke: s.strokeColor,
          strokeWidth: sw,
          fill: s.strokeColor,
          headSize,
          pointerWidth: pointerSize,
          showStartHead: (s.startArrowhead ?? 'none') !== 'none',
          startArrowhead: s.startArrowhead ?? 'none',
          endArrowhead: s.endArrowhead ?? 'arrow',
          strokeStyle: s.strokeStyle,
          roughness: s.roughness,
          opacity: s.opacity,
        },
        extra: {
          endArrowhead: s.endArrowhead,
          startArrowhead: s.startArrowhead,
          elbowed: s.activeTool === 'arrow' && s.arrowPath === 'elbow',
        curved: s.activeTool === 'arrow' && s.arrowPath === 'curved',
        },
      };
      draftLayerRef.current?.beginSegment(s.activeTool, geo, draftSegmentStyleRef.current.style, base.id as string, handDrawn);
    } else if (s.activeTool === 'circle' || s.activeTool === 'magnifier') {
      if (s.activeTool === 'magnifier') {
        // The magnifier keeps its React draft (live zoom bubble component).
        setDrawingElement({
          ...base,
          type: s.activeTool === 'magnifier' ? 'magnifier' : 'circle',
          x: pos.x, y: pos.y,
          width: 0, height: 0,
          stroke: s.strokeColor,
          fill: 'transparent',
          strokeWidth: sw,
          ...(s.activeTool === 'magnifier' ? { magnification: s.magnification, roughness: s.roughness } : {}),
        } as CircleElement | MagnifierElement);
        return;
      }
      const geo: DraftBoxGeo = { kind: 'ellipse', ox: pos.x, oy: pos.y, w: 0, h: 0 };
      draftBoxGeoRef.current = geo;
      draftBoxStyleRef.current = {
        id: base.id as string,
        type: 'circle',
        style: {
          stroke: s.strokeColor,
          fill: s.fillColor === 'transparent' ? 'transparent' : s.fillColor,
          strokeWidth: sw,
          strokeStyle: s.strokeStyle,
          fillStyle: s.fillStyle,
          roughness: s.roughness,
          opacity: s.opacity,
        },
        extra: {},
      };
      draftLayerRef.current?.beginBox(geo, draftBoxStyleRef.current.style, base.id as string, handDrawn);
    } else if (s.activeTool === 'diamond') {
      const geo: DraftBoxGeo = { kind: 'diamond', ox: pos.x, oy: pos.y, w: 0, h: 0 };
      draftBoxGeoRef.current = geo;
      draftBoxStyleRef.current = {
        id: base.id as string,
        type: 'diamond',
        style: {
          stroke: s.strokeColor,
          fill: s.fillColor === 'transparent' ? 'transparent' : s.fillColor,
          strokeWidth: sw,
          strokeStyle: s.strokeStyle,
          fillStyle: s.fillStyle,
          roughness: s.roughness,
          cornerRadius: s.cornerRadius,
          opacity: s.opacity,
        },
        extra: {},
      };
      draftLayerRef.current?.beginBox(geo, draftBoxStyleRef.current.style, base.id as string, handDrawn);
    } else if (s.activeTool === 'callout') {
      // The press marks what the callout points AT; the bubble is then dragged
      // out to wherever it should sit (a plain click drops it up and right).
      const bodyW = 168 * scale;
      const bodyH = 60 * scale;
      const geo: DraftBoxGeo = {
        kind: 'callout', ox: 0, oy: 0, w: bodyW, h: bodyH,
        extra: { pointerDirection: s.pointerDirection, pointerLength: s.pointerLength * scale, pointerWidth: s.pointerWidth * scale, pointerOffset: 0.5, tipAbs: { x: pos.x, y: pos.y }, bodyW, bodyH },
      };
      placeCalloutBody(geo, pos);
      draftBoxGeoRef.current = geo;
      draftBoxStyleRef.current = {
        id: base.id as string,
        type: 'callout',
        style: {
          stroke: s.strokeColor,
          fill: s.fillColor,
          strokeWidth: sw,
          strokeStyle: s.strokeStyle,
          fillStyle: s.fillStyle,
          roughness: s.roughness,
          cornerRadius: Math.max(s.cornerRadius, 12) * scale,
          opacity: s.opacity,
        },
        extra: {
          pointerDirection: s.pointerDirection,
          pointerLength: s.pointerLength * scale,
          pointerWidth: s.pointerWidth * scale,
          pointerOffset: 0.5,
        },
      };
      draftLayerRef.current?.beginBox(geo, draftBoxStyleRef.current.style, base.id as string, handDrawn);
    } else {
      // rectangle, rounded-rect, blur, pixelate, spotlight
      const isEffect = ['blur', 'pixelate', 'spotlight'].includes(s.activeTool);
      const geo: DraftBoxGeo = { kind: s.activeTool as DraftBoxGeo['kind'], ox: pos.x, oy: pos.y, w: 0, h: 0 };
      const effectStyle: DraftBoxStyle =
        s.activeTool === 'blur' || s.activeTool === 'pixelate'
          ? { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)', strokeWidth: 1.5, opacity: s.opacity }
          : { stroke: '#facc15', fill: 'rgba(250,204,21,0.08)', strokeWidth: 1.5, opacity: s.opacity, cornerRadius: Math.min(s.cornerRadius, SPOTLIGHT_RADIUS) * scale };
      draftBoxGeoRef.current = geo;
      draftBoxStyleRef.current = {
        id: base.id as string,
        type: s.activeTool as ShapeElement['type'],
        style: isEffect ? effectStyle : {
          stroke: s.strokeColor,
          fill: s.fillColor,
          strokeWidth: sw,
          strokeStyle: s.strokeStyle,
          fillStyle: s.fillStyle,
          roughness: s.roughness,
          // Rounded corners are configured on the Rectangle tool (Edges
          // setting); legacy rounded-rect elements keep their own value.
          cornerRadius: (s.activeTool === 'rectangle' || s.activeTool === 'rounded-rect')
            ? s.cornerRadius * scale
            : 0,
          opacity: s.opacity,
        },
        extra: {
          blurRadius: s.activeTool === 'blur' ? s.blurRadius : undefined,
          pixelSize: s.activeTool === 'pixelate' ? s.pixelSize : undefined,
          dim: s.activeTool === 'spotlight' ? s.spotlightDim : undefined,
        },
      };
      draftLayerRef.current?.beginBox(geo, draftBoxStyleRef.current.style, base.id as string, handDrawn);
    }
  }

  function handleMouseMove(e?: Konva.KonvaEventObject<any>) {
    if (e && isTransformerTarget(e.target)) return;
    // Paste lands where the pointer is, as in Excalidraw.
    setPastePoint(getCanvasPoint());

    // Hover-to-select: enable selection cursor/interaction without changing toolbar tool
    if (e && !isDrawing && !isErasing) {
      const s = useEditorStore.getState();
      const hoveredId = findAnnotationId(e.target);
      // Under a drawing tool, hovering an existing drawing borrows the
      // selection tool for as long as the pointer is on it (or it stays
      // selected): click selects, drag moves, double-click labels. The
      // toolbar tool is untouched, so moving off it draws again.
      const drawingTools = !['select', 'hand', 'eraser', 'crop', 'text'].includes(s.activeTool);
      if (s.activeTool === 'select' || s.activeTool === 'hand' || drawingTools) {
        if (s.hoveredId !== hoveredId) setHoveredId(hoveredId);
      } else if (s.hoveredId) {
        setHoveredId(null);
      }
      // The text tool hovering a line/arrow shows the attach-label preview
      // (anchor dot + text cursor) instead of the generic selection cursor,
      // so the preview and the cursor never disagree about what a click does.
      const hoveredEl = hoveredId ? s.elements.find((el) => el.id === hoveredId) : undefined;
      const textAttachHover = s.activeTool === 'text'
        && (hoveredEl?.type === 'arrow' || hoveredEl?.type === 'line');
      if (hoveredId && drawingTools && !textAttachHover) {
        if (!hoveredAnnotationRef.current) hoverPreviousToolRef.current = s.activeTool;
        hoveredAnnotationRef.current = hoveredId;
        if (!hoverSelectModeRef.current) setHoverSelectMode(true);
      } else if (textAttachHover && hoveredAnnotationRef.current) {
        hoveredAnnotationRef.current = null;
        if (hoverSelectModeRef.current) setHoverSelectMode(false);
      } else if (
        !hoveredId
        && hoveredAnnotationRef.current
        && s.selectedElementIds.length === 0
      ) {
        hoveredAnnotationRef.current = null;
        hoverPreviousToolRef.current = null;
        if (hoverSelectModeRef.current) setHoverSelectMode(false);
      }

      // Text tool over a line/arrow: preview where a click would attach a
      // label — a quiet anchor dot on the stroke, drawn imperatively on the
      // interaction layer (no React on the move hot path). The pointer is
      // projected onto each arrow/line; the nearest one within ~10 screen px
      // wins and is remembered for the click.
      const textTool = s.activeTool === 'text';
      // No preview while the label editor is open: the pointer is over the
      // textarea, and the dot would linger under the editing UI.
      if (textTool && !textInput.visible && !hoveredAnnotationRef.current) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - lastTextAttachCheckRef.current < 32) {
          // throttled
        } else {
          lastTextAttachCheckRef.current = now;
          const pos = getCanvasPoint();
          if (pos) {
            let best: { id: string; t: number } | null = null;
            let bestD = Infinity;
            const threshold = 10 / s.zoom;
            for (const el of s.elements) {
              if (el.type !== 'arrow' && el.type !== 'line') continue;
              // Cheap bbox pre-filter so arrows far from the pointer never pay
              // for the 48-sample path projection.
              const b = getElementBounds(el, s.imageSize);
            if (
              pos.x < b.x - threshold || pos.x > b.x + b.w + threshold
              || pos.y < b.y - threshold || pos.y > b.y + b.h + threshold
            ) continue;
            const linear = el as ArrowElement | LineElement;
            // A linear element that already has a label edits that label on
            // click, so the preview anchors at the label's own position
            // instead of the pointer-projected spot (preview == action).
            const existingLabel = linear.groupId
              ? s.elements.find(
                  (x) => x.type === 'text' && x.groupId === linear.groupId,
                ) as TextElement | undefined
              : undefined;
            let t: number;
            let pt: { x: number; y: number };
            if (existingLabel) {
              t = existingLabel.labelOffset ?? 0.5;
              pt = pointAlongPath(linear, t);
            } else {
              t = projectPointToPath(linear, pos.x - el.x, pos.y - el.y);
              pt = pointAlongPath(linear, t);
            }
            const d = Math.hypot(pos.x - (el.x + pt.x), pos.y - (el.y + pt.y));
            if (d < bestD) {
              bestD = d;
              best = { id: el.id, t };
            }
          }
          if (best && bestD <= threshold) {
            if (!textAttachRef.current) textAttachRef.current = { id: best.id, t: best.t };
            else {
              textAttachRef.current.id = best.id;
              textAttachRef.current.t = best.t;
            }
            const linear = s.elements.find((x) => x.id === best!.id) as ArrowElement | LineElement;
            const pt = pointAlongPath(linear, best.t);
            draftLayerRef.current?.showLabelAnchor(linear.x + pt.x, linear.y + pt.y, s.zoom);
          } else if (textAttachRef.current) {
            textAttachRef.current = null;
            draftLayerRef.current?.clearLabelAnchor();
          }
        }
        }
      } else if (textAttachRef.current) {
        textAttachRef.current = null;
        draftLayerRef.current?.clearLabelAnchor();
      }
    }

    // Marquee multi-select (drawn imperatively on the interaction layer)
    if (marqueeOriginRef.current) {
      const pos = getCanvasPoint();
      if (pos) {
        const o = marqueeOriginRef.current;
        marqueeRectRef.current = {
          x: Math.min(o.x, pos.x),
          y: Math.min(o.y, pos.y),
          w: Math.abs(pos.x - o.x),
          h: Math.abs(pos.y - o.y),
        };
        const m = marqueeRectRef.current;
        draftLayerRef.current?.showMarquee(m.x, m.y, m.w, m.h, getSelectionTheme().accent, MARQUEE_FILL);
        selectInMarquee(m);
      }
      return;
    }

    // Eraser: mark what the stroke touches (pending-erasure fade), imperatively
    if (isErasingRef.current) {
      const pos = getCanvasPoint();
      if (pos) {
        eraseAlong(eraserEndRef.current ?? pos, pos, !!e?.evt?.altKey);
        // Trail: the last few pointer positions only, so it fades behind the cursor.
        eraserTrailRef.current = [...eraserTrailRef.current, pos.x, pos.y].slice(-24);
        draftLayerRef.current?.showEraserTrail(eraserTrailRef.current, useEditorStore.getState().zoom);
        eraserEndRef.current = pos;
      }
      return;
    }

    if (!isDrawing) return;
    // Perf probe: pointermove → draft update cost (dev only, see perf.ts).
    const moveStart = performance.now();
    const pos = getCanvasPoint();
    if (!pos) return;

    // The magnifier keeps its React draft (live zoom bubble component). Its
    // updates are rAF-coalesced so this is at most one render per frame.
    if (drawingElement?.type === 'magnifier') {
      const origin = drawOriginRef.current || { x: drawingElement.x, y: drawingElement.y };
      let w = pos.x - origin.x;
      let h = pos.y - origin.y;
      if (e?.evt?.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * size;
        h = Math.sign(h || 1) * size;
      }
      if (e?.evt?.altKey) {
        queueDrawingUpdate({
          ...drawingElement,
          x: origin.x - w,
          y: origin.y - h,
          width: w * 2,
          height: h * 2,
        } as MagnifierElement);
      } else {
        queueDrawingUpdate({
          ...drawingElement,
          x: origin.x,
          y: origin.y,
          width: w,
          height: h,
        } as MagnifierElement);
      }
      perfProbeRef.current?.tick(performance.now() - moveStart, 'magnifier-draw');
      return;
    }

    // Freehand: append samples in place, repaint only the active stroke.
    if (freehandDraftRef.current && freehandPointsRef.current) {
      const pts = freehandPointsRef.current;
      const prs = freehandPressuresRef.current ?? (freehandPressuresRef.current = []);
      const ptCount = pts.length / 2;
      let nx = pos.x;
      let ny = pos.y;
      if (handDrawn && ptCount > 0) {
        [nx, ny] = wobbleFreehandPoint(pos.x, pos.y, ptCount, freehandDraftRef.current.strokeWidth);
      }
      const evt = e?.evt as PointerEvent | undefined;
      const isPen = evt?.pointerType === 'pen' && (evt?.pressure ?? 0) > 0;
      appendFreehandSampleInPlace(pts, prs, nx, ny, isPen ? (evt?.pressure ?? 0.5) : 0.5);
      draftLayerRef.current?.updateFreehand(pts, prs, !isPen);
      perfProbeRef.current?.tick(performance.now() - moveStart, 'freehand-draw');
      return;
    }

    // Arrow / line: the endpoint follows the pointer 1:1 (Shift constrains to
    // 15° steps, Alt draws from the start point out both ways).
    if (draftSegmentGeoRef.current) {
      const geo = draftSegmentGeoRef.current;
      let dx = pos.x - geo.sx;
      let dy = pos.y - geo.sy;
      if (e?.evt?.shiftKey) {
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / SHIFT_LOCKING_ANGLE) * SHIFT_LOCKING_ANGLE;
        const len = Math.hypot(dx, dy);
        dx = Math.cos(snap) * len;
        dy = Math.sin(snap) * len;
      }
      if (e?.evt?.altKey && drawOriginRef.current) {
        const o = drawOriginRef.current;
        geo.sx = o.x - dx;
        geo.sy = o.y - dy;
        geo.ex = o.x + dx;
        geo.ey = o.y + dy;
      } else {
        geo.ex = geo.sx + dx;
        geo.ey = geo.sy + dy;
      }
      // Live binding preview (Excalidraw's suggestedBinding): while the
      // endpoint nears a bindable shape, highlight the target + attachment
      // point and let the endpoint magnetically follow the outline. The
      // persistent binding is still derived on commit from the same geometry,
      // so preview and release always agree.
      if (draftSegmentStyleRef.current) {
        const st = useEditorStore.getState();
        const kind = draftSegmentStyleRef.current.kind;
        const pseudo = {
          id: '__draft__',
          type: kind,
          x: geo.sx,
          y: geo.sy,
          points: [0, 0, geo.ex - geo.sx, geo.ey - geo.sy],
          strokeWidth: draftSegmentStyleRef.current.style.strokeWidth,
        } as ArrowElement;
        const bsnap = snapEndpointForBinding(
          pseudo, 'end',
          [0, 0, geo.ex - geo.sx, geo.ey - geo.sy],
          st.elements, st.imageSize, st.zoom, st.isBindingEnabled,
        );
        if (bsnap.preview) {
          draftLayerRef.current?.showBindingPreview(bsnap.preview, getSelectionTheme().accent, st.zoom);
          geo.ex = geo.sx + bsnap.points[2];
          geo.ey = geo.sy + bsnap.points[3];
        } else {
          draftLayerRef.current?.clearBindingPreview();
        }
      }
      draftLayerRef.current?.updateSegment(geo);
      perfProbeRef.current?.tick(performance.now() - moveStart, 'segment-draw');
      return;
    }

    // Box shapes (rect / rounded / ellipse / diamond / blur / pixelate /
    // spotlight / crop): drag from the origin; Shift constrains aspect;
    // Alt draws from the center.
    if (draftBoxGeoRef.current) {
      const geo = draftBoxGeoRef.current;
      const origin = drawOriginRef.current || { x: geo.ox, y: geo.oy };
      let w = pos.x - origin.x;
      let h = pos.y - origin.y;
      if (e?.evt?.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * size;
        h = Math.sign(h || 1) * size;
      }
      geo.w = w;
      geo.h = h;
      geo.centered = !!e?.evt?.altKey;
      // Callout: the bubble follows the pointer while its tail stays on the
      // press point.
      if (geo.kind === 'callout' && geo.extra?.tipAbs) {
        placeCalloutBody(geo, pos);
        geo.centered = false;
      }
      draftLayerRef.current?.updateBox(geo);
      perfProbeRef.current?.tick(performance.now() - moveStart, 'box-draw');
    }
  }

  function handleMouseLeave() {
    const s = useEditorStore.getState();
    // Leaving the canvas: drop the text-attach preview so it cannot linger.
    if (textAttachRef.current) {
      textAttachRef.current = null;
      draftLayerRef.current?.clearLabelAnchor();
    }
    if (s.selectedElementIds.length) return;
    hoveredAnnotationRef.current = null;
    hoverPreviousToolRef.current = null;
    if (hoverSelectModeRef.current) setHoverSelectMode(false);
  }

  /**
   * Excalidraw's box selection: an element is selected once the box fully
   * encloses it, and the selection updates live while the box is dragged.
   */
  function selectInMarquee(m: { x: number; y: number; w: number; h: number }) {
    const s = useEditorStore.getState();
    const hit = s.elements
      .filter((el) => {
        if (el.locked) return false;
        const b = getElementBounds(el, s.imageSize);
        return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h;
      })
      .map((el) => el.id);
    const hitSet = new Set(hit);
    // Collapse label pairs so shape+text are selected as one logical element (Excalidraw)
    const collapsed = hit.filter((id) => {
      const el = s.elements.find((e) => e.id === id);
      if (!el || el.type !== 'text' || !el.groupId) return true;
      for (const other of s.elements) {
        if (other.id !== id && other.groupId === el.groupId && hitSet.has(other.id)) return false;
      }
      return true;
    });
    const next = marqueeAdditiveRef.current
      ? [...new Set([...marqueeBaseRef.current, ...collapsed])]
      : collapsed;
    const cur = s.selectedElementIds;
    if (next.length === cur.length && next.every((id, i) => id === cur[i])) return;
    s.setSelectedElementIds(next);
    syncSettingsFromSelection(next);
  }

  async function handleMouseUp(e?: Konva.KonvaEventObject<unknown>) {
    // Gesture ended: release the pointer capture taken at pointerdown so the
    // browser restores normal hover/hit behavior.
    releasePointer(e);
    // Marquee multi-select commit
    if (marqueeOriginRef.current && marqueeRectRef.current) {
      selectInMarquee(marqueeRectRef.current);
      marqueeOriginRef.current = null;
      marqueeAdditiveRef.current = false;
      marqueeRectRef.current = null;
      draftLayerRef.current?.clearMarquee();
      return;
    }

    // Eraser: commit - remove everything the stroke marked.
    if (isErasingRef.current && eraserStartRef.current && eraserEndRef.current) {
      const toRemove = [...eraserHitsRef.current];
      eraserHitsRef.current = new Set();
      if (toRemove.length) useEditorStore.getState().removeElements(toRemove);
      isErasingRef.current = false;
      setIsErasing(false);
      eraserStartRef.current = null;
      eraserEndRef.current = null;
      draftLayerRef.current?.clearEraser();
      applyEraserFade(null);
      draftLayerRef.current?.clearEraser();
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    // The magnifier is the only React-path draft; its updates are
    // rAF-coalesced, so commit the coalesced final frame. Everything else was
    // drawn imperatively and is committed from the refs below.
    const finalDraft = drawingElement?.type === 'magnifier'
      ? (pendingDrawRef.current ?? drawingElement)
      : null;
    pendingDrawRef.current = null;
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    const MIN_SIZE = 3;
    let valid = false;
    let draft: EditorElement | null = null;

    // Crop commit (imperative overlay marquee - never saved as an annotation)
    if (draftBoxGeoRef.current?.kind === 'crop') {
      const geo = draftBoxGeoRef.current;
      const w0 = geo.centered ? geo.w * 2 : geo.w;
      const h0 = geo.centered ? geo.h * 2 : geo.h;
      const x = Math.min(geo.ox, geo.ox + w0);
      const y = Math.min(geo.oy, geo.oy + h0);
      const w = Math.abs(w0);
      const h = Math.abs(h0);
      draftBoxGeoRef.current = null;
      draftBoxStyleRef.current = null;
      draftLayerRef.current?.clear();
      if (w > MIN_SIZE && h > MIN_SIZE) {
        useEditorStore.getState().cropToRegion({ x, y, width: w, height: h });
      }
      return;
    }

    // Freehand: snapshot the mutable buffers into an immutable element.
    if (freehandDraftRef.current && freehandPointsRef.current) {
      const fd = freehandDraftRef.current;
      const pts = freehandPointsRef.current;
      const prs = freehandPressuresRef.current ?? [];
      valid = pts.length > 4;
      if (valid) {
        draft = {
          ...fd.base,
          type: fd.tool,
          x: 0, y: 0,
          points: pts.slice(),
          pressures: prs.slice(),
          simulatePressure: fd.simulatePressure,
          stroke: fd.color,
          strokeWidth: fd.strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0.5,
          opacity: fd.opacity,
        } as PencilElement;
      }
      freehandDraftRef.current = null;
      freehandPointsRef.current = null;
      freehandPressuresRef.current = null;
    } else if (draftSegmentGeoRef.current && draftSegmentStyleRef.current) {
      const geo = draftSegmentGeoRef.current;
      const seg = draftSegmentStyleRef.current;
      valid = Math.abs(geo.ex - geo.sx) > MIN_SIZE || Math.abs(geo.ey - geo.sy) > MIN_SIZE;
      if (valid) {
        draft = {
          ...seg.extra,
          id: seg.id,
          type: seg.kind,
          x: geo.sx,
          y: geo.sy,
          points: [0, 0, geo.ex - geo.sx, geo.ey - geo.sy],
          stroke: seg.style.stroke,
          strokeWidth: seg.style.strokeWidth,
          fill: seg.style.fill,
          // Arrowhead geometry only exists on arrows (matches the pre-audit
          // draft: line drafts carried no pointerLength/pointerWidth).
          ...(seg.kind === 'arrow'
            ? {
                pointerLength: seg.style.headSize ?? 0,
                pointerWidth: seg.style.pointerWidth ?? (seg.style.headSize ?? 0),
              }
            : {}),
          opacity: seg.style.opacity,
          strokeStyle: seg.style.strokeStyle,
          roughness: seg.style.roughness,
        } as ArrowElement | LineElement;
      }
      draftSegmentGeoRef.current = null;
      draftSegmentStyleRef.current = null;
    } else if (draftBoxGeoRef.current && draftBoxStyleRef.current) {
      const geo = draftBoxGeoRef.current;
      const box = draftBoxStyleRef.current;
      const w0 = geo.centered ? geo.w * 2 : geo.w;
      const h0 = geo.centered ? geo.h * 2 : geo.h;
      valid = Math.abs(w0) > MIN_SIZE || Math.abs(h0) > MIN_SIZE;
      if (valid) {
        const isEffect = ['blur', 'pixelate', 'spotlight'].includes(box.type);
        draft = {
          ...box.extra,
          id: box.id,
          type: box.type,
          x: geo.centered ? geo.ox - geo.w : geo.ox,
          y: geo.centered ? geo.oy - geo.h : geo.oy,
          width: w0,
          height: h0,
          opacity: box.style.opacity,
          strokeStyle: box.style.strokeStyle,
          fillStyle: box.style.fillStyle,
          roughness: box.style.roughness,
          stroke: isEffect ? undefined : box.style.stroke,
          fill: isEffect ? undefined : box.style.fill,
          strokeWidth: isEffect ? 0 : box.style.strokeWidth,
          cornerRadius: box.style.cornerRadius,
          ...(box.type === 'callout' ? {
            pointerDirection: directionFromClickToBox(
              geo.ox, geo.oy,
              Math.min(geo.ox, geo.ox + geo.w), Math.min(geo.oy, geo.oy + geo.h),
              Math.abs(geo.w), Math.abs(geo.h),
            ) as CalloutPointerDirection,
            pointerLength: box.extra?.pointerLength,
            pointerWidth: box.extra?.pointerWidth,
            pointerOffset: box.extra?.pointerOffset ?? 0.5,
            pointerTip: geo.extra?.pointerTip,
          } : {}),
          // A big source starts with a bubble that still fits the screenshot.
          ...(box.type === 'magnifier' ? {
            magnification: startMagnification(w0, h0, (box.extra as { magnification?: number })?.magnification ?? 2.25),
          } : {}),
        } as ShapeElement | CalloutElement;
      }
      draftBoxGeoRef.current = null;
      draftBoxStyleRef.current = null;
    } else if (finalDraft) {
      draft = finalDraft;
      valid = (() => {
        if (draft!.type === 'pencil' || draft!.type === 'highlighter') {
          return (draft as PencilElement).points.length > 4;
        }
        if (draft!.type === 'arrow' || draft!.type === 'line') {
          const pts = (draft as ArrowElement | LineElement).points;
          return Math.abs(pts[2]) > MIN_SIZE || Math.abs(pts[3]) > MIN_SIZE;
        }
        const w = Math.abs((draft as ShapeElement | CircleElement).width);
        const h = Math.abs((draft as ShapeElement | CircleElement).height);
        return w > MIN_SIZE || h > MIN_SIZE;
      })();
    }

    if (draft && valid) {
      if (draft.type === 'blur' || draft.type === 'pixelate') {
        const shape = draft as ShapeElement;
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        const w = Math.abs(shape.width);
        const h = Math.abs(shape.height);
        const s = useEditorStore.getState();
        const intensity = draft.type === 'blur' ? s.blurRadius : s.pixelSize;
        const url = await createBlurImage(x, y, w, h, draft.type, intensity);
        if (url) {
          addElement({
            ...shape, x, y, width: w, height: h,
            imageDataURL: url,
            // Persisted so the region can be re-baked when it is moved,
            // resized, or its intensity is changed from the panel.
            ...(draft.type === 'blur'
              ? { blurRadius: intensity }
              : { pixelSize: intensity }),
            stroke: undefined,
            fill: undefined,
          } as ShapeElement);
        }
      } else {
        let el = { ...draft };
        if ('width' in el && 'height' in el) {
          if ((el as ShapeElement).width < 0) {
            el.x += (el as ShapeElement).width;
            (el as ShapeElement).width *= -1;
          }
          if ((el as ShapeElement).height < 0) {
            el.y += (el as ShapeElement).height;
            (el as ShapeElement).height *= -1;
          }
        }
        // Auto-bind: a freshly drawn arrow/line whose endpoint ends on or near
        // a shape attaches to it (light auto-bind, Excalidraw's scaled-down
        // behavior). Respects the isBindingEnabled toggle. Bound endpoints are
        // snapped onto the shape's outline right away.
        if (el.type === 'arrow' || el.type === 'line') {
          const st = useEditorStore.getState();
          if (st.isBindingEnabled) {
            const lineEl = el as ArrowElement | LineElement;
            const startBinding = resolveEndpointBinding(lineEl, 'start', st.elements, st.imageSize, st.zoom);
            const endBinding = resolveEndpointBinding(lineEl, 'end', st.elements, st.imageSize, st.zoom);
            if (startBinding || endBinding) {
              const pts = [...lineEl.points];
              const snap = (which: 'start' | 'end', b: typeof startBinding) => {
                if (!b) return;
                const targetEl = st.elements.find((e) => e.id === b.elementId);
                if (!targetEl || !isBindableElement(targetEl)) return;
                const anchor = anchorForBinding(targetEl, b.fixedPoint, b.mode, st.imageSize);
                const i = which === 'start' ? 0 : pts.length - 2;
                pts[i] = anchor.x - lineEl.x;
                pts[i + 1] = anchor.y - lineEl.y;
              };
              snap('start', startBinding);
              snap('end', endBinding);
              el = {
                ...el,
                points: pts as [number, number, number, number],
                startBinding,
                endBinding,
              } as EditorElement;
            }
          }
          // Elbow arrows route their interior at commit (binding on or off):
          // the orthogonal corner(s) are derived from the endpoints and the
          // side headings implied by the (possibly just attached) bindings.
          if ((el as ArrowElement).elbowed) {
            const a = el as ArrowElement;
            const n = a.points.length;
            const routed = elbowPointsLocal(
              { x: a.x, y: a.y },
              { x: a.x + a.points[0], y: a.y + a.points[1] },
              { x: a.x + a.points[n - 2], y: a.y + a.points[n - 1] },
              headingFromFixedPoint(a.startBinding?.fixedPoint),
              headingFromFixedPoint(a.endBinding?.fixedPoint),
            );
            el = { ...el, points: routed as [number, number, number, number] } as EditorElement;
          }
        }
        addElement(el);
      }
    }
    draftLayerRef.current?.clear();
    setDrawingElement(null);
    drawOriginRef.current = null;
    // Tools stay active after drawing; the callout's text is the one follow-up.
    if (draft && valid && draft.type === 'callout') {
      // A callout exists to carry words: open its text straight away.
      const id = draft.id;
      window.setTimeout(() => {
        const made = useEditorStore.getState().elements.find((x) => x.id === id);
        if (made) {
          calloutLabelRef.current = true;
          attachTextToAnnotation(made);
        }
      }, 0);
    }
  }

  // --- Zoom helpers (wheel + pinch) ---

  function applyZoomAt(clientX: number, clientY: number, newZoom: number) {
    const st = stageRef.current;
    const root = containerRef.current;
    if (!st || !root) return;
    const rect = root.getBoundingClientRect();
    const pointer = { x: clientX - rect.left, y: clientY - rect.top };
    const s = useEditorStore.getState();
    // Chain off the pending viewport so back-to-back events compound before
    // the once-per-frame store sync lands.
    const vp = pendingViewportRef.current ?? { zoom: s.zoom, x: s.stagePosition.x, y: s.stagePosition.y };
    const oldZoom = vp.zoom;
    const oldPos = { x: vp.x, y: vp.y };
    const clamped = Math.max(0.1, Math.min(5, newZoom));
    const mousePointTo = {
      x: (pointer.x - oldPos.x) / oldZoom,
      y: (pointer.y - oldPos.y) / oldZoom,
    };
    const next = {
      zoom: clamped,
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    };
    // Move the Stage node immediately; React only hears about it at the next
    // animation frame (syncViewportToStore), so the canvas never lags behind
    // the pointer and React never runs per wheel event.
    pendingViewportRef.current = next;
    st.scale({ x: clamped, y: clamped });
    st.position({ x: next.x, y: next.y });
    st.batchDraw();
    syncViewportToStore();
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    const pointer = st.getPointerPosition();
    if (!pointer) return;
    const s = useEditorStore.getState();
    let delta = e.evt.deltaY;
    if (e.evt.deltaMode === 1) delta *= 16; // lines → pixels
    if (e.evt.deltaMode === 2) delta *= 400; // pages → pixels
    const factor = Math.exp(-delta * 0.0012);
    const root = containerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    applyZoomAt(rect.left + pointer.x, rect.top + pointer.y, s.zoom * factor);
  }

  // Pinch-to-zoom + two-finger pan (touch)
  const pinchRef = useRef<
    { dist: number; zoom: number; cx: number; cy: number } | null
  >(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const touchDist = (t: TouchList) => {
      if (t.length < 2) return 0;
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };
    const touchCenter = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const center = touchCenter(e.touches);
        pinchRef.current = {
          dist: touchDist(e.touches),
          zoom: useEditorStore.getState().zoom,
          cx: center.x,
          cy: center.y,
        };
        // Cancel any in-progress draw so pinch doesn't create a stroke
        setIsDrawing(false);
        clearDrawingDraft();
        isErasingRef.current = false;
        setIsErasing(false);
        eraserStartRef.current = null;
        eraserEndRef.current = null;
        applyEraserFade(null);
        draftLayerRef.current?.clear();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const dist = touchDist(e.touches);
      if (dist < 1 || pinchRef.current.dist < 1) return;
      const center = touchCenter(e.touches);

      // Two-finger pan: the centroid's own movement translates the stage.
      // Without this the canvas could only be panned with the hand tool, which
      // is an awkward mode switch on a phone.
      const dx = center.x - pinchRef.current.cx;
      const dy = center.y - pinchRef.current.cy;
      if (dx || dy) {
        panStageBy(dx, dy);
        pinchRef.current.cx = center.x;
        pinchRef.current.cy = center.y;
      }

      const scale = dist / pinchRef.current.dist;
      applyZoomAt(center.x, center.y, pinchRef.current.zoom * scale);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // --- Selection ---

  /**
   * Pull the selected elements' real values into the tool settings.
   *
   * Every path that changes the selection must call this. Previously only the
   * stage-mousedown path hydrated (and only a subset of fields), so clicking a
   * shape - the common case - left the panel showing whatever was set last.
   */
  const syncSettingsFromSelection = useCallback((ids: string[]) => {
    const s = useEditorStore.getState();
    const els = s.elements.filter((el) => ids.includes(el.id));
    if (!els.length) return;
    const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
    const patch = { ...hydrateSettingsFromSelection(els, scale) };
    for (const el of els) {
      const partner = labelPairPartner(el, s.elements);
      if (partner && partner.type === 'text' && !ids.includes(partner.id)) {
        Object.assign(patch, hydrateSettingsFromElement(partner, scale));
      }
    }
    if (Object.keys(patch).length) useEditorStore.setState(patch as Partial<typeof s>);
  }, []);

  function handleSelect(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    const s = useEditorStore.getState();
    // Only the selection tool selects (or a drawing tool borrowing it while
    // hovering a drawing); otherwise a click belongs to the element being drawn.
    if (s.activeTool !== 'select' && !hoverSelectModeRef.current) return;
    e.cancelBubble = true;
    const clicked = s.elements.find((x) => x.id === id);
    const targetId = clicked ? selectionTargetForClick(clicked, s.elements) : id;
    let nextIds: string[];
    if (e.evt.shiftKey) {
      const currentIds = s.selectedElementIds;
      nextIds = currentIds.includes(targetId)
        ? currentIds.filter((i) => i !== targetId)
        : [...currentIds, targetId];
    } else {
      nextIds = [targetId];
    }
    s.setSelectedElementIds(nextIds);
    syncSettingsFromSelection(nextIds);
  }

  /**
   * Open the in-place editor for a text annotation. Shared by double-click,
   * Enter-on-selection, and double-clicking a shape that already has a label.
   */
  function openTextEditor(textEl: TextElement, pendingNewId?: string) {
    useEditorStore.getState().setSelectedElementIds([]);
    setTextInput({
      x: textEl.x,
      y: textEl.y,
      visible: true,
      editId: textEl.id,
      initialText: textEl.text,
      pendingNewId,
    });
    // Hydrate before the overlay mounts so it renders in this element's own
    // font and size rather than the last-used defaults.
    syncSettingsFromSelection([textEl.id]);
  }

  /**
   * Enter on a selected annotation → edit its text in place. Text elements are
   * edited directly; any other shape gets (or edits) an attached text label,
   * mirroring Excalidraw's "Enter to type text on the selected shape".
   */
  useEffect(() => {
    const onEditText = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const s = useEditorStore.getState();
      if (s.annotationsLocked) return;
      const el = s.elements.find((x) => x.id === id);
      if (!el || el.locked) return;
      if (el.type === 'text') {
        openTextEditor(el as TextElement);
      } else {
        attachTextToAnnotation(el);
      }
    };
    window.addEventListener('snapty-edit-text', onEditText);
    return () => window.removeEventListener('snapty-edit-text', onEditText);
  }, []);

  /**
   * Double-click any annotation → attach a text label grouped to it (center of
   * a box, middle of a line/arrow) so it moves and resizes with the shape. The
   * text editor opens immediately; Esc or an empty commit removes the label.
   */
  function attachTextToAnnotation(el: EditorElement, atT?: number) {
    const s = useEditorStore.getState();
    if (s.annotationsLocked || !s.imageSize.width) return;
    // Already has an attached label → just edit that one.
    if (el.groupId) {
      const existing = s.elements.find(
        (e) => e.type === 'text' && e.groupId === el.groupId,
      ) as TextElement | undefined;
      if (existing) {
        openTextEditor(existing);
        return;
      }
    }
    const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
    const groupId = generateId();
    const fontSize = s.fontSize * scale;
    const isLineLabel = el.type === 'arrow' || el.type === 'line';
    // For line/arrow, text sits ON the stroke in the middle (Excalidraw style:
    // label is part of the arrow with a gap). atT is the position along the
    // path (e.g., 0.5 = middle). No perpendicular offset — line is erased
    // behind the text box.
    const defaultLineOffsetY = isLineLabel ? 0 : undefined;
    const labelOpts = isLineLabel
      ? { labelOffset: atT, labelOffsetY: defaultLineOffsetY }
      : undefined;
    // Centered label geometry is shared by every shape type (see
    // lib/editor/text-labels) so the editor overlay, the committed element,
    // and the Konva node all agree on placement.
    const anchor = labelAnchorForElement(
      el,
      s.imageSize,
      fontSize,
      scale,
      labelOpts,
    );
    const textEl = createAttachedLabel(
      generateId(),
      groupId,
      anchor,
      {
        fontSize,
        fontFamily: s.fontFamily || HANDWRITTEN_FONT,
        fontStyle: s.fontStyle || 'normal',
        align: 'center',
        fill: s.strokeColor,
        opacity: s.opacity,
      },
      labelOpts ? { labelOffset: atT ?? 0.5, labelOffsetY: defaultLineOffsetY } : undefined,
    );
    // One undo step for the shape group + the label.
    s.attachText(el.id, textEl);
    openTextEditor(textEl, textEl.id);
  }

  function handleTextDblClick(el: TextElement, e: Konva.KonvaEventObject<any>) {
    const st = useEditorStore.getState();
    // Double-click edits text from any tool (except tools with their own
    // double-click semantics); hover-select made this work already for most
    // drawing tools, now it is deterministic.
    if (['eraser', 'crop', 'hand'].includes(st.activeTool)) return;
    if (st.annotationsLocked) return;
    e.cancelBubble = true;
    openTextEditor(el);
  }

  /**
   * Double-click a line/arrow BODY to insert a vertex there (polyline
   * editing): the click point becomes a new point in `points` and the element
   * renders as a multi-point polyline with editable vertex handles. The
   * endpoint handles keep their bind/drag semantics. Handle double-clicks
   * (label editing) are left alone by checking the click target.
   */
  function handleLineVertexInsert(el: ArrowElement | LineElement, e: Konva.KonvaEventObject<MouseEvent>) {
    const st = useEditorStore.getState();
    if (st.annotationsLocked || el.locked) return;
    // Only the body: handles are Circles (their double-click means "edit
    // label"), and rough shapes hit-test through child paths, so walk up.
    if ((e.target as Konva.Node).getClassName?.() === 'Circle') return;
    let node: Konva.Node | null = e.target as Konva.Node;
    while (node && node.id() !== el.id) node = node.getParent();
    if (!node) return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const local = node.getAbsoluteTransform().copy().invert().point(pointer);
    const pts = el.points;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const d = distToSegment(local, { x: pts[i], y: pts[i + 1] }, { x: pts[i + 2], y: pts[i + 3] });
      if (d < bestD) {
        bestD = d;
        bestI = i + 2;
      }
    }
    const newPoints = [...pts];
    newPoints.splice(bestI, 0, local.x, local.y);
    // Multi-point polylines render straight; a formerly bent 2-point arrow
    // drops its curve so the new vertex is what bends the path. An elbow
    // arrow becomes a free polyline the moment the user adds a vertex —
    // routing is router-owned, so an explicit edit opts out of it.
    st.updateElement(el.id, {
      points: newPoints as [number, number, number, number],
      ...(el.type === 'arrow' ? { bend: 0 } : {}),
      ...(el.type === 'arrow' && (el as ArrowElement).elbowed ? { elbowed: false } : {}),
    });
  }

  function loadDroppedImage(file: File) {
    if (file.name.endsWith('.snapty') || file.name.endsWith('.json')) {
      void import('@/lib/editor/project-file').then(async (m) => {
        const res = await m.loadProjectFromFile(file);
        const { toastError, toastSuccess } = await import('@/lib/app-toast');
        if (res.ok) toastSuccess('Project opened', file.name);
        else toastError('Could not open project', res.error);
      });
      return;
    }
    if (!file.type.startsWith('image/')) return;
    void loadImageFileIntoEditor(file);
  }

  // --- Transform ---

  function handleTransform(id: string, node: Konva.Node) {
    const el = useEditorStore.getState().elements.find((e) => e.id === id);
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    if (el?.type === 'circle' && node.getClassName?.() === 'Ellipse') {
      const ellipse = node as Konva.Ellipse;
      const rx = Math.max(2.5, ellipse.radiusX() * scaleX);
      const ry = Math.max(2.5, ellipse.radiusY() * scaleY);
      ellipse.radiusX(rx);
      ellipse.radiusY(ry);
      ellipse.scaleX(1);
      ellipse.scaleY(1);
      updateElement(id, {
        x: ellipse.x() - rx,
        y: ellipse.y() - ry,
        width: rx * 2,
        height: ry * 2,
        rotation: ellipse.rotation(),
        scaleX: 1,
        scaleY: 1,
      });
      return;
    }

    const updates: Partial<EditorElement> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: 1,
      scaleY: 1,
    };

    /*
      Types whose size is not `width`/`height`. Without these branches the
      generic path below silently discarded the resize (the `'width' in el`
      guard was false), so text and step badges showed handles that did nothing.
    */
    if (el?.type === 'text') {
      const textEl = el as TextElement;
      // Konva's generic `width()`/`height()` return the raw attrs (0 when
      // never set), so a fresh TextElement would clamp to the 20px floor.
      // Use the local bbox instead — it tracks the rendered text (natural
      // size when auto, or the explicit size once the user has dragged).
      const baseWidth =
        textEl.width ||
        node.getClientRect({ relativeTo: node as Konva.Container }).width ||
        0;
      const baseHeight =
        textEl.height ||
        (node as Konva.Group).findOne('Text')?.height() ||
        0;
      // Every handle re-wraps / resizes the box; fontSize is a separate
      // property and changes only via the font-size control, never from a
      // box drag. Corner handles change both width and height; side handles
      // change only the axis they sit on.
      const nextWidth = Math.max(20, baseWidth * scaleX);
      const nextHeight = Math.max(20, baseHeight * scaleY);
      updateElement(id, {
        ...updates,
        width: nextWidth,
        height: nextHeight,
      } as Partial<TextElement>);
      node.scaleX(1);
      node.scaleY(1);
      node.width(nextWidth);
      node.height(nextHeight);
      return;
    }

    if (el?.type === 'step') {
      const stepEl = el as StepElement;
      const r = Math.max(8, (stepEl.radius ?? 16) * Math.max(scaleX, scaleY));
      updateElement(id, {
        ...updates,
        radius: r,
        fontSize: r * 0.8,
      } as Partial<StepElement>);
      node.scaleX(1);
      node.scaleY(1);
      return;
    }

    if (el?.type === 'pencil' || el?.type === 'highlighter') {
      // Freehand points are absolute image coordinates with the element pinned
      // at 0,0 - an invariant cropToRegion relies on. Scale the points about
      // their own bounding box and leave x/y alone.
      const pencilEl = el as PencilElement;
      const pts = pencilEl.points ?? [];
      if (pts.length >= 2) {
        let minX = Infinity;
        let minY = Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]);
          minY = Math.min(minY, pts[i + 1]);
        }
        const scaled = pts.map((v, i) =>
          i % 2 === 0 ? minX + (v - minX) * scaleX : minY + (v - minY) * scaleY,
        );
        updateElement(id, {
          x: 0,
          y: 0,
          rotation: node.rotation(),
          scaleX: 1,
          scaleY: 1,
          points: scaled,
        } as Partial<PencilElement>);
      }
      node.scaleX(1);
      node.scaleY(1);
      node.position({ x: 0, y: 0 });
      return;
    }

    if (el && ('width' in el)) {
      const baseW = node.width() || (el as ShapeElement).width || 0;
      const baseH = node.height() || (el as ShapeElement).height || 0;
      const w = Math.max(5, Math.abs(baseW * scaleX));
      const h = Math.max(5, Math.abs(baseH * scaleY));
      (updates as Partial<ShapeElement>).width = w;
      (updates as Partial<ShapeElement>).height = h;
      node.width(w);
      node.height(h);
    }

    node.scaleX(1);
    node.scaleY(1);
    updateElement(id, updates);
  }

  // --- Drag end ---

  function handleDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    // The live magnifier pin hands over to the commit below; release it after.
    if (magnifierDragRef.current) {
      magnifierDragRef.current = null;
      // Hand the live shift back: the commit below pins the bubble for real.
      const magNode = e.target as Konva.Group;
      magNode.setAttr('liveShift', undefined);
      magNode.findOne?.('.mag-bubble')?.position({ x: 0, y: 0 });
    }
    linearHandleDragRef.current = null;
    draftLayerRef.current?.clearGuides();
    draftLayerRef.current?.clearHoverOutline();
    endMultiSelectDrag();
    let x = e.target.x();
    let y = e.target.y();
    const s = useEditorStore.getState();
    const el = s.elements.find((item) => item.id === id);
    const centered = e.target.getClassName?.() === 'Ellipse';
    const boxW = el && 'width' in el ? Math.abs((el as ShapeElement).width || 0) : 0;
    const boxH = el && 'height' in el ? Math.abs((el as ShapeElement).height || 0) : 0;
    if (centered) {
      x -= boxW / 2;
      y -= boxH / 2;
    }
    if (el) {
      const clamped = clampToGutter(el, x, y, s.imageSize);
      x = clamped.x;
      y = clamped.y;
      e.target.position(centered ? { x: x + boxW / 2, y: y + boxH / 2 } : { x, y });
    }

    if (altDuplicateRef.current === id) {
      altDuplicateRef.current = null;
      const source = s.elements.find((item) => item.id === id);
      if (source) {
        // A fresh group id so the clone never joins the original group
        // (attached labels would drag the original shape around).
        const newGroupId = source.groupId ? generateId() : undefined;
        const dx = x - source.x;
        const dy = y - source.y;
        const clone = {
          ...JSON.parse(JSON.stringify(source)),
          id: generateId(),
          x,
          y,
          ...(newGroupId ? { groupId: newGroupId } : {}),
        } as EditorElement;
        const clones: EditorElement[] = [clone];
        const cloneIds = [clone.id];
        // Alt-drag duplicating either half of a shape↔label pair carries the
        // partner (fresh id, same fresh group) so the copy is never stranded
        // or joined to the original's label.
        if (source.groupId && isLabelPairGroup(source.groupId, s.elements)) {
          const partner = s.elements.find(
            (el) => el.id !== source.id && el.groupId === source.groupId,
          );
          if (partner) {
            const partnerClone = {
              ...JSON.parse(JSON.stringify(partner)),
              id: generateId(),
              x: partner.x + dx,
              y: partner.y + dy,
              groupId: newGroupId,
            } as EditorElement;
            clones.push(partnerClone);
            cloneIds.push(partnerClone.id);
          }
        }
        // Restore original position, add clone at new position
        const orig = s.elements.find((item) => item.id === id);
        if (orig) {
          e.target.position({ x: orig.x, y: orig.y });
          s.addElements(clones);
          s.setSelectedElementIds(cloneIds);
          return;
        }
      }
    }

    // Dragging a grouped element must carry its whole group (attached text
    // labels included). Konva only moves the dragged node, so shift the dragged
    // element plus every selected element and their group members by the same
    // delta in one undo step.
    if (el) {
      const dx = x - el.x;
      const dy = y - el.y;
      if (dx !== 0 || dy !== 0) {
        const toMove = new Set<string>([id, ...s.selectedElementIds]);
        const groupIds = new Set(
          s.elements
            .filter((e) => toMove.has(e.id) && e.groupId)
            .map((e) => e.groupId as string),
        );
        for (const e of s.elements) {
          if (e.groupId && groupIds.has(e.groupId)) toMove.add(e.id);
        }
        s.moveElementsBy([...toMove], dx, dy);
      }
    } else {
      updateElement(id, { x, y });
    }
  }

  /**
   * Imperatively keep an attached label's Konva node glued to its shape while
   * the shape's BODY is dragged. Konva moves only the dragged node; the label
   * node is a sibling, so it must follow per frame (the store only hears
   * about the move at dragend, then moves the whole group by the same delta).
   */
  const glueAttachedLabelLive = (
    labelEl: EditorElement | undefined,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
  ) => {
    if (!labelEl) return;
    const cache = nodeCacheRef.current;
    let node = cache.get(labelEl.id);
    // Validate: if the node was removed from the stage, drop the stale entry.
    if (node && !node.getStage()) { cache.delete(labelEl.id); node = undefined; }
    if (!node) {
      const stage = stageRef.current;
      node = stage ? findAnnotationNode(stage, labelEl.id) : undefined;
      if (node) cache.set(labelEl.id, node);
    }
    if (!node) return;
    node.position({
      x: labelEl.x + (targetX - originX),
      y: labelEl.y + (targetY - originY),
    });
  };

  /** Keep start/bend/end dots glued to a line/arrow while its body is dragged. */
  const glueLinearHandles = (
    id: string,
    originX: number,
    originY: number,
    nx: number,
    ny: number,
  ) => {
    const stage = stageRef.current;
    if (!stage) return;
    let cache = linearHandleDragRef.current;
    if (!cache || cache.id !== id) {
      const locals: { node: Konva.Node; lx: number; ly: number }[] = [];
      stage.find(`.linear-${id}`).forEach((node) => {
        locals.push({ node, lx: node.x() - originX, ly: node.y() - originY });
      });
      cache = { id, locals };
      linearHandleDragRef.current = cache;
    }
    for (const { node, lx, ly } of cache.locals) {
      if (!node.getStage()) continue;
      node.position({ x: nx + lx, y: ny + ly });
    }
  };

  function handleDragMove(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    pinCalloutTipLive(id, e.target);
    pinMagnifierBubbleLive(id, e.target);
    // Slice A: capture pre-drag multi-select bounds for the drag-ghost.
    if (useEditorStore.getState().multiSelectGhost === null) {
      beginMultiSelectDrag();
    }
    draftLayerRef.current?.clearHoverOutline();
    const s = useEditorStore.getState();
    const el = s.elements.find((item) => item.id === id);
    if (!el) {
      draftLayerRef.current?.clearGuides();
      return;
    }
    // Live binding: bound arrows follow the dragged target on every frame.
    // Purely imperative (node attrs + batchDraw) — the store only hears about
    // the move at dragend, and arrows selected together re-anchor at commit.
    const attachedLabel = el.groupId
      ? s.elements.find((x) => x.type === 'text' && x.groupId === el.groupId)
      : undefined;
    if (!('width' in el)) {
      let nx = e.target.x();
      let ny = e.target.y();
      const clamped = clampToGutter(el, nx, ny, s.imageSize);
      nx = clamped.x;
      ny = clamped.y;
      const dx = nx - el.x;
      const dy = ny - el.y;
      e.target.position({ x: nx, y: ny });
      glueAttachedLabelLive(attachedLabel, el.x, el.y, nx, ny);
      glueLinearHandles(id, el.x, el.y, nx, ny);
      // Multi-select: move other selected elements by same delta imperatively (Excalidraw group drag)
      if (s.selectedElementIds.length > 1 && s.selectedElementIds.includes(id)) {
        for (const selId of s.selectedElementIds) {
          if (selId === id) continue;
          const selEl = s.elements.find((x) => x.id === selId);
          if (!selEl) continue;
          let node = nodeCacheRef.current.get(selId);
          if (!node || !node.getStage()) {
            node = stageRef.current ? findAnnotationNode(stageRef.current, selId) : undefined;
            if (node) nodeCacheRef.current.set(selId, node);
          }
          if (!node) continue;
          node.position({ x: (selEl as any).x + dx, y: (selEl as any).y + dy });
          const selLabel = selEl.groupId ? s.elements.find((x) => x.type === 'text' && x.groupId === selEl.groupId) : undefined;
          if (selLabel) glueAttachedLabelLive(selLabel, selEl.x, selEl.y, (selEl as any).x + dx, (selEl as any).y + dy);
        }
      }
      const layer = annotationLayerRef.current ?? (stageRef.current?.findOne('.annotation-layer') as Konva.Layer | undefined);
      layer?.batchDraw();
      draftLayerRef.current?.clearGuides();
      return;
    }
    const w = Math.abs((el as ShapeElement).width || 0);
    const h = Math.abs((el as ShapeElement).height || 0);
    // Crisp ellipses are drawn from the center; rough ellipses and rects use top-left.
    const centered = e.target.getClassName?.() === 'Ellipse';
    const moving = {
      x: centered ? e.target.x() - w / 2 : e.target.x(),
      y: centered ? e.target.y() - h / 2 : e.target.y(),
      w,
      h,
    };
    // Excalidraw's object snapping is off by default: the shape follows the
    // pointer 1:1 (no alignment/magnetic jumps).
    let sx = moving.x;
    let sy = moving.y;
    const clampedSnap = clampToGutter(el, sx, sy, s.imageSize);
    sx = clampedSnap.x;
    sy = clampedSnap.y;
    const dx = sx - el.x;
    const dy = sy - el.y;
    e.target.position(centered ? { x: sx + w / 2, y: sy + h / 2 } : { x: sx, y: sy });
    // After the clamp, so bound arrows track the position actually drawn.
    if (isBindableElement(el)) applyLiveBindingsForTarget(id, liveElementFromNode(el, e.target));
    glueAttachedLabelLive(attachedLabel, el.x, el.y, sx, sy);
    if (s.selectedElementIds.length > 1 && s.selectedElementIds.includes(id)) {
      for (const selId of s.selectedElementIds) {
        if (selId === id) continue;
        const selEl = s.elements.find((x) => x.id === selId);
        if (!selEl) continue;
        let node = nodeCacheRef.current.get(selId);
        if (!node || !node.getStage()) {
          node = stageRef.current ? findAnnotationNode(stageRef.current, selId) : undefined;
          if (node) nodeCacheRef.current.set(selId, node);
        }
        if (!node) continue;
        node.position({ x: (selEl as any).x + dx, y: (selEl as any).y + dy });
        const selLabel = selEl.groupId ? s.elements.find((x) => x.type === 'text' && x.groupId === selEl.groupId) : undefined;
        if (selLabel) glueAttachedLabelLive(selLabel, selEl.x, selEl.y, (selEl as any).x + dx, (selEl as any).y + dy);
      }
    }
    const layer = annotationLayerRef.current ?? (stageRef.current?.findOne('.annotation-layer') as Konva.Layer | undefined);
    layer?.batchDraw();
  }

  // --- Element rendering ---

  const handleElementTransformEnd = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const node = findAnnotationNode(stage, id);
      if (node) handleTransform(id, node);
      // Excalidraw: a box cannot be resized shorter than its wrapped text.
      const st = useEditorStore.getState();
      const shape = st.elements.find((e) => e.id === id);
      const label = shape && shape.type !== 'text' ? labelPairPartner(shape, st.elements) : undefined;
      if (label?.type === 'text') growContainerToFitText(label.id);
    });
  }, []);

  /**
   * Live-update an arrow/line node while one of its handles is dragged.
   *
   * The handle's drag is Konva-owned; writing the geometry to the store on
   * every pointermove re-renders the handle at the recomputed position, which
   * fights Konva's drag and makes the first drag barely bend (the handle keeps
   * snapping back toward the chord). Instead the node is mutated in place and
   * the store is only touched on commit, so one continuous drag deforms
   * smoothly and stays a single undo step. Works for the legacy 2-point + bend
   * form and for multi-point polylines, and carries the stroke dash so a bent
   * dotted arrow stays dotted.
   */
  const applyArrowLineLive = (
    id: string,
    points: number[],
    bendVal: number,
    strokeWidth: number,
    handDrawnStyle: boolean,
    strokeStyle?: string,
  ) => {
    const st = stageRef.current;
    if (!st) return;
    const cache = nodeCacheRef.current;
    let node = cache.get(id);
    if (node && !node.getStage()) { cache.delete(id); node = undefined; }
    if (!node) { node = findAnnotationNode(st, id); if (node) cache.set(id, node); }
    if (!node) return;
    const multi = points.length > 4;
    const basePoints = multi
      ? points
      : renderPoints(points[0] ?? 0, points[1] ?? 0, points[2] ?? 0, points[3] ?? 0, bendVal);
    const drawPoints = handDrawnStyle
      ? handDrawnPolyline(basePoints, id, strokeWidth, 0.2)
      : basePoints;
    const tension = multi
      ? 0
      : (handDrawnStyle ? (bendVal ? 0.45 : 0.2) : (bendVal ? 0.5 : 0));
    const dash = strokeDash(strokeStyle);
    // Label-present arrows render as a Group of multiple shaft segments + 1-2
    // named head triangles (the Konva `Arrow` is single-node only). The old
    // recurse-and-stop-on-first-match path left the heads and the extra
    // segments pointing at the pre-bend geometry, so a bent arrow with a
    // label visibly lost its end and the gap around the label drifted.
    // For that case we re-derive segments + head triangles from the live
    // points and patch each child by name.
    const patchLabelGroup = (group: Konva.Group): boolean => {
      const kids = group.getChildren();
      const shaftKids = kids.filter(
        (k) => k.getClassName() === 'Line' && k.name().startsWith('shaft'),
      );
      if (!shaftKids.length) return false;
      const stStore = useEditorStore.getState();
      const parent = stStore.elements.find((x) => x.id === id) as ArrowElement | undefined;
      const labelEl = parent
        ? (stStore.elements.find(
            (x) => x.type === 'text' && (
              (x as TextElement).containerId === parent.id ||
              (parent.groupId && x.groupId === parent.groupId && isLabelPairGroup(parent.groupId, stStore.elements))
            ),
          ) as TextElement | undefined)
        : undefined;
      // Re-clip the new sampled polyline against the label's current box so
      // the gap moves with the bend. Falls back to drawPoints when the label
      // can't be resolved or the clip empties the stroke.
      let segs: number[][] | null = null;
      if (labelEl) {
        const tb = getElementBounds(labelEl, stStore.imageSize);
        const tightW = Math.max(
          24,
          Math.min(
            tb.w,
            measureTextWidth(labelEl) + (labelEl.padding ?? TEXT_PADDING) * 2,
          ),
        );
        let rectX = tb.x - (parent?.x ?? 0);
        if (labelEl.align === 'center') rectX += (tb.w - tightW) / 2;
        else if (labelEl.align === 'right') rectX += tb.w - tightW;
        const labelRect = {
          x: rectX,
          y: tb.y - (parent?.y ?? 0),
          w: tightW,
          h: Math.max(1, tb.h),
        };
        const clipSource = multi
          ? drawPoints
          : (() => {
              if (!bendVal) return drawPoints;
              const sampled: number[] = [];
              const N = 28;
              const liveEl = { ...(parent as ArrowElement), points, bend: bendVal } as ArrowElement;
              for (let i = 0; i <= N; i++) {
                const p = pointAlongPath(liveEl, i / N);
                sampled.push(p.x, p.y);
              }
              return sampled;
            })();
        let clipped: number[][] = [clipSource];
        for (const r of [labelRect]) {
          clipped = clipped.flatMap((seg) => clipPolylineAgainstRect(seg, r));
          if (!clipped.length) break;
        }
        segs = clipped.length ? clipped : null;
      }
      // Patch each shaft segment in order; show/hide to match segment count.
      if (segs) {
        for (let i = 0; i < shaftKids.length; i++) {
          const seg = segs[i];
          const k = shaftKids[i] as Konva.Line;
          k.visible(true);
          if (seg && seg.length >= 4) k.points(seg);
        }
        for (let i = segs.length; i < shaftKids.length; i++) shaftKids[i].visible(false);
      } else {
        // No label gap to keep: collapse to a single segment drawing the full
        // polyline, hide the rest. Avoids the "shaft disappears" render that
        // happens when an old segment set pointed at a stale position.
        if (shaftKids[0]) {
          (shaftKids[0] as Konva.Line).visible(true);
          (shaftKids[0] as Konva.Line).points(drawPoints);
        }
        for (let i = 1; i < shaftKids.length; i++) shaftKids[i].visible(false);
      }
      // Re-derive head triangles from the live endpoints so the arrowhead
      // follows the curve tangent at the end (the reported "arrow end lost"
      // case: head was frozen at the pre-bend position).
      const headSize =
        parent?.pointerLength ?? Math.max(10, (parent?.strokeWidth || strokeWidth || 2) * 4);
      const newSx = points[0] ?? 0;
      const newSy = points[1] ?? 0;
      const newEx = points[points.length - 2] ?? 0;
      const newEy = points[points.length - 1] ?? 0;
      const endHead = kids.find((k) => k.name() === 'head-end') as Konva.Line | undefined;
      if (endHead) {
        let endTan: { x: number; y: number };
        if (multi) {
          const n = points.length;
          const dx = points[n - 2] - points[n - 4];
          const dy = points[n - 1] - points[n - 3];
          const len = Math.hypot(dx, dy) || 1;
          endTan = { x: dx / len, y: dy / len };
        } else {
          endTan = tangentAtEnd(newSx, newSy, newEx, newEy, bendVal);
        }
        endHead.points(
          arrowHeadPoints(newEx - endTan.x, newEy - endTan.y, newEx, newEy, headSize).flat(),
        );
      }
      const startHead = kids.find((k) => k.name() === 'head-start') as Konva.Line | undefined;
      if (startHead) {
        let startTan: { x: number; y: number };
        if (multi) {
          const dx = points[2] - points[0];
          const dy = points[3] - points[1];
          const len = Math.hypot(dx, dy) || 1;
          startTan = { x: dx / len, y: dy / len };
        } else {
          startTan = tangentAtStart(newSx, newSy, newEx, newEy, bendVal);
        }
        startHead.points(
          arrowHeadPoints(newSx + startTan.x, newSy + startTan.y, newSx, newSy, headSize).flat(),
        );
      }
      return true;
    };
    const patchShaft = (n: Konva.Node): boolean => {
      const cls = n.getClassName();
      if (cls === 'Arrow') {
        n.setAttrs({ points: drawPoints, tension, dash });
        return true;
      }
      if (cls === 'Group') {
        if (patchLabelGroup(n as Konva.Group)) return true;
        const kids = (n as Konva.Group).getChildren();
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i];
          const kc = k.getClassName();
          if (kc === 'Line' || kc === 'Arrow') {
            k.setAttrs({ points: drawPoints, tension, dash });
            return true;
          }
        }
      }
      return false;
    };
    if (node.getAttr(LINEAR_SHAPE_ATTR)) {
      node.setAttr('points', linearShapePoints(points, multi ? 0 : bendVal));
    } else if (!patchShaft(node)) {
      node.setAttrs({ points: drawPoints, tension, dash });
    }
    const stStore = useEditorStore.getState();
    const parent = stStore.elements.find((x) => x.id === id);
    if (parent) {
      reflowLabelRef.current({ ...parent, points, bend: bendVal } as EditorElement);
    }
    node.getLayer()?.batchDraw();
  };

  /**
   * Imperative live binding — the target is mid-gesture (drag/resize/rotate)
   * so its geometry is read from the Konva node, not the store. Every arrow
   * bound to it is re-pointed directly (applyArrowLineLive) and the layer is
   * batch-drawn; the store is untouched until the gesture commits. Arrows
   * moving together with the target (same selection) are skipped here and
   * re-anchored once at commit, so movement is never double-applied.
   */
  const applyLiveBindingsForTarget = (targetId: string, liveTarget: EditorElement) => {
    const st = useEditorStore.getState();
    if (!st.isBindingEnabled) return;
    const skip = st.selectedElementIds.length > 1 ? new Set(st.selectedElementIds) : undefined;
    const updates = computeBoundArrowUpdates(st.elements, targetId, liveTarget, st.imageSize, skip);
    for (const { arrow, points } of updates) {
      applyArrowLineLive(arrow.id, points, arrow.bend ?? 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
    }
  };

  /**
   * Reflow an attached label's Konva node from the LIVE element geometry
   * while its shape is being resized/rotated (the store only hears the final
   * commit, so without this the label sits at the stale spot until release).
   * Rotated container labels render as a Group offset by half the box, so
   * position = anchor + offset; unrotated labels sit at the anchor directly.
   */
  const applyLiveLabelReflow = (liveEl: EditorElement) => {
    const st = useEditorStore.getState();
    // A label's position is owned by its shape; never reflow a text element
    // against its own bounds.
    if (liveEl.type === 'text') return;
    // Prefer the explicit `containerId` binding (set by v2 migration and by
    // `attachText`) so arrows whose label is bound without a `groupId` still
    // reflow. Fall back to the legacy groupId-pair path for v1 projects.
    const labelEl = st.elements.find(
      (x) => x.type === 'text' && (
        (x as TextElement).containerId === liveEl.id ||
        (!!liveEl.groupId && x.groupId === liveEl.groupId && isLabelPairGroup(liveEl.groupId, st.elements))
      ),
    ) as TextElement | undefined;
    if (!labelEl) return;
    const cache = nodeCacheRef.current;
    let node = cache.get(labelEl.id);
    if (node && !node.getStage()) { cache.delete(labelEl.id); node = undefined; }
    if (!node) {
      const stage = stageRef.current;
      node = stage ? findAnnotationNode(stage, labelEl.id) : undefined;
      if (node) cache.set(labelEl.id, node);
    }
    if (!node) return;
    const scale = getImageToolScale(st.imageSize.width, st.imageSize.height);
    const anchor = labelAnchorForElement(liveEl, st.imageSize, labelEl.fontSize ?? 24, scale, labelEl);
    const offX = node.offsetX() || 0;
    const offY = node.offsetY() || 0;
    node.position({ x: anchor.x + offX, y: anchor.y + offY });
  };
  reflowLabelRef.current = applyLiveLabelReflow;

  /** Live pass during a shape resize/rotate: bound arrows + attached label. */
  const handleLiveShapeTransform = (liveEl: EditorElement, node: Konva.Node) => {
    applyLiveBindingsForTarget(liveEl.id, liveElementFromNode(liveEl, node));
    applyLiveLabelReflow(liveEl);
  };

  function renderElement(el: EditorElement, isDraft = false, fadeIds: Set<string> | null = null) {
    const s = useEditorStore.getState();
    const isSelectMode = s.activeTool === 'select' || hoverSelectModeRef.current;
    const isSelected = s.selectedElementIds.includes(el.id);
    const canManipulate = isSelectMode || isSelected;
    const draggable = !isDraft && canManipulate && !el.locked && !s.annotationsLocked;
    const listening = !isDraft;
    const baseProps = {
      id: el.id,
      x: el.x,
      y: el.y,
      // Eraser fade preview: elements under the stroke render at 30% opacity
      // (Excalidraw's pending-erasure fade) without touching the store.
      opacity: (el.opacity ?? 1) * (fadeIds?.has(el.id) ? 0.3 : 1),
      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      draggable: draggable && !el.locked,
      listening,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onTap: ((e: Konva.KonvaEventObject<Event>) => handleSelect(el.id, e as Konva.KonvaEventObject<MouseEvent>)) as any,
      onDragStart: () => {
        draftLayerRef.current?.clearHoverOutline();
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e),
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(el.id, e),
      onTransformEnd: () => handleElementTransformEnd(el.id),
      // Subtle hover feedback: a thin accent outline drawn imperatively on the
      // interaction layer (Excalidraw's hover state). No React, no store.
      onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
        // While the button is held (drag / press) hover feedback is noise:
        // dragging element A should not outline element B underneath.
        if ((e.evt as MouseEvent).buttons) return;
        const st = useEditorStore.getState();
        if (
          st.activeTool === 'hand' || st.activeTool === 'eraser' || st.activeTool === 'crop'
          || marqueeOriginRef.current || isErasingRef.current
          || el.locked
        ) return;
        // Container labels are not their own object — hover the parent shape.
        let hoverEl = el;
        if (el.type === 'text' && el.groupId) {
          const partner = labelPairPartner(el, st.elements);
          if (partner && isClosedShape(partner)) hoverEl = partner;
        }
        if (st.selectedElementIds.includes(hoverEl.id) || st.selectedElementIds.includes(el.id)) return;
        draftLayerRef.current?.showHoverOutline(getElementBounds(hoverEl, st.imageSize));
      },
      onMouseLeave: () => {
        draftLayerRef.current?.clearHoverOutline();
      },
      // Double-click a line body to insert a vertex (polyline editing). On an
      // arrow it opens the label instead (Excalidraw), so arrows are not wired.
      ...((el.type === 'line')
        ? { onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleLineVertexInsert(el as ArrowElement | LineElement, e) }
        : {}),
    };

    /**
     * Binding focus points (Excalidraw's `arrows/focus.ts`): a bound arrow
     * endpoint renders a dashed connector to the normalized attachment point
     * inside its target, and that point is a small draggable circle. Dragging
     * it moves the attachment around the shape; the endpoint follows on the
     * same frame (imperative) and commits one undo step. The dashed line is
     * updated imperatively during the drag so React never runs on the move
     * hot path.
     */
    const dragFocusPoint = (
      linear: ArrowElement | LineElement,
      which: 'start' | 'end',
      b: FixedPointBinding,
      node: Konva.Node,
    ) => {
      const st = useEditorStore.getState();
      const target = st.elements.find((x) => x.id === b.elementId);
      if (!target || !isBindableElement(target)) return;
      const fp = fixedPointFromGlobalPoint(target, node.x(), node.y(), st.imageSize);
      const anchorPt = anchorForBinding(target, fp, b.mode, st.imageSize);
      const eIdx = which === 'start' ? 0 : linear.points.length - 2;
      const newPoints = [...linear.points];
      newPoints[eIdx] = anchorPt.x - linear.x;
      newPoints[eIdx + 1] = anchorPt.y - linear.y;
      applyArrowLineLive(linear.id, focusRouted(linear, newPoints), linear.bend ?? 0, linear.strokeWidth ?? 2, handDrawn, linear.strokeStyle);
      // Keep the dashed connector glued to the pointer on this frame.
      const lineNode = stageRef.current?.findOne(`#focus-line-${linear.id}-${which}`) as Konva.Line | undefined;
      lineNode?.points([newPoints[eIdx] + linear.x, newPoints[eIdx + 1] + linear.y, node.x(), node.y()]);
      lineNode?.getLayer()?.batchDraw();
    };
    /** Re-route an elbowed arrow's interior after a focus-point drag. */
    const focusRouted = (linear: ArrowElement | LineElement, pts: number[]) => {
      if (linear.type !== 'arrow' || !linear.elbowed) return pts;
      const n = pts.length;
      return elbowPointsLocal(
        { x: linear.x, y: linear.y },
        { x: linear.x + pts[0], y: linear.y + pts[1] },
        { x: linear.x + pts[n - 2], y: linear.y + pts[n - 1] },
        headingFromFixedPoint(linear.startBinding?.fixedPoint),
        headingFromFixedPoint(linear.endBinding?.fixedPoint),
      ) as number[];
    };
    const commitFocusPoint = (
      linear: ArrowElement | LineElement,
      which: 'start' | 'end',
      b: FixedPointBinding,
      node: Konva.Node,
    ) => {
      const st = useEditorStore.getState();
      const target = st.elements.find((x) => x.id === b.elementId);
      if (!target || !isBindableElement(target)) return;
      const fp = fixedPointFromGlobalPoint(target, node.x(), node.y(), st.imageSize);
      const anchorPt = anchorForBinding(target, fp, b.mode, st.imageSize);
      const eIdx = which === 'start' ? 0 : linear.points.length - 2;
      const newPoints = [...linear.points];
      newPoints[eIdx] = anchorPt.x - linear.x;
      newPoints[eIdx + 1] = anchorPt.y - linear.y;
      const updates: Partial<ArrowElement> = {
        points: focusRouted(linear, newPoints) as [number, number, number, number],
        ...(which === 'start'
          ? { startBinding: { ...b, fixedPoint: fp } }
          : { endBinding: { ...b, fixedPoint: fp } }),
      };
      commitElementUpdate(linear.id, updates);
    };
    const renderFocusPointUI = (
      linear: ArrowElement | LineElement,
      hoverEvents: ReturnType<typeof handleHoverEvents>,
    ) => {
      if (isDraft || !isSelected) return null;
      const st = useEditorStore.getState();
      const theme = getSelectionTheme();
      const binds: Array<{ which: 'start' | 'end'; b: FixedPointBinding }> = [];
      if (linear.startBinding) binds.push({ which: 'start', b: linear.startBinding });
      if (linear.endBinding) binds.push({ which: 'end', b: linear.endBinding });
      const out: React.ReactNode[] = [];
      for (const { which, b } of binds) {
        const target = st.elements.find((x) => x.id === b.elementId);
        if (!target || !isBindableElement(target)) continue;
        const focus = globalFixedPointForBinding(target, b.fixedPoint, st.imageSize);
        const eIdx = which === 'start' ? 0 : linear.points.length - 2;
        const ep = { x: linear.x + linear.points[eIdx], y: linear.y + linear.points[eIdx + 1] };
        out.push(
          <React.Fragment key={`focus-${which}`}>
            <Line
              id={`focus-line-${linear.id}-${which}`}
              points={[ep.x, ep.y, focus.x, focus.y]}
              stroke={theme.accentDim}
              strokeWidth={1.2}
              dash={[4, 3]}
              listening={false}
              perfectDrawEnabled={false}
            />
            <Circle
              name="edit-handle focus-point-handle"
              x={focus.x}
              y={focus.y}
              radius={4.5}
              fill="rgba(255, 255, 255, 0.92)"
              stroke={theme.accentSoft}
              strokeWidth={1.2}
              hitStrokeWidth={16}
              cursor="grab"
              draggable
              onMouseDown={(e) => handleHandleMouseDown(linear.id, e)}
              onDragMove={(e) => { e.cancelBubble = true; dragFocusPoint(linear, which, b, e.target); }}
              onDragEnd={(e) => { e.cancelBubble = true; commitFocusPoint(linear, which, b, e.target); }}
              {...hoverEvents}
            />
          </React.Fragment>,
        );
      }
      return out.length ? out : null;
    };

    /**
     * Excalidraw-style midpoint ghost handles for multi-point polylines: a
     * quiet dashed handle on every segment midpoint. Dragging one inserts a
     * vertex there and follows the pointer; release commits one history entry.
     * Hand-drawn (jittered) polylines skip the ghosts — their drawn vertices
     * are offset from the raw points, so a ghost would float off the stroke.
     */
    const renderMidGhosts = (el: ArrowElement | LineElement, pts: number[], _handDrawnStyle: boolean) => {
      // Excalidraw shows a midpoint ghost on EVERY segment — drag converts midpoint to vertex.
      // Legacy quadratic bend (bend !==0) keeps bend handle; hand-drawn no longer blocks ghost
      // so straight hand-drawn arrows also bend via vertex (cleaner than scalar bend).
      if (pts.length <= 4 && (el.bend ?? 0) !== 0) return null;
      const ghostProps = midHandleProps();
      const ghostHover = handleHoverEvents();
      const ghosts: { x: number; y: number; seg: number }[] = [];
      for (let i = 0; i < pts.length - 2; i += 2) {
        ghosts.push({
          x: (pts[i] + pts[i + 2]) / 2,
          y: (pts[i + 1] + pts[i + 3]) / 2,
          seg: i / 2,
        });
      }
      return ghosts.map((m, k) => (
        <Circle
          key={`mid-${k}`}
          x={el.x + m.x}
          y={el.y + m.y}
          {...ghostProps}
          name={`edit-handle linear-${el.id}`}
          draggable
          onMouseDown={(e) => handleHandleMouseDown(el.id, e)}
          onDragStart={(e) => {
            e.cancelBubble = true;
            const idx = m.seg * 2 + 2;
            midVertexRef.current = { id: el.id, idx, points: [...pts] };
            const mv = midVertexRef.current;
            mv.points.splice(idx, 0, m.x, m.y);
            applyArrowLineLive(el.id, mv.points, 0, el.strokeWidth ?? 2, false, el.strokeStyle);
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const mv = midVertexRef.current;
            if (!mv || mv.id !== el.id) return;
            mv.points[mv.idx] = e.target.x() - el.x;
            mv.points[mv.idx + 1] = e.target.y() - el.y;
            applyArrowLineLive(el.id, mv.points, 0, el.strokeWidth ?? 2, false, el.strokeStyle);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const mv = midVertexRef.current;
            if (!mv || mv.id !== el.id) return;
            midVertexRef.current = null;
            commitElementUpdate(el.id, {
              points: mv.points as [number, number, number, number],
              // An explicit vertex edit on an elbow converts it to a free
              // polyline — router-owned interior would otherwise overwrite it.
              ...(el.type === 'arrow' && (el as ArrowElement).elbowed ? { elbowed: false } : {}),
            });
          }}
          {...ghostHover}
        />
      ));
    };

    switch (el.type) {
      case 'rectangle':
      case 'rounded-rect': {
        const shape = el as ShapeElement;
        // If element has imageDataURL (pasted image), render as image
        if (shape.imageDataURL) {
          return (
            <CachedKonvaImage
              key={shape.id}
              {...baseProps}
              src={shape.imageDataURL}
              width={shape.width}
              height={shape.height}
              cornerRadius={shape.cornerRadius ?? 0}
            />
          );
        }
        const isCropMarquee = shape.id === '__crop_marquee__';
        if (isCropMarquee) {
          return (
            <Rect
              key={shape.id}
              {...baseProps}
              width={shape.width}
              height={shape.height}
              fill={shape.fill}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              dash={[8, 4]}
              listening={false}
            />
          );
        }
        if (handDrawn) {
          const w = Math.abs(shape.width || 0);
          const h = Math.abs(shape.height || 0);
          return (
            <RoughKonvaShape
              key={shape.id}
              kind="rectangle"
              seed={shape.id}
              id={shape.id}
              x={shape.width < 0 ? shape.x + shape.width : shape.x}
              y={shape.height < 0 ? shape.y + shape.height : shape.y}
              width={w}
              height={h}
              stroke={shape.stroke}
              fill={shape.fill}
              strokeWidth={shape.strokeWidth}
              strokeStyle={shape.strokeStyle}
              fillStyle={shape.fillStyle}
              roughness={shape.roughness ?? 1.25}
              cornerRadius={shape.cornerRadius}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragStart={baseProps.onDragStart}
              onDragMove={baseProps.onDragMove}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Rect
            key={shape.id}
            {...baseProps}
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            cornerRadius={shape.cornerRadius ?? 0}
            dash={shape.strokeStyle === 'dashed' ? [8, 6] : shape.strokeStyle === 'dotted' ? [2, 4] : undefined}
          />
        );
      }

      case 'diamond': {
        const diamond = el as DiamondElement;
        const w = Math.abs(diamond.width || 0);
        const h = Math.abs(diamond.height || 0);
        const x = diamond.width < 0 ? diamond.x + diamond.width : diamond.x;
        const y = diamond.height < 0 ? diamond.y + diamond.height : diamond.y;
        if (handDrawn) {
          return (
            <RoughKonvaShape
              key={diamond.id}
              kind="diamond"
              cornerRadius={diamond.cornerRadius ?? 0}
              seed={diamond.id}
              id={diamond.id}
              x={x}
              y={y}
              width={w}
              height={h}
              stroke={diamond.stroke}
              fill={diamond.fill}
              strokeWidth={diamond.strokeWidth}
              strokeStyle={diamond.strokeStyle}
              fillStyle={diamond.fillStyle}
              roughness={diamond.roughness ?? 1.25}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragStart={baseProps.onDragStart}
              onDragMove={baseProps.onDragMove}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Line
            key={diamond.id}
            {...baseProps}
            x={x}
            y={y}
            points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
            closed
            fill={diamond.fill}
            stroke={diamond.stroke}
            strokeWidth={diamond.strokeWidth}
          />
        );
      }

      case 'spotlight': {
        // Invisible hit area; the dim layer (SpotlightDim) draws the actual
        // effect once for every spotlight, reading this node's live geometry.
        const shape = el as ShapeElement;
        return (
          <Rect
            key={shape.id}
            {...baseProps}
            name="spotlight-hit"
            width={shape.width}
            height={shape.height}
            cornerRadius={Math.min(shape.cornerRadius ?? 0, SPOTLIGHT_RADIUS)}
            fill="transparent"
          />
        );
      }

      case 'blur':
      case 'pixelate': {
        const shape = el as ShapeElement;
        if (isDraft && !shape.imageDataURL) {
          return (
            <Rect
              key={shape.id}
              {...baseProps}
              x={Math.min(shape.x, shape.x + shape.width)}
              y={Math.min(shape.y, shape.y + shape.height)}
              width={Math.abs(shape.width)}
              height={Math.abs(shape.height)}
              fill="rgba(59,130,246,0.1)"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          );
        }
        if (!shape.imageDataURL) return null;
        return (
          <CachedKonvaImage
            key={shape.id}
            {...baseProps}
            src={shape.imageDataURL}
            width={shape.width}
            height={shape.height}
          />
        );
      }

      case 'magnifier': {
        const mag = el as MagnifierElement;
        // Resize is opposite-corner-fixed like a normal ellipse: the corner
        // you are NOT dragging stays put and the source center moves as the
        // bbox grows or shrinks. The top-left comes from the magnifier so
        // both axes land in the same store update.
        // Gap cut in the connecting arrow behind its label, as on an arrow.
        const magLabel = mag.groupId
          ? elements.find((t) => t.type === 'text' && t.id !== mag.id && t.groupId === mag.groupId) as TextElement | undefined
          : undefined;
        const magLabelGap = magLabel
          ? pathLabelClipRect(magLabel, mag, s.imageSize, liveLabel?.id === magLabel.id ? liveLabel.text : undefined)
          : null;
        const resizeToRadii = (
          radii: { rx: number; ry: number; topLeftX: number; topLeftY: number },
          commit: boolean,
        ) => {
          // Resizing the source leaves the bubble where and how big it is.
          const live = (useEditorStore.getState().elements.find((x) => x.id === mag.id) as MagnifierElement | undefined) ?? mag;
          const updates = resizeSourceKeepingBubble(live, {
            x: radii.topLeftX,
            y: radii.topLeftY,
            width: radii.rx * 2,
            height: radii.ry * 2,
          }, imageSize);
          if (commit) commitElementUpdate(mag.id, updates);
          // The handle drag is already frame-coalesced; write straight through
          // (label re-seated too) so the ring tracks the pointer without lag.
          else useEditorStore.getState().updateElementSilent(mag.id, updates as Partial<EditorElement>, true);
        };
        return (
          <MagnifierKonva
            key={mag.id}
            el={mag}
            backgroundImage={backgroundImage}
            imageSize={imageSize}
            selected={isSelected}
            accent={getSelectionTheme().accent}
            opacity={baseProps.opacity}
            listening={baseProps.listening}
            draggable={baseProps.draggable}
            onBubblePress={() => {
              const st = useEditorStore.getState();
              if (!st.selectedElementIds.includes(mag.id)) st.setSelectedElementIds([mag.id]);
            }}
            draft={isDraft}
            handDrawn={handDrawn}
            onClick={baseProps.onClick}
            onTap={baseProps.onTap}
            onDragEnd={baseProps.onDragEnd}
            onDragMove={baseProps.onDragMove}
            onPreviewOffsetMove={(offset) => useEditorStore.getState().updateElementSilent(mag.id, { previewOffset: offset } as Partial<EditorElement>, true)}
            onPreviewOffsetCommit={(offset) => commitElementUpdate(mag.id, { previewOffset: offset })}
            onRadiiMove={(radii) => resizeToRadii(radii, false)}
            onRadiiCommit={(radii) => resizeToRadii(radii, true)}
            onMagnificationMove={(m) => useEditorStore.getState().updateElementSilent(mag.id, { magnification: m } as Partial<EditorElement>, true)}
            onMagnificationCommit={(m) => commitElementUpdate(mag.id, { magnification: m })}
            labelGap={magLabelGap}
            onLeaderBendMove={(bend) => useEditorStore.getState().updateElementSilent(mag.id, { leaderBend: bend } as Partial<EditorElement>, true)}
            onLeaderBendCommit={(bend) => commitElementUpdate(mag.id, { leaderBend: bend })}
          />
        );
      }

      case 'circle': {
        const circle = el as CircleElement;
        const w = Math.abs(circle.width);
        const h = Math.abs(circle.height);
        const x = circle.width < 0 ? circle.x + circle.width : circle.x;
        const y = circle.height < 0 ? circle.y + circle.height : circle.y;
        if (handDrawn) {
          return (
            <RoughKonvaShape
              key={circle.id}
              kind="ellipse"
              seed={circle.id}
              id={circle.id}
              x={x}
              y={y}
              width={w}
              height={h}
              stroke={circle.stroke}
              fill={circle.fill}
              strokeWidth={circle.strokeWidth}
              strokeStyle={circle.strokeStyle}
              fillStyle={circle.fillStyle}
              roughness={circle.roughness ?? 1.25}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragStart={baseProps.onDragStart}
              onDragMove={baseProps.onDragMove}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Ellipse
            key={circle.id}
            {...baseProps}
            x={x + w / 2}
            y={y + h / 2}
            radiusX={Math.max(2.5, w / 2)}
            radiusY={Math.max(2.5, h / 2)}
            fill={circle.fill}
            stroke={circle.stroke}
            strokeWidth={circle.strokeWidth}
            dash={circle.strokeStyle === 'dashed' ? [8, 6] : circle.strokeStyle === 'dotted' ? [2, 4] : undefined}
          />
        );
      }

      case 'arrow': {
        const arrow = el as ArrowElement;
        const [sx, sy, ex, ey] = arrow.points;
        const bend = arrow.bend ?? 0;
        const showHandles = !isDraft && isSelected && selectedElementIds.length === 1;
        const handleProps = { ...selectionHandleProps('endpoint'), name: `edit-handle linear-${arrow.id}` };
        const bendHandleProps = { ...selectionHandleProps('bend'), name: `edit-handle linear-${arrow.id}` };
        const isMulti = arrow.points.length > 4;
        const isElbow = arrow.elbowed === true;
        // Elbow interior vertices are router-owned: no vertex handle (only
        // midpoint ghosts per segment). Free polylines keep the middle handle.
        const showMidVertexHandle = isMulti && !isElbow;
        const multiPoints = isMulti ? arrow.points : [];
        const hoverHandles = handleHoverEvents();
        // Bend handle sits at the LABEL's on-curve anchor when an attached
        // label exists (Excalidraw: the label IS the bend handle). The label
        // gap in the shaft is clipped at this same on-curve position, so the
        // handle and the gap stay glued together. With no label, fall back to
        // the visual curve midpoint (the bezier control point is OFF the
        // curve, so a handle placed there floats in empty space and bends
        // feel detached from the stroke).
        const labelT = elements.find(
          (x) => x.type === 'text' && (
            (x as TextElement).containerId === arrow.id ||
            (!!arrow.groupId && x.groupId === arrow.groupId && isLabelPairGroup(arrow.groupId, elements))
          ),
        ) as TextElement | undefined;
        const bendAnchorT = labelT?.labelOffset ?? 0.5;
        const curveMid = isMulti
          ? { x: (arrow.points[0] + arrow.points[arrow.points.length - 2]) / 2, y: (arrow.points[1] + arrow.points[arrow.points.length - 1]) / 2 }
          : pointAlongPath(arrow, bendAnchorT);

        // Simple 3-dot editing: start, middle (bend), end. In hand-drawn mode
        // the polyline is jittered, so handles must sit on the *drawn* points
        // or the dots visibly float off the line.
        const basePoints = isMulti ? arrow.points : renderPoints(sx, sy, ex, ey, bend);
        // Handles sit on the true points; rough.js wobbles the stroke around them.
        const drawPoints = basePoints;
        const jit: number[] | null = null;
        const offAt = (i: number) => (jit ? jit[i] : 0);

        /** Middle vertex index for multi-point elements (mid handle target). */
        const midVertexIdx = isMulti ? Math.floor(multiPoints.length / 4) * 2 : -1;

        const updatePoint = (idx: number, node: Konva.Node, commit: boolean) => {
          // The handle sits on the drawn point; store the raw point so the
          // drawn vertex stays glued to the pointer through the jitter.
          const localX = node.x() - arrow.x - offAt(idx);
          const localY = node.y() - arrow.y - offAt(idx + 1);
          const newPoints = [...arrow.points];
          newPoints[idx] = localX;
          newPoints[idx + 1] = localY;
          if (commit) commitElementUpdate(arrow.id, { points: newPoints });
          else applyArrowLineLive(arrow.id, newPoints, 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
        };
        const updateBendFromHandle = (node: Konva.Node, commit = false) => {
          // Bend handle lives on the curve at `bendAnchorT` (the label's
          // on-curve position, or the midpoint when no label is attached).
          // `bendFromCurveAt` inverts any on-curve drag back to bend so the
          // handle and the shaft gap stay glued together during the drag.
          const bendVal = bendFromCurveAt(
            sx, sy, ex, ey, bendAnchorT,
            node.x() - arrow.x,
            node.y() - arrow.y,
          );
          if (commit) {
            // A click on the handle without movement fires dragEnd too; do not
            // push a history entry for a bend that never changed. Compare with
            // the live store value: the hand-drawn path may have already
            // written a silent bend on the first move.
            const current = useEditorStore.getState().elements.find((x) => x.id === arrow.id) as ArrowElement | undefined;
            if (bendVal !== (current?.bend ?? 0)) commitElementUpdate(arrow.id, { bend: bendVal });
          } else if (handDrawn) {
            // Rough shapes bake their path at render, so a rough arrow cannot
            // bend live: one silent write switches it to the jittered curve
            // path, after which the drag continues imperatively.
            const live = useEditorStore.getState().elements.find((x) => x.id === arrow.id);
            if (!(live as ArrowElement | undefined)?.bend) {
              throttledSilentUpdate(arrow.id, { bend: bendVal });
            }
            applyArrowLineLive(arrow.id, [sx, sy, ex, ey], bendVal, arrow.strokeWidth ?? 2, true, arrow.strokeStyle);
          } else {
            applyArrowLineLive(arrow.id, [sx, sy, ex, ey], bendVal, arrow.strokeWidth ?? 2, false, arrow.strokeStyle);
          }
        };
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false, forceInside = false, evt?: { shiftKey?: boolean }) => {
          // Copy the points and replace only the dragged endpoint, so multi-point
          // polylines keep their interior vertices instead of collapsing to two.
          const eIdx = which === 'start' ? 0 : arrow.points.length - 2;
          const newPoints = [...arrow.points];
          newPoints[eIdx] = node.x() - arrow.x - offAt(eIdx);
          newPoints[eIdx + 1] = node.y() - arrow.y - offAt(eIdx + 1);
          // Shift locks the dragged endpoint to 15° steps (Excalidraw's
          // SHIFT_LOCKING_ANGLE), on both the live move and the commit.
          if (evt?.shiftKey) {
            // Relative to the neighbouring point, so a bent line locks its last segment.
            const oIdx = which === 'start' ? 2 : newPoints.length - 4;
            const dx = newPoints[eIdx] - newPoints[oIdx];
            const dy = newPoints[eIdx + 1] - newPoints[oIdx + 1];
            const len = Math.hypot(dx, dy);
            if (len > 1e-6) {
              const snappedAngle = Math.round(Math.atan2(dy, dx) / SHIFT_LOCKING_ANGLE) * SHIFT_LOCKING_ANGLE;
              newPoints[eIdx] = newPoints[oIdx] + Math.cos(snappedAngle) * len;
              newPoints[eIdx + 1] = newPoints[oIdx + 1] + Math.sin(snappedAngle) * len;
            }
          }
          // Elbow arrows: the interior is router-owned, so it is re-derived
          // from the (possibly just snapped) endpoints + side headings.
          const routeElbowPoints = (pts: number[]) => {
            if (!arrow.elbowed) return pts;
            const n = pts.length;
            return elbowPointsLocal(
              { x: arrow.x, y: arrow.y },
              { x: arrow.x + pts[0], y: arrow.y + pts[1] },
              { x: arrow.x + pts[n - 2], y: arrow.y + pts[n - 1] },
              headingFromFixedPoint(arrow.startBinding?.fixedPoint),
              headingFromFixedPoint(arrow.endBinding?.fixedPoint),
            ) as number[];
          };
          if (commit) {
            // Drag-to-bind / unbind: release over a shape to bind the dragged
            // endpoint, drag it away (or disable binding) to free it. Alt
            // forces an inside binding even when released near (not in) a shape.
            const st = useEditorStore.getState();
            const binding = st.isBindingEnabled
              ? resolveEndpointBinding({ ...arrow, points: newPoints as [number, number, number, number] }, which, st.elements, st.imageSize, st.zoom, { forceInside })
              : null;
            // Snap the dragged endpoint onto the target's outline right away
            // so the arrowhead lands on the edge, not where it was released.
            if (binding) {
              const targetEl = st.elements.find((el) => el.id === binding.elementId);
              if (targetEl && isBindableElement(targetEl)) {
                const anchor = anchorForBinding(targetEl, binding.fixedPoint, binding.mode, st.imageSize);
                newPoints[eIdx] = anchor.x - arrow.x;
                newPoints[eIdx + 1] = anchor.y - arrow.y;
              }
            }
            const finalPoints = routeElbowPoints(newPoints);
            const updates: Partial<ArrowElement> = {
              points: finalPoints as [number, number, number, number],
              bend: arrow.bend ?? 0,
            };
            if (which === 'start') updates.startBinding = binding;
            else updates.endBinding = binding;
            draftLayerRef.current?.clearBindingPreview();
            commitElementUpdate(arrow.id, updates);
          } else {
            const st = useEditorStore.getState();
            const bsnap = snapEndpointForBinding(
              { ...arrow, points: newPoints as [number, number, number, number] } as ArrowElement,
              which, newPoints, st.elements, st.imageSize, st.zoom, st.isBindingEnabled,
            );
            if (bsnap.preview) {
              draftLayerRef.current?.showBindingPreview(bsnap.preview, getSelectionTheme().accent, st.zoom);
              applyArrowLineLive(arrow.id, routeElbowPoints(bsnap.points), arrow.bend ?? 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
            } else {
              draftLayerRef.current?.clearBindingPreview();
              applyArrowLineLive(arrow.id, routeElbowPoints(newPoints), arrow.bend ?? 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
            }
          }
        };


        // Gap only for text actually bound to this arrow (groupId + pair).
        // Free "test" near the arrow should not cut the line — otherwise the
        // arrow shaft disappears leaving only the head (the "fucked up" in screenshot).
        const candidateRects: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const t of elements) {
          if (t.type !== 'text') continue;
          if (!t.groupId || t.groupId !== arrow.groupId) continue;
          if (!isLabelPairGroup(t.groupId, elements)) continue;
          const r = pathLabelClipRect(t as TextElement, arrow, s.imageSize, liveLabel?.id === t.id ? liveLabel.text : undefined);
          if (r) candidateRects.push(r);
        }
        return (
          <React.Fragment key={arrow.id}>
            <LinearKonvaShape
              {...baseProps}
              points={linearShapePoints(arrow.points, bend)}
              clipRects={candidateRects}
              seed={arrow.id}
              stroke={arrow.stroke}
              strokeWidth={arrow.strokeWidth}
              strokeStyle={arrow.strokeStyle}
              roughness={arrow.roughness ?? 1}
              arrowType={linearArrowType(arrow)}
              startArrowhead={arrow.startArrowhead ?? 'none'}
              endArrowhead={arrow.endArrowhead ?? 'arrow'}
            />
            {showHandles && (
              <>
                <Circle x={arrow.x + drawPoints[0]} y={arrow.y + drawPoints[1]} {...handleProps} draggable
                  onMouseDown={(e) => handleHandleMouseDown(arrow.id, e)}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false, false, e.evt); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true, e.evt.altKey, e.evt); }}
                  {...hoverHandles}
                />
                {showMidVertexHandle ? (
                  // Free multi-point polylines keep the middle vertex handle
                  // (drag moves it, double-click DELETES it — Excalidraw's
                  // point deletion) plus midpoint ghost handles: drag one to
                  // insert a new vertex and bend the polyline there. Elbow
                  // arrows skip the vertex handle entirely: their interior is
                  // router-owned, so only per-segment midpoint ghosts show.
                  <>
                    <Circle x={arrow.x + drawPoints[midVertexIdx]}
                      y={arrow.y + drawPoints[midVertexIdx + 1]}
                      {...bendHandleProps} draggable
                      name={`edit-handle mid-vertex-handle linear-${arrow.id}`}
                      onMouseDown={(e) => handleHandleMouseDown(arrow.id, e)}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        const removed = removeVertexAt(arrow, midVertexIdx);
                        if (removed) {
                          commitElementUpdate(arrow.id, { points: removed as [number, number, number, number] });
                        }
                      }}
                      onDragMove={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, false); }}
                      onDragEnd={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, true); }}
                      {...hoverHandles}
                    />
                    {renderMidGhosts(arrow, multiPoints, handDrawn)}
                  </>
                ) : isMulti ? (
                  renderMidGhosts(arrow, multiPoints, handDrawn)
                ) : (bend !== 0) ? (
                  // Legacy curved arrows (bend !== 0) and hand-drawn arrows
                  // keep the quadratic bend handle; straight 2-point arrows
                  // get the Excalidraw midpoint ghost instead (drag converts
                  // the midpoint into a real vertex).
                  <Circle x={arrow.x + curveMid.x}
                    y={arrow.y + curveMid.y}
                    {...bendHandleProps} draggable
                    onMouseDown={(e) => handleHandleMouseDown(arrow.id, e)}
                    onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
                    {...hoverHandles}
                  />
                ) : (
                  renderMidGhosts(arrow, arrow.points, false)
                )}
                <Circle x={arrow.x + drawPoints[drawPoints.length - 2]}
                  y={arrow.y + drawPoints[drawPoints.length - 1]}
                  {...handleProps} draggable
                  onMouseDown={(e) => handleHandleMouseDown(arrow.id, e)}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false, false, e.evt); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true, e.evt.altKey, e.evt); }}
                  {...hoverHandles}
                />
              </>
            )}
            {showHandles && renderFocusPointUI(arrow, hoverHandles)}
          </React.Fragment>
        );
      }

      case 'line': {
        const line = el as LineElement;
        const [sx, sy, ex, ey] = line.points;
        const bend = line.bend ?? 0;
        const showHandles = !isDraft && isSelected && selectedElementIds.length === 1;
        const handleProps = { ...selectionHandleProps('endpoint'), name: `edit-handle linear-${line.id}` };
        const bendHandleProps = { ...selectionHandleProps('bend'), name: `edit-handle linear-${line.id}` };
        const isMulti = line.points.length > 4;
        // Bend handle sits at the LABEL's on-curve anchor when a label is
        // attached, so the handle and the shaft gap stay glued together.
        // No label → fall back to the visual curve midpoint.
        const labelT = elements.find(
          (x) => x.type === 'text' && (
            (x as TextElement).containerId === line.id ||
            (!!line.groupId && x.groupId === line.groupId && isLabelPairGroup(line.groupId, elements))
          ),
        ) as TextElement | undefined;
        const bendAnchorT = labelT?.labelOffset ?? 0.5;
        const curveMid = isMulti
          ? { x: (line.points[0] + line.points[line.points.length - 2]) / 2, y: (line.points[1] + line.points[line.points.length - 1]) / 2 }
          : pointAlongPath(line, bendAnchorT);
        const multiPoints = isMulti ? line.points : [];
        const hoverHandles = handleHoverEvents();

        // Simple 3-dot editing: start, middle (bend), end. In hand-drawn mode
        // the polyline is jittered, so handles must sit on the *drawn* points
        // or the dots visibly float off the line.
        const basePoints = isMulti ? line.points : renderPoints(sx, sy, ex, ey, bend);
        // Handles sit on the true points; rough.js wobbles the stroke around them.
        const drawPoints = basePoints;
        const jit: number[] | null = null;
        const offAt = (i: number) => (jit ? jit[i] : 0);

        /** Middle vertex index for multi-point elements (mid handle target). */
        const midVertexIdx = isMulti ? Math.floor(multiPoints.length / 4) * 2 : -1;

        const updatePoint = (idx: number, node: Konva.Node, commit: boolean) => {
          // The handle sits on the drawn point; store the raw point so the
          // drawn vertex stays glued to the pointer through the jitter.
          const localX = node.x() - line.x - offAt(idx);
          const localY = node.y() - line.y - offAt(idx + 1);
          const newPoints = [...line.points];
          newPoints[idx] = localX;
          newPoints[idx + 1] = localY;
          if (commit) commitElementUpdate(line.id, { points: newPoints });
          else applyArrowLineLive(line.id, newPoints, 0, line.strokeWidth ?? 2, handDrawn, line.strokeStyle);
        };
        const updateBendFromHandle = (node: Konva.Node, commit = false) => {
          // Handle sits on the curve at the label's on-curve anchor.
          // `bendFromCurveAt` inverts any on-curve drag back to bend.
          const bendVal = bendFromCurveAt(
            sx, sy, ex, ey, bendAnchorT,
            node.x() - line.x,
            node.y() - line.y,
          );
          if (commit) {
            const current = useEditorStore.getState().elements.find((x) => x.id === line.id) as LineElement | undefined;
            if (bendVal !== (current?.bend ?? 0)) commitElementUpdate(line.id, { bend: bendVal });
          } else if (handDrawn) {
            const live = useEditorStore.getState().elements.find((x) => x.id === line.id);
            if (!(live as LineElement | undefined)?.bend) {
              throttledSilentUpdate(line.id, { bend: bendVal });
            }
            applyArrowLineLive(line.id, [sx, sy, ex, ey], bendVal, line.strokeWidth ?? 2, true, line.strokeStyle);
          } else {
            applyArrowLineLive(line.id, [sx, sy, ex, ey], bendVal, line.strokeWidth ?? 2, false, line.strokeStyle);
          }
        };
        const bendHandle = showHandles && !isMulti ? (
          <Circle
            x={line.x + curveMid.x}
            y={line.y + curveMid.y}
            {...bendHandleProps} draggable
            onMouseDown={(e) => handleHandleMouseDown(line.id, e)}
            onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
            onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
            {...hoverHandles}
          />
        ) : null;
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false, forceInside = false, evt?: { shiftKey?: boolean }) => {
          // Copy the points and replace only the dragged endpoint, so multi-point
          // polylines keep their interior vertices instead of collapsing to two.
          const eIdx = which === 'start' ? 0 : line.points.length - 2;
          const newPoints = [...line.points];
          newPoints[eIdx] = node.x() - line.x - offAt(eIdx);
          newPoints[eIdx + 1] = node.y() - line.y - offAt(eIdx + 1);
          // Shift locks the dragged endpoint to 15° steps (Excalidraw's
          // SHIFT_LOCKING_ANGLE), on both the live move and the commit.
          if (evt?.shiftKey) {
            // Relative to the neighbouring point, so a bent line locks its last segment.
            const oIdx = which === 'start' ? 2 : newPoints.length - 4;
            const dx = newPoints[eIdx] - newPoints[oIdx];
            const dy = newPoints[eIdx + 1] - newPoints[oIdx + 1];
            const len = Math.hypot(dx, dy);
            if (len > 1e-6) {
              const snappedAngle = Math.round(Math.atan2(dy, dx) / SHIFT_LOCKING_ANGLE) * SHIFT_LOCKING_ANGLE;
              newPoints[eIdx] = newPoints[oIdx] + Math.cos(snappedAngle) * len;
              newPoints[eIdx + 1] = newPoints[oIdx + 1] + Math.sin(snappedAngle) * len;
            }
          }
          if (commit) {
            // Drag-to-bind / unbind: release over a shape to bind the dragged
            // endpoint, drag it away (or disable binding) to free it. Alt
            // forces an inside binding even when released near (not in) a shape.
            const st = useEditorStore.getState();
            const binding = st.isBindingEnabled
              ? resolveEndpointBinding({ ...line, points: newPoints as [number, number, number, number] }, which, st.elements, st.imageSize, st.zoom, { forceInside })
              : null;
            // Snap the dragged endpoint onto the target's outline right away
            // so the arrowhead lands on the edge, not where it was released.
            if (binding) {
              const targetEl = st.elements.find((el) => el.id === binding.elementId);
              if (targetEl && isBindableElement(targetEl)) {
                const anchor = anchorForBinding(targetEl, binding.fixedPoint, binding.mode, st.imageSize);
                newPoints[eIdx] = anchor.x - line.x;
                newPoints[eIdx + 1] = anchor.y - line.y;
              }
            }
            const updates: Partial<LineElement> = {
              points: newPoints as [number, number, number, number],
            };
            if (which === 'start') updates.startBinding = binding;
            else updates.endBinding = binding;
            draftLayerRef.current?.clearBindingPreview();
            commitElementUpdate(line.id, updates);
          } else {
            const st = useEditorStore.getState();
            const bsnap = snapEndpointForBinding(
              { ...line, points: newPoints as [number, number, number, number] } as LineElement,
              which, newPoints, st.elements, st.imageSize, st.zoom, st.isBindingEnabled,
            );
            if (bsnap.preview) {
              draftLayerRef.current?.showBindingPreview(bsnap.preview, getSelectionTheme().accent, st.zoom);
              applyArrowLineLive(line.id, bsnap.points, line.bend ?? 0, line.strokeWidth ?? 2, handDrawn, line.strokeStyle);
            } else {
              draftLayerRef.current?.clearBindingPreview();
              applyArrowLineLive(line.id, newPoints, line.bend ?? 0, line.strokeWidth ?? 2, handDrawn, line.strokeStyle);
            }
          }
        };

        // Gap only for bound label (groupId pair), not any nearby free text.
        const lineCandidateRects: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const t of elements) {
          if (t.type !== 'text') continue;
          if (!t.groupId || t.groupId !== line.groupId) continue;
          if (!isLabelPairGroup(t.groupId, elements)) continue;
          const r = pathLabelClipRect(t as TextElement, line, s.imageSize, liveLabel?.id === t.id ? liveLabel.text : undefined);
          if (r) lineCandidateRects.push(r);
        }
        return (
          <React.Fragment key={line.id}>
            <LinearKonvaShape
              {...baseProps}
              points={linearShapePoints(line.points, bend)}
              clipRects={lineCandidateRects}
              seed={line.id}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              strokeStyle={line.strokeStyle}
              roughness={line.roughness ?? 1}
              arrowType={linearArrowType(line)}
              // Lines never draw heads; older lines may carry stale arrowhead fields.
              startArrowhead="none"
              endArrowhead="none"
            />
            {showHandles && (
              <>
                <Circle x={line.x + drawPoints[0]} y={line.y + drawPoints[1]} {...handleProps} draggable
                  onMouseDown={(e) => handleHandleMouseDown(line.id, e)}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false, false, e.evt); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true, e.evt.altKey, e.evt); }}
                  {...hoverHandles}
                />
                {isMulti ? (
                  <>
                    <Circle x={line.x + drawPoints[midVertexIdx]}
                      y={line.y + drawPoints[midVertexIdx + 1]}
                      {...bendHandleProps} draggable
                      name={`edit-handle mid-vertex-handle linear-${line.id}`}
                      onMouseDown={(e) => handleHandleMouseDown(line.id, e)}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        const removed = removeVertexAt(line, midVertexIdx);
                        if (removed) {
                          commitElementUpdate(line.id, { points: removed as [number, number, number, number] });
                        }
                      }}
                      onDragMove={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, false); }}
                      onDragEnd={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, true); }}
                      {...hoverHandles}
                    />
                    {renderMidGhosts(line, multiPoints, handDrawn)}
                  </>
                ) : (bend !== 0) ? (
                  // Legacy curved lines and hand-drawn lines keep the quadratic
                  // bend handle; straight 2-point lines get the Excalidraw
                  // midpoint ghost instead (drag converts it to a vertex).
                  bendHandle
                ) : (
                  renderMidGhosts(line, line.points, false)
                )}
                <Circle x={line.x + drawPoints[drawPoints.length - 2]}
                  y={line.y + drawPoints[drawPoints.length - 1]}
                  {...handleProps} draggable
                  onMouseDown={(e) => handleHandleMouseDown(line.id, e)}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false, false, e.evt); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true, e.evt.altKey, e.evt); }}
                  {...hoverHandles}
                />
              </>
            )}
            {showHandles && renderFocusPointUI(line, hoverHandles)}
          </React.Fragment>
        );
      }

      case 'pencil':
      case 'highlighter': {
        const pencil = el as PencilElement;
        // The stroke renders as a smooth filled outline (perfect-freehand)
        // instead of a raw polyline, so it looks fluid at any zoom. A
        // transparent fat stroke keeps the hit area forgiving without
        // drawing a second visible edge.
        const outline = freehandOutline(pencil.points, pencil.type, pencil.strokeWidth ?? 3, {
          pressures: pencil.pressures,
          simulatePressure: pencil.simulatePressure,
        });
        if (!(isSelected && !isDraft)) {
          return (
            <Line
              key={pencil.id}
              {...baseProps}
              points={outline}
              closed
              fill={pencil.stroke}
              stroke="transparent"
              strokeWidth={0.01}
              hitStrokeWidth={20}
              lineCap="round"
              lineJoin="round"
            />
          );
        }
        // Path-aware selection (Excalidraw): the selected stroke is indicated
        // by a thin dashed outline that hugs the perfect-freehand geometry —
        // no bounding rectangle. Stroke and outline share one Group, so they
        // move (and drag) together. Resize/rotate are intentionally not
        // offered for freehand (the outline is the stroke itself).
        return (
          <Group key={pencil.id} {...baseProps}>
            <Line
              points={outline}
              closed
              fill={pencil.stroke}
              stroke="transparent"
              strokeWidth={0.01}
              hitStrokeWidth={20}
              lineCap="round"
              lineJoin="round"
            />
          </Group>
        );
      }

      case 'text': {
        const textEl = el as TextElement;
        // Hide while editing in the textarea overlay
        if (textInput.visible && textInput.editId === textEl.id) return null;
        // Attached labels: the box is the shape's inner box (height set), so
        // verticalAlign places the block top/middle/bottom inside the shape.
        // Container text rotates with its shape, so spin around the box center
        // (a Group at the center + offset Text) rather than the top-left.
        const isAttached = !!textEl.groupId;
        const hasRotation = isAttached && (textEl.rotation ?? 0) !== 0;
        // Undefined width: Konva Text auto-sizes to the natural line width
        // and wrap falls through to 'none' below, so fresh captions render on
        // a single line until the user drags a side handle to add wrap.
        // Undefined height: same idea vertically — auto-size until the user
        // drags a top/bottom handle or a corner.
        const rawBoxW = textEl.width;
        const rawBoxH: number | undefined = isAttached
          ? (textEl.height ??
            (textEl.fontSize ?? 24) * TEXT_LINE_HEIGHT +
              (textEl.padding ?? TEXT_PADDING) * 2)
          : textEl.height;
        // The shape this label is attached to (same groupId, different id).
        const parentEl = isAttached
          ? elements.find((x) => x.id !== textEl.id && x.groupId === textEl.groupId)
          : undefined;
        const isPathLabel =
          !!parentEl && (parentEl.type === 'arrow' || parentEl.type === 'line' || parentEl.type === 'magnifier');
        // For path labels, use tight width so arrow remains grabbable outside the text
        const renderBoxW = isPathLabel
          ? Math.max(24, Math.min(rawBoxW ?? 0, measureTextWidth(textEl) + (textEl.padding ?? TEXT_PADDING) * 2))
          : rawBoxW;
        const renderBoxH = rawBoxH;
        const textOffsetX = isPathLabel ? ((rawBoxW ?? 0) - (renderBoxW ?? 0)) / 2 : 0;
        // boxW/boxH drive the rotation pivot below, which only fires for
        // attached text (always created with an explicit width). Keep them
        // numeric so the math is type-safe.
        const boxW = rawBoxW ?? 0;
        const boxH = rawBoxH;

        // Clicking a closed-shape label selects the container. Clicking an
        // arrow/line label selects the label so it can slide on the path.
        const selectLabel = (e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          handleSelect(textEl.id, e);
        };

        // Path labels get a tight dashed box only when the label itself is
        // selected. Closed-shape labels never show their own chrome.
        // Excalidraw draws no frame around an arrow's label.
        const showLabelBox = false;
        const labelBoxH = isPathLabel
          ? ((textEl.fontSize ?? 24) * TEXT_LINE_HEIGHT + (textEl.padding ?? TEXT_PADDING) * 2)
          : boxH;
        const labelBox = showLabelBox ? (
          <Rect
            x={isPathLabel ? textOffsetX : 0}
            y={0}
            width={isPathLabel ? renderBoxW : boxW}
            height={labelBoxH}
            stroke={isSelected ? getSelectionTheme().accent : getSelectionTheme().accentDim}
            strokeWidth={1}
            dash={[3, 2]}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : null;

        const textNode = (
          <Text
            x={textOffsetX}
            text={textEl.text}
            fontSize={textEl.fontSize ?? 24}
            fontFamily={fontFamilyForCanvas(textEl.fontFamily)}
            fontStyle={textEl.fontStyle}
            fill={textEl.fill ?? '#000000'}
            stroke={textEl.stroke}
            strokeWidth={textEl.strokeWidth}
            padding={textEl.padding ?? TEXT_PADDING}
            lineHeight={textEl.lineHeight ?? TEXT_LINE_HEIGHT}
            width={renderBoxW}
            height={renderBoxH}
            wrap={renderBoxW ? 'word' : 'none'}
            align={textEl.align ?? 'left'}
            verticalAlign={
              isAttached
                ? (textEl.verticalAlign ?? 'middle')
                : textEl.height
                  ? 'top'
                  : undefined
            }
            listening={true}
            onDblClick={(e) => handleTextDblClick(textEl, e)}
            onDblTap={(e) => handleTextDblClick(textEl, e)}
          />
        );
        // Path labels drag along the stroke; shape labels are fixed inside
        // their shape (the shape moves them); free text drags freely.
        // For container text (rectangle/ellipse with centered text), dragging
        // the text should drag the whole shape+text as one (Excalidraw).
        // The text hit area otherwise blocks the shape's drag and feels "struggle".
        const groupProps: Record<string, unknown> = {
          ...baseProps,
          onClick: selectLabel,
          onTap: selectLabel as any,
        };
        if (isAttached && parentEl && (isClosedShape(parentEl) || isPathLabel)) {
          // Letters are not their own object: click selects the shape, drag
          // moves the pair via the parent node.
          groupProps.draggable = false;
          groupProps.onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
            // Selection tool, or a drawing tool borrowing it over this drawing.
            if (useEditorStore.getState().activeTool !== 'select' && !hoverSelectModeRef.current) return;
            e.cancelBubble = true;
            handleSelect(parentEl.id, e);
            const stage = stageRef.current;
            const parentNode = stage ? findAnnotationNode(stage, parentEl.id) : undefined;
            if (!parentNode || parentEl.locked || useEditorStore.getState().annotationsLocked) return;
            // Hand the drag to the shape only once the pointer really moves
            // with the button held. Starting it on press left a plain click
            // with a live drag that followed the mouse after release.
            const from = { x: e.evt.clientX, y: e.evt.clientY };
            const stop = () => {
              window.removeEventListener('mousemove', move);
              window.removeEventListener('mouseup', stop);
            };
            const move = (ev: MouseEvent) => {
              if (!(ev.buttons & 1)) { stop(); return; }
              if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 3) return;
              stop();
              const stageNow = parentNode.getStage();
              if (!stageNow) return;
              // Carry the distance already travelled into the drag, so the
              // shape tracks the pointer 1:1 from the press point.
              stageNow.setPointersPositions(ev);
              const abs = parentNode.absolutePosition();
              parentNode.absolutePosition({ x: abs.x + ev.clientX - from.x, y: abs.y + ev.clientY - from.y });
              parentNode.startDrag();
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', stop);
          };
        }
        // Excalidraw: on a selected arrow the midpoint handle sits on the label
        // and wins the pointer, so the arrow can still be bent.
        if (isPathLabel && parentEl && selectedElementIds.length === 1 && selectedElementIds[0] === parentEl.id) {
          groupProps.listening = false;
        }
        if (!hasRotation) {
          return <Group key={textEl.id} {...groupProps}>{labelBox}{textNode}</Group>;
        }
        // Rotated container text: Group at the box center, Text offset by half
        // the box so rotation spins around the center (same pivot as the shape).
        return (
          <Group
            key={textEl.id}
            {...groupProps}
            x={textEl.x + boxW / 2}
            y={textEl.y + (boxH ?? 0) / 2}
            offsetX={boxW / 2}
            offsetY={(boxH ?? 0) / 2}
            rotation={textEl.rotation ?? 0}
          >
            {labelBox}
            {textNode}
          </Group>
        );
      }

      case 'step': {
        const step = el as StepElement;
        const r = step.radius ?? 16;
        const fs = step.fontSize ?? Math.round(r * 0.8);
        // ponytail: the finger sits outside the badge's bounds, so the selection
        // frame hugs the badge only; widen step bounds if that reads wrong.
        const fb = step.pointer ? stepFingerBox(step.pointer, r) : null;
        const finger = fb && (
          <Text
            text={step.pointer}
            // Twice the box width: Konva drops a glyph wider than its box.
            x={fb.x - fb.size / 2}
            y={fb.y}
            width={fb.size * 2}
            height={fb.size}
            fontSize={fb.size * 0.8}
            align="center"
            verticalAlign="middle"
            wrap="none"
            fill="#000000"
          />
        );
        if (handDrawn) {
          const points = handDrawnEllipsePoints(r, r, step.id, 2, 24);
          return (
            <Group key={step.id} {...baseProps} listening={true}>
              <Line
                points={points}
                closed
                fill={step.fill ?? '#ef4444'}
                stroke="#ffffff"
                strokeWidth={2}
                tension={0.15}
                lineJoin="round"
              />
              <Text
                text={String(step.stepNumber)}
                fontSize={fs}
                fontFamily={BADGE_FONT}
                fontStyle="bold"
                fill="#ffffff"
                align="center"
                verticalAlign="middle"
                width={r * 2}
                height={r * 2}
                offsetX={r}
                offsetY={r}
              />
              {finger}
            </Group>
          );
        }
        return (
          <Group key={step.id} {...baseProps} listening={true}>
            <Circle
              radius={r}
              fill={step.fill ?? '#ef4444'}
              stroke="#ffffff"
              strokeWidth={2}
              hitFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.arc(0, 0, r + 4, 0, Math.PI * 2, false);
                ctx.closePath();
                ctx.fillStrokeShape(shape);
              }}
            />
            <Text
              text={String(step.stepNumber)}
              fontSize={fs}
              fontFamily={BADGE_FONT}
              fontStyle="bold"
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              width={r * 2}
              height={r * 2}
              offsetX={r}
              offsetY={r}
            />
            {finger}
          </Group>
        );
      }

      case 'callout': {
        const co = el as CalloutElement;
        return (
          <CalloutKonvaShape
            key={co.id}
            {...baseProps}
            width={Math.max(1, Math.abs(co.width))}
            height={Math.max(1, Math.abs(co.height))}
            tip={calloutTipOf(co)}
            pointerWidth={co.pointerWidth ?? 20}
            cornerRadius={co.cornerRadius ?? 12}
            seed={co.id}
            stroke={co.stroke ?? '#1e1e1e'}
            // A speech bubble needs a body to be read over a screenshot, so
            // "no background" draws as paper white here. Kept out of the
            // element so it never leaks into the next shape's settings.
            fill={!co.fill || co.fill === 'transparent' ? '#ffffff' : co.fill}
            fillStyle={!co.fill || co.fill === 'transparent' ? 'solid' : co.fillStyle}
            strokeWidth={co.strokeWidth ?? 2}
            strokeStyle={co.strokeStyle}
            roughness={co.roughness}
          />
        );
      }

      default:
        return null;
    }
  }

  // Premium selection chrome follows theme tokens
  const selectionTheme = useMemo(() => getSelectionTheme(), [activeTool, selectedElementIds]);

  // Style transformer anchors when theme changes
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    tr.anchorStyleFunc(styleSelectionAnchor);
    tr.getLayer()?.batchDraw();
  }, [selectionTheme, selectedElementIds]);
  const bgFill = useMemo(() => {
    const cs = canvasStyle;
    if (cs.bgStyle === 'solid') return cs.bgColor || '#ffffff';
    if (cs.bgStyle === 'glass') return '#f0f0f0';
    if (cs.bgStyle === 'gradient') return undefined; // handled via linear gradient props
    if (cs.padding > 0) return 'transparent';
    return undefined;
  }, [canvasStyle.bgStyle, canvasStyle.bgColor, canvasStyle.padding]);

  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const contentPad = canvasStyle.padding || 0;
  // Device chrome extends the frame beyond the image + padding (live ≈ export).
  const frameInsets = DEVICE_FRAME_INSETS[canvasStyle.deviceFrame];
  const contentOffsetX = contentPad + frameInsets.left;
  const contentOffsetY = contentPad + frameInsets.top;
  const frameW = (imageSize.width || 0) + contentPad * 2 + frameInsets.left + frameInsets.right;
  const frameH = (imageSize.height || 0) + contentPad * 2 + frameInsets.top + frameInsets.bottom;
  const showFrame = !!backgroundImage && (contentPad > 0 || canvasStyle.bgStyle !== 'none' || canvasStyle.shadowEnabled || canvasStyle.borderRadius > 0 || canvasStyle.deviceFrame !== 'none');
  const frameInner = { x: contentOffsetX, y: contentOffsetY, w: imageSize.width || 0, h: imageSize.height || 0 };

  // Get current zoom/position for textarea positioning using fresh values
  const currentZoom = useEditorStore((s) => s.zoom);
  const currentStagePos = useEditorStore((s) => s.stagePosition);

  /**
   * Committed annotations are memoized as a unit: element objects are
   * immutable (Zustand replaces only the changed one), so this list is only
   * rebuilt when something the render actually reads changes. Zoom/pan,
   * drawing, dragging, marquee and eraser never touch these deps, so those
   * interactions do not reconcile (or redraw) any committed annotation.
   * Selection/tool changes still rebuild — they alter draggable/listening.
   */
  /**
   * Keep every interaction handle screen-sized regardless of zoom (Excalidraw's
   * zoom-invariant grab points): `.edit-handle` nodes (line/arrow endpoint +
   * bend + midpoint ghost handles, magnifier handles) are counter-scaled by
   * 1/zoom, and the Transformer is pushed through an update so its zoom-aware
   * anchorStyleFunc re-runs. Runs via useLayoutEffect so newly-attached
   * handles are corrected before the browser paints the frame. Konva Circle
   * geometry is centered on the node origin, so scaling a handle keeps it
   * glued to its endpoint while the visual radius and hit area stay
   * screen-constant.
   */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const z = zoom > 0 ? zoom : 1;
    let changed = false;
    stage.find('.edit-handle').forEach((node) => {
      const base = (node.getAttr('handleBaseScale') as number | undefined) ?? 1;
      if (base !== 1 / z) {
        node.setAttr('handleBaseScale', 1 / z);
        node.scale({ x: 1 / z, y: 1 / z });
        changed = true;
      }
    });
    transformerRef.current?.update();
    if (changed) stage.batchDraw();
  }, [zoom, selectedElementIds]);

  // Custom shape selection overlay: a single selected box-shaped annotation
  // (rectangle/rounded-rect/circle/diamond/step) is edited through its own
  // dashed-outline overlay instead of the generic Konva Transformer. Text and
  // multi-selection keep the Transformer (Excalidraw also uses a combined box
  // for multi-select).
  const shapeOverlayEl = (() => {
    if (selectedElementIds.length !== 1) return null;
    const sole = elements.find((e) => e.id === selectedElementIds[0]);
    if (!sole || sole.locked) return null;
    if (!isShapeOverlayType(sole.type)) return null;
    // Hide while its label is being edited in the textarea.
    if (textInput.visible && textInput.editId === sole.id) return null;
    return sole;
  })();

  // One shared dim layer for every spotlight; the strongest dim wins.
  const spotlightDim = elements.reduce<number | null>(
    (m, el) => (el.type === 'spotlight' ? Math.max(m ?? 0, (el as ShapeElement).dim ?? 0.55) : m),
    null,
  );

  // The dim sits above the drawings, so selection chrome is lifted back over it.
  useLayoutEffect(() => {
    if (spotlightDim === null) return;
    annotationLayerRef.current?.find('.edit-handle').forEach((n) => n.moveToTop());
    transformerRef.current?.moveToTop();
  });

  const annotationNodes = useMemo(
    () => elements.map((el) => renderElement(el, false, null)),
    [
      elements, handDrawn, annotationsLocked, textInput, liveLabel, imageSize,
      backgroundImage, selectedElementIds, activeTool, hoverSelectMode,
    ],
  );

  return (
    <div
      ref={containerRef}
      data-snapty-canvas
      role="application"
      aria-label="Screenshot editor"
      aria-roledescription="annotation surface"
      className={`relative w-full h-full overflow-hidden z-0 ${dragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      style={{
        cursor: cursorCSS,
      }}
      onContextMenu={(e) => {
        // Slice A: per-element right-click menu. If the right-click hits an
        // annotation, open the shape menu and suppress the canvas menu.
        const stage = stageRef.current;
        if (!stage) return;
        // This is a DOM event: its target is the canvas element, so hit-test
        // the stage at the pointer for the Konva node.
        stage.setPointersPositions(e.nativeEvent);
        const pointer = stage.getPointerPosition();
        const hit = pointer ? stage.getIntersection(pointer) : null;
        const targetId = hit ? findAnnotationId(hit) : null;
        if (targetId) {
          e.preventDefault();
          e.stopPropagation();
          setShapeMenu({ id: targetId, pos: { x: e.clientX, y: e.clientY } });
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) loadDroppedImage(file);
      }}
    >
      {/* Workspace dots follow the same toggle as the exported in-image grid */}
      <div className={cn('absolute inset-0 bg-canvas', gridEnabled && 'canvas-dot-grid')} />
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePosition.x}
        y={stagePosition.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        dragDistance={2}
        onTouchStart={handleMouseDown as any}
        onTouchMove={handleMouseMove as any}
        onTouchEnd={handleMouseUp as any}
        onWheel={handleWheel}
        draggable={activeTool === 'hand'}
        onDragStart={() => {
          if (useEditorStore.getState().activeTool === 'hand') setIsHandDragging(true);
        }}
        onDragMove={(e) => {
          if (useEditorStore.getState().activeTool === 'hand') {
            // Konva owns the drag; the store is synced once per frame so a
            // dragmove stream never re-renders React per event.
            const s = useEditorStore.getState();
            const vp = pendingViewportRef.current ?? { zoom: s.zoom, x: s.stagePosition.x, y: s.stagePosition.y };
            pendingViewportRef.current = { zoom: vp.zoom, x: e.target.x(), y: e.target.y() };
            syncViewportToStore();
          }
        }}
        onDragEnd={(e) => {
          if (useEditorStore.getState().activeTool === 'hand') {
            const s = useEditorStore.getState();
            const vp = pendingViewportRef.current ?? { zoom: s.zoom, x: s.stagePosition.x, y: s.stagePosition.y };
            pendingViewportRef.current = { zoom: vp.zoom, x: e.target.x(), y: e.target.y() };
            syncViewportToStore();
            setIsHandDragging(false);
          }
        }}
      >
        {/* Background + framed image (padding / bgStyle live preview) */}
        <Layer>
          {showFrame && (
            <Rect
              x={0}
              y={0}
              width={frameW}
              height={frameH}
              fill={
                canvasStyle.bgStyle === 'none'
                  ? (contentPad > 0 ? '#ffffff' : undefined)
                  : bgFill
              }
              fillLinearGradientStartPoint={
                canvasStyle.bgStyle === 'gradient' ? { x: 0, y: 0 } : undefined
              }
              fillLinearGradientEndPoint={
                canvasStyle.bgStyle === 'gradient' ? { x: frameW, y: frameH } : undefined
              }
              fillLinearGradientColorStops={
                canvasStyle.bgStyle === 'gradient'
                  ? [0, canvasStyle.bgGradientStart || '#ffffff', 1, canvasStyle.bgGradientEnd || '#e5e5e5']
                  : undefined
              }
              cornerRadius={canvasStyle.borderRadius || 0}
              shadowEnabled={canvasStyle.shadowEnabled}
              shadowBlur={canvasStyle.shadowBlur || 24}
              shadowOffsetX={canvasStyle.shadowOffsetX || 0}
              shadowOffsetY={canvasStyle.shadowOffsetY || 12}
              shadowColor={canvasStyle.shadowColor || 'rgba(0,0,0,0.25)'}
              listening={false}
            />
          )}
          {canvasStyle.deviceFrame !== 'none' && (
            <DeviceFrameKonva frame={canvasStyle.deviceFrame} frameUrl={canvasStyle.frameUrl} outerW={frameW} outerH={frameH} inner={frameInner} pass="behind" />
          )}
          <Group x={contentOffsetX} y={contentOffsetY}>
            <Rect
              name="background"
              x={0}
              y={0}
              width={imageSize.width || dimensions.width}
              height={imageSize.height || dimensions.height}
              fillPatternImage={gridEnabled && gridPattern ? (gridPattern as unknown as HTMLImageElement) : undefined}
              fillPatternScale={{ x: 1, y: 1 }}
              fill={gridEnabled ? undefined : '#ffffff'}
              listening={false}
              id="grid-bg"
            />
            {backgroundImage && (
              <KonvaImage
                image={backgroundImage}
                x={0}
                y={0}
                width={imageSize.width}
                height={imageSize.height}
                name="background"
              />
            )}
          </Group>
          {canvasStyle.deviceFrame !== 'none' && (
            <DeviceFrameKonva frame={canvasStyle.deviceFrame} frameUrl={canvasStyle.frameUrl} outerW={frameW} outerH={frameH} inner={frameInner} pass="overlay" />
          )}
        </Layer>

        {/* Annotation layer (same offset as the framed image) */}
        <Layer ref={annotationLayerRef} name="annotation-layer" x={contentOffsetX} y={contentOffsetY}>
          {annotationNodes}
          {drawingElement && renderElement(drawingElement, true)}
          {/* Above the drawings so they dim outside the spotlights; the chrome
              (handles, transformer) is lifted back over it by the effect below. */}
          {spotlightDim !== null && <SpotlightDim dim={spotlightDim} />}
          <Transformer
            ref={transformerRef}
            shouldOverdrawWholeArea
            keepRatio={(() => {
              const sole = selectedElementIds.length === 1
                ? elements.find((e) => e.id === selectedElementIds[0])
                : undefined;
              // Uniform-scale: pasted overlay images and step badges.
              const soleEl = sole as ShapeElement | undefined;
              const isOverlay = soleEl?.type === 'rectangle' && !!soleEl.imageDataURL;
              return isOverlay || sole?.type === 'step';
            })()}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
            // Text already carries its own padding, so its frame hugs it.
            padding={selectedElementIds.length === 1 && elements.find((x) => x.id === selectedElementIds[0])?.type === 'text' ? 0 : 4}
            anchorSize={8}
            anchorCornerRadius={2}
            borderStroke={selectionTheme.accent}
            borderStrokeWidth={1}
            borderDash={selectedElementIds.length > 1 ? [4, 2] : undefined}
            onTransformStart={() => setTransforming(true)}
            onTransformEnd={() => setTransforming(false)}
            anchorStroke={selectionTheme.accent}
            anchorFill={selectionTheme.surface}
            rotateEnabled={!annotationsLocked}
            resizeEnabled={!annotationsLocked}
            rotateAnchorOffset={selectedElementIds.length === 1 && elements.find((x) => x.id === selectedElementIds[0])?.type === 'text' ? 16 : 20}
            rotateLineVisible={false}
            rotateAnchorSize={9}
            rotateAnchorCursor="grab"
            anchorStyleFunc={styleSelectionAnchor}
            onTransform={(e) => {
              const st = useEditorStore.getState();
              const tr = transformerRef.current;
              if (!tr) return;
              const nodes = tr.nodes();
              const evt = e.evt as { shiftKey?: boolean };
              // Rotation snapping — Excalidraw semantics (Shift constrains
              // rotation to 15° steps). Applied after Konva's own rotate math
              // each frame, so the object follows the pointer until it nears a
              // step and then lands on it; releasing Shift frees rotation
              // immediately (never sticky).
              if (evt?.shiftKey && nodes.length === 1) {
                const snapped = Math.round(nodes[0].rotation() / 15) * 15;
                if (Math.abs(nodes[0].rotation() - snapped) > 0.001) {
                  nodes[0].rotation(snapped);
                  tr.forceUpdate();
                }
              }
              // Live text resize: re-wrap / rescale the Text node each frame
              // so the drag never stretches the glyphs. Konva's Transformer
              // scales the group; we translate that scale into intrinsic
              // width + fontSize on the Text child, reset the group scale,
              // and shift the group position so the active anchor stays under
              // the pointer. Without this the text squashes/stretches live
              // and only settles on commit.
              if (nodes.length === 1) {
                const node = nodes[0];
                const id = node.id();
                const el = id ? st.elements.find((x) => x.id === id) : undefined;
                if (el?.type === 'text') {
                  const textNode = (node as Konva.Group).findOne('Text') as Konva.Text | undefined;
                  if (textNode) {
                    const anchor = tr.getActiveAnchor();
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const pad = textNode.padding();
                    const visualW = textNode.getWidth();
                    const visualH = textNode.getHeight();
                    const isLeft =
                      anchor === 'middle-left' ||
                      anchor === 'top-left' ||
                      anchor === 'bottom-left';
                    const isTop =
                      anchor === 'top-center' ||
                      anchor === 'top-left' ||
                      anchor === 'top-right';
                    const isHorizontalResize =
                      anchor === 'middle-left' ||
                      anchor === 'middle-right' ||
                      anchor === 'top-left' ||
                      anchor === 'top-right' ||
                      anchor === 'bottom-left' ||
                      anchor === 'bottom-right';
                    const isVerticalResize =
                      anchor === 'top-center' ||
                      anchor === 'bottom-center' ||
                      anchor === 'top-left' ||
                      anchor === 'top-right' ||
                      anchor === 'bottom-left' ||
                      anchor === 'bottom-right';
                    if (isHorizontalResize) {
                      // Re-wrap at the new width. fontSize is never touched
                      // by a box drag.
                      const newVisualW = Math.max(20, visualW * scaleX);
                      textNode.width(Math.max(20, newVisualW - pad * 2));
                      if (textNode.wrap() === 'none') textNode.wrap('word');
                    }
                    if (isVerticalResize) {
                      // Resize the box height. Text auto-wraps to the width;
                      // the height just bounds the box. Konva's getHeight()
                      // already includes padding, so we write the raw value
                      // back without subtracting.
                      const newVisualH = Math.max(20, visualH * scaleY);
                      textNode.height(newVisualH);
                    }

                    // Keep the active anchor under the pointer by shifting
                    // the group by the change in visual size.
                    const newVisualW = textNode.getWidth();
                    const newVisualH = textNode.getHeight();
                    const dx = isLeft ? visualW - newVisualW : 0;
                    const dy = isTop ? visualH - newVisualH : 0;
                    if (dx !== 0) node.x(node.x() + dx);
                    if (dy !== 0) node.y(node.y() + dy);

                    node.scaleX(1);
                    node.scaleY(1);
                    tr.forceUpdate();
                  }
                }
              }
              // Live binding during resize/rotate: a single bindable target
              // keeps every bound arrow glued on every frame. Multi-select
              // re-anchors once at commit (recomputeBindings) — per-element
              // scaling mid-gesture would be guesswork.
              if (st.isBindingEnabled && st.selectedElementIds.length === 1) {
                const id = st.selectedElementIds[0];
                const el = st.elements.find((x) => x.id === id);
                if (el && isBindableElement(el) && nodes[0]) {
                  handleLiveShapeTransform(el, nodes[0]);
                }
              }
            }}
            enabledAnchors={(() => {
              if (annotationsLocked) return [];
              const sole = selectedElementIds.length === 1
                ? elements.find((e) => e.id === selectedElementIds[0])
                : undefined;
              // Uniform-scale types get corners only; a side handle there would
              // imply a non-uniform resize the element cannot represent.
              const soleEl = sole as ShapeElement | undefined;
              const isOverlay = soleEl?.type === 'rectangle' && !!soleEl.imageDataURL;
              if (isOverlay || sole?.type === 'step') {
                return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
              }
              return [
                'top-left', 'top-right', 'bottom-left', 'bottom-right',
                'middle-left', 'middle-right', 'top-center', 'bottom-center',
              ];
            })()}
          />
          {shapeOverlayEl && (
            <ShapeSelectionOverlay
              el={shapeOverlayEl}
              zoom={zoom}
              annotationsLocked={annotationsLocked}
              getNode={(id) => (stageRef.current ? findAnnotationNode(stageRef.current, id) : undefined)}
              toImagePoint={getCanvasPoint}
              onLiveTransform={handleLiveShapeTransform}
              onCommit={handleElementTransformEnd}
            />
          )}
        </Layer>

        {/* Transient interaction layer: drawing drafts, marquee, eraser rect
            and snapping guides. Driven imperatively by DraftLayer from pointer
            events — React never renders here during a gesture. */}
        <Layer name="interaction-layer" x={contentOffsetX} y={contentOffsetY} listening={false} ref={interactionLayerRef}>
          {!multiSelectGhost && !transforming && (
            <SelectionOverlayV2
              elements={elements}
              selectedIds={selectedElementIds}
              imageSize={imageSize}
              zoom={zoom}
            />
          )}
        </Layer>
      </Stage>

      {/* Text input overlay: the single in-place editor for every text entry
          point (Text tool, double-click labels, Enter on selection). */}
      <TextEditOverlay
        state={textInput}
        elements={elements}
        stagePos={currentStagePos}
        contentOffset={{ x: contentOffsetX, y: contentOffsetY }}
        zoom={currentZoom}
        imageSize={imageSize}
        defaultFontSize={fontSize}
        defaultFill={strokeColor}
        defaultFontFamily={fontFamily}
        defaultFontStyle={fontStyle || 'normal'}
        defaultAlign={textAlign || 'left'}
        textAreaRef={textAreaRef}
        ignoreBlurUntilRef={textIgnoreBlurRef}
        onCommit={() => { setLiveLabel(null); commitTextRef.current(); }}
        onTextChange={(id, text) => { setLiveLabel({ id, text }); growContainerToFitText(id, text); }}
      />

      <OcrPanel
        open={ocrOpen}
        busy={ocrBusy}
        text={ocrText}
        copied={ocrCopied}
        onClose={() => setOcrOpen(false)}
        onCopy={() => void copyOCRText()}
      />

      {/* Slice A: per-element right-click menu (overrides the canvas menu
          when the right-click hits a specific element). */}
      <ShapeContextMenu
        elementId={shapeMenu?.id ?? null}
        position={shapeMenu?.pos ?? null}
        onClose={() => setShapeMenu(null)}
      />
    </div>
  );
};

export default EditorCanvas;


/**
 * Excalidraw: a box grows in height to fit text typed inside it. Wrapped text
 * height is measured with an off-stage Konva.Text using the label's width.
 */
function growContainerToFitText(labelId: string, liveText?: string) {
  const st = useEditorStore.getState();
  const label = st.elements.find((e) => e.id === labelId) as TextElement | undefined;
  const shape = label ? resolveContainerShape(label, st.elements) : null;
  if (!label || !shape || !isClosedShape(shape)) return;
  const scale = getImageToolScale(st.imageSize.width, st.imageSize.height);
  const textH = new Konva.Text({
    text: liveText ?? label.text,
    width: label.width,
    fontSize: label.fontSize ?? 24,
    fontFamily: fontFamilyForCanvas(label.fontFamily),
    fontStyle: label.fontStyle,
    padding: label.padding ?? TEXT_PADDING,
    lineHeight: label.lineHeight ?? TEXT_LINE_HEIGHT,
    wrap: 'word',
  }).height();
  // The text area is the inscribed rectangle, so the shape grows by sqrt(2) / 2.
  const need = (textH + TEXT_PADDING * scale * 2) * (shape.type === 'circle' ? Math.SQRT2 : shape.type === 'diamond' ? 2 : 1);
  const h = (shape as { height: number }).height;
  const stroke = Number((shape as { strokeWidth?: number }).strokeWidth) || 0;
  if (Math.abs(h) + stroke >= need) return;
  const patch = { height: (h < 0 ? -1 : 1) * (need - stroke) } as Partial<EditorElement>;
  // Typing/commit pass the text: growth rides along silently so one undo
  // removes text and growth together (Excalidraw).
  if (liveText !== undefined) st.updateElementSilent(shape.id, patch, true);
  else st.updateElement(shape.id, patch);
}
