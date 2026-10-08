'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { Circle, Group, Rect } from 'react-konva';
import type Konva from 'konva';
import type { EditorElement, ShapeElement, StepElement, CalloutElement, CalloutPointerDirection } from '@/types/editor';
import { getSelectionTheme, handleHoverEvents } from '@/lib/selection-theme';
import type { Bounds } from '@/lib/editor/snap-guides';
import { calloutPointerTip as getCalloutPointerTip, calloutTipOf } from '@/lib/editor/callout-pointer';

/**
 * Custom shape selection/transform overlay (Excalidraw-style).
 *
 * Replaces the generic Konva Transformer for single selections of box-shaped
 * annotations (rectangle, rounded-rect, circle, diamond, step): a thin dashed
 * outline that hugs the element, small zoom-invariant grab handles on the
 * corners/edges, and a rotate handle above the box. No React state and no
 * store writes happen while a handle is dragged — the element node and the
 * overlay nodes are mutated imperatively (Konva attrs + batchDraw), exactly
 * like the arrow/line handles, and the gesture commits once on release as a
 * single undo step via the parent's `onCommit`.
 *
 * Resize math: pointer → element-local frame (rotation undone), new box from
 * the fixed opposite edge/corner, then the node is scaled and repositioned so
 * the fixed reference stays glued in world space. Shift (or a uniform-scale
 * type) keeps the aspect ratio; rotation snaps to 15° steps with Shift.
 */

export type OverlayAnchor =
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'middle-left' | 'middle-right' | 'top-center' | 'bottom-center';

const MIN_SIZE = 5;
/** Rotate-handle standoff above the box, screen px (image px = /zoom). */
// Excalidraw's selection chrome, in screen px: the frame sits 4px outside the
// element, corner handles are 8px rounded squares, and the rotation handle
// floats 16px above the frame.
const ROTATE_GAP = 16;
const SELECTION_PAD = 4;
const HANDLE_SIZE = 8;

interface AnchorDef {
  /** Fixed reference point in BASE-local coords (stays glued to the world). */
  fx: number;
  fy: number;
  cursor: string;
  axis: 'both' | 'x' | 'y';
}

function anchorDefs(w: number, h: number): Record<OverlayAnchor, AnchorDef> {
  return {
    'top-left':      { fx: w,     fy: h,     cursor: 'nwse-resize', axis: 'both' },
    'top-right':     { fx: 0,     fy: h,     cursor: 'nesw-resize', axis: 'both' },
    'bottom-left':   { fx: w,     fy: 0,     cursor: 'nesw-resize', axis: 'both' },
    'bottom-right':  { fx: 0,     fy: 0,     cursor: 'nwse-resize', axis: 'both' },
    'middle-left':   { fx: w,     fy: h / 2, cursor: 'ew-resize',   axis: 'x' },
    'middle-right':  { fx: 0,     fy: h / 2, cursor: 'ew-resize',   axis: 'x' },
    'top-center':    { fx: w / 2, fy: h,     cursor: 'ns-resize',   axis: 'y' },
    'bottom-center': { fx: w / 2, fy: 0,     cursor: 'ns-resize',   axis: 'y' },
  };
}

/** Handle position inside the overlay group (image units, box-local). */
function anchorPos(k: OverlayAnchor, w: number, h: number): [number, number] {
  switch (k) {
    case 'top-left': return [0, 0];
    case 'top-right': return [w, 0];
    case 'bottom-left': return [0, h];
    case 'bottom-right': return [w, h];
    case 'middle-left': return [0, h / 2];
    case 'middle-right': return [w, h / 2];
    case 'top-center': return [w / 2, 0];
    case 'bottom-center': return [w / 2, h];
  }
}

/** Handle position on the padded selection frame. */
function framePos(k: OverlayAnchor, w: number, h: number, pad: number): [number, number] {
  const [x, y] = anchorPos(k, w + pad * 2, h + pad * 2);
  return [x - pad, y - pad];
}

const CORNER_ANCHORS: OverlayAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ALL_ANCHORS: OverlayAnchor[] = [
  ...CORNER_ANCHORS,
  'middle-left', 'middle-right', 'top-center', 'bottom-center',
];

/** Box-shaped types the overlay owns (text keeps the Transformer re-wrap UX). */
const OVERLAY_TYPES = new Set(['rectangle', 'rounded-rect', 'circle', 'diamond', 'step', 'callout', 'spotlight']);

export function isShapeOverlayType(type: string): boolean {
  return OVERLAY_TYPES.has(type);
}

/** Uniform-scale types: corner handles only, always keep aspect (like Excalidraw's
 *  proportional resize for images). Overlay images and step badges qualify. */
function isUniformScale(el: EditorElement): boolean {
  if (el.type === 'step') return true;
  if (el.type === 'rectangle') return !!(el as ShapeElement).imageDataURL;
  return false;
}

/** The element's visual (rendered) box in image coords, normalized to positive size. */
export function elementSelectionBox(el: EditorElement): Bounds {
  if (el.type === 'step') {
    const r = (el as StepElement).radius ?? 16;
    return { x: el.x - r, y: el.y - r, w: r * 2, h: r * 2 };
  }
  if ('width' in el && 'height' in el) {
    const w = Math.abs((el as { width: number }).width);
    const h = Math.abs((el as { height: number }).height);
    const x = (el as { width: number }).width < 0 ? el.x + (el as { width: number }).width : el.x;
    const y = (el as { height: number }).height < 0 ? el.y + (el as { height: number }).height : el.y;
    return { x, y, w, h };
  }
  return { x: el.x, y: el.y, w: 0, h: 0 };
}

interface DragState {
  kind: 'resize' | 'rotate' | 'callout-pointer';
  /** Absolute tip of a callout being resized, held fixed through the drag. */
  calloutAbsTip?: { x: number; y: number };
  /** Callout pointer drag: current element state snapshot. */
  calloutBase?: { width: number; height: number; pointerOffset: number; pointerLength: number; pointerWidth: number; pointerDirection: CalloutPointerDirection };
  /** Visual box (already includes any residual element scale). */
  base: Bounds;
  rotDeg: number;
  /** Resize: */
  anchor?: OverlayAnchor;
  uniform: boolean;
  centered: boolean;
  /** Rotate: fixed box center + initial pointer angle. */
  cx?: number;
  cy?: number;
  startAng?: number;
}

interface Props {
  el: EditorElement;
  zoom: number;
  annotationsLocked: boolean;
  getNode: (id: string) => Konva.Node | undefined;
  toImagePoint: () => { x: number; y: number } | null;
  /** Imperative live binding / label reflow during the gesture. */
  onLiveTransform: (el: EditorElement, node: Konva.Node) => void;
  /** Commit the gesture as one undo step (parent bakes node attrs into the store). */
  onCommit: (id: string, node: Konva.Node) => void;
}

export default function ShapeSelectionOverlay({
  el, zoom, annotationsLocked, getNode, toImagePoint, onLiveTransform, onCommit,
}: Props) {
  const theme = getSelectionTheme();
  const groupRef = useRef<Konva.Group | null>(null);
  const outlineRef = useRef<Konva.Rect | null>(null);
  const rotateRef = useRef<Konva.Circle | null>(null);
  const handleRefs = useRef<Partial<Record<OverlayAnchor, Konva.Shape | null>>>({});
  const dragRef = useRef<DragState | null>(null);
  const isCallout = el.type === 'callout';
  const calloutNodeRef = useRef<Konva.Circle>(null);
  const calloutPendingRef = useRef<Partial<CalloutElement> | null>(null);
  const calloutRafRef = useRef<number | null>(null);

  const raw = elementSelectionBox(el);
  const sx0 = el.scaleX ?? 1;
  const sy0 = el.scaleY ?? 1;
  const baseBox: Bounds = { x: raw.x, y: raw.y, w: raw.w * sx0, h: raw.h * sy0 };
  const rotDeg = el.rotation ?? 0;
  const rot = (rotDeg * Math.PI) / 180;
  const uniform = isUniformScale(el);
  const anchors = anchorDefs(baseBox.w, baseBox.h);
  const handleKeys = uniform ? CORNER_ANCHORS : ALL_ANCHORS;
  const pad = SELECTION_PAD / zoom;
  const rotateGap = pad + ROTATE_GAP / zoom;
  const hover = handleHoverEvents();

  /** Reposition every overlay node to the current box (image coords). */
  const updateOverlay = (ox: number, oy: number, nw: number, nh: number, r: number) => {
    groupRef.current?.setAttrs({ x: ox, y: oy, rotation: r });
    outlineRef.current?.setAttrs({ width: nw + pad * 2, height: nh + pad * 2 });
    for (const k of ALL_ANCHORS) {
      const n = handleRefs.current[k];
      if (n) {
        const [px, py] = framePos(k, nw, nh, pad);
        n.position({ x: px, y: py });
      }
    }
    rotateRef.current?.position({ x: nw / 2, y: -rotateGap });
  };

  /** Follow the element while its BODY is dragged (Konva moves the node; the
   *  overlay is a sibling). Resize/rotate handlers update the overlay directly. */
  useEffect(() => {
    const node = getNode(el.id);
    if (!node) return;
    // Where the node origin sits inside the visual box (top-left vs center).
    const centered = node.getClassName?.() === 'Ellipse' || node.getClassName?.() === 'Group';
    const offset = centered
      ? { x: baseBox.w / 2, y: baseBox.h / 2 }
      : { x: raw.x - el.x, y: raw.y - el.y };
    const sync = () => {
      const g = groupRef.current;
      if (!g) return;
      g.setAttrs({
        x: node.x() + offset.x,
        y: node.y() + offset.y,
        rotation: node.rotation() ?? 0,
      });
      // A callout's tip stays on its target while the bubble is dragged, so
      // its handle follows the node's live tip, not the bubble.
      const liveTip = node.getAttr('tip') as { x: number; y: number } | undefined;
      if (liveTip && calloutNodeRef.current) {
        calloutNodeRef.current.position({ x: baseBox.w / 2 + liveTip.x, y: baseBox.h / 2 + liveTip.y });
      }
      node.getLayer()?.batchDraw();
      // The overlay can live on another layer than the node.
      if (g.getLayer() !== node.getLayer()) g.getLayer()?.batchDraw();
    };
    node.on('dragmove', sync);
    return () => {
      node.off('dragmove', sync);
    };
    // Geometry deps: a resize/rotate commit rewrites x/y/size, so the
    // node→overlay offset must be re-derived from the fresh element.
  }, [el.id, raw.x, raw.y, baseBox.w, baseBox.h]);

  const setHandleActive = (node: Konva.Shape) => {
    node.fill(theme.accent);
    node.getLayer()?.batchDraw();
  };
  const setHandleIdle = (node: Konva.Shape) => {
    node.fill('#ffffff');
    node.getLayer()?.batchDraw();
  };

  // --- Resize ---

  const startResize = (k: OverlayAnchor) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const node = getNode(el.id);
    dragRef.current = {
      kind: 'resize',
      base: baseBox,
      rotDeg,
      anchor: k,
      uniform,
      centered: !!node && (node.getClassName?.() === 'Ellipse' || node.getClassName?.() === 'Group'),
      calloutAbsTip: isCallout
        ? (() => {
            const t = calloutTipOf({ ...(el as CalloutElement), width: baseBox.w, height: baseBox.h });
            return { x: baseBox.x + baseBox.w / 2 + t.x, y: baseBox.y + baseBox.h / 2 + t.y };
          })()
        : undefined,
    };
    setHandleActive(e.target as Konva.Shape);
  };

  const moveResize = (e: Konva.KonvaEventObject<DragEvent>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'resize' || !d.anchor) return;
    const P = toImagePoint();
    if (!P) return;
    const node = getNode(el.id);
    if (!node) return;
    const a = anchors[d.anchor];
    const rad = (d.rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Pointer in the element's local (unrotated) frame.
    const dx = P.x - d.base.x;
    const dy = P.y - d.base.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;

    // Signed distances along the growth direction from the fixed reference:
    // the box never flips — dragging a handle past the opposite edge clamps
    // at the minimum size instead of mirroring (the element would otherwise
    // jump to the wrong side of its own origin).
    const growX = (a.fx > 0 ? -1 : 1) * (lx - a.fx);
    const growY = (a.fy > 0 ? -1 : 1) * (ly - a.fy);
    let nw: number;
    let nh: number;
    if (a.axis === 'both') {
      nw = Math.max(MIN_SIZE, growX);
      nh = Math.max(MIN_SIZE, growY);
    } else if (a.axis === 'x') {
      nw = Math.max(MIN_SIZE, growX);
      nh = d.base.h;
    } else {
      nw = d.base.w;
      nh = Math.max(MIN_SIZE, growY);
    }
    // Shift (corners) or uniform types keep the aspect ratio — the dragged
    // corner rides the diagonal from the fixed corner.
    const ratio = d.base.w / d.base.h;
    const shift = !!(e.evt as MouseEvent).shiftKey;
    if (d.uniform || (a.axis === 'both' && shift)) {
      if (nw / nh > ratio) nw = nh * ratio;
      else nh = nw / ratio;
    }

    // Node scale in RAW units (visual = rawSize · scale); any residual
    // element scale from the committed state is folded in so the visual box
    // lands on the new size and the commit bake is exact.
    const scX = (el.scaleX ?? 1) * (nw / d.base.w);
    const scY = (el.scaleY ?? 1) * (nh / d.base.h);
    // Scale around the node origin, then move the origin so the fixed
    // reference point stays glued to the world (Konva Transformer semantics).
    const corrX = a.fx * (1 - scX);
    const corrY = a.fy * (1 - scY);
    const ox = d.base.x + corrX * cos - corrY * sin;
    const oy = d.base.y + corrX * sin + corrY * cos;
    // Node origin within the visual box (Ellipse/step badges are centered).
    const offX = d.centered ? d.base.w / 2 : 0;
    const offY = d.centered ? d.base.h / 2 : 0;
    const nx = ox + offX * scX * cos - offY * scY * sin;
    const ny = oy + offX * scX * sin + offY * scY * cos;

    node.setAttrs({ x: nx, y: ny, scaleX: scX, scaleY: scY });
    // A callout's tip stays on its target while the body is resized: the
    // shape draws in raw (pre-scale) units from its body centre, so solve
    // for the raw tip that lands on the fixed absolute point.
    if (isCallout && d.calloutAbsTip && !d.rotDeg) {
      const tipRaw = {
        x: (d.calloutAbsTip.x - nx) / scX - d.base.w / 2,
        y: (d.calloutAbsTip.y - ny) / scY - d.base.h / 2,
      };
      node.setAttr('tip', tipRaw);
      calloutNodeRef.current?.position({ x: d.calloutAbsTip.x - ox, y: d.calloutAbsTip.y - oy });
    }
    updateOverlay(ox, oy, nw, nh, d.rotDeg);
    onLiveTransform(el, node);
    node.getLayer()?.batchDraw();
  };

  const endResize = (e: Konva.KonvaEventObject<DragEvent>) => {
    moveResize(e); // apply the final pointer position
    dragRef.current = null;
    setHandleIdle(e.target as Konva.Shape);
    const node = getNode(el.id);
    if (node) onCommit(el.id, node);
  };

  // --- Rotate ---

  const startRotate = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const P = toImagePoint();
    if (!P) return;
    const node = getNode(el.id);
    const cx = baseBox.x + (baseBox.w / 2) * Math.cos(rot) - (baseBox.h / 2) * Math.sin(rot);
    const cy = baseBox.y + (baseBox.w / 2) * Math.sin(rot) + (baseBox.h / 2) * Math.cos(rot);
    dragRef.current = {
      kind: 'rotate',
      base: baseBox,
      rotDeg,
      uniform,
      centered: !!node && (node.getClassName?.() === 'Ellipse' || node.getClassName?.() === 'Group'),
      cx,
      cy,
      startAng: Math.atan2(P.y - cy, P.x - cx),
    };
    setHandleActive(e.target as Konva.Shape);
  };

  const moveRotate = (e: Konva.KonvaEventObject<DragEvent>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'rotate' || d.cx === undefined || d.cy === undefined) return;
    const P = toImagePoint();
    if (!P) return;
    const node = getNode(el.id);
    if (!node) return;
    const ang = Math.atan2(P.y - d.cy, P.x - d.cx) - (d.startAng ?? 0);
    let deg = d.rotDeg + (ang * 180) / Math.PI;
    if ((e.evt as MouseEvent).shiftKey) deg = Math.round(deg / 15) * 15;
    const rad = (deg * Math.PI) / 180;
    // Box top-left after rotating about the fixed center.
    const hx = (d.base.w / 2) * Math.cos(rad) - (d.base.h / 2) * Math.sin(rad);
    const hy = (d.base.w / 2) * Math.sin(rad) + (d.base.h / 2) * Math.cos(rad);
    // Centered nodes rotate about their origin (the box center) already.
    node.setAttrs({
      x: d.centered ? d.cx : d.cx - hx,
      y: d.centered ? d.cy : d.cy - hy,
      rotation: deg,
    });
    updateOverlay(d.cx - hx, d.cy - hy, d.base.w, d.base.h, deg);
    onLiveTransform(el, node);
    node.getLayer()?.batchDraw();
  };

  const endRotate = (e: Konva.KonvaEventObject<DragEvent>) => {
    moveRotate(e);
    dragRef.current = null;
    setHandleIdle(e.target as Konva.Shape);
    const node = getNode(el.id);
    if (node) onCommit(el.id, node);
  };

  // --- Callout pointer handle ---


  /** Compute the pointer tip position in overlay-local (unrotated) coords. */
  const calloutPointerTipPos = (): { x: number; y: number } | null => {
    if (!isCallout) return null;
    const co = el as CalloutElement;
    const cw = Math.max(1, baseBox.w);
    const ch = Math.max(1, baseBox.h);
    const dir = co.pointerDirection ?? 'bottom-left';
    const offset = co.pointerOffset ?? 0.5;
    const pLen = co.pointerLength ?? 24;
    const pWid = co.pointerWidth ?? 20;
    return getCalloutPointerTip(cw, ch, dir, offset, pLen, pWid, calloutTipOf({ ...co, width: cw, height: ch }));
  };

  const startCalloutPointer = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const co = el as CalloutElement;
    dragRef.current = {
      kind: 'callout-pointer',
      base: baseBox,
      rotDeg,
      uniform,
      centered: false,
      calloutBase: {
        width: baseBox.w,
        height: baseBox.h,
        pointerOffset: co.pointerOffset ?? 0.5,
        pointerLength: co.pointerLength ?? 16,
        pointerWidth: co.pointerWidth ?? 20,
        pointerDirection: (co.pointerDirection ?? 'bottom-left') as CalloutPointerDirection,
      },
    };
    setHandleActive(e.target as Konva.Shape);
  };

  const moveCalloutPointer = (_e: Konva.KonvaEventObject<DragEvent>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'callout-pointer' || !d.calloutBase) return;
    const P = toImagePoint();
    if (!P) return;
    const node = getNode(el.id);
    if (!node) return;
    const rad = (d.rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = P.x - (d.base.x);
    const dy = P.y - (d.base.y);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const cw = d.calloutBase.width;
    const ch = d.calloutBase.height;
    // The tip follows the pointer freely (relative to the body centre), so
    // the callout can be aimed at any spot at any distance.
    calloutPendingRef.current = { pointerTip: { x: lx - cw / 2, y: ly - ch / 2 } };
    if (calloutRafRef.current !== null) return;
    calloutRafRef.current = requestAnimationFrame(() => {
      calloutRafRef.current = null;
      const pending = calloutPendingRef.current;
      calloutPendingRef.current = null;
      if (!pending) return;
      useEditorStore.getState().updateElementSilent(el.id, pending as Partial<CalloutElement>);
      node.getLayer()?.batchDraw();
    });
  };

  const endCalloutPointer = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Flush any pending silent update as a single commit
    if (calloutRafRef.current !== null) {
      cancelAnimationFrame(calloutRafRef.current);
      calloutRafRef.current = null;
    }
    const pending = calloutPendingRef.current;
    calloutPendingRef.current = null;
    dragRef.current = null;
    setHandleIdle(e.target as Konva.Shape);
    if (pending) {
      useEditorStore.getState().commitElementUpdate(el.id, pending as Partial<CalloutElement>);
    } else {
      const node = getNode(el.id);
      if (node) onCommit(el.id, node);
    }
  };

  if (baseBox.w < MIN_SIZE || baseBox.h < MIN_SIZE) return null;

  return (
    <Group
      ref={groupRef}
      x={baseBox.x}
      y={baseBox.y}
      rotation={rotDeg}
    >
      {/* Excalidraw's selection frame: a thin solid line just outside the element. */}
      <Rect
        ref={outlineRef}
        x={-pad}
        y={-pad}
        width={baseBox.w + pad * 2}
        height={baseBox.h + pad * 2}
        stroke={theme.accent}
        strokeWidth={1 / zoom}
        listening={false}
        perfectDrawEnabled={false}
      />
      {!annotationsLocked && (
        <>
          {handleKeys.map((k) => {
            const def = anchors[k];
            const [px, py] = framePos(k, baseBox.w, baseBox.h, pad);
            const corner = CORNER_ANCHORS.includes(k);
            const common = {
              x: px,
              y: py,
              name: 'edit-handle',
              cursor: def.cursor,
              draggable: true,
              onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; },
              onDragStart: startResize(k),
              onDragMove: moveResize,
              onDragEnd: endResize,
            };
            // Corners are visible squares. Sides have no handle, as in
            // Excalidraw on desktop: the frame edge itself is the grab zone.
            return corner ? (
              <Rect
                key={k}
                ref={(n) => { handleRefs.current[k] = n; }}
                {...common}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                offsetX={HANDLE_SIZE / 2}
                offsetY={HANDLE_SIZE / 2}
                cornerRadius={2}
                fill="#ffffff"
                stroke={theme.accent}
                strokeWidth={1}
                hitStrokeWidth={12}
              />
            ) : (
              <Circle
                key={k}
                ref={(n) => { handleRefs.current[k] = n; }}
                {...common}
                radius={4}
                opacity={0}
                hitStrokeWidth={16}
              />
            );
          })}
          <Circle
            ref={rotateRef}
            name="edit-handle"
            x={baseBox.w / 2}
            y={-rotateGap}
            radius={HANDLE_SIZE / 2}
            fill="#ffffff"
            stroke={theme.accent}
            strokeWidth={1}
            hitStrokeWidth={14}
            cursor="grab"
            draggable
            onMouseDown={(e) => { e.cancelBubble = true; }}
            onDragStart={startRotate}
            onDragMove={moveRotate}
            onDragEnd={endRotate}
          />
          {/* Callout pointer drag handle — sits at the pointer tip. */}
          {isCallout && (() => {
            const tip = calloutPointerTipPos();
            if (!tip) return null;
            return (
              <Circle
                ref={calloutNodeRef}
                name="edit-handle"
                x={tip.x}
                y={tip.y}
                // Same white dot with an accent ring as every other point handle.
                radius={4.5}
                fill="#ffffff"
                stroke={theme.accent}
                strokeWidth={1}
                shadowColor={theme.shadow}
                shadowBlur={3}
                shadowOpacity={0.16}
                shadowOffset={{ x: 0, y: 0.5 }}
                hitStrokeWidth={18}
                cursor="move"
                draggable
                onMouseDown={(e) => { e.cancelBubble = true; }}
                onDragStart={startCalloutPointer}
                onDragMove={moveCalloutPointer}
                onDragEnd={endCalloutPointer}
                {...hover}
              />
            );
          })()}
        </>
      )}
    </Group>
  );
}
