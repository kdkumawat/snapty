'use client';

import React from 'react';
import { Rect, Group } from 'react-konva';
import type { EditorElement } from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { getSelectionTheme } from '@/lib/selection-theme';

export type SelectionOverlayV2Props = {
  /** The element id under the pointer, or null. */
  hoveredId: string | null;
  /** All elements (so we can look up bounds for the hovered id). */
  elements: EditorElement[];
  /** Already-selected ids — we skip them (selection chrome wins). */
  selectedIds: ReadonlySet<string>;
  /** Image size, for getElementBounds. */
  imageSize: { width: number; height: number };
  /** Current zoom — handles/dashes scale inversely. */
  zoom: number;
};

/**
 * Always-on hover outline. Paints a 1px dashed outline around the element
 * under the pointer in `select` and `hand` modes, reusing the existing
 * selection theme so the hover feel matches the selection feel.
 *
 * Renders inside the interaction layer (no `listening`). Drawn above all
 * annotations.
 */
export default function SelectionOverlayV2({
  hoveredId,
  elements,
  selectedIds,
  imageSize,
  zoom,
}: SelectionOverlayV2Props) {
  if (!hoveredId || selectedIds.has(hoveredId)) return null;
  const el = elements.find((e) => e.id === hoveredId);
  if (!el) return null;
  const b = getElementBounds(el, imageSize);
  if (b.w <= 0 || b.h <= 0) return null;
  const theme = getSelectionTheme();
  const dash = [5 / zoom, 3 / zoom] as [number, number];
  return (
    <Group listening={false}>
      <Rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        stroke={theme.accentDim ?? theme.accent}
        strokeWidth={1 / zoom}
        dash={dash}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}
