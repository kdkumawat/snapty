'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Copy, Check, Download, Share2, Loader2, ChevronDown, Settings2, MonitorUp,
} from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard, exportCanvasBlob } from '@/components/editor/export-dialog';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import type { BgStyle, ExportFormat } from '@/types/editor';
import { SegmentedControl } from '@/components/editor/ui/segmented-control';
import { cn } from '@/lib/utils';

const DOWNLOAD_OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'png', label: 'PNG', hint: 'Lossless' },
  { id: 'jpg', label: 'JPG', hint: 'Smaller file' },
  { id: 'webp', label: 'WebP', hint: 'Modern' },
  { id: 'svg', label: 'SVG', hint: 'Vector' },
];

export default function ActionCluster({ embedded = false }: { embedded?: boolean }) {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const setImageLocked = useEditorStore((s) => s.setImageLocked);
  const setAnnotationsLocked = useEditorStore((s) => s.setAnnotationsLocked);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const setHandDrawn = useEditorStore((s) => s.setHandDrawn);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<'download' | 'settings' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const handleCopy = async () => {
    if (!backgroundImage || busy) return;
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
      toastError('Capture Unavailable', 'Not supported in this browser');
      return;
    }
    if (imageLocked && backgroundImage) {
      toastInfo('Image Locked', 'Unlock in Settings to replace');
      return;
    }
    setCapturing(true);
    setImageLoading(true);
    try {
      const result = await captureScreenRegion();
      if (!result.ok) {
        if (result.reason === 'denied') toastInfo('Capture Cancelled', 'No screenshot was taken');
        else toastError('Capture Failed', result.message);
        return;
      }
      useEditorStore.getState().setBackgroundImage(result.image);
      toastSuccess('Captured', 'Screenshot loaded');
    } catch {
      toastError('Capture Failed', 'Try again');
    } finally {
      setCapturing(false);
      setImageLoading(false);
    }
  };

  const popoverClass =
    'absolute right-0 top-[calc(100%+0.45rem)] z-[120] rounded-xl border border-border bg-surface shadow-[var(--floating-shadow)] origin-top-right animate-in fade-in-0 duration-100';

  return (
    <div
      ref={rootRef}
      className={cn(!embedded && 'absolute top-3 right-3 z-[100]')}
    >
      <FloatingSurface pill className="h-11 px-1 flex items-center gap-0.5 w-fit">
        {isScreenCaptureSupported() && (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Capture Screen"
                onClick={() => void handleCapture()}
                disabled={capturing}
              >
                {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorUp className="w-4 h-4" />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Capture Screen ({modKey}+Shift+S)</TooltipContent>
          </Tooltip>
        )}

        {backgroundImage && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton aria-label="Copy as PNG" onClick={() => void handleCopy()} disabled={busy}>
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

        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Canvas Settings"
                aria-expanded={menu === 'settings'}
                onClick={() => setMenu((m) => (m === 'settings' ? null : 'settings'))}
              >
                <Settings2 className="w-4 h-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">Canvas Settings</TooltipContent>
          </Tooltip>

          {menu === 'settings' && (
            <div className={cn(popoverClass, 'w-[16.5rem] p-3 space-y-3.5')}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Canvas Settings
              </p>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-xs">Hand-Drawn</Label>
                  <p className="text-[10px] text-muted-foreground">Sketchy strokes</p>
                </div>
                <Switch checked={handDrawn} onCheckedChange={setHandDrawn} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-xs">Lock Image</Label>
                  <p className="text-[10px] text-muted-foreground">Block replace / capture</p>
                </div>
                <Switch checked={imageLocked} onCheckedChange={setImageLocked} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-xs">Lock Annotations</Label>
                  <p className="text-[10px] text-muted-foreground">Freeze move &amp; edit</p>
                </div>
                <Switch checked={annotationsLocked} onCheckedChange={setAnnotationsLocked} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Padding</Label>
                  <span className="text-[10px] font-mono text-muted-foreground">{canvasStyle.padding}px</span>
                </div>
                <Slider
                  value={[canvasStyle.padding]}
                  min={0}
                  max={120}
                  step={4}
                  onValueChange={([v]) => setCanvasStyle({ padding: v })}
                />
                <p className="text-[10px] text-muted-foreground">Frame around the image (live + export)</p>
              </div>

              {canvasStyle.bgStyle === 'solid' && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Fill Color</Label>
                  <input
                    type="color"
                    value={canvasStyle.bgColor || '#ffffff'}
                    onChange={(e) => setCanvasStyle({ bgColor: e.target.value })}
                    className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                    aria-label="Background color"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <SegmentedControl<BgStyle>
                  value={canvasStyle.bgStyle}
                  onChange={(v) => setCanvasStyle({ bgStyle: v })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'solid', label: 'Solid' },
                    { value: 'gradient', label: 'Grad' },
                    { value: 'glass', label: 'Glass' },
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Corner Radius</Label>
                  <span className="text-[10px] font-mono text-muted-foreground">{canvasStyle.borderRadius}px</span>
                </div>
                <Slider
                  value={[canvasStyle.borderRadius]}
                  min={0}
                  max={48}
                  step={2}
                  onValueChange={([v]) => setCanvasStyle({ borderRadius: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Shadow</Label>
                <Switch
                  checked={canvasStyle.shadowEnabled}
                  onCheckedChange={(v) => setCanvasStyle({ shadowEnabled: v })}
                />
              </div>

              <div className="pt-1 border-t border-border space-y-1.5">
                <button
                  type="button"
                  className="w-full h-9 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
                  onClick={() => {
                    resetToolSettings();
                    toastSuccess('Tools reset', 'Snapty defaults restored');
                  }}
                >
                  Reset tools
                </button>
                <p className="text-[10px] text-muted-foreground leading-snug px-0.5">
                  Restores stroke color, width, fill, arrowheads, font size, sloppiness, and hand-drawn mode to Snapty defaults. Your image and annotations stay.
                </p>
              </div>
            </div>
          )}
        </div>
      </FloatingSurface>
    </div>
  );
}
