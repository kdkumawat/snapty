'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { loadImageFileIntoEditor, capImageSize } from '@/lib/image-load';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import type { ToolType } from '@/types/editor';
import { STEP_CYCLE, STROKE_PICKS, ROUND_CORNER_RADIUS, FONT_HAND_DRAWN, FONT_NORMAL, FONT_CODE, STANDARD_FONT } from '@/types/editor';
import { letterToTool } from '@/lib/tool-shortcuts';
import { copyStyleToClipboard, getClipboardStyle } from '@/lib/editor/clipboard-style';
import { copySelectedAnnotations, pasteAnnotationsFromClipboard, hasAnnotationClipboard, suppressNextImagePaste, isImagePasteSuppressed } from '@/lib/editor/annotation-clipboard';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? 'Cmd' : 'Ctrl';
export { modKey, isMac };

export function useKeyboardShortcuts() {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const preSpaceTool = useRef<ToolType | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      // The palette's own search box must still close it.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const st = useEditorStore.getState();
        st.setShowCommandPalette(!st.showCommandPalette);
        return;
      }
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (document.documentElement.dataset.textEdit) return;
      // Dialogs own their keys (Tab, Escape, arrows), and shortcuts must not act on the canvas behind them.
      if (tgt.closest('[data-slot="dialog-content"]')) return;
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();
      const st = useEditorStore.getState();

      // Excalidraw: Ctrl/Cmd+Alt+C / V copy and paste styles.
      if (isCtrl && e.altKey && (key === 'c' || key === 'v')) {
        e.preventDefault();
        const first = st.elements.find((el) => el.id === st.selectedElementIds[0]);
        if (key === 'c' && first) {
          copyStyleToClipboard(first);
          toastSuccess('Styles copied', `Paste with ${modKey}+Alt+V`);
        } else if (key === 'v') {
          const style = getClipboardStyle();
          if (style && first) st.updateSelectedElements(style);
        }
        return;
      }
      // Excalidraw: Alt+Shift+D toggles dark mode.
      if (e.altKey && isShift && key === 'd') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snapty-toggle-theme'));
        return;
      }
      // Excalidraw: Shift+H / Shift+V flip the selection.
      if (!isCtrl && isShift && (key === 'h' || key === 'v') && st.selectedElementIds.length) {
        e.preventDefault();
        st.flipSelected(key === 'h' ? 'horizontal' : 'vertical');
        return;
      }

      if (isCtrl && key === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('snapty-open-file'));
        return;
      }
      if (isCtrl && !isShift && key === 'z') { e.preventDefault(); st.undo(); return; }
      if (isCtrl && ((isShift && key === 'z') || (!isShift && key === 'y'))) { e.preventDefault(); st.redo(); return; }
      if (isCtrl && !isShift && key === 'd') { e.preventDefault(); st.duplicateSelected(); return; }
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
        st.setShowCommandPalette(false);
        return;
      }

      // Layer order: [ sends backward, ] brings forward (single selection).
      if (!isCtrl && (e.key === '[' || e.key === ']') && st.selectedElementIds.length === 1) {
        const id = st.selectedElementIds[0];
        e.preventDefault();
        if (e.key === ']') st.bringForward(id);
        else st.sendBackward(id);
        return;
      }

      if (!isCtrl && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && st.selectedElementIds.length && !tgt.closest('[role="slider"]')) {
        if (st.annotationsLocked) return;
        e.preventDefault();
        const step = isShift ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.nudgeSelected(dx, dy);
        return;
      }

      // Without an image only the safe tools may be reached by keyboard: with
      // the renumbered digits, 1 = select and 2 = arrow (which is disabled on
      // an empty canvas), so only the select/hand letters plus digit 1 apply.
      if (!isCtrl && !isShift && (backgroundImage || ['v', 'h', '1'].includes(key))) {
        // Digits follow the main bar's order (the eraser keeps 0).
        const tool = letterToTool[key] || (key === '0' ? 'eraser' : /^[1-9]$/.test(key) ? st.mainTools[Number(key) - 1] : undefined);
        if (tool) {
          e.preventDefault();
          // Re-pressing a tool's key cycles its main option and shows the result by the cursor.
          const hint = (kind: string, value: string) =>
            window.dispatchEvent(new CustomEvent('snapty-tool-hint', { detail: { kind, value } }));
          // Excalidraw: pressing A with the arrow tool active cycles its type.
          if (tool === 'arrow' && st.activeTool === 'arrow') {
            const order = ['straight', 'curved', 'elbow'] as const;
            const next = order[(order.indexOf(st.arrowPath) + 1) % order.length];
            st.setArrowPath(next);
            hint('arrowPath', next);
            return;
          }
          // N again: Number, Letter, Number with finger, Letter with finger, Finger only (a stamp returns to Number).
          if (tool === 'step' && st.activeTool === 'step') {
            const i = STEP_CYCLE.indexOf(st.stepStyle as (typeof STEP_CYCLE)[number]);
            const next = STEP_CYCLE[(i + 1) % STEP_CYCLE.length];
            st.setStepStyle(next);
            hint('stepStyle', next);
            return;
          }
          // B again: Blur, Pixelate (the panel's Mode row).
          if (tool === 'blur' && (st.activeTool === 'blur' || st.activeTool === 'pixelate')) {
            const next = st.activeTool === 'blur' ? 'pixelate' : 'blur';
            st.setActiveTool(next, { clearSelection: false });
            hint('blurMode', next);
            return;
          }
          // R again: sharp / round edges.
          if (tool === 'rectangle' && st.activeTool === 'rectangle') {
            const next = st.cornerRadius > 0 ? 'sharp' : 'round';
            st.setCornerRadius(next === 'round' ? ROUND_CORNER_RADIUS : 0);
            hint('edges', next);
            return;
          }
          // T again: font family, in the panel's order.
          if (tool === 'text' && st.activeTool === 'text') {
            const order = [['hand', FONT_HAND_DRAWN], ['normal', FONT_NORMAL], ['code', FONT_CODE]] as const;
            const cur = st.fontFamily === FONT_CODE ? 2 : st.fontFamily === FONT_NORMAL || st.fontFamily === STANDARD_FONT ? 1 : 0;
            const [name, family] = order[(cur + 1) % order.length];
            st.setFontFamily(family);
            hint('font', name);
            return;
          }
          // K again: the highlighter's quick-pick colours.
          if (tool === 'highlighter' && st.activeTool === 'highlighter') {
            const i = (STROKE_PICKS as readonly string[]).indexOf(st.highlighterColor);
            const next = STROKE_PICKS[(i + 1) % STROKE_PICKS.length];
            st.setHighlighterColor(next);
            hint('hlColor', next);
            return;
          }
          st.setActiveTool(tool);
          return;
        }
      }
      if (!isCtrl && e.key === 'Enter' && !e.repeat) {
        // Enter edits the selected annotation's text in place: text elements
        // are edited directly, any other shape gets (or edits) an attached
        // text label — Excalidraw-style "Enter to type text".
        const anyModal = st.showHelpDialog || st.showExportDialog || st.showCommandPalette;
        if (!anyModal && !st.annotationsLocked && st.selectedElementIds.length === 1) {
          const el = st.elements.find((x) => x.id === st.selectedElementIds[0]);
          if (el && !el.locked) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('snapty-edit-text', { detail: el.id }));
            return;
          }
        }
      }
      if (isCtrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); st.setZoom(st.zoom * 1.2); return; }
      if (isCtrl && e.key === '-') { e.preventDefault(); st.setZoom(st.zoom / 1.2); return; }
      if (isCtrl && isShift && (e.key === '0' || e.key === ')')) { e.preventDefault(); st.setStepStartNumber(1); return; }
      if (isCtrl && !isShift && e.key === '0') { e.preventDefault(); st.resetView(); return; }
      if (isCtrl && !isShift && e.key === '1') { e.preventDefault(); st.zoomToActual(); return; }
      if (isCtrl && !isShift && e.key === '2') { e.preventDefault(); st.zoomToSelection(); return; }
      if (isCtrl && key === 'e' && !isShift) { e.preventDefault(); st.setShowExportDialog(true); return; }
      if (isCtrl && key === 'a' && !isShift) {
        e.preventDefault();
        st.setSelectedElementIds(st.elements.filter((el) => !el.locked).map((el) => el.id));
        return;
      }
      // Slice A: invert selection (Cmd/Ctrl+Shift+A)
      if (isCtrl && isShift && key === 'a') {
        e.preventDefault();
        st.invertSelection();
        return;
      }
      // Slice A: Tab / Shift+Tab cycle selection in z-order
      // Only from the canvas: on a toolbar or panel control Tab keeps moving focus.
      if (!isCtrl && e.key === 'Tab' && (tgt === document.body || tgt.tagName === 'MAIN')) {
        e.preventDefault();
        st.cycleSelection(isShift ? -1 : 1);
        return;
      }
      // Slice A: in-place duplicate (Cmd/Ctrl+Shift+D) — overrides normal
      // duplicate so the user gets both behaviors
      if (isCtrl && isShift && key === 'd') {
        e.preventDefault();
        st.duplicateInPlace();
        return;
      }
      // Close image: the toolbar X, which asks the action cluster (it checks the image lock).
      if (isCtrl && isShift && key === 'x') {
        e.preventDefault();
        if (st.backgroundImage) window.dispatchEvent(new CustomEvent('snapty-clear'));
        return;
      }
      if (isCtrl && !isShift && key === 'x' && st.selectedElementIds.length && !st.annotationsLocked) {
        e.preventDefault();
        const ids = st.selectedElementIds;
        const copied = copySelectedAnnotations();
        if (copied > 0) st.removeElements(ids);
        return;
      }
      if (isCtrl && isShift && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        if (st.elements.length) st.clearElements();
        return;
      }
      if (isCtrl && !isShift && key === 's') {
        e.preventDefault();
        // Save project (.snapty) — faster than export if user wants to continue editing later
        if (st.backgroundImage || st.elements.length) {
          void import('@/lib/editor/project-file').then((m) => m.downloadProject());
        } else {
          toastInfo('Nothing to save', 'Add an image or annotation first');
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
        void (async () => {
          try {
            const result = await captureScreenRegion();
            if (!result.ok) {
              if (result.reason === 'denied') toastInfo('Capture cancelled', 'No screenshot was taken');
              else toastError('Capture failed', result.message);
              return;
            }
            const { image: capped } = await capImageSize(result.image);
            useEditorStore.getState().setBackgroundImage(capped);
          } catch {
            toastError('Capture failed', 'Something went wrong - try again');
          } finally {
            useEditorStore.getState().setImageLoading(false);
          }
        })();
        return;
      }
      if (isCtrl && key === 'c' && !isShift) {
        // With a selection, copy the annotations themselves (paste with Ctrl+V).
        // Without one, fall back to copying the whole annotated image.
        const copied = copySelectedAnnotations();
        if (copied > 0) {
          e.preventDefault();
          return;
        }
        if (st.backgroundImage) {
          e.preventDefault();
          // The action cluster copies and flashes its Copy icon.
          window.dispatchEvent(new Event('snapty-copy'));
        }
        return;
      }
      if (isCtrl && key === 'v' && !isShift) {
        // Paste annotations first; otherwise let the native paste event paste
        // an image from the OS clipboard.
        if (hasAnnotationClipboard()) {
          const pasted = pasteAnnotationsFromClipboard();
          if (pasted > 0) {
            e.preventDefault();
            suppressNextImagePaste();
            return;
          }
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

    // Back to the tool that was active before Space turned it into the hand.
    const releaseSpace = () => {
      const restore = preSpaceTool.current;
      if (restore) {
        useEditorStore.getState().setActiveTool(restore, { clearSelection: false });
        preSpaceTool.current = null;
      }
    };

    const up = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        releaseSpace();
      }
    };

    // Excalidraw: holding Ctrl/Cmd while drawing or dragging an arrow keeps
    // it from binding to shapes.
    const binding = (e: KeyboardEvent | FocusEvent) => {
      const held = 'ctrlKey' in e && (e.ctrlKey || e.metaKey);
      if (useEditorStore.getState().isBindingEnabled === held) {
        useEditorStore.setState({ isBindingEnabled: !held });
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('keydown', binding);
    window.addEventListener('keyup', binding);
    window.addEventListener('blur', binding);
    window.addEventListener('blur', releaseSpace);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('keydown', binding);
      window.removeEventListener('keyup', binding);
      window.removeEventListener('blur', binding);
    window.removeEventListener('blur', releaseSpace);
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
      // Ctrl+V just pasted annotations; some browsers still fire the paste
      // event afterwards, which must not also paste an image.
      if (isImagePasteSuppressed()) return;

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
