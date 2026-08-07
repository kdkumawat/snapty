'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { useKeyboardShortcuts, useClipboardPaste } from '@/hooks/use-keyboard-shortcuts';
import TopChrome from '@/components/editor/chrome/top-chrome';
import { ToolbarTips } from '@/components/editor/toolbar/floating-toolbar';
import ZoomControls from '@/components/editor/chrome/zoom-controls';
import UtilityCluster from '@/components/editor/chrome/utility-cluster';
import FloatingPropertiesPanel from '@/components/editor/panels/properties-panel';
import EmptyState from '@/components/editor/empty/empty-state';
import ExportDialog from '@/components/editor/export-dialog';
import HelpDialog from '@/components/editor/help-dialog';
import SettingsDialog from '@/components/editor/dialogs/settings-dialog';
import CommandPalette from '@/components/editor/menus/command-palette';
import CanvasContextMenu from '@/components/editor/menus/canvas-context-menu';
import ImageLoadingSkeleton from '@/components/editor/image-loading-skeleton';
import { scheduleAutosave, clearAutosave, type AutosaveSnapshot } from '@/lib/editor/autosave';

const EditorCanvas = dynamic(() => import('@/components/editor/editor-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  ),
});

/** Persist while editing; never restore on mount so reload shows empty state. */
function useAutosaveLifecycle() {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const elements = useEditorStore((s) => s.elements);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const zoom = useEditorStore((s) => s.zoom);
  const stagePosition = useEditorStore((s) => s.stagePosition);
  const imageDataURL = useEditorStore((s) => s.imageDataURL);
  const imageSize = useEditorStore((s) => s.imageSize);
  const activeTool = useEditorStore((s) => s.activeTool);
  const stepCounter = useEditorStore((s) => s.stepCounter);

  useEffect(() => {
    void clearAutosave();
  }, []);

  useEffect(() => {
    if (!backgroundImage && !imageDataURL) {
      void clearAutosave();
      return;
    }
    scheduleAutosave((): AutosaveSnapshot | null => {
      const s = useEditorStore.getState();
      if (!s.imageDataURL) return null;
      return {
        version: 1,
        updatedAt: Date.now(),
        imageDataURL: s.imageDataURL,
        imageSize: s.imageSize,
        elements: s.elements,
        canvasStyle: s.canvasStyle,
        zoom: s.zoom,
        stagePosition: s.stagePosition,
        activeTool: s.activeTool,
        stepCounter: s.stepCounter,
      };
    });
  }, [backgroundImage, elements, canvasStyle, zoom, stagePosition, imageDataURL, imageSize, activeTool, stepCounter]);
}

export default function EditorShell() {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const imageLoading = useEditorStore((s) => s.imageLoading);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const overlayInputRef = React.useRef<HTMLInputElement>(null);

  useKeyboardShortcuts();
  useClipboardPaste();
  useAutosaveLifecycle();

  useEffect(() => {
    document.documentElement.classList.add('theme-ready');
  }, []);

  useEffect(() => {
    const onOpen = () => {
      if (imageLocked && backgroundImage) return;
      fileInputRef.current?.click();
    };
    const onAdd = () => {
      if (imageLocked || !backgroundImage) return;
      overlayInputRef.current?.click();
    };
    window.addEventListener('snapty-open-file', onOpen);
    window.addEventListener('snapty-add-image', onAdd);
    return () => {
      window.removeEventListener('snapty-open-file', onOpen);
      window.removeEventListener('snapty-add-image', onAdd);
    };
  }, [imageLocked, backgroundImage]);

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
      <div className="relative flex flex-col flex-1 min-h-0 h-full w-full bg-canvas overflow-hidden select-none touch-manipulation">
        {/* Flex child fills shell; absolute wrap inside fills that child */}
        <div className="relative flex-1 min-h-0 w-full">
          <CanvasContextMenu>
            <div
              className="absolute inset-0 overflow-hidden bg-canvas"
              data-snapty-canvas-wrap
            >
              {backgroundImage ? (
                <>
                  <EditorCanvas />
                  {imageLoading && <ImageLoadingSkeleton label="Loading image…" />}
                </>
              ) : (
                <EmptyState />
              )}
            </div>
          </CanvasContextMenu>
        </div>

        <TopChrome onOpenPalette={() => setShowCommandPalette(true)} />
        <ToolbarTips />
        <FloatingPropertiesPanel />
        <ZoomControls />
        <UtilityCluster />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void import('@/lib/image-load').then(({ loadImageFileIntoEditor }) => loadImageFileIntoEditor(file));
            e.target.value = '';
          }}
        />
        <input
          ref={overlayInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void import('@/lib/image-load').then(({ addImageOverlay }) => addImageOverlay(file));
            e.target.value = '';
          }}
        />

        <ExportDialog />
        <HelpDialog />
        <SettingsDialog />
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
