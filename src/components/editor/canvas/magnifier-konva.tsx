'use client';

/**
 * Magnifier: Shottr-style spyglass.
 * An elliptical source (the region being magnified) with crosshair alignment
 * lines, plus a linked bubble that enlarges the region and adds a pixel grid.
 * Source radii are independent, so the magnifier can be a circle or an ellipse,
 * and the bubble can be dragged anywhere rather than orbiting at a fixed radius.
 *
 * The zoom is painted into one persistent offscreen canvas on an animation frame —
 * never re-allocated, never routed through React state — so the bubble tracks the
 * source live while drawing, dragging and resizing instead of catching up afterwards.
 * Supports hand-drawn rings via Rough when enabled.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Group, Ellipse, Line, Circle, Rect, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { MagnifierElement } from '@/types/editor';
import {
  magnifierMetrics,
  resolvePreviewOffset,
} from '@/lib/editor/magnifier-geometry';
import { selectionHandleProps, getSelectionTheme } from '@/lib/selection-theme';
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
  /** Live update while repositioning the magnified bubble (offset from source center). */
  onPreviewOffsetMove?: (offset: { x: number; y: number }) => void;
  /** Commit the bubble placement as a single undo step. */
  onPreviewOffsetCommit?: (offset: { x: number; y: number }) => void;
  /** Live update while resizing the source ellipse (radii in image units). */
  onRadiiMove?: (radii: { rx: number; ry: number }) => void;
  /** Commit the source radii as a single undo step. */
  onRadiiCommit?: (radii: { rx: number; ry: number }) => void;
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
        if (pendingRef.current) onMove(pendingRef.current);
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      cancelFrame();
      const local = pendingRef.current;
      pendingRef.current = null;
      if (local) onCommit(local);
    };

    // On window rather than the stage so the gesture survives the pointer
    // leaving the canvas, which is easy to do when dragging the bubble outward.
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }, [toLocal, onMove, onCommit, cancelFrame]);

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
 * Source radii implied by dragging a corner handle to `local`. Resizing is
 * center-fixed so the magnified region does not slide out from under the ring.
 * Each axis is independent, so corners can shape an ellipse.
 */
function radiiFromCorner(
  local: { x: number; y: number },
  w: number,
  h: number,
): { rx: number; ry: number } {
  return {
    rx: Math.max(8, Math.abs(local.x - w / 2)),
    ry: Math.max(8, Math.abs(local.y - h / 2)),
  };
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
  onPreviewOffsetMove,
  onPreviewOffsetCommit,
  onRadiiMove,
  onRadiiCommit,
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
  // Direction from source to bubble, used for the leader line and its endpoints.
  const angle = Math.atan2(off.oy, off.ox);

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

  // Leader line: from the source rim to the bubble rim along the offset vector.
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const leader = [
    srcCx + cosA * (rx + 3),
    srcCy + sinA * (ry + 3),
    previewCx - cosA * (previewRx + 3),
    previewCy - sinA * (previewRy + 3),
  ];

  // Crosshair alignment lines spanning the source box through its center.
  const crosshairOpacity = handDrawn ? 0.45 : 0.7;
  const crosshair = [
    [0, srcCy, w, srcCy],
    [srcCx, 0, srcCx, h],
  ];

  const canEdit = !!selected && !draft && !!draggable;
  const canReposition = canEdit && typeof onPreviewOffsetMove === 'function';
  const canResize = canEdit && typeof onRadiiMove === 'function';
  const theme = getSelectionTheme();
  const handle = selectionHandleProps('endpoint');
  const lengthHandle = selectionHandleProps('bend');

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

  /**
   * Connector length: keeps the bubble's direction, changes only how far out it
   * sits. Dragging the bubble itself moves it freely; this handle is for
   * lengthening or shortening the leader line without re-aiming it.
   */
  const lengthOffsetAt = useCallback(
    (local: { x: number; y: number }) => {
      const dx = local.x - srcCx;
      const dy = local.y - srcCy;
      // Project onto the current direction so sideways wobble does not re-aim.
      const projected = dx * cosA + dy * sinA;
      const minDist = Math.max(rx, ry) + Math.max(previewRx, previewRy) * 0.15;
      const dist = Math.max(minDist, projected);
      return { x: cosA * dist, y: sinA * dist };
    },
    [srcCx, srcCy, cosA, sinA, rx, ry, previewRx, previewRy],
  );
  const onLengthDrag = useHandleDrag(
    groupRef,
    useCallback((local) => onPreviewOffsetMove?.(lengthOffsetAt(local)), [onPreviewOffsetMove, lengthOffsetAt]),
    useCallback((local) => onPreviewOffsetCommit?.(lengthOffsetAt(local)), [onPreviewOffsetCommit, lengthOffsetAt]),
  );

  const onCornerDrag = useHandleDrag(
    groupRef,
    useCallback((local) => onRadiiMove?.(radiiFromCorner(local, w, h)), [onRadiiMove, w, h]),
    useCallback((local) => onRadiiCommit?.(radiiFromCorner(local, w, h)), [onRadiiCommit, w, h]),
  );

  // Midpoint of the leader line, where the length handle sits.
  const leaderMid = {
    x: (leader[0] + leader[2]) / 2,
    y: (leader[1] + leader[3]) / 2,
  };

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

      {/* Crosshair alignment lines through the source center. */}
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

      {hasPreview && (
        <>
          <Line
            points={leader}
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

          {/* Connector length: slide the bubble in/out along its current direction. */}
          {canReposition && (
            <Circle
              x={leaderMid.x}
              y={leaderMid.y}
              {...lengthHandle}
              {...onLengthDrag}
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
          {canResize && CORNERS.map(([fx, fy]) => (
            <Circle
              key={`${el.id}-rs${fx}${fy}`}
              x={fx ? w + SELECT_PAD : -SELECT_PAD}
              y={fy ? h + SELECT_PAD : -SELECT_PAD}
              {...handle}
              {...onCornerDrag}
            />
          ))}
        </>
      )}
    </Group>
  );
}
