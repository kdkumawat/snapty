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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Group, Ellipse, Line, Circle, Rect, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { MagnifierElement } from '@/types/editor';
import {
  magnifierMetrics,
  resolvePreviewOffset,
  leaderGeometry,
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
  /** Commit the bubble placement as a single undo step. The live drag itself
   *  stays in component-local state, so the store (and the rest of the editor)
   *  is not touched until release. */
  onPreviewOffsetCommit?: (offset: { x: number; y: number }) => void;
  /** Commit the source bbox as a single undo step (radii + new top-left). */
  onRadiiCommit?: (radii: { rx: number; ry: number; topLeftX: number; topLeftY: number }) => void;
  /** Commit the leader bend as a single undo step (0 = straight, ±1 = full curve). */
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
 * one component update per pointer event.
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

/** Live gesture values held locally during a drag; committed to the store on release. */
type LivePatch = {
  previewOffset?: { x: number; y: number };
  radii?: { rx: number; ry: number; topLeftX: number; topLeftY: number };
  leaderBend?: number;
};

export default function MagnifierKonva({
  el: elProp,
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
  onPreviewOffsetCommit,
  onRadiiCommit,
  onLeaderBendCommit,
}: Props) {
  // Live drag values stay in component-local state: each move re-renders ONLY
  // this component (the zoom painting is imperative anyway), and the global
  // store hears about the gesture once, at commit. The old path pushed every
  // frame through the store, re-rendering the entire annotation scene.
  const [live, setLive] = useState<LivePatch | null>(null);
  const el = useMemo<MagnifierElement>(() => {
    if (!live) return elProp;
    const next: MagnifierElement = { ...elProp };
    if (live.previewOffset) next.previewOffset = live.previewOffset;
    if (live.leaderBend !== undefined) next.leaderBend = live.leaderBend;
    if (live.radii) {
      next.x = live.radii.topLeftX;
      next.y = live.radii.topLeftY;
      next.width = live.radii.rx * 2;
      next.height = live.radii.ry * 2;
    }
    return next;
  }, [elProp, live]);
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

  // Crosshair alignment lines spanning the source box through its center.
  const crosshairOpacity = handDrawn ? 0.45 : 0.7;
  const crosshair = [
    [0, srcCy, w, srcCy],
    [srcCx, 0, srcCx, h],
  ];

  const canEdit = !!selected && !draft && !!draggable;
  const canReposition = canEdit && typeof onPreviewOffsetCommit === 'function';
  const canResize = canEdit && typeof onRadiiCommit === 'function';
  const theme = getSelectionTheme();
  const handle = selectionHandleProps('endpoint');
  const lengthHandle = selectionHandleProps('bend');
  const hoverEvents = handleHoverEvents();

  /** Bubble: free placement, the offset is just pointer-minus-source-center. */
  const bubbleOffsetAt = useCallback(
    (local: { x: number; y: number }) => ({ x: local.x - srcCx, y: local.y - srcCy }),
    [srcCx, srcCy],
  );
  const onBubbleDrag = useHandleDrag(
    groupRef,
    useCallback((local) => {
      setLive((p) => ({ ...(p ?? {}), previewOffset: bubbleOffsetAt(local) }));
    }, [bubbleOffsetAt]),
    useCallback((local) => {
      setLive(null);
      onPreviewOffsetCommit?.(bubbleOffsetAt(local));
    }, [onPreviewOffsetCommit, bubbleOffsetAt]),
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
  const onLeaderBendDrag = useHandleDrag(
    groupRef,
    useCallback(
      (local) => {
        setLive((p) => ({ ...(p ?? {}), leaderBend: bendFromHandle(lSx, lSy, lEx, lEy, local.x, local.y) }));
      },
      [lSx, lSy, lEx, lEy],
    ),
    useCallback(
      (local) => {
        setLive(null);
        onLeaderBendCommit?.(bendFromHandle(lSx, lSy, lEx, lEy, local.x, local.y));
      },
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
  const handleNodesRef = useRef<(Konva.Circle | null)[]>([null, null, null, null]);
  const dragOriginRef = useRef<{ w: number; h: number } | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const onCornerMoveSmooth = useCallback(
    (local: { x: number; y: number }) => {
      dragHandleLocalRef.current = local;
      const corner = draggingCornerRef.current;
      if (!corner) return;
      const origin = dragOriginRef.current ?? { w, h };
      setLive((p) => ({
        ...(p ?? {}),
        radii: radiiFromCorner(local, corner.fx, corner.fy, origin.w, origin.h),
      }));
    },
    [w, h],
  );
  const onCornerCommitSmooth = useCallback(
    (local: { x: number; y: number }) => {
      const corner = draggingCornerRef.current;
      draggingCornerRef.current = null;
      dragHandleLocalRef.current = null;
      dragOriginRef.current = null;
      // Re-render so the handle snaps back to its prop-driven initial position.
      forceRender();
      setLive(null);
      if (!corner) return;
      const origin = { w, h };
      onRadiiCommit?.(radiiFromCorner(local, corner.fx, corner.fy, origin.w, origin.h));
    },
    [onRadiiCommit, w, h],
  );
  const baseCornerDrag = useHandleDrag(groupRef, onCornerMoveSmooth, onCornerCommitSmooth);
  const cornerDragProps = useCallback(
    (fx: 0 | 1, fy: 0 | 1) => ({
      onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
        dragOriginRef.current = { w, h };
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
    [baseCornerDrag, w, h],
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
          dash={selected ? (styleDash ?? [5, 4]) : styleDash}
          fill="rgba(255,255,255,0.03)"
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* Crosshair alignment lines through the source center. Shown only while
          placing or editing: as a finished annotation the plain ring reads
          cleaner, and the alignment grid is a tool, not part of the export. */}
      {(draft || selected) && (
        <>
          {crosshair.map((pts, i) => (
            <Line
              key={`${el.id}-x${i}`}
              points={pts}
              stroke={stroke}
              strokeWidth={Math.max(1, strokeWidth * 0.5)}
              opacity={crosshairOpacity}
              dash={[4, 3]}
              listening={false}
              perfectDrawEnabled={false}
            />
          ))}
          <Circle
            x={srcCx}
            y={srcCy}
            radius={Math.max(2, strokeWidth * 0.9)}
            fill={stroke}
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}

      {hasPreview && (
        <>
          <Line
            points={leaderControl
              ? [lSx, lSy, leaderControl.x, leaderControl.y, lEx, lEy]
              : [lSx, lSy, lEx, lEy]}
            tension={leaderControl ? 0.5 : 0}
            stroke={stroke}
            strokeWidth={Math.max(1.25, strokeWidth * 0.65)}
            lineCap="round"
            opacity={0.55}
            listening={false}
            perfectDrawEnabled={false}
          />
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
                dash={styleDash ?? (canReposition ? [5, 4] : undefined)}
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
            {...(canReposition ? onBubbleDrag : {})}
            perfectDrawEnabled={false}
          />

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
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
            perfectDrawEnabled={false}
          />
          {canResize && CORNERS.map(([fx, fy]) => {
            const idx = fy * 2 + fx;
            return (
              <Circle
                key={`${el.id}-rs${fx}${fy}`}
                ref={(node) => { handleNodesRef.current[idx] = node; }}
                x={fx ? w + SELECT_PAD : -SELECT_PAD}
                y={fy ? h + SELECT_PAD : -SELECT_PAD}
                {...handle}
                {...cornerDragProps(fx, fy)}
                {...hoverEvents}
              />
            );
          })}
        </>
      )}
    </Group>
  );
}
