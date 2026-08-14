'use client';

import React, { useEffect } from 'react';
import type { EditorElement, TextElement } from '@/types/editor';
import { HANDWRITTEN_FONT, TEXT_PADDING, TEXT_LINE_HEIGHT } from '@/types/editor';
import { getImageToolScale } from '@/store/editor-store';
import { cn } from '@/lib/utils';

/**
 * The single in-place text editor for Snapty. Every way of editing text —
 * the Text tool, double-click on a shape (attached label), double-click on
 * an existing text, Enter on a selection — funnels into this overlay. It is
 * the one place that converts image-space text geometry into screen pixels,
 * so the caret, the committed glyphs, and the Konva `Text` node all agree at
 * any zoom.
 *
 * Everything is expressed in the same units the Konva `Text` node uses,
 * then multiplied by zoom once. Padding used to be a raw CSS `p-1` while
 * Konva padded in image units, so the text shifted on commit by an amount
 * that grew with zoom — the shared TEXT_PADDING/TEXT_LINE_HEIGHT constants
 * (also used by the Konva node) keep the two in lockstep.
 */
export type TextEditState = {
  x: number;
  y: number;
  visible: boolean;
  editId?: string;
  initialText?: string;
  pendingNewId?: string;
};

type Props = {
  state: TextEditState;
  elements: EditorElement[];
  /** Screen-space stage position (top-left of the Konva stage). */
  stagePos: { x: number; y: number };
  /** Canvas padding + device-frame inset, in image units. */
  contentOffset: { x: number; y: number };
  zoom: number;
  imageSize: { width: number; height: number };
  /** Live tool settings — used only while creating NEW text (no element yet). */
  defaultFontSize: number;
  defaultFill: string;
  defaultFontFamily: string;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Timestamp until which blur events are ignored (mount/focus race). */
  ignoreBlurUntilRef: React.RefObject<number>;
  /** Commit the current textarea content. */
  onCommit: () => void;
  /** Cancel editing (Escape). Caller handles removing pending labels. */
  onCancel: () => void;
};

export default function TextEditOverlay({
  state,
  elements,
  stagePos,
  contentOffset,
  zoom,
  imageSize,
  defaultFontSize,
  defaultFill,
  defaultFontFamily,
  textAreaRef,
  ignoreBlurUntilRef,
  onCommit,
  onCancel,
}: Props) {
  const editEl = state.editId
    ? (elements.find((el) => el.id === state.editId) as TextElement | undefined)
    : undefined;

  // Auto-focus on mount; select existing text so typing replaces it.
  useEffect(() => {
    if (state.visible && textAreaRef.current) {
      ignoreBlurUntilRef.current = Date.now() + 250;
      requestAnimationFrame(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.value = state.initialText ?? '';
          if (state.editId) textAreaRef.current.select();
        }
      });
    }
  }, [state.visible, state.initialText, state.editId, textAreaRef, ignoreBlurUntilRef]);

  if (!state.visible) return null;

  const scale = getImageToolScale(imageSize.width, imageSize.height);
  const displayFont = editEl?.fontSize ?? defaultFontSize * scale;
  const displayColor = editEl?.fill ?? defaultFill;
  const displayFamily = editEl?.fontFamily ?? defaultFontFamily ?? HANDWRITTEN_FONT;
  const displayFontStyle = editEl?.fontStyle ?? 'normal';
  const displayAlign = editEl?.align ?? 'left';
  const pad = (editEl?.padding ?? TEXT_PADDING) * zoom;
  // Attached labels (groupId set) sit inside a drawn shape - the shape is the
  // boundary, so no separate dashed box around the editor.
  const isAttachedLabel = !!editEl?.groupId;
  // Closed-shape labels have a fixed inner-box height and a verticalAlign:
  // the editing box is the shape's inner box and the text block is anchored
  // top/middle/bottom inside it, matching the committed Konva node.
  const hasInnerBox = isAttachedLabel && !!editEl?.height;
  const boxTop = stagePos.y + (state.y + contentOffset.y) * zoom;

  const textarea = (
    <textarea
      ref={textAreaRef}
      className={cn(
        'bg-transparent outline-none resize-none',
        isAttachedLabel ? 'border-none' : 'border border-dashed border-accent',
      )}
      style={{
        fontSize: displayFont * zoom,
        fontFamily: displayFamily,
        color: displayColor,
        padding: pad,
        // The 1px dashed border must not add to the box, or the caret sits
        // one pixel off from where the glyph lands after commit.
        boxSizing: 'border-box',
        margin: -1,
        // Match the committed label box so a centered attached label
        // previews exactly where it will land after commit.
        width: hasInnerBox
          ? Math.max(100, (editEl.width ?? 100) * zoom)
          : editEl?.width
            ? Math.max(100, editEl.width * zoom)
            : undefined,
        minWidth: 100,
        minHeight: 40,
        lineHeight: editEl?.lineHeight ?? TEXT_LINE_HEIGHT,
        fontStyle:
          displayFontStyle === 'normal' || displayFontStyle === 'italic'
            ? displayFontStyle
            : 'normal',
        fontWeight: displayFontStyle.includes('bold') ? 'bold' : 'normal',
        textAlign: displayAlign ?? 'left',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => {
        // Ignore the synthetic blur that fires while the textarea mounts/focuses.
        if (Date.now() < ignoreBlurUntilRef.current) {
          requestAnimationFrame(() => textAreaRef.current?.focus());
          return;
        }
        onCommit();
      }}
      rows={2}
    />
  );

  if (hasInnerBox) {
    // Vertical-align-aware edit box: a flex wrapper sized to the shape's
    // inner box, anchoring the textarea top/middle/bottom inside it.
    const va = editEl?.verticalAlign ?? 'middle';
    return (
      <div
        className="absolute z-50 flex"
        style={{
          left: stagePos.x + (state.x + contentOffset.x) * zoom,
          top: boxTop,
          width: Math.max(100, (editEl.width ?? 100) * zoom),
          height: editEl.height! * zoom,
          alignItems: va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center',
        }}
      >
        {textarea}
      </div>
    );
  }

  return (
    <div
      className="absolute z-50"
      style={{
        left: stagePos.x + (state.x + contentOffset.x) * zoom,
        top: boxTop,
      }}
    >
      {textarea}
    </div>
  );
}
