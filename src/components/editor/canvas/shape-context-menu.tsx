'use client';

import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { isClosedShape } from '@/lib/editor/text-labels';

export type ShapeContextMenuProps = {
  /**
   * The element id under the pointer when the user right-clicked, or null
   * to hide. The menu positions itself at the screen coordinates from the
   * contextmenu event.
   */
  elementId: string | null;
  /** Screen coordinates of the right-click, in CSS pixels. */
  position: { x: number; y: number } | null;
  /** Close the menu (after an action or on outside click). */
  onClose: () => void;
};

const itemClass =
  'flex items-center justify-between gap-6 px-3 py-1.5 text-sm rounded-md outline-none cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-40 data-[disabled]:pointer-events-none';

/**
 * Per-element context menu. Lightweight non-Radix menu so it can be opened
 * from the canvas's `onContextMenu` handler without conflicting with the
 * existing `CanvasContextMenu` (the canvas menu shows when the right-click
 * hits empty canvas; this one shows when it hits an element).
 *
 * Slice A scope: Duplicate, Delete, Bring forward/back/to front/to back,
 * Add label (closed shapes), Edit text, Copy style, Paste style, Lock/Unlock.
 */
export default function ShapeContextMenu({
  elementId,
  position,
  onClose,
}: ShapeContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const elements = useEditorStore((s) => s.elements);
  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const updateSelectedElements = useEditorStore((s) => s.updateSelectedElements);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);
  const addLabelToShape = useEditorStore((s) => s.addLabelToShape);
  const setSelectedElementIds = useEditorStore((s) => s.setSelectedElementIds);

  const el = elementId ? elements.find((e) => e.id === elementId) : null;
  const isClosed = el ? isClosedShape(el) : false;

  // Close on outside click / Escape
  useEffect(() => {
    if (!elementId || !position) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [elementId, position, onClose]);

  if (!elementId || !position || !el) return null;

  // Clamp to viewport
  const menuW = 200;
  const menuH = 240;
  const x = Math.min(position.x, window.innerWidth - menuW - 8);
  const y = Math.min(position.y, window.innerHeight - menuH - 8);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="z-[400] min-w-[12rem] rounded-xl border border-border bg-surface/95 backdrop-blur-md p-1 shadow-xl"
      style={{ position: 'fixed', left: x, top: y, width: menuW }}
    >
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          duplicateSelected();
        })}
      >
        Duplicate
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          removeElements([elementId]);
        })}
      >
        Delete
      </button>
      {isClosed && (
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={run(() => addLabelToShape(elementId))}
        >
          Add label
        </button>
      )}
      <div className="h-px my-1 bg-border" />
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          bringForward(elementId);
        })}
      >
        Bring forward
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          sendBackward(elementId);
        })}
      >
        Send back
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          bringToFront(elementId);
        })}
      >
        Bring to front
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          sendToBack(elementId);
        })}
      >
        Send to back
      </button>
      <div className="h-px my-1 bg-border" />
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => {
          setSelectedElementIds([elementId]);
          if (el.locked) unlockSelected();
          else lockSelected();
        })}
      >
        {el.locked ? 'Unlock' : 'Lock'}
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={run(() => updateSelectedElements({ opacity: Math.max(0.1, (el.opacity ?? 1) - 0.2) }))}
      >
        Decrease opacity
      </button>
    </div>
  );
}
