'use client';

import React from 'react';
import { Shape } from 'react-konva';
import type Konva from 'konva';
import type { Drawable } from 'roughjs/bin/core';
import { generateRoughPath, paintDrawable } from '@/lib/rough-renderer';
import { calloutPath, type CalloutTip } from '@/lib/editor/callout-pointer';
import type { FillStyle, StrokeStyle } from '@/types/editor';

type CalloutShapeProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tail tip relative to the body centre. */
  tip: CalloutTip;
  pointerWidth: number;
  cornerRadius: number;
  seed: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
  strokeStyle?: StrokeStyle;
  fillStyle?: FillStyle;
  roughness?: number;
} & Omit<Konva.ShapeConfig, 'fill' | 'stroke' | 'strokeWidth' | 'sceneFunc' | 'hitFunc'>;

/**
 * A callout drawn in the shared hand-drawn style: one closed outline (body
 * plus tail) through rough.js, so stroke style, fill style and sloppiness
 * behave exactly as on a rectangle.
 *
 * The tip is read from the node's own attrs inside `sceneFunc`, not from
 * props, so a live drag can keep the tail on its target by setting
 * `node.setAttr('tip', ...)` and redrawing; React re-renders once on commit.
 */
export default function CalloutKonvaShape({
  tip, pointerWidth, cornerRadius, seed, stroke, fill, strokeWidth, strokeStyle, fillStyle, roughness,
  width, height, ...konva
}: CalloutShapeProps) {
  const cache = React.useRef<{ key: string; drawable: Drawable | null; path: string }>({ key: '', drawable: null, path: '' });
  const style = { seed, stroke, fill, strokeWidth, strokeStyle, fillStyle, roughness };
  const styleKey = JSON.stringify(style);

  const outline = (shape: Konva.Shape) => {
    const t = (shape.getAttr('tip') as CalloutTip | undefined) ?? tip;
    const key = `${styleKey}|${width}|${height}|${pointerWidth}|${cornerRadius}|${t.x}|${t.y}`;
    if (cache.current.key !== key) {
      // Direction, offset and length are unused once a tip is given.
      const path = calloutPath(width, height, 'bottom-left', 0.5, 0, pointerWidth, cornerRadius, t);
      cache.current = { key, path, drawable: generateRoughPath(path, style) };
    }
    return cache.current;
  };

  return (
    <Shape
      {...konva}
      width={width}
      height={height}
      tip={tip}
      sceneFunc={(ctx, shape) => {
        const { drawable } = outline(shape);
        if (drawable) paintDrawable(ctx as unknown as CanvasRenderingContext2D, drawable, 1);
      }}
      hitFunc={(ctx, shape) => {
        // The exact silhouette, tail included, so the tail is grabbable too.
        const p = new Path2D(outline(shape).path);
        const c = ctx._context;
        c.fillStyle = shape.colorKey;
        c.fill(p);
        c.strokeStyle = shape.colorKey;
        c.lineWidth = 12;
        c.stroke(p);
      }}
    />
  );
}
