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
  defaultFontStyle: string;
  defaultAlign: 'left' | 'center' | 'right';
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Timestamp until which blur events are ignored (mount/focus race). */
  ignoreBlurUntilRef: React.RefObject<number>;
  /** Commit the current textarea content. */
  onCommit: () => void;
  /** Live text while typing (drives the arrow gap under a path label). */
  onTextChange?: (id: string, text: string) => void;
  /** Cancel editing (Escape). Caller handles removing pending labels. */
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
  defaultFontStyle,
  defaultAlign,
  textAreaRef,
  ignoreBlurUntilRef,
  onCommit,
  onTextChange,
}: Props) {
  const editEl = state.editId
    ? (elements.find((el) => el.id === state.editId) as TextElement | undefined)
    : undefined;

  // Auto-focus on mount; select existing text so typing replaces it.
  useEffect(() => {
    if (state.visible && textAreaRef.current) {
      ignoreBlurUntilRef.current = Date.now() + 250;
      // Focus right away so keys typed immediately land here; the timer below
      // re-focuses after any click-driven focus change.
      const ta = textAreaRef.current;
      ta.focus();
      ta.value = state.initialText ?? '';
      if (state.editId) ta.select();
      // A timer, not a frame callback: frames stop in a background tab, and
      // the editor must take focus after the click's own focus change either way.
      // Never touch the value here: the user may already be typing.
      setTimeout(() => {
        if (textAreaRef.current && document.activeElement !== textAreaRef.current) {
          textAreaRef.current.focus();
        }
      }, 0);
    }
  }, [state.visible, state.initialText, state.editId, textAreaRef, ignoreBlurUntilRef]);

  if (!state.visible) return null;

  const scale = getImageToolScale(imageSize.width, imageSize.height);
  const displayFont = editEl?.fontSize ?? defaultFontSize * scale;
  const displayColor = editEl?.fill ?? defaultFill;
  const displayFamily = editEl?.fontFamily ?? defaultFontFamily ?? HANDWRITTEN_FONT;
  const displayFontStyle = editEl?.fontStyle ?? defaultFontStyle;
  const displayAlign = editEl?.align ?? defaultAlign;
  const pad = (editEl?.padding ?? TEXT_PADDING) * zoom;
  // Attached labels (groupId set) sit inside a drawn shape - the shape is the
  // boundary, so no separate dashed box around the editor.
  const isAttachedLabel = !!editEl?.groupId;
  // Closed-shape labels have a fixed inner-box height and a verticalAlign:
  // the editing box is the shape's inner box and the text block is anchored
  // top/middle/bottom inside it, matching the committed Konva node.
  const hasInnerBox = isAttachedLabel && !!editEl?.height;
  // Arrow/line label: no inner box; grows with the text, centred on the stroke.
  const isPathLabel = isAttachedLabel && !editEl?.height;
  // Free text with no fixed width sizes to its own text, like the committed
  // Konva node, so centred or right-aligned lines do not shift on commit.
  const autoSize = isPathLabel || (!hasInnerBox && !editEl?.width);
  // Fitted boxes hug their text so a one-line label sits centred while typing.
  const fit = autoSize || hasInnerBox;
  const boxTop = stagePos.y + (state.y + contentOffset.y) * zoom;

  const textarea = (
    <textarea
      ref={textAreaRef}
      className={cn(
        'bg-transparent outline-none resize-none',
        // No frame while typing, as in Excalidraw: the caret is the only chrome.
        'border border-transparent',
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
        width: autoSize
          ? undefined
          : hasInnerBox
          ? (editEl.width ?? 100) * zoom
          : editEl?.width
            ? Math.max(100, editEl.width * zoom)
            : undefined,
        minWidth: fit ? 0 : 100,
        minHeight: fit ? 0 : 40,
        overflow: fit ? 'hidden' : undefined,
        // Path labels size to their text (Chrome field-sizing) and are centred
        // on the stroke point by the wrapper below.
        ...(fit ? ({ fieldSizing: 'content', minWidth: autoSize ? '2ch' : undefined } as React.CSSProperties) : {}),
        lineHeight: editEl?.lineHeight ?? TEXT_LINE_HEIGHT,
        fontStyle:
          displayFontStyle === 'normal' || displayFontStyle === 'italic'
            ? displayFontStyle
            : 'normal',
        fontWeight: displayFontStyle.includes('bold') ? 'bold' : 'normal',
        textAlign: displayAlign ?? 'left',
      }}
      onKeyDown={(e) => {
        // Enter or Escape finishes and keeps what was typed; Ctrl/Cmd+Enter
        // and Shift+Enter add a new line.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
          e.preventDefault();
          document.execCommand('insertText', false, '\n');
        } else if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
      }}
      onInput={(e) => {
        if (!fit) return;
        const ta = e.currentTarget;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
        // Box labels let the shape grow live while typing.
        if (editEl && (hasInnerBox || isPathLabel)) onTextChange?.(editEl.id, ta.value);
      }}
      onBlur={() => {
        // Ignore the synthetic blur that fires while the textarea mounts/focuses.
        if (Date.now() < ignoreBlurUntilRef.current) {
          setTimeout(() => textAreaRef.current?.focus(), 0);
          return;
        }
        onCommit();
      }}
      rows={fit ? 1 : 2}
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
          width: (editEl.width ?? 100) * zoom,
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
        left:
          stagePos.x +
          (state.x + contentOffset.x + (isPathLabel ? (editEl?.width ?? 0) / 2 : 0)) * zoom,
        top: boxTop,
        transform: isPathLabel ? 'translateX(-50%)' : undefined,
      }}
    >
      {textarea}
    </div>
  );
}
