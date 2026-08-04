'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard } from '@/components/editor/export-dialog';
import type { ToolType } from '@/types/editor';

// Mac detection helper
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? 'Cmd' : 'Ctrl';
export { modKey, isMac };

const toolShortcuts: Record<string, ToolType> = {
  v: 'select', h: 'hand', a: 'arrow', r: 'rectangle', u: 'rounded-rect',
  o: 'circle', l: 'line', p: 'pencil', i: 'highlighter', t: 'text',
  n: 'step', b: 'blur', x: 'pixelate', s: 'spotlight', e: 'eraser',
};

export function useKeyboardShortcuts() {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  // Track the tool that was active before Space was pressed
  const preSpaceTool = useRef<ToolType | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      const isCtrl = e.ctrlKey || e.metaKey, isShift = e.shiftKey;

      // Undo: Ctrl+Z (no shift)
      if (isCtrl && !isShift && e.key.toLowerCase() === 'z') { e.preventDefault(); useEditorStore.getState().undo(); return; }
      // Redo: Ctrl+Shift+Z
      if (isCtrl && isShift && e.key.toLowerCase() === 'z') { e.preventDefault(); useEditorStore.getState().redo(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isCtrl) {
        const { selectedElementIds, removeElements } = useEditorStore.getState();
        if (selectedElementIds.length) { e.preventDefault(); removeElements(selectedElementIds); }
        return;
      }
      if (e.key === 'Escape') { useEditorStore.getState().setSelectedElementIds([]); useEditorStore.getState().setActiveTool('select'); return; }
      if (!isCtrl && !isShift && backgroundImage) {
        const tool = toolShortcuts[e.key.toLowerCase()];
        if (tool) { useEditorStore.getState().setActiveTool(tool); return; }
      }
      if (isCtrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); const { zoom, setZoom } = useEditorStore.getState(); setZoom(zoom * 1.2); return; }
      if (isCtrl && e.key === '-') { e.preventDefault(); const { zoom, setZoom } = useEditorStore.getState(); setZoom(zoom / 1.2); return; }
      if (isCtrl && isShift && (e.key === '0' || e.key === ')')) { e.preventDefault(); useEditorStore.getState().setStepStartNumber(1); return; }
      if (isCtrl && !isShift && e.key === '0') { e.preventDefault(); useEditorStore.getState().resetView(); return; }
      if (isCtrl && e.key.toLowerCase() === 'e' && !isShift) { e.preventDefault(); useEditorStore.getState().setShowExportDialog(true); return; }
      if (isCtrl && e.key.toLowerCase() === 'a' && !isShift) { e.preventDefault(); const { elements, setSelectedElementIds } = useEditorStore.getState(); setSelectedElementIds(elements.map(el => el.id)); return; }
      if (isCtrl && e.key.toLowerCase() === 'c' && !isShift) {
        const st = useEditorStore.getState();
        if (st.backgroundImage) { e.preventDefault(); copyToClipboard().catch(() => {}); }
        return;
      }
      if (e.key === '?' && !isCtrl) { e.preventDefault(); useEditorStore.getState().setShowHelpDialog(true); return; }
      // Space: save current tool, switch to hand
      if (e.key === ' ' && !isCtrl) {
        e.preventDefault();
        const st = useEditorStore.getState();
        if (st.activeTool !== 'hand') {
          preSpaceTool.current = st.activeTool;
        }
        useEditorStore.getState().setActiveTool('hand');
        return;
      }
    };

    const up = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        // Restore the tool that was active before Space was pressed
        const restore = preSpaceTool.current;
        if (restore) {
          useEditorStore.getState().setActiveTool(restore);
          preSpaceTool.current = null;
        }
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [backgroundImage]);
}

export function useClipboardPaste() {
  const setBackgroundImage = useEditorStore((s) => s.setBackgroundImage);

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      const items = e.clipboardData?.items; if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile(); if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => { const img = new Image(); img.onload = () => setBackgroundImage(img); img.src = reader.result as string; };
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [setBackgroundImage]);
}
