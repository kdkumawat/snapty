'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Copy, Check, Download, Share2, Loader2, ChevronDown, Settings2, MonitorUp, X,
} from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard, exportCanvasBlob } from '@/components/editor/export-dialog';
import { copySelectedAnnotations } from '@/lib/editor/annotation-clipboard';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import { capImageSize } from '@/lib/image-load';
import { clearAutosave } from '@/lib/editor/autosave';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ExportFormat } from '@/types/editor';
import { cn } from '@/lib/utils';

const DOWNLOAD_OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'png', label: 'PNG', hint: 'Lossless' },
  { id: 'jpg', label: 'JPG', hint: 'Smaller file' },
  { id: 'webp', label: 'WebP', hint: 'Modern' },
  { id: 'svg', label: 'SVG', hint: 'Vector' },
];

export default function ActionCluster({ embedded = false }: { embedded?: boolean }) {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const elements = useEditorStore((s) => s.elements);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const setShowSettings = useEditorStore((s) => s.setShowSettings);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<'download' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu && !confirmClear) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenu(null);
        setConfirmClear(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null);
        setConfirmClear(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, confirmClear]);

  const handleCopy = async () => {
    if (busy) return;
    // With a selection, copy the annotations themselves (paste with Ctrl+V);
    // the whole image is only copied when nothing is selected - matching the
    // keyboard shortcut.
    const copied = copySelectedAnnotations();
    if (copied > 0) {
      setBusy(true);
      setCopied(true);
      toastSuccess('Copied', `${copied} annotation${copied > 1 ? 's' : ''} copied — paste with ${modKey}+V`);
      setTimeout(() => { setCopied(false); setBusy(false); }, 2000);
      return;
    }
    if (!backgroundImage) return;
    setBusy(true);
    try {
      await copyToClipboard();
      setCopied(true);
      toastSuccess('Copied', 'Image on clipboard. Ready to paste');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastError('Couldn’t copy', 'Allow clipboard access and try again');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!backgroundImage) return;
    try {
      const blob = await exportCanvasBlob('png');
      if (!blob) throw new Error('export failed');
      const file = new File([blob], 'snapty.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Snapty annotation' });
        toastSuccess('Shared', 'Image sent');
      } else {
        await copyToClipboard();
        toastSuccess('Copied', 'Share unavailable. Image copied instead');
      }
    } catch {
      toastError('Share failed', 'Try Download instead');
    }
  };

  const handleDownload = async (format: ExportFormat) => {
    setDownloading(true);
    setExportFormat(format);
    try {
      const blob = await exportCanvasBlob(format);
      if (!blob) throw new Error('export failed');
      const ext = format === 'jpg' ? '.jpg' : `.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapty-export${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('Downloaded', `Saved as ${format.toUpperCase()}`);
      setMenu(null);
    } catch {
      toastError('Download failed', 'Try again or open Export');
    } finally {
      setDownloading(false);
    }
  };

  const handleCapture = async () => {
    if (!isScreenCaptureSupported()) {
      toastError('Capture unavailable', 'Not supported in this browser');
      return;
    }
    if (imageLocked && backgroundImage) {
      toastInfo('Image locked', 'Unlock in Settings to replace');
      return;
    }
    setCapturing(true);
    setImageLoading(true);
    try {
      const result = await captureScreenRegion();
      if (!result.ok) {
        if (result.reason === 'denied') toastInfo('Capture cancelled', 'No screenshot was taken');
        else toastError('Capture failed', result.message);
        return;
      }
      const { image: capped } = await capImageSize(result.image);
      useEditorStore.getState().setBackgroundImage(capped);
      toastSuccess('Captured', 'Screenshot loaded');
    } catch {
      toastError('Capture failed', 'Try again');
    } finally {
      setCapturing(false);
      setImageLoading(false);
    }
  };

  /** Clear straight away when there is nothing to lose; confirm otherwise. */
  const requestClear = () => {
    if (imageLocked) {
      toastInfo('Image locked', 'Unlock in Settings to clear');
      return;
    }
    if (elements.length === 0) {
      clearImageAndAutosave();
      return;
    }
    setConfirmClear(true);
  };

  const clearImageAndAutosave = () => {
    replaceImage();
    void clearAutosave();
  };

  /*
    The mobile settings sheet reaches these through window events: the phone top
    bar carries only Settings and Close, so the actions themselves still need to
    run from here where their state lives.
  */
  useEffect(() => {
    const onCapture = () => void handleCapture();
    const onCopy = () => void handleCopy();
    const onShare = () => void handleShare();
    window.addEventListener('snapty-capture', onCapture);
    window.addEventListener('snapty-copy', onCopy);
    window.addEventListener('snapty-share', onShare);
    return () => {
      window.removeEventListener('snapty-capture', onCapture);
      window.removeEventListener('snapty-copy', onCopy);
      window.removeEventListener('snapty-share', onShare);
    };
  });

  const popoverClass =
    'absolute right-0 top-[calc(100%+0.45rem)] z-[120] rounded-xl border border-border bg-surface shadow-[var(--floating-shadow)] origin-top-right animate-in fade-in-0 duration-100';

  return (
    <div
      ref={rootRef}
      className={cn('relative', !embedded && 'absolute top-3 right-3 z-[80]')}
    >
      <FloatingSurface pill className="h-11 px-1 flex items-center gap-0.5 w-fit">
        {/*
          On a phone the bar is reduced to Settings + Close. Capture, copy,
          download and share all live inside the settings sheet there, so the
          top row cannot squeeze the toolbar down to a scroll stub.
        */}
        {!isMobile && isScreenCaptureSupported() && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Capture screen"
                onClick={() => void handleCapture()}
                disabled={capturing}
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorUp className="w-4 h-4" />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Capture screen ({modKey}+Shift+S)</TooltipContent>
          </Tooltip>
        )}

        {!isMobile && backgroundImage && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton aria-label="Copy" onClick={() => void handleCopy()} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy ({modKey}+C)</TooltipContent>
            </Tooltip>

            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label="Download"
                    aria-expanded={menu === 'download'}
                    onClick={() => setMenu((m) => (m === 'download' ? null : 'download'))}
                    disabled={downloading}
                  >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download</TooltipContent>
              </Tooltip>

              {menu === 'download' && (
                <div role="menu" className={cn(popoverClass, 'w-[17rem] p-2')}>
                  <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick download
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DOWNLOAD_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        className="rounded-xl border border-border/80 px-2.5 py-2.5 text-left hover:bg-secondary hover:border-border transition-colors"
                        onClick={() => void handleDownload(opt.id)}
                      >
                        <span className="block text-sm font-semibold">{opt.label}</span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                  <div className="my-2 h-px bg-border" />
                  <label className="flex items-center justify-between gap-3 px-2 py-2 rounded-xl hover:bg-secondary cursor-pointer">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">Transparent</span>
                      <p className="text-[10px] text-muted-foreground">PNG/SVG without canvas fill</p>
                    </div>
                    <Switch
                      checked={!!canvasStyle.transparentExport}
                      onCheckedChange={(v) => setCanvasStyle({ transparentExport: v })}
                    />
                  </label>
                  <button
                    type="button"
                    role="menuitem"
                    className="mt-1 w-full flex items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-medium bg-secondary/60 hover:bg-secondary transition-colors"
                    onClick={() => {
                      setMenu(null);
                      setShowExportDialog(true);
                    }}
                  >
                    <span>More options</span>
                    <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton aria-label="Share" onClick={() => void handleShare()}>
                  <Share2 className="w-4 h-4" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">Share</TooltipContent>
            </Tooltip>
          </>
        )}

        {/*
          One settings surface. This used to duplicate the settings dialog as an
          inline popover; the dialog now also owns theme, shortcuts and about.
        */}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton aria-label="Settings" onClick={() => setShowSettings(true)}>
              <Settings2 className="w-4 h-4" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>

        {backgroundImage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton aria-label="Close image" onClick={requestClear}>
                <X className="w-4 h-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close: clear image</TooltipContent>
          </Tooltip>
        )}
      </FloatingSurface>

      {confirmClear && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Clear this image?"
          className={cn(popoverClass, 'w-[17rem] p-3 space-y-3')}
        >
          <div>
            <p className="text-sm font-semibold">Clear this image?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Your annotations will be discarded. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="flex-1 h-8 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 h-8 rounded-lg bg-destructive text-white text-xs font-medium hover:opacity-90 transition-opacity"
              onClick={() => {
                setConfirmClear(false);
                clearImageAndAutosave();
              }}
            >
              Clear image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
