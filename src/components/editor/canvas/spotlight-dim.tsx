'use client';

import { Shape } from 'react-konva';
import type Konva from 'konva';

/**
 * The dim layer for every spotlight, drawn once: the whole image in black with
 * one even-odd hole per spotlight. Holes are read from the live "spotlight-hit"
 * nodes at draw time, so they follow a drag or resize before it is committed.
 */
export default function SpotlightDim({ dim }: { dim: number }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        const layer = shape.getLayer();
        const stage = shape.getStage();
        if (!layer || !stage) return;
        const bg = stage.findOne('.background') as Konva.Node | undefined;
        const c = ctx._context;
        c.beginPath();
        c.rect(0, 0, bg?.width() ?? 0, bg?.height() ?? 0);
        for (const node of layer.find('.spotlight-hit') as Konva.Rect[]) {
          c.save();
          c.transform(...(node.getTransform().getMatrix() as [number, number, number, number, number, number]));
          c.roundRect(0, 0, node.width(), node.height(), node.cornerRadius() || 0);
          c.restore();
        }
        c.fillStyle = `rgba(0,0,0,${dim})`;
        c.fill('evenodd');
      }}
    />
  );
}
