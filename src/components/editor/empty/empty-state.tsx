'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Clipboard, MonitorUp, Loader2, Lock } from '@/components/editor/ui/icons';
import ScissorLogo from '@/components/scissor-logo';
import { loadImageFileIntoEditor } from '@/lib/image-load';
import { loadSampleImageIntoEditor } from '@/lib/editor/sample-image';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';
import ImageLoadingSkeleton from '@/components/editor/image-loading-skeleton';
import { toastError, toastInfo } from '@/lib/app-toast';

export default function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const imageLoading = useEditorStore((s) => s.imageLoading);
  const gridEnabled = useEditorStore((s) => s.canvasStyle.gridEnabled);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);

  useEffect(() => {
    const onOpen = () => fileInputRef.current?.click();
    window.addEventListener('snapty-open-file', onOpen);
    return () => window.removeEventListener('snapty-open-file', onOpen);
  }, []);

  async function handlePaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            void loadImageFileIntoEditor(new File([blob], 'paste.png', { type }));
            return;
          }
        }
      }
      toastInfo('Clipboard empty', 'Copy an image first, then paste');
    } catch {
      toastError('Paste failed', 'Allow clipboard access, or press '+modKey+'+V');
    }
  }

  async function handleCapture() {
    if (!isScreenCaptureSupported()) {
      toastError('Capture unavailable', 'Not supported in this browser');
      return;
    }
    setCaptureBusy(true);
    setImageLoading(true);
    try {
      const result = await captureScreenRegion();
      if (!result.ok) {
        if (result.reason === 'denied') toastInfo('Capture cancelled', 'No screenshot was taken');
        else toastError('Capture failed', result.message);
        return;
      }
      useEditorStore.getState().setBackgroundImage(result.image);
    } catch {
      toastError('Capture failed', 'Something went wrong. Try again');
    } finally {
      setCaptureBusy(false);
      setImageLoading(false);
    }
  }

  const [sampleBusy, setSampleBusy] = useState(false);
  const linkClass = 'inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50';

  return (
    <div
      className={cn('absolute inset-0 z-10 flex items-center justify-center p-4 bg-canvas overflow-y-auto', gridEnabled && 'canvas-dot-grid')}
      role="region"
      aria-label="Image drop area"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) void loadImageFileIntoEditor(file);
      }}
    >
      {imageLoading && <ImageLoadingSkeleton label="Loading image…" />}

      <div className="w-full max-w-[26rem] flex flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
            <ScissorLogo size={18} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Snapty</h1>
        </div>

        <div
          className={cn(
            'w-full rounded-lg border-2 border-dashed px-5 py-8 flex flex-col items-center gap-3 transition-colors',
            dragOver ? 'border-accent bg-[var(--accent-container)]' : 'border-border',
          )}
        >
          <p className="text-lg font-semibold">
            {dragOver ? 'Drop to open' : 'Paste a screenshot to annotate it'}
          </p>
          <button
            type="button"
            onClick={() => void handlePaste()}
            aria-keyshortcuts={`${modKey}+V`}
            className="h-10 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-medium inline-flex items-center gap-2 hover:opacity-90"
          >
            <Clipboard className="w-4 h-4" />
            Paste from clipboard
            <kbd className="snapty-kbd max-sm:hidden !bg-transparent !border-current/40 !text-current">{modKey}+V</kbd>
          </button>
          <p className="text-sm text-muted-foreground">
            or drop an image here, or{' '}
            <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => fileInputRef.current?.click()}>
              choose a file
            </button>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <button
            type="button"
            className={linkClass}
            disabled={sampleBusy}
            onClick={() => {
              setSampleBusy(true);
              void loadSampleImageIntoEditor().finally(() => setSampleBusy(false));
            }}
          >
            {sampleBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Try a sample screenshot
          </button>
          {isScreenCaptureSupported() && (
            <button type="button" className={linkClass} disabled={captureBusy} onClick={() => void handleCapture()}>
              {captureBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MonitorUp className="w-3.5 h-3.5" />}
              Capture screen
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Lock className="w-3 h-3" /> Nothing is uploaded. Your screenshots stay on your device.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadImageFileIntoEditor(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
