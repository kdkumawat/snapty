'use client';

import React from 'react';
import { Rect, Group } from 'react-konva';
import type { EditorElement } from '@/types/editor';
import { getElementBounds } from '@/lib/editor/selection';
import { isContainerText } from '@/lib/editor/text-labels';
import { getSelectionTheme } from '@/lib/selection-theme';

// Excalidraw's selection frame sits 4 screen px outside the element.
const SELECTION_PAD = 4;

export type SelectionOverlayV2Props = {
  /** Selected ids; frames are drawn only for a multi-selection. */
  selectedIds: string[];
  elements: EditorElement[];
  /** Image size, for getElementBounds. */
  imageSize: { width: number; height: number };
  /** Current zoom, so the frame stays 1 screen px. */
  zoom: number;
};

/**
 * Excalidraw's multi-selection chrome: every selected element gets its own
 * thin solid frame, inside the dashed group box the Transformer draws.
 *
 * Renders inside the interaction layer (no `listening`). The caller hides it
 * during a drag or transform, since the frames read committed geometry.
 */
export default function SelectionOverlayV2({
  selectedIds,
  elements,
  imageSize,
  zoom,
}: SelectionOverlayV2Props) {
  // A lone freehand stroke has no resize overlay of its own, so it gets the
  // same plain frame here.
  const sole = selectedIds.length === 1 ? elements.find((e) => e.id === selectedIds[0]) : undefined;
  const soleFreehand = sole?.type === 'pencil' || sole?.type === 'highlighter';
  if (selectedIds.length < 2 && !soleFreehand) return null;
  const theme = getSelectionTheme();
  const pad = SELECTION_PAD / zoom;
  return (
    <Group listening={false}>
      {selectedIds.map((id) => {
        const el = elements.find((e) => e.id === id);
        if (!el) return null;
        // A label has no frame of its own; it lives inside its owner's.
        if (isContainerText(el, elements) && selectedIds.length > 1) return null;
        // ponytail: axis-aligned bounds, so a rotated element's frame does not
        // rotate with it. Use the node's own transform if that matters.
        const b = getElementBounds(el, imageSize);
        if (b.w <= 0 && b.h <= 0) return null;
        return (
          <Rect
            key={id}
            x={b.x - pad}
            y={b.y - pad}
            width={b.w + pad * 2}
            height={b.h + pad * 2}
            stroke={theme.accent}
            strokeWidth={1 / zoom}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })}
    </Group>
  );
}
