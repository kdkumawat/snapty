'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  FolderOpen, Clipboard, Link as LinkIcon, MonitorUp, HelpCircle, Loader2, Info,
} from 'lucide-react';
import ScissorLogo from '@/components/scissor-logo';
import { loadImageFileIntoEditor, loadImageFromUrl } from '@/lib/image-load';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';
import ImageLoadingSkeleton from '@/components/editor/image-loading-skeleton';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { Kbd } from '@/components/editor/ui/kbd';

export default function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const imageLoading = useEditorStore((s) => s.imageLoading);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const setInfoDialog = useEditorStore((s) => s.setInfoDialog);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);

  // Offline still works for files/paste/capture - only URL import needs a network.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

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
      toastInfo('Clipboard Empty', 'Copy an image first, then paste');
    } catch {
      toastError('Paste Failed', 'Allow clipboard access and try again');
    }
  }

  async function handleUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setUrlBusy(true);
    setUrlError('');
    try {
      await loadImageFromUrl(trimmed);
      setUrl('');
      toastSuccess('Loaded', 'Image imported from URL');
    } catch {
      setUrlError('Could not load (CORS blocked or invalid). Paste or open a file instead.');
    } finally {
      setUrlBusy(false);
    }
  }

  async function handleCapture() {
    if (!isScreenCaptureSupported()) {
      toastError('Capture Unavailable', 'Not supported in this browser');
      return;
    }
    setCaptureBusy(true);
    setImageLoading(true);
    try {
      const result = await captureScreenRegion();
      if (!result.ok) {
        if (result.reason === 'denied') toastInfo('Capture Cancelled', 'No screenshot was taken');
        else toastError('Capture Failed', result.message);
        return;
      }
      useEditorStore.getState().setBackgroundImage(result.image);
      toastSuccess('Captured', 'Screenshot loaded. Use Crop to refine');
    } catch {
      toastError('Capture Failed', 'Something went wrong. Try again');
    } finally {
      setCaptureBusy(false);
      setImageLoading(false);
    }
  }

  const rowClass =
    'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-foreground hover:bg-secondary/80 transition-colors text-left';

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-canvas"
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

      <div
        className={cn(
          'w-full max-w-[22rem] flex flex-col items-stretch gap-1',
          dragOver && 'outline outline-2 outline-accent/40 outline-offset-8 rounded-2xl',
        )}
      >
        <div className="flex flex-col items-center text-center mb-5 gap-2">
          <div className="w-12 h-12 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
            <ScissorLogo size={22} />
          </div>
          <h1 className="text-3xl font-semibold text-accent font-hand">
            Snapty
          </h1>
          <p className="text-sm font-hand text-muted-foreground">
            {dragOver ? 'Drop to open' : 'Drop an image anywhere · your image never leaves this device'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur shadow-[var(--floating-shadow)] p-1.5">
          <button type="button" className={rowClass} onClick={() => fileInputRef.current?.click()}>
            <FolderOpen className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="flex-1 font-hand text-[1.1rem]">Open</span>
            <Kbd>{modKey}+O</Kbd>
          </button>
          <button type="button" className={rowClass} onClick={() => void handlePaste()}>
            <Clipboard className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="flex-1 font-hand text-[1.1rem]">Paste</span>
            <Kbd>{modKey}+V</Kbd>
          </button>
          {isScreenCaptureSupported() && (
            <button
              type="button"
              className={rowClass}
              disabled={captureBusy}
              onClick={() => void handleCapture()}
            >
              {captureBusy
                ? <Loader2 className="w-[18px] h-[18px] animate-spin text-muted-foreground shrink-0" />
                : <MonitorUp className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />}
              <span className="flex-1 font-hand text-[1.1rem]">Capture screen</span>
              <Kbd>{modKey}+Shift+S</Kbd>
            </button>
          )}
          <button type="button" className={rowClass} onClick={() => setShowHelpDialog(true)}>
            <HelpCircle className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="flex-1 font-hand text-[1.1rem]">Help</span>
            <Kbd>?</Kbd>
          </button>
          <button
            type="button"
            className={rowClass}
            onClick={() => setInfoDialog('about')}
          >
            <Info className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="flex-1 font-hand text-[1.1rem]">About Snapty</span>
          </button>
        </div>

        {!online && (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface/90 backdrop-blur p-3">
            <p className="text-[12px] font-hand text-muted-foreground leading-snug">
              <span className="text-foreground">You’re offline.</span> Open, paste, and capture
              still work - everything stays on this device. Only URL import needs a connection.
            </p>
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-border bg-surface/90 backdrop-blur shadow-[var(--floating-shadow)] p-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-muted-foreground ml-2 shrink-0" strokeWidth={1.75} />
            <input
              disabled={!online}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleUrl(); }}
              placeholder="Paste image URL…"
              className="flex-1 h-9 bg-transparent font-hand text-[1rem] outline-none placeholder:text-muted-foreground min-w-0"
              aria-label="Image URL"
            />
            <button
              type="button"
              disabled={urlBusy || !url.trim() || !online}
              onClick={() => void handleUrl()}
              className="h-8 px-3 rounded-lg font-hand text-sm bg-secondary hover:bg-secondary/80 disabled:opacity-40 shrink-0"
            >
              {urlBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load'}
            </button>
          </div>
          {urlError && <p className="text-[12px] font-hand text-destructive px-2 pt-1.5 pb-0.5">{urlError}</p>}
        </div>

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
