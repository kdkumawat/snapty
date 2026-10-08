import { useEditorStore, generateId } from '@/store/editor-store';
import type { EditorElement } from '@/types/editor';
import { expandLabelPairs } from '@/lib/editor/text-labels';
import { getElementBounds } from '@/lib/editor/selection';

/**
 * In-app annotation clipboard (separate from the OS clipboard).
 *
 * Ctrl/Cmd+C with a selection copies the *annotations* here instead of the
 * whole annotated image; Ctrl/Cmd+V pastes them back as new elements. The
 * clipboard is a plain deep clone so later edits never leak into it.
 */
let annotationClipboard: EditorElement[] | null = null;

/** Last pointer position over the canvas, in image coordinates. */
let pastePoint: { x: number; y: number } | null = null;
export function setPastePoint(p: { x: number; y: number } | null | undefined) {
  if (p) pastePoint = p;
}

/** Some browsers (Safari) fire the paste event even after keydown was prevented. */
let suppressImagePasteUntil = 0;

export function suppressNextImagePaste(ms = 800): void {
  suppressImagePasteUntil = Date.now() + ms;
}

export function isImagePasteSuppressed(): boolean {
  return Date.now() < suppressImagePasteUntil;
}

export function hasAnnotationClipboard(): boolean {
  return !!annotationClipboard?.length;
}

/** Drop the clipboard (e.g. a fresh image replaces the canvas). */
export function clearAnnotationClipboard(): void {
  annotationClipboard = null;
}

/** Copy the current selection. Returns the number of elements copied (0 = nothing selected). */
export function copySelectedAnnotations(): number {
  const s = useEditorStore.getState();
  if (!s.selectedElementIds.length) return 0;
  // Copying either half of a shape↔label pair carries the whole pair so a
  // pasted arrow keeps its label (and vice versa). Paste regenerates ids and
  // re-links the shared group id, so the relationship survives round-trips.
  const ids = expandLabelPairs(s.elements, s.selectedElementIds);
  const selected = s.elements
    .filter((el) => ids.has(el.id))
    .map((el) => JSON.parse(JSON.stringify(el)) as EditorElement);
  if (!selected.length) return 0;
  annotationClipboard = selected;
  return selected.length;
}

/**
 * Paste the clipboard as new elements offset by (16, 16). Grouped elements
 * keep their grouping but get a fresh group id so they never join the original
 * group. Returns the number of elements pasted (0 = nothing to paste / no image).
 */
export function pasteAnnotationsFromClipboard(): number {
  if (!annotationClipboard?.length) return 0;
  const s = useEditorStore.getState();
  if (!s.imageSize.width || !s.imageSize.height) return 0;
  const groupMap = new Map<string, string>();
  const clones = annotationClipboard.map((el) => {
    const c = JSON.parse(JSON.stringify(el)) as EditorElement;
    c.id = generateId();
    if (c.groupId) {
      if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, generateId());
      c.groupId = groupMap.get(c.groupId);
    }
    return c;
  });
  // Excalidraw pastes centred on the pointer; with no pointer on the canvas
  // yet, fall back to a small cascade offset.
  let dx = 16;
  let dy = 16;
  if (pastePoint) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const c of clones) {
      const b = getElementBounds(c, s.imageSize);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    dx = pastePoint.x - (minX + maxX) / 2;
    dy = pastePoint.y - (minY + maxY) / 2;
  }
  for (const c of clones) {
    // Freehand strokes keep absolute points with the element pinned at 0,0.
    if (c.type === 'pencil' || c.type === 'highlighter') {
      c.points = c.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
    } else {
      c.x += dx;
      c.y += dy;
    }
  }
  const ids = clones.map((c) => c.id);
  s.addElements(clones);
  s.setSelectedElementIds(ids);
  // Advance the clipboard by the same offset so repeated pastes cascade (each
  // new paste lands next to the last one instead of stacking on the first).
  if (!pastePoint) annotationClipboard = annotationClipboard.map((el) => ({ ...el, x: el.x + 16, y: el.y + 16 }));
  return clones.length;
}
