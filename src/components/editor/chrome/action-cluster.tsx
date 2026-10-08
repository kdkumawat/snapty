'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Copy, Check, Download, Share2, Loader2, MonitorUp, X,
} from '@/components/editor/ui/icons';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { SegmentedControl } from '@/components/editor/ui/segmented-control';
import ImageStyleSettings from '@/components/editor/dialogs/image-style-settings';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard, copySvgToClipboard, exportImage, getSelectionRegion } from '@/components/editor/export-dialog';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import { capImageSize } from '@/lib/image-load';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ExportFormat } from '@/types/editor';
import { cn } from '@/lib/utils';

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'svg', label: 'SVG' },
];
const SCALES = [{ value: '1', label: '1x' }, { value: '2', label: '2x' }];

/** Crossfades two icons with CSS only; the icon is the button's confirmation. */
function SwapIcon({ on, from, to }: { on: boolean; from: React.ReactNode; to: React.ReactNode }) {
  return (
    <span className="inline-grid">
      <span className={cn('col-start-1 row-start-1 transition-opacity duration-150', on && 'opacity-0')}>{from}</span>
      <span className={cn('col-start-1 row-start-1 transition-opacity duration-150', !on && 'opacity-0')}>{to}</span>
    </span>
  );
}

export default function ActionCluster({ embedded = false }: { embedded?: boolean }) {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const showExport = useEditorStore((s) => s.showExportDialog);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const exportQuality = useEditorStore((s) => s.exportQuality);
  const setExportQuality = useEditorStore((s) => s.setExportQuality);
  const exportScale = useEditorStore((s) => s.exportScale);
  const setExportScale = useEditorStore((s) => s.setExportScale);
  const exportSelectionOnly = useEditorStore((s) => s.exportSelectionOnly);
  const setExportSelectionOnly = useEditorStore((s) => s.setExportSelectionOnly);
  const hasSelection = useEditorStore((s) => s.selectedElementIds.length > 0);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);

  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<'download' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Ctrl+E, the menu and the palette ask for the download popover through the
  // store flag; open it and clear the flag so the toolbar is not hidden.
  useEffect(() => {
    if (!showExport) return;
    setShowExportDialog(false);
    if (useEditorStore.getState().backgroundImage) setMenu('download');
  }, [showExport, setShowExportDialog]);

  const exportArgs = () => {
    const region = exportSelectionOnly ? getSelectionRegion() : null;
    return [exportFormat === 'png' ? 1 : exportQuality / 100, exportScale, region ?? undefined] as const;
  };

  const handleCopy = async () => {
    if (busy || !backgroundImage) return;
    setBusy(true);
    try {
      if (exportFormat === 'svg') await copySvgToClipboard();
      else await copyToClipboard(exportScale, exportArgs()[2]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toastError('Couldn’t copy', 'Allow clipboard access and try again');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!backgroundImage) return;
    try {
      const blob = await exportImage('png', 0.92);
      if (!blob) throw new Error('export failed');
      const file = new File([blob], 'snapty.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Snapty annotation' });
      } else {
        await copyToClipboard();
        toastSuccess('Copied', 'Share unavailable. Image copied instead');
      }
    } catch {
      toastError('Share failed', 'Try Download instead');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await exportImage(exportFormat, ...exportArgs());
      if (!blob) throw new Error('export failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapty-export.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => { setDownloaded(false); setMenu(null); }, 1200);
    } catch {
      toastError('Download failed', 'Try again');
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
      toastInfo('Image locked', 'Unlock in the menu to replace');
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
    } catch {
      toastError('Capture failed', 'Try again');
    } finally {
      setCapturing(false);
      setImageLoading(false);
    }
  };

  const requestClear = () => {
    if (imageLocked) {
      toastInfo('Image locked', 'Unlock in the menu to clear');
      return;
    }
    replaceImage();
  };

  // The menus and palette reach these actions through window events.
  useEffect(() => {
    const on: Record<string, () => void> = {
      'snapty-clear': requestClear,
      'snapty-capture': () => void handleCapture(),
      'snapty-copy': () => void handleCopy(),
      'snapty-share': () => void handleShare(),
    };
    for (const [k, fn] of Object.entries(on)) window.addEventListener(k, fn);
    return () => { for (const [k, fn] of Object.entries(on)) window.removeEventListener(k, fn); };
  });

  const popoverClass =
    'absolute right-0 top-[calc(100%+0.45rem)] z-[120] rounded-xl border border-border bg-surface shadow-[var(--floating-shadow)] origin-top-right animate-in fade-in-0 duration-100';

  return (
    <div
      ref={rootRef}
      className={cn('relative', !embedded && 'absolute top-3 right-3 z-[80]')}
    >
      <FloatingSurface pill className="action-flat flex items-center gap-2 w-fit">
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

        {backgroundImage && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton aria-label="Copy image" onClick={() => void handleCopy()}>
                  <SwapIcon on={copied} from={<Copy className="w-4 h-4" />} to={<Check className="w-4 h-4" />} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy image ({modKey}+C)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Download"
                  aria-expanded={menu === 'download'}
                  onClick={() => setMenu((m) => (m === 'download' ? null : 'download'))}
                >
                  <Download className="w-4 h-4" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download ({modKey}+E)</TooltipContent>
            </Tooltip>

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

        {backgroundImage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton aria-label="Close image" onClick={requestClear}>
                <X className="w-4 h-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close image ({modKey}+Shift+X)</TooltipContent>
          </Tooltip>
        )}
      </FloatingSurface>

      {menu === 'download' && backgroundImage && (
        <div
          role="dialog"
          aria-label="Download"
          className={cn(popoverClass, 'w-[min(19rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto p-4 space-y-4')}
        >
          <SegmentedControl<ExportFormat>
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            ariaLabel="Format"
            value={exportFormat}
            options={FORMATS}
            onChange={setExportFormat}
          />
          {exportFormat !== 'svg' && (
            <SegmentedControl
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              ariaLabel="Scale"
              value={String(exportScale)}
              options={SCALES}
              onChange={(v) => setExportScale(Number(v))}
            />
          )}
          {(exportFormat === 'jpg' || exportFormat === 'webp') && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[0.8125rem] text-foreground">
                <span>Quality</span>
                <span className="font-mono tabular-nums">{exportQuality}%</span>
              </div>
              <Slider value={[exportQuality]} onValueChange={([v]) => setExportQuality(v)} min={10} max={100} step={5} />
            </div>
          )}
          {exportFormat !== 'jpg' && <label className="flex items-center justify-between gap-3 text-[0.875rem] text-foreground cursor-pointer">
            Transparent background
            <Switch
              checked={!!canvasStyle.transparentExport}
              onCheckedChange={(v) => setCanvasStyle({ transparentExport: v })}
            />
          </label>}
          {hasSelection && (
            <label className="flex items-center justify-between gap-3 text-[0.875rem] text-foreground cursor-pointer">
              Selection only
              <Switch checked={exportSelectionOnly} onCheckedChange={setExportSelectionOnly} />
            </label>
          )}
          <details className="group border-t border-border pt-2">
            <summary className="flex items-center justify-between cursor-pointer list-none text-[0.875rem] text-foreground [&::-webkit-details-marker]:hidden">
              Frame and background
              <span className="text-muted-foreground transition-transform group-open:rotate-90">&rsaquo;</span>
            </summary>
            <div className="pt-3"><ImageStyleSettings /></div>
          </details>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-10 rounded-lg border border-border bg-secondary text-foreground text-[0.875rem] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[var(--accent-container)] disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleCopy()}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SwapIcon on={copied} from={<Copy className="w-4 h-4" />} to={<Check className="w-4 h-4" />} />}
              Copy
            </button>
            <button
              type="button"
              className="h-10 rounded-lg bg-accent text-accent-foreground text-[0.875rem] font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SwapIcon on={downloaded} from={<Download className="w-4 h-4" />} to={<Check className="w-4 h-4" />} />}
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
