'use client';

/**
 * Magnifier: Shottr-style spyglass.
 * An elliptical source (the region being magnified) with crosshair alignment
 * lines, plus a linked bubble that enlarges the region and adds a pixel grid.
 * Source radii are independent, so the magnifier can be a circle or an ellipse,
 * and the bubble can be dragged anywhere rather than orbiting at a fixed radius.
 *
 * The zoom is painted into one persistent offscreen canvas on an animation frame -
 * never re-allocated, never routed through React state - so the bubble tracks the
 * source live while drawing, dragging and resizing instead of catching up afterwards.
 * Supports hand-drawn rings via Rough when enabled.
 */
import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { Group, Ellipse, Circle, Rect, Shape, Image as KonvaImage } from 'react-konva';
import { generateLinearDrawables, paintDrawable } from '@/lib/rough-renderer';
import type Konva from 'konva';
import type { MagnifierElement } from '@/types/editor';
import {
  magnifierMetrics,
  resolvePreviewOffset,
  leaderGeometry,
  MIN_MAGNIFICATION,
  MAX_MAGNIFICATION,
} from '@/lib/editor/magnifier-geometry';
import { bendFromHandle } from '@/lib/editor/curve';
import { selectionHandleProps, getSelectionTheme, handleHoverEvents } from '@/lib/selection-theme';
import RoughKonvaShape from '@/components/editor/canvas/rough-konva-shape';

type Props = {
  el: MagnifierElement;
  backgroundImage: HTMLImageElement | null;
  imageSize: { width: number; height: number };
  selected?: boolean;
  accent?: string;
  opacity?: number;
  listening?: boolean;
  draggable?: boolean;
  /** Element is still being drawn: keep the zoom live, but no selection handles yet. */
  draft?: boolean;
  handDrawn?: boolean;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  /** The bubble was pressed: select the magnifier, so the first drag already moves the bubble. */
  onBubblePress?: () => void;
  /** Live update while repositioning the magnified bubble (offset from source center). */
  onPreviewOffsetMove?: (offset: { x: number; y: number }) => void;
  /** Live / committed zoom while a bubble corner is dragged. */
  onMagnificationMove?: (magnification: number) => void;
  onMagnificationCommit?: (magnification: number) => void;
  /** Rect (element-local) cut out of the connecting arrow behind its label. */
  labelGap?: { x: number; y: number; w: number; h: number } | null;
  /** Commit the bubble placement as a single undo step. */
  onPreviewOffsetCommit?: (offset: { x: number; y: number }) => void;
  /** Live update while resizing the source bbox (radii + new top-left). */
  onRadiiMove?: (radii: { rx: number; ry: number; topLeftX: number; topLeftY: number }) => void;
  /** Commit the source bbox as a single undo step. */
  onRadiiCommit?: (radii: { rx: number; ry: number; topLeftX: number; topLeftY: number }) => void;
  /** Live update while bending the leader line (0 = straight, ±1 = full curve). */
  onLeaderBendMove?: (bend: number) => void;
  /** Commit the leader bend as a single undo step. */
  onLeaderBendCommit?: (bend: number) => void;
};

/**
 * Paints the magnified region into `canvas`, resizing it only when the target
 * size actually changes. Reusing the canvas keeps drag/resize allocation-free.
 */
function paintPreview(
  canvas: HTMLCanvasElement,
  backgroundImage: HTMLImageElement,
  imageSize: { width: number; height: number },
  absSrcCx: number,
  absSrcCy: number,
  rx: number,
  ry: number,
  previewRx: number,
  previewRy: number,
  mag: number,
): void {
  const cw = Math.max(2, Math.ceil(previewRx * 2));
  const ch = Math.max(2, Math.ceil(previewRy * 2));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, cw, ch);
  // High-quality resampling makes the spyglass zoom look smooth/crispy, not blocky
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const natW = backgroundImage.naturalWidth || backgroundImage.width || imageSize.width;
  const natH = backgroundImage.naturalHeight || backgroundImage.height || imageSize.height;
  const sx = natW / Math.max(1, imageSize.width);
  const sy = natH / Math.max(1, imageSize.height);

  // Clamp the sampled rect to the bitmap, then mirror that clamp into the
  // destination so the magnified content never stretches near the edges.
  const wantX = (absSrcCx - rx) * sx;
  const wantY = (absSrcCy - ry) * sy;
  const wantW = Math.max(1, rx * 2 * sx);
  const wantH = Math.max(1, ry * 2 * sy);
  const sXs = Math.min(Math.max(0, wantX), natW);
  const sYs = Math.min(Math.max(0, wantY), natH);
  const sWs = Math.max(0, Math.min(wantX + wantW, natW) - sXs);
  const sHs = Math.max(0, Math.min(wantY + wantH, natH) - sYs);
  const scaleX = cw / wantW;
  const scaleY = ch / wantH;

  ctx.beginPath();
  ctx.ellipse(previewRx, previewRy, previewRx, previewRy, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (sWs > 0 && sHs > 0) {
    ctx.drawImage(
      backgroundImage,
      sXs, sYs, sWs, sHs,
      (sXs - wantX) * scaleX, (sYs - wantY) * scaleY,
      sWs * scaleX, sHs * scaleY,
    );
  }

  // Pixel-grid spyglass overlay: one source pixel is `gridStep` canvas pixels
  // wide, so only draw it once that is big enough to read as pixels rather
  // than as a grey haze.
  const gridStepX = mag / sx;
  const gridStepY = mag / sy;
  if (gridStepX >= 8 && gridStepY >= 8) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = gridStepX; gx < cw; gx += gridStepX) {
      const px = Math.round(gx) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, ch);
    }
    for (let gy = gridStepY; gy < ch; gy += gridStepY) {
      const py = Math.round(gy) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(cw, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Gap between the source ellipse and its selection frame, matching Transformer padding. */
const SELECT_PAD = 8;

/** Resize handle corners as [right?, bottom?] flags. */
const CORNERS: ReadonlyArray<readonly [0 | 1, 0 | 1]> = [[0, 0], [1, 0], [0, 1], [1, 1]];

/**
 * Drag a Konva handle without letting the parent Group also move.
 *
 * Konva's own `draggable` on a child of a draggable Group is what made the
 * magnifier jump: both nodes claimed the gesture, so the whole element slid
 * while the handle was being dragged (and on touch the Group usually won).
 * Here the handle is NOT draggable - it captures the pointer, reads stage
 * coordinates directly, and reports positions in the Group's local space.
 * Updates are coalesced onto an animation frame so a fast drag does not queue
 * one store write per pointer event.
 */
function useHandleDrag(
  groupRef: React.RefObject<Konva.Group | null>,
  onMove: (local: { x: number; y: number }) => void,
  onCommit: (local: { x: number; y: number }) => void,
) {
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  // The gesture listeners are attached once at pointerdown and would otherwise
  // capture that render's `onMove`/`onCommit` closures - whose geometry (e.g.
  // the magnifier's w/h while corner-resizing) goes stale as the store updates.
  // Keeping the latest callbacks in refs makes every frame use fresh values,
  // so a long corner drag cannot compound drift and outrun the cursor.
  const onMoveRef = useRef(onMove);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  /** Native pointer event -> the Group's local coordinate space. */
  const toLocal = useCallback(
    (stage: Konva.Stage, evt: PointerEvent): { x: number; y: number } | null => {
      const group = groupRef.current;
      if (!group) return null;
      // Let Konva map client coords through the stage's own container offset,
      // so this works while the page is scrolled or the stage is inset.
      stage.setPointersPositions(evt);
      const pointer = stage.getPointerPosition();
      if (!pointer) return null;
      // Invert the group's absolute transform so the result is independent of
      // stage zoom/pan and of the element's own rotation.
      return group.getAbsoluteTransform().copy().invert().point(pointer);
    },
    [groupRef],
  );

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  const onPointerDown = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    e.evt.preventDefault();

    const seed = toLocal(stage, e.evt);
    if (seed) pendingRef.current = seed;

    const handleMove = (evt: PointerEvent) => {
      const local = toLocal(stage, evt);
      if (!local) return;
      pendingRef.current = local;
      // Coalesce onto a frame: a fast drag fires far more pointermove events
      // than the canvas can usefully redraw, and each one would be a store write.
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (pendingRef.current) onMoveRef.current(pendingRef.current);
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      cancelFrame();
      const local = pendingRef.current;
      pendingRef.current = null;
      if (local) onCommitRef.current(local);
    };

    // On window rather than the stage so the gesture survives the pointer
    // leaving the canvas, which is easy to do when dragging the bubble outward.
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }, [toLocal, cancelFrame]);

  /**
   * Konva starts a Group drag from `mousedown`/`touchstart`, which are separate
   * event objects from `pointerdown` - cancelling only pointerdown still let the
   * whole magnifier slide along with the handle. These stop the Group drag.
   */
  const swallow = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
  }, []);

  return {
    onPointerDown,
    onMouseDown: swallow,
    onTouchStart: swallow,
  } as const;
}

/**
 * Source bbox implied by dragging a corner handle to `local`. Resizing is
 * opposite-corner-fixed (the same model as the shared Transformer for normal
 * ellipses): the corner you are NOT dragging stays put, the dragged corner
 * follows the cursor, and the source center moves as the bbox grows or
 * shrinks. Each axis is independent, so corners can shape an ellipse.
 *
 * Returns the new top-left of the source box plus the new radii, so the
 * caller can write all four bbox fields back in one update.
 */
function radiiFromCorner(
  local: { x: number; y: number },
  fx: 0 | 1,
  fy: 0 | 1,
  originW: number,
  originH: number,
): { rx: number; ry: number; topLeftX: number; topLeftY: number } {
  // Handle sits SELECT_PAD outside the bbox corner, so subtract that offset
  // before computing the new bbox width. Without it the handle is always
  // rendered ahead of the cursor while resizing, which reads as a laggy drag.
  const dragX = local.x - (fx ? SELECT_PAD : -SELECT_PAD);
  const dragY = local.y - (fy ? SELECT_PAD : -SELECT_PAD);
  // The opposite bbox corner is captured on pointerdown so it stays put
  // through the drag, matching how a normal ellipse is resized.
  const oppX = (1 - fx) * originW;
  const oppY = (1 - fy) * originH;
  const topLeftX = Math.min(dragX, oppX);
  const topLeftY = Math.min(dragY, oppY);
  const rx = Math.max(8, Math.abs(dragX - oppX) / 2);
  const ry = Math.max(8, Math.abs(dragY - oppY) / 2);
  return { rx, ry, topLeftX, topLeftY };
}

export default function MagnifierKonva({
  el,
  backgroundImage,
  imageSize,
  selected,
  accent = '#EA580C',
  opacity = 1,
  listening = true,
  draggable = false,
  draft = false,
  handDrawn = false,
  onClick,
  onTap,
  onDragEnd,
  onDragMove,
  onBubblePress,
  onPreviewOffsetMove,
  onPreviewOffsetCommit,
  onMagnificationMove,
  onMagnificationCommit,
  labelGap,
  onRadiiMove,
  onRadiiCommit,
  onLeaderBendMove,
  onLeaderBendCommit,
}: Props) {
  const m = magnifierMetrics(el);
  const { w, h, rx, ry, mag, previewRx, previewRy } = m;
  const gx = el.width < 0 ? el.x + el.width : el.x;
  const gy = el.height < 0 ? el.y + el.height : el.y;

  const srcCx = w / 2;
  const srcCy = h / 2;

  const off = resolvePreviewOffset(el, imageSize);
  const previewCx = srcCx + off.ox;
  const previewCy = srcCy + off.oy;

  const stroke = el.stroke || accent;
  const strokeWidth = el.strokeWidth ?? 2.5;
  const roughness = el.roughness ?? 1.25;
  const styleDash = el.strokeStyle === 'dashed' ? [8, 6] : el.strokeStyle === 'dotted' ? [2, 4] : undefined;

  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  // Painting is cheap enough to run while drawing, so the zoom stays live from
  // the first drag instead of appearing only once the gesture ends.
  const hasPreview = !!backgroundImage && rx >= 8 && ry >= 8;

  // One canvas for the lifetime of the element: repainting in place avoids the
  // allocate-and-swap that made the old implementation stutter on every change.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (canvasRef.current === null && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
  }

  /**
   * Repaints from the node's *live* position rather than from props, so a drag
   * in progress (which Konva applies to the node before the store updates)
   * magnifies what is actually under the ring right now.
   */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !backgroundImage || rx < 8 || ry < 8) return;
    const node = groupRef.current;
    const originX = node ? node.x() : gx;
    const originY = node ? node.y() : gy;
    paintPreview(
      canvas,
      backgroundImage,
      imageSize,
      originX + w / 2,
      originY + h / 2,
      rx,
      ry,
      previewRx,
      previewRy,
      mag,
    );
    // The canvas object is unchanged, so Konva needs an explicit redraw to
    // pick up the new pixels.
    imageRef.current?.getLayer()?.batchDraw();
  }, [backgroundImage, imageSize, gx, gy, w, h, rx, ry, previewRx, previewRy, mag]);

  // Paint synchronously before the browser shows the frame: on the first paint
  // and on every geometry change there is no blank/stale bubble in between.
  useLayoutEffect(() => {
    repaint();
  }, [repaint]);

  // Keep the zoom locked to the ring for the whole duration of a drag.
  const rafRef = useRef<number | null>(null);
  const scheduleRepaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      repaint();
    });
  }, [repaint]);

  useEffect(() => () => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  // Leader line: from the source rim to the bubble rim. When bent, the anchors
  // slide around the rims toward the control point so the curve stays glued to
  // both ellipses instead of crossing them at a diagonal.
  const leader = leaderGeometry(el, imageSize);

  const canEdit = !!selected && !draft && !!draggable;
  const canReposition = canEdit && typeof onPreviewOffsetMove === 'function';
  // The bubble is its own grab handle even before the magnifier is selected:
  // otherwise the first drag on it moved the whole group (the source ring).
  const canDragBubble = !draft && !!draggable && typeof onPreviewOffsetMove === 'function';
  const canResize = canEdit && typeof onRadiiMove === 'function';
  const theme = getSelectionTheme();
  // The same 8px rounded-square corner handle every box shape uses.
  const squareHandle = {
    name: 'edit-handle',
    width: 8, height: 8, offsetX: 4, offsetY: 4, cornerRadius: 2,
    fill: '#ffffff', stroke: theme.accent, strokeWidth: 1, hitStrokeWidth: 12,
  };
  const lengthHandle = selectionHandleProps('bend');
  const hoverEvents = handleHoverEvents();

  /** Bubble: free placement, the offset is just pointer-minus-source-center. */
  const bubbleOffsetAt = useCallback(
    (local: { x: number; y: number }) => ({ x: local.x - srcCx, y: local.y - srcCy }),
    [srcCx, srcCy],
  );
  const onBubbleDrag = useHandleDrag(
    groupRef,
    useCallback((local) => onPreviewOffsetMove?.(bubbleOffsetAt(local)), [onPreviewOffsetMove, bubbleOffsetAt]),
    useCallback((local) => onPreviewOffsetCommit?.(bubbleOffsetAt(local)), [onPreviewOffsetCommit, bubbleOffsetAt]),
  );

  // Midpoint of the leader line, where the bend handle rests when straight.
  const lSx = leader.sx;
  const lSy = leader.sy;
  const lEx = leader.ex;
  const lEy = leader.ey;
  const leaderControl = leader.bent ? { x: leader.cx, y: leader.cy } : null;
  const leaderMid = {
    x: (lSx + lEx) / 2,
    y: (lSy + lEy) / 2,
  };

  /**
   * Leader bend: drag the mid handle sideways to curve the connector. The
   * handle renders at the live control point, so it follows the pointer.
   */
  const zoomAt = useCallback((local: { x: number; y: number }) => {
    const k = Math.max(
      (Math.abs(local.x - previewCx) - SELECT_PAD) / rx,
      (Math.abs(local.y - previewCy) - SELECT_PAD) / ry,
    );
    return Math.max(MIN_MAGNIFICATION, Math.min(MAX_MAGNIFICATION, k));
  }, [previewCx, previewCy, rx, ry]);
  const onBubbleResize = useHandleDrag(
    groupRef,
    useCallback((local) => onMagnificationMove?.(zoomAt(local)), [onMagnificationMove, zoomAt]),
    useCallback((local) => onMagnificationCommit?.(zoomAt(local)), [onMagnificationCommit, zoomAt]),
  );
  const onLeaderBendDrag = useHandleDrag(
    groupRef,
    useCallback(
      (local) => onLeaderBendMove?.(bendFromHandle(lSx, lSy, lEx, lEy, local.x, local.y)),
      [onLeaderBendMove, lSx, lSy, lEx, lEy],
    ),
    useCallback(
      (local) => onLeaderBendCommit?.(bendFromHandle(lSx, lSy, lEx, lEy, local.x, local.y)),
      [onLeaderBendCommit, lSx, lSy, lEx, lEy],
    ),
  );

  // Corner handles are static at SELECT_PAD outside the bbox; without help
  // the visible handle stays put while the ellipse grows, so the cursor
  // outruns the handle and the drag reads as laggy. We track which corner is
  // being dragged and pin that one to the live pointer position via a ref +
  // useLayoutEffect so the Konva node is updated synchronously after the
  // render (before paint) - no one-frame React delay. The other three keep
  // their initial anchors. Drag origin is captured on pointerdown so the
  // center stays put even as the store pushes new w/h through every rAF tick.
  const draggingCornerRef = useRef<{ fx: 0 | 1; fy: 0 | 1 } | null>(null);
  const dragHandleLocalRef = useRef<{ x: number; y: number } | null>(null);
  const handleNodesRef = useRef<(Konva.Rect | null)[]>([null, null, null, null]);
  // Source box at pointerdown, in image coordinates: the corner opposite the
  // dragged one stays fixed there for the whole gesture.
  const dragOriginRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  /**
   * New source box for a corner drag, in image coordinates. The pointer
   * arrives in the group's local space, and the group itself moves as the
   * box updates, so it is first lifted to image space; the opposite corner
   * comes from the box captured at pointerdown and never moves.
   */
  const radiiAbs = useCallback(
    (local: { x: number; y: number }, corner: { fx: 0 | 1; fy: 0 | 1 }) => {
      const origin = dragOriginRef.current;
      const group = groupRef.current;
      if (!origin || !group) return null;
      const r = radiiFromCorner(
        { x: local.x + group.x() - origin.x, y: local.y + group.y() - origin.y },
        corner.fx, corner.fy, origin.w, origin.h,
      );
      return { ...r, topLeftX: origin.x + r.topLeftX, topLeftY: origin.y + r.topLeftY };
    },
    [],
  );
  const onCornerMoveSmooth = useCallback(
    (local: { x: number; y: number }) => {
      dragHandleLocalRef.current = local;
      const corner = draggingCornerRef.current;
      if (!corner) return;
      const r = radiiAbs(local, corner);
      if (r) onRadiiMove?.(r);
    },
    [onRadiiMove, radiiAbs],
  );
  const onCornerCommitSmooth = useCallback(
    (local: { x: number; y: number }) => {
      const corner = draggingCornerRef.current;
      const r = corner ? radiiAbs(local, corner) : null;
      draggingCornerRef.current = null;
      dragHandleLocalRef.current = null;
      dragOriginRef.current = null;
      // Re-render so the handle snaps back to its prop-driven initial position.
      forceRender();
      if (r) onRadiiCommit?.(r);
    },
    [onRadiiCommit, radiiAbs],
  );
  const baseCornerDrag = useHandleDrag(groupRef, onCornerMoveSmooth, onCornerCommitSmooth);
  const cornerDragProps = useCallback(
    (fx: 0 | 1, fy: 0 | 1) => ({
      onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
        dragOriginRef.current = { x: gx, y: gy, w, h };
        draggingCornerRef.current = { fx, fy };
        dragHandleLocalRef.current = {
          x: fx ? w + SELECT_PAD : -SELECT_PAD,
          y: fy ? h + SELECT_PAD : -SELECT_PAD,
        };
        baseCornerDrag.onPointerDown(e);
      },
      onMouseDown: baseCornerDrag.onMouseDown,
      onTouchStart: baseCornerDrag.onTouchStart,
    }),
    [baseCornerDrag, w, h, gx, gy],
  );

  // Apply the live handle position synchronously after every render, before
  // the browser paints. Runs without deps so the Konva node is repositioned
  // even on the renders triggered by the store's rAF-throttled updates.
  useLayoutEffect(() => {
    const drag = draggingCornerRef.current;
    const local = dragHandleLocalRef.current;
    if (!drag || !local) return;
    const idx = drag.fy * 2 + drag.fx;
    const node = handleNodesRef.current[idx];
    if (node) node.position(local);
  });

  return (
    <Group
      id={el.id}
      ref={groupRef}
      x={gx}
      y={gy}
      opacity={opacity}
      rotation={el.rotation ?? 0}
      listening={listening}
      draggable={draggable}
      onClick={onClick}
      onTap={onTap as any}
      onDragEnd={(e) => {
        onDragEnd?.(e);
        scheduleRepaint();
      }}
      onDragMove={(e) => {
        onDragMove?.(e);
        scheduleRepaint();
      }}
    >
      {/*
        Hit target. Every decorative child is listening={false} and a Konva Group
        has no hit area of its own, so without this the magnifier could not be
        clicked, selected or dragged at all.
      */}
      <Ellipse
        x={srcCx}
        y={srcCy}
        radiusX={Math.max(rx, 6)}
        radiusY={Math.max(ry, 6)}
        fill="rgba(0,0,0,0)"
        listening={listening}
        perfectDrawEnabled={false}
      />
      {handDrawn ? (
        <RoughKonvaShape
          kind="ellipse"
          seed={`${el.id}-src`}
          x={srcCx - rx}
          y={srcCy - ry}
          width={rx * 2}
          height={ry * 2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="transparent"
          fillStyle="none"
          roughness={roughness}
          strokeStyle={el.strokeStyle}
          listening={false}
        />
      ) : (
        <Ellipse
          x={srcCx}
          y={srcCy}
          radiusX={rx}
          radiusY={ry}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={styleDash}
          fill="rgba(255,255,255,0.03)"
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {hasPreview && (
        <>
          {/* The connector is a real arrow in the shared hand-drawn style,
              from the source ring to the bubble, like an arrow bound to two
              shapes: it re-anchors on both rims as either end moves. */}
          <Shape
            listening={false}
            perfectDrawEnabled={false}
            sceneFunc={(ctx) => {
              // While the source ring is dragged the canvas shifts the bubble
              // back imperatively (attr `liveShift`); the arrow re-anchors to
              // match without waiting for a React render.
              const shift = groupRef.current?.getAttr('liveShift') as { dx: number; dy: number } | undefined;
              const g = shift
                ? leaderGeometry({ ...el, previewOffset: { x: off.ox - shift.dx, y: off.oy - shift.dy } }, imageSize)
                : leader;
              const drawables = generateLinearDrawables({
                seed: el.id,
                stroke,
                strokeWidth,
                strokeStyle: el.strokeStyle,
                roughness,
                arrowType: g.bent ? 'round' : 'sharp',
                points: g.bent ? [g.sx, g.sy, g.cx, g.cy, g.ex, g.ey] : [g.sx, g.sy, g.ex, g.ey],
                startArrowhead: 'none',
                endArrowhead: 'arrow',
              });
              const c = ctx as unknown as CanvasRenderingContext2D;
              c.save();
              if (labelGap) {
                // Everything except the label box (even-odd), as on an arrow.
                // The box is centred on the arrow's own midpoint, where the
                // label is seated, so the two can never drift apart.
                c.beginPath();
                c.rect(-1e5, -1e5, 2e5, 2e5);
                c.rect(g.cx - labelGap.w / 2, g.cy - labelGap.h / 2, labelGap.w, labelGap.h);
                c.clip('evenodd');
              }
              for (const d of drawables) paintDrawable(c, d, 1);
              c.restore();
            }}
          />
          <Group name="mag-bubble">
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();
              ctx.ellipse(previewCx, previewCy, previewRx, previewRy, 0, 0, Math.PI * 2, false);
              ctx.closePath();
            }}
            listening={false}
          >
            <KonvaImage
              ref={imageRef}
              image={canvasRef.current ?? undefined}
              x={previewCx - previewRx}
              y={previewCy - previewRy}
              width={previewRx * 2}
              height={previewRy * 2}
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
          {handDrawn ? (
            <RoughKonvaShape
              kind="ellipse"
              seed={`${el.id}-prev`}
              x={previewCx - previewRx}
              y={previewCy - previewRy}
              width={previewRx * 2}
              height={previewRy * 2}
              stroke={stroke}
              strokeWidth={strokeWidth + 0.5}
              fill="transparent"
              fillStyle="none"
              roughness={roughness}
              strokeStyle={el.strokeStyle}
              listening={false}
            />
          ) : (
            <>
              <Ellipse
                x={previewCx}
                y={previewCy}
                radiusX={previewRx}
                radiusY={previewRy}
                stroke={stroke}
                strokeWidth={strokeWidth + 0.5}
                dash={styleDash}
                fill="transparent"
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={14}
                shadowOffsetY={4}
                listening={false}
                perfectDrawEnabled={false}
              />
              <Ellipse
                x={previewCx}
                y={previewCy}
                radiusX={Math.max(1, previewRx - strokeWidth)}
                radiusY={Math.max(1, previewRy - strokeWidth)}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1}
                listening={false}
                perfectDrawEnabled={false}
              />
            </>
          )}

          {/*
            Bubble hit target. Unselected it just forwards the click to the group
            so the bubble selects the magnifier like any other annotation; once
            selected it becomes the grab handle that moves the bubble freely.
            Not Konva-draggable: see useHandleDrag.
          */}
          <Ellipse
            x={previewCx}
            y={previewCy}
            radiusX={previewRx}
            radiusY={previewRy}
            fill="rgba(0,0,0,0)"
            listening={listening}
            {...(canDragBubble ? onBubbleDrag : {})}
            {...(canDragBubble ? {
              onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => { onBubblePress?.(); onBubbleDrag.onPointerDown(e); },
            } : {})}
            perfectDrawEnabled={false}
          />

          {/* Bubble frame and corner handles, like any shape: dragging a corner
              resizes the bubble, which is the zoom. */}
          {canReposition && (
            <>
              <Rect
                x={previewCx - previewRx - SELECT_PAD}
                y={previewCy - previewRy - SELECT_PAD}
                width={(previewRx + SELECT_PAD) * 2}
                height={(previewRy + SELECT_PAD) * 2}
                stroke={theme.accent}
                strokeWidth={1}
                listening={false}
                perfectDrawEnabled={false}
              />
              {CORNERS.map(([fx, fy]) => (
                <Rect
                  key={`${el.id}-bz${fx}${fy}`}
                  x={previewCx + (fx ? 1 : -1) * (previewRx + SELECT_PAD)}
                  y={previewCy + (fy ? 1 : -1) * (previewRy + SELECT_PAD)}
                  {...squareHandle}
                  cursor={fx === fy ? 'nwse-resize' : 'nesw-resize'}
                  {...onBubbleResize}
                />
              ))}
            </>
          )}

          </Group>

          {/* Leader bend: drag sideways to curve the connector (the bubble is
              itself freely draggable, so a separate length handle was redundant). */}
          {canReposition && (
            <Circle
              x={leaderControl ? leaderControl.x : leaderMid.x}
              y={leaderControl ? leaderControl.y : leaderMid.y}
              {...lengthHandle}
              {...onLeaderBendDrag}
              {...hoverEvents}
            />
          )}
        </>
      )}

      {/*
        Selection affordance. The shared Transformer skips magnifiers (its box
        would wrap the bubble and scaling it would break the linked geometry),
        so the frame and handles are drawn here in the same accent styling.
      */}
      {canEdit && (
        <>
          <Rect
            x={-SELECT_PAD}
            y={-SELECT_PAD}
            width={w + SELECT_PAD * 2}
            height={h + SELECT_PAD * 2}
            stroke={theme.accent}
            strokeWidth={1}
            listening={false}
            perfectDrawEnabled={false}
          />
          {canResize && CORNERS.map(([fx, fy]) => {
            const idx = fy * 2 + fx;
            return (
              <Rect
                key={`${el.id}-rs${fx}${fy}`}
                ref={(node) => { handleNodesRef.current[idx] = node; }}
                x={fx ? w + SELECT_PAD : -SELECT_PAD}
                y={fy ? h + SELECT_PAD : -SELECT_PAD}
                {...squareHandle}
                cursor={fx === fy ? 'nwse-resize' : 'nesw-resize'}
                {...cornerDragProps(fx, fy)}
              />
            );
          })}
        </>
      )}
    </Group>
  );
}
