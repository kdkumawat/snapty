'use client';

import React, { useMemo } from 'react';
import { Shape } from 'react-konva';
import type Konva from 'konva';
import {
  generateRoughDrawable,
  generateArrowHead,
  paintDrawable,
  type RoughDrawInput,
} from '@/lib/rough-renderer';

type RoughShapeProps = RoughDrawInput & {
  id?: string;
  opacity?: number;
  listening?: boolean;
  draggable?: boolean;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  showArrowhead?: boolean;
  showStartArrowhead?: boolean;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
  hitStrokeWidth?: number;
};

export default function RoughKonvaShape({
  opacity = 1,
  listening = true,
  draggable = false,
  hitStrokeWidth = 14,
  showArrowhead,
  showStartArrowhead,
  ...input
}: RoughShapeProps) {
  const pointsKey = input.points?.join(',') ?? '';

  const drawable = useMemo(
    () => generateRoughDrawable({ ...input, x: 0, y: 0 }),
    [
      input.kind, input.seed, input.stroke, input.fill, input.strokeWidth,
      input.strokeStyle, input.fillStyle, input.roughness, input.width, input.height,
      input.cornerRadius, pointsKey, input.arrowheadSize,
    ],
  );

  const head = useMemo(() => {
    if (input.kind !== 'arrow' && !showArrowhead) return null;
    if (input.kind === 'arrow' || showArrowhead) {
      return generateArrowHead({ ...input, points: input.points });
    }
    return null;
  }, [input.kind, input.seed, pointsKey, input.stroke, input.strokeWidth, input.roughness, input.arrowheadSize, showArrowhead]);

  const startHead = useMemo(() => {
    if (!showStartArrowhead || !input.points || input.points.length < 4) return null;
    const [sx, sy, ex, ey] = input.points;
    return generateArrowHead({
      ...input,
      points: [ex, ey, sx, sy],
      seed: `${input.seed}-start`,
      arrowheadSize: input.arrowheadSize,
    });
  }, [showStartArrowhead, input.seed, pointsKey, input.stroke, input.strokeWidth, input.roughness, input.arrowheadSize]);

  const w = Math.abs(input.width || 0);
  const h = Math.abs(input.height || 0);
  const isBox = input.kind === 'rectangle' || input.kind === 'ellipse' || input.kind === 'diamond' || input.kind === 'polygon';

  return (
    <Shape
      id={input.id}
      x={input.x}
      y={input.y}
      width={isBox ? Math.max(1, w) : undefined}
      height={isBox ? Math.max(1, h) : undefined}
      rotation={input.rotation}
      scaleX={input.scaleX}
      scaleY={input.scaleY}
      opacity={opacity}
      listening={listening}
      draggable={draggable}
      sceneFunc={(ctx, shape) => {
        const c = ctx as unknown as CanvasRenderingContext2D;
        paintDrawable(c, drawable, 1);
        if (head) paintDrawable(c, head, 1);
        if (startHead) paintDrawable(c, startHead, 1);
        // Ensure Konva tracks the shape for transforms
        (ctx as any).fillStrokeShape?.(shape);
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        if (input.kind === 'ellipse') {
          ctx.ellipse(w / 2, h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
        } else if (input.kind === 'diamond') {
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w, h / 2);
          ctx.lineTo(w / 2, h);
          ctx.lineTo(0, h / 2);
          ctx.closePath();
        } else if ((input.kind === 'line' || input.kind === 'arrow') && input.points) {
          ctx.moveTo(input.points[0], input.points[1]);
          ctx.lineTo(input.points[2], input.points[3]);
        } else {
          ctx.rect(0, 0, Math.max(1, w), Math.max(1, h));
        }
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
      hitStrokeWidth={hitStrokeWidth}
      onClick={input.onClick}
      onTap={input.onTap as any}
      onDragStart={input.onDragStart}
      onDragMove={input.onDragMove}
      onDragEnd={input.onDragEnd}
      onTransformEnd={input.onTransformEnd}
    />
  );
}
