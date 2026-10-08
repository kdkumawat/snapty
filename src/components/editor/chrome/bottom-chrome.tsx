'use client';

import { ZoomInIcon, ZoomOutIcon, UndoIcon, RedoIcon } from '@/components/editor/ui/excalidraw-icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { useFormFactor } from '@/hooks/use-form-factor';
import FloatingToolbar from '@/components/editor/toolbar/floating-toolbar';
import { modKey } from '@/hooks/use-keyboard-shortcuts';

/**
 * Bottom-left chrome, as in Excalidraw: zoom and undo/redo as flat grey
 * button groups, with no floating shadow.
 */
const GROUP = 'h-9 flex items-center rounded-lg bg-secondary text-foreground overflow-hidden';
const BTN = 'h-9 w-9 inline-flex items-center justify-center hover:bg-[var(--accent-container)] disabled:opacity-40 disabled:pointer-events-none [&>svg]:w-4 [&>svg]:h-4';

export default function BottomChrome() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const resetView = useEditorStore((s) => s.resetView);
  const zoomToActual = useEditorStore((s) => s.zoomToActual);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s._historyIndex > 0);
  const canRedo = useEditorStore((s) => s._historyIndex < s._history.length - 1);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);

  const phone = useFormFactor() === 'phone';

  if (!hasImage) return null;

  const zoomPill = (
    <div className={GROUP}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={BTN} aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}>
            {ZoomOutIcon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom out</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="h-9 w-[3.75rem] text-[0.875rem] hover:bg-[var(--accent-container)]"
            onClick={() => (Math.abs(zoom - 1) < 0.02 ? resetView() : zoomToActual())}
            aria-label={`${Math.round(zoom * 100)} percent`}
          >
            {Math.round(zoom * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Fit / actual size</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={BTN} aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}>
            {ZoomInIcon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom in</TooltipContent>
      </Tooltip>
    </div>
  );

  const historyPill = (
    <div className={GROUP}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={BTN} aria-label="Undo" disabled={!canUndo} onClick={undo}>
            {UndoIcon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Undo ({modKey}+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={BTN} aria-label="Redo" disabled={!canRedo} onClick={redo}>
            {RedoIcon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Redo ({modKey}+Shift+Z)</TooltipContent>
      </Tooltip>
    </div>
  );

  // Excalidraw's phone layout: the toolbar is a bottom bar, with undo/redo
  // on the row above it and no zoom buttons (pinch zooms).
  if (phone) {
    return (
      <div className="absolute inset-x-4 z-[70] flex flex-col gap-2 pointer-events-none bottom-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <div className="flex justify-end pointer-events-auto">{historyPill}</div>
        <div className="pointer-events-auto"><FloatingToolbar embedded /></div>
      </div>
    );
  }

  return (
    <>
    <div className="absolute left-4 z-[70] flex items-center gap-2.5 bottom-[max(1rem,env(safe-area-inset-bottom,0px))]">
      {zoomPill}
      {historyPill}
    </div>
    </>
  );
}
