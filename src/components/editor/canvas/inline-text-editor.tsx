'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { TextElement } from '@/types/editor';
import { HANDWRITTEN_FONT, TEXT_PADDING, TEXT_LINE_HEIGHT } from '@/types/editor';
import { wrapText, measureBlock } from '@/lib/editor/measure-text';

export type InlineTextEditorProps = {
  /** The element being edited, or undefined for a brand-new label. */
  element?: TextElement;
  /** Stage position (screen pixels) — needed to align with the Konva stage. */
  stagePos: { x: number; y: number };
  /** Canvas padding + device-frame inset, in image units. */
  contentOffset: { x: number; y: number };
  /** Editor zoom. */
  zoom: number;
  /** Image size for inner-box math. */
  imageSize: { width: number; height: number };
  /** Live defaults for a brand-new element (no `element` passed). */
  defaultFontSize: number;
  defaultFill: string;
  defaultFontFamily: string;
  /** Container shape, in image units — drives inner-box sizing + wrap width. */
  containerBox?: { x: number; y: number; w: number; h: number };
  /** Stage-space position (top-left) of the text, in image units. */
  textPosition: { x: number; y: number };
  /** Commit: write `text` back; layout = measured block. */
  onCommit: (text: string, layout: { width: number; height: number; lines: string[] }) => void;
  /** Cancel: caller removes the empty label, etc. */
  onCancel: () => void;
  /** Re-focus this element when it changes (e.g. context menu "Edit text"). */
  focusToken?: string | number;
};

/**
 * Inline text editor for container-bound labels. Mounts inside a shape's
 * inner box; wraps the text by word at the container's available width
 * (matching the Excalidraw feel). Uses a `contentEditable` div for natural
 * IME / paste behavior; falls back to word-wrap on the measured block.
 *
 * The editor's outer width matches the container's inner box (clamped to a
 * minimum). As the user types, we re-wrap on each input and report the
 * measured block to the caller. The caller stores `width` / `height` on the
 * element via `commitTextReflow` so the Konva render path stays in lockstep.
 */
export default function InlineTextEditor({
  element,
  stagePos,
  contentOffset,
  zoom,
  defaultFontSize,
  defaultFill,
  defaultFontFamily,
  containerBox,
  textPosition,
  onCommit,
  onCancel,
  focusToken,
}: InlineTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(element?.text ?? '');
  const [layout, setLayout] = useState<{ width: number; height: number; lines: string[] }>(() => {
    const fs = element?.fontSize ?? defaultFontSize;
    const lh = element?.lineHeight ?? TEXT_LINE_HEIGHT;
    const pad = element?.padding ?? TEXT_PADDING;
    const wrapWidth = Math.max(40, (element?.width ?? 200));
    const lines = wrapText(element?.text ?? '', wrapWidth, {
      family: element?.fontFamily ?? defaultFontFamily ?? HANDWRITTEN_FONT,
      size: fs,
      style: element?.fontStyle ?? 'normal',
    });
    return { ...measureBlock(lines, { family: element?.fontFamily ?? defaultFontFamily ?? HANDWRITTEN_FONT, size: fs, style: element?.fontStyle ?? 'normal' }, lh, pad), lines };
  });

  // Auto-focus on mount or when the element changes.
  useLayoutEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
      // Select all for typing-replace on first open (Excalidraw behavior).
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [focusToken]);

  const fs = element?.fontSize ?? defaultFontSize;
  const lh = element?.lineHeight ?? TEXT_LINE_HEIGHT;
  const pad = element?.padding ?? TEXT_PADDING;
  const family = element?.fontFamily ?? defaultFontFamily ?? HANDWRITTEN_FONT;
  const fontStyle = element?.fontStyle ?? 'normal';
  const fill = element?.fill ?? defaultFill;

  // Wrap target = container inner box width, or the element's existing width,
  // or a sensible default.
  const wrapWidth = containerBox
    ? Math.max(40, containerBox.w - pad * 2)
    : Math.max(40, element?.width ?? 200);

  // Editor outer box — anchored to the container's inner box if any, else
  // a free-floating size.
  const left = stagePos.x + (textPosition.x + contentOffset.x) * zoom;
  const top = stagePos.y + (textPosition.y + contentOffset.y) * zoom;
  const editorWidth = containerBox
    ? Math.max(80, (containerBox.w - pad * 2) * zoom)
    : Math.max(80, wrapWidth * zoom);
  const editorHeight = containerBox
    ? Math.max(40, (containerBox.h - pad * 2) * zoom)
    : Math.max(40, layout.height * zoom);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const next = e.currentTarget.innerText;
    setText(next);
    const lines = wrapText(next, wrapWidth, { family, size: fs, style: fontStyle });
    const block = measureBlock(lines, { family, size: fs, style: fontStyle }, lh, pad);
    setLayout({ ...block, lines });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(text, layout);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    // Defer commit so a click elsewhere (e.g. another tool) can win the race.
    requestAnimationFrame(() => onCommit(text, layout));
  };

  // Vertical alignment inside the container: 'top' / 'middle' / 'bottom'.
  const va = element?.verticalAlign ?? 'middle';
  const justify: 'flex-start' | 'center' | 'flex-end' =
    va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';

  return (
    <div
      className="absolute z-50 flex"
      style={{
        left,
        top,
        width: editorWidth,
        height: editorHeight,
        alignItems: justify,
      }}
    >
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Text annotation"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full bg-transparent outline-none whitespace-pre-wrap break-words"
        style={{
          fontFamily: family,
          fontSize: fs * zoom,
          lineHeight: lh,
          color: fill,
          fontStyle: fontStyle === 'normal' || fontStyle === 'italic' ? fontStyle : 'normal',
          fontWeight: fontStyle.includes('bold') ? 'bold' : 'normal',
          textAlign: element?.align ?? 'center',
          padding: 0,
          minHeight: 24,
        }}
      />
    </div>
  );
}
