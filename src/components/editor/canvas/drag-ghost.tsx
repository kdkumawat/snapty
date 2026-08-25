'use client';

import React from 'react';
import { Rect, Group } from 'react-konva';
import { getSelectionTheme } from '@/lib/selection-theme';

export type DragGhostProps = {
  /** Pre-drag boxes for every selected element, or null when not dragging. */
  ghost: { id: string; box: { x: number; y: number; w: number; h: number } }[] | null;
  /** Current zoom — dashes scale inversely. */
  zoom: number;
};

/**
 * Renders faint outlines at the pre-drag positions of the multi-select
 * during a drag gesture. Shows the user where the elements CAME from as
 * they move — Excalidraw's drag-ghost affordance.
 *
 * Mounted in the interaction layer. No `listening` so it never blocks
 * pointer events.
 */
export default function DragGhost({ ghost, zoom }: DragGhostProps) {
  if (!ghost || ghost.length === 0) return null;
  const theme = getSelectionTheme();
  const dash = [4 / zoom, 4 / zoom] as [number, number];
  return (
    <Group listening={false} opacity={0.5}>
      {ghost.map(({ id, box }) => (
        <Rect
          key={id}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          stroke={theme.accentDim ?? theme.accent}
          strokeWidth={1 / zoom}
          dash={dash}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
}
