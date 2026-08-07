'use client';

import { ZoomIn, ZoomOut, Undo2, Redo2 } from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { modKey } from '@/hooks/use-keyboard-shortcuts';

export default function ZoomControls() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const resetView = useEditorStore((s) => s.resetView);
  const zoomToActual = useEditorStore((s) => s.zoomToActual);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s._historyIndex > 0);
  const canRedo = useEditorStore((s) => s._historyIndex < s._history.length - 1);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);

  if (!hasImage) return null;

  return (
    <div className="absolute left-3 z-[100] flex items-center gap-2 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
      <FloatingSurface pill className="h-10 px-1 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton size="sm" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.2)}>
              <ZoomOut className="w-4 h-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom Out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="h-7 min-w-[2.75rem] px-1.5 rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={() => (Math.abs(zoom - 1) < 0.02 ? resetView() : zoomToActual())}
              aria-label={`${Math.round(zoom * 100)} percent`}
            >
              {Math.round(zoom * 100)}%
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Fit / Actual Size</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton size="sm" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.2)}>
              <ZoomIn className="w-4 h-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom In</TooltipContent>
        </Tooltip>
      </FloatingSurface>

      <FloatingSurface pill className="h-10 px-1 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton size="sm" aria-label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 className="w-4 h-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top">Undo ({modKey}+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton size="sm" aria-label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 className="w-4 h-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top">Redo ({modKey}+Shift+Z)</TooltipContent>
        </Tooltip>
      </FloatingSurface>
    </div>
  );
}
