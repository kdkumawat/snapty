'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard } from '@/components/editor/export-dialog';
import { loadImageFileIntoEditor } from '@/lib/image-load';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import type { ToolType } from '@/types/editor';
import { letterToTool, digitToTool } from '@/lib/tool-shortcuts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? 'Cmd' : 'Ctrl';
export { modKey, isMac };

export function useKeyboardShortcuts() {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const preSpaceTool = useRef<ToolType | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();
      const st = useEditorStore.getState();

      if (isCtrl && key === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snapty-open-file'));
        return;
      }
      if (isCtrl && key === 'k') {
        e.preventDefault();
        st.setShowCommandPalette(!st.showCommandPalette);
        return;
      }
      if (isCtrl && !isShift && key === 'z') { e.preventDefault(); st.undo(); return; }
      if (isCtrl && isShift && key === 'z') { e.preventDefault(); st.redo(); return; }
      if (isCtrl && key === 'd') { e.preventDefault(); st.duplicateSelected(); return; }
      if (isCtrl && !isShift && key === 'g') { e.preventDefault(); st.groupSelected(); return; }
      if (isCtrl && isShift && key === 'g') { e.preventDefault(); st.ungroupSelected(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isCtrl) {
        if (st.selectedElementIds.length) {
          e.preventDefault();
          st.removeElements(st.selectedElementIds);
        }
        return;
      }
      if (e.key === 'Escape') {
        st.setSelectedElementIds([]);
        st.setActiveTool('select');
        st.setStickyTool(false);
        st.setShowCommandPalette(false);
        return;
      }

      if (!isCtrl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && st.selectedElementIds.length) {
        if (st.annotationsLocked) return;
        e.preventDefault();
        const step = isShift ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.nudgeSelected(dx, dy);
        return;
      }

      if (!isCtrl && !isShift && (backgroundImage || ['v', 'h', '1', '2'].includes(key))) {
        const tool = letterToTool[key] || digitToTool[key];
        if (tool) {
          e.preventDefault();
          st.setActiveTool(tool);
          return;
        }
      }
      if (isCtrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); st.setZoom(st.zoom * 1.2); return; }
      if (isCtrl && e.key === '-') { e.preventDefault(); st.setZoom(st.zoom / 1.2); return; }
      if (isCtrl && isShift && (e.key === '0' || e.key === ')')) { e.preventDefault(); st.setStepStartNumber(1); return; }
      if (isCtrl && !isShift && e.key === '0') { e.preventDefault(); st.resetView(); return; }
      if (isCtrl && !isShift && e.key === '1') { e.preventDefault(); st.zoomToActual(); return; }
      if (isCtrl && key === 'e' && !isShift) { e.preventDefault(); st.setShowExportDialog(true); return; }
      if (isCtrl && key === 'a' && !isShift) {
        e.preventDefault();
        st.setSelectedElementIds(st.elements.filter((el) => !el.locked).map((el) => el.id));
        return;
      }
      if (isCtrl && isShift && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        const n = st.elements.length;
        if (n) {
          st.clearElements();
          toastSuccess('Cleared', n === 1 ? 'Removed 1 annotation' : `Removed ${n} annotations`);
        }
        return;
      }
      if (isCtrl && isShift && key === 's') {
        e.preventDefault();
        if (!isScreenCaptureSupported()) {
          toastError('Capture unavailable', 'Not supported in this browser');
          return;
        }
        st.setImageLoading(true);
        void captureScreenRegion()
          .then((result) => {
            if (!result.ok) {
              if (result.reason === 'denied') toastInfo('Capture cancelled', 'No screenshot was taken');
              else toastError('Capture failed', result.message);
              return;
            }
            useEditorStore.getState().setBackgroundImage(result.image);
            toastSuccess('Captured', 'Screenshot loaded in the editor');
          })
          .catch(() => toastError('Capture failed', 'Something went wrong - try again'))
          .finally(() => useEditorStore.getState().setImageLoading(false));
        return;
      }
      if (isCtrl && key === 'c' && !isShift) {
        if (st.backgroundImage) {
          e.preventDefault();
          void copyToClipboard()
            .then(() => toastSuccess('Copied', 'Image on clipboard - ready to paste'))
            .catch(() => toastError('Couldn’t copy', 'Allow clipboard access and try again'));
        }
        return;
      }
      if (e.key === '?' && !isCtrl) { e.preventDefault(); st.setShowHelpDialog(true); return; }
      if (e.key === ' ' && !isCtrl) {
        e.preventDefault();
        if (st.activeTool !== 'hand') preSpaceTool.current = st.activeTool;
        st.setActiveTool('hand', { clearSelection: false });
        return;
      }
    };

    const up = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        const restore = preSpaceTool.current;
        if (restore) {
          useEditorStore.getState().setActiveTool(restore, { clearSelection: false });
          preSpaceTool.current = null;
        }
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [backgroundImage]);
}

async function pasteImageFromClipboardEvent(e: ClipboardEvent): Promise<boolean> {
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          await loadImageFileIntoEditor(file, { mode: 'auto' });
          return true;
        }
      }
    }
  }
  return false;
}

async function pasteImageFromAsyncClipboard(): Promise<boolean> {
  if (!navigator.clipboard?.read) return false;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          await loadImageFileIntoEditor(new File([blob], 'paste.png', { type }), { mode: 'auto' });
          return true;
        }
      }
    }
  } catch {
    /* permission denied or empty */
  }
  return false;
}

/** Paste images onto the canvas (overlay when a background already exists). */
export function useClipboardPaste() {
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;

      const hasImageItem = e.clipboardData
        ? Array.from(e.clipboardData.items || []).some((i) => i.type.startsWith('image/'))
        : false;

      if (hasImageItem) {
        e.preventDefault();
        try {
          const ok = await pasteImageFromClipboardEvent(e);
          if (!ok) await pasteImageFromAsyncClipboard();
        } catch (err) {
          toastError('Paste failed', err instanceof Error ? err.message : 'Could not paste image');
        }
        return;
      }

      // Some browsers expose screenshots only via async clipboard API
      if (e.clipboardData && Array.from(e.clipboardData.types || []).length === 0) {
        e.preventDefault();
        const ok = await pasteImageFromAsyncClipboard();
        if (!ok) toastInfo('Nothing to paste', 'Copy an image first');
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);
}
