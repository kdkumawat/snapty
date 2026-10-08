'use client';

import React from 'react';
import { Shape } from 'react-konva';
import type Konva from 'konva';
import type { Drawable } from 'roughjs/bin/core';
import {
  generateLinearDrawables,
  paintDrawable,
  type LinearDrawInput,
} from '@/lib/rough-renderer';
import { useEditorStore } from '@/store/editor-store';

export type ClipRect = { x: number; y: number; w: number; h: number };

type LinearShapeProps = LinearDrawInput & {
  id: string;
  x: number;
  y: number;
  /** Local rects (bound labels) the shaft must not draw through. */
  clipRects?: ClipRect[];
  hitStrokeWidth?: number;
} & Pick<
  Konva.ShapeConfig,
  'opacity' | 'listening' | 'draggable' | 'rotation' | 'scaleX' | 'scaleY'
> & {
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onDblClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDblTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
};

/** Marks the node so imperative live-drag code knows it can just set `points`. */
export const LINEAR_SHAPE_ATTR = 'linearShape';

/**
 * One renderer for every arrow and line: sharp, curved and elbow shafts with
 * Excalidraw's arrowheads, all drawn by rough.js.
 *
 * Geometry is read from the node's own attrs inside `sceneFunc`, not from
 * props, so a live drag only has to `node.setAttrs({ points })` and redraw;
 * React re-renders once on commit.
 */
export default function LinearKonvaShape({
  id, x, y, points, clipRects, hitStrokeWidth = 18,
  seed, stroke, strokeWidth, strokeStyle, roughness, arrowType, startArrowhead, endArrowhead,
  ...konva
}: LinearShapeProps) {
  // Drawables are cached per geometry; a drag recomputes them, a pan does not.
  const cache = React.useRef<{ key: string; drawables: Drawable[] }>({ key: '', drawables: [] });
  const style = { seed, stroke, strokeWidth, strokeStyle, roughness, arrowType, startArrowhead, endArrowhead };
  const styleKey = JSON.stringify(style);
  // Excalidraw's hit threshold: about 8.5 screen px either side of the stroke.
  const hitWidth = Math.max(hitStrokeWidth, 17 / useEditorStore((s) => s.zoom));

  const bindNode = (node: Konva.Shape | null) => {
    if (!node) return;
    // A custom Shape has no intrinsic size; report the polyline's bounds so
    // getClientRect (selection, snapping, export bounds) keeps working.
    node.getSelfRect = () => {
      const pts = node.getAttr('points') as number[];
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (let i = 0; i < pts.length - 1; i += 2) {
        minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };
  };

  return (
    <Shape
      ref={bindNode}
      id={id}
      x={x}
      y={y}
      points={points}
      clipRects={clipRects}
      {...{ [LINEAR_SHAPE_ATTR]: true }}
      hitStrokeWidth={hitWidth}
      {...konva}
      sceneFunc={(ctx, shape) => {
        const pts = shape.getAttr('points') as number[];
        const key = `${styleKey}|${pts.join(',')}`;
        if (cache.current.key !== key) {
          cache.current = { key, drawables: generateLinearDrawables({ ...style, points: pts }) };
        }
        const c = ctx as unknown as CanvasRenderingContext2D;
        const rects = (shape.getAttr('clipRects') as ClipRect[] | undefined) ?? [];
        c.save();
        if (rects.length) {
          // Everything except the label boxes: a huge rect plus the boxes,
          // clipped even-odd, leaves holes where the labels sit.
          c.beginPath();
          c.rect(-1e6, -1e6, 2e6, 2e6);
          for (const r of rects) c.rect(r.x, r.y, r.w, r.h);
          c.clip('evenodd');
        }
        cache.current.drawables.forEach((d, i) => {
          // Heads (every drawable after the shaft) are never clipped by a label.
          if (i === 1 && rects.length) { c.restore(); c.save(); }
          paintDrawable(c, d, 1);
        });
        c.restore();
      }}
      hitFunc={(ctx, shape) => {
        const pts = shape.getAttr('points') as number[];
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length - 1; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.strokeShape(shape);
      }}
    />
  );
}
