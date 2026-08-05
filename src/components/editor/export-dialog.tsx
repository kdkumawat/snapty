'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Download, Copy, Check, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import type {
  ExportFormat, CanvasStyle, EditorElement, ShapeElement, ArrowElement,
  LineElement, PencilElement, CircleElement, TextElement, StepElement,
} from '@/types/editor';
import { cn } from '@/lib/utils';
import { toastError, toastSuccess } from '@/lib/app-toast';

const formats: { id: ExportFormat; label: string; ext: string; mime: string }[] = [
  { id: 'png', label: 'PNG', ext: '.png', mime: 'image/png' },
  { id: 'jpg', label: 'JPG', ext: '.jpg', mime: 'image/jpeg' },
  { id: 'webp', label: 'WEBP', ext: '.webp', mime: 'image/webp' },
];

/** Bounding box of a single annotation (includes stroke / pointer padding). */
function getElementBounds(el: EditorElement): { x: number; y: number; w: number; h: number } {
  const stroke = ('strokeWidth' in el ? Number((el as { strokeWidth?: number }).strokeWidth) : 0) || 0;
  const pad = stroke / 2 + 2;

  switch (el.type) {
    case 'rectangle':
    case 'rounded-rect':
    case 'blur':
    case 'pixelate':
    case 'spotlight': {
      const s = el as ShapeElement;
      const w = Math.abs(s.width);
      const h = Math.abs(s.height);
      const x = s.width < 0 ? s.x + s.width : s.x;
      const y = s.height < 0 ? s.y + s.height : s.y;
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case 'circle': {
      const c = el as CircleElement;
      const w = Math.abs(c.width);
      const h = Math.abs(c.height);
      const x = c.width < 0 ? c.x + c.width : c.x;
      const y = c.height < 0 ? c.y + c.height : c.y;
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    case 'arrow':
    case 'line': {
      const pts = (el as ArrowElement | LineElement).points;
      const xs = [el.x, el.x + (pts?.[2] ?? 0)];
      const ys = [el.y, el.y + (pts?.[3] ?? 0)];
      const extra = el.type === 'arrow'
        ? Math.max((el as ArrowElement).pointerLength ?? 12, (el as ArrowElement).pointerWidth ?? 12)
        : 0;
      const minX = Math.min(...xs) - pad - extra;
      const maxX = Math.max(...xs) + pad + extra;
      const minY = Math.min(...ys) - pad - extra;
      const maxY = Math.max(...ys) + pad + extra;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'pencil':
    case 'highlighter': {
      const pts = (el as PencilElement).points || [];
      if (pts.length < 2) return { x: el.x, y: el.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      const sw = (el as PencilElement).strokeWidth || 4;
      return { x: minX - sw, y: minY - sw, w: maxX - minX + sw * 2, h: maxY - minY + sw * 2 };
    }
    case 'text': {
      const t = el as TextElement;
      const fs = t.fontSize || 24;
      const lines = (t.text || '').split('\n');
      const maxChars = Math.max(1, ...lines.map((l) => l.length));
      const w = maxChars * fs * 0.62 + (t.padding ?? 4) * 2;
      const h = lines.length * fs * 1.25 + (t.padding ?? 4) * 2;
      return { x: t.x - 2, y: t.y - 2, w: w + 4, h: h + 4 };
    }
    case 'step': {
      const r = (el as StepElement).radius ?? 16;
      return { x: el.x - r - 4, y: el.y - r - 4, w: r * 2 + 8, h: r * 2 + 8 };
    }
    default:
      return { x: el.x, y: el.y, w: 0, h: 0 };
  }
}

/**
 * Union of image rect + every annotation so copy/export never clips
 * arrows, steps, or text that sit outside the screenshot.
 */
function getContentBounds(): { x: number; y: number; width: number; height: number } {
  const { imageSize, elements } = useEditorStore.getState();
  let minX = 0;
  let minY = 0;
  let maxX = imageSize.width;
  let maxY = imageSize.height;

  for (const el of elements) {
    // Spotlight layers span the full image; skip expanding beyond image for those
    if (el.type === 'spotlight') continue;
    const b = getElementBounds(el);
    if (!Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  const margin = 4;
  minX = Math.floor(minX - margin);
  minY = Math.floor(minY - margin);
  maxX = Math.ceil(maxX + margin);
  maxY = Math.ceil(maxY + margin);

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * Capture stage content at image-native resolution WITHOUT resizing/moving the
 * live stage (that caused a visible flicker on copy/export).
 * Only selection transformers are briefly hidden.
 */
async function captureStagePng(): Promise<{ dataURL: string; width: number; height: number }> {
  const stage = (window as any).__snapty_stage;
  if (!stage) throw new Error('No stage configuration available');
  const { imageSize } = useEditorStore.getState();
  if (!imageSize.width || !imageSize.height) throw new Error('No image loaded');

  const bounds = getContentBounds();
  const hidden: { node: any; visible: boolean }[] = [];
  try {
    const transformers = stage.find?.('Transformer') || [];
    transformers.forEach((node: any) => {
      hidden.push({ node, visible: node.visible() });
      node.visible(false);
    });
    if (hidden.length) stage.batchDraw();

    const scaleX = stage.scaleX() || 1;
    const scaleY = stage.scaleY() || 1;
    // Region of the stage container that currently displays `bounds` (content space)
    const x = stage.x() + bounds.x * scaleX;
    const y = stage.y() + bounds.y * scaleY;
    const width = Math.max(1, bounds.width * scaleX);
    const height = Math.max(1, bounds.height * scaleY);
    // pixelRatio so output is ~bounds in image pixels regardless of zoom
    const pixelRatio = scaleX > 0 ? 1 / scaleX : 1;

    const dataURL = stage.toDataURL({
      x,
      y,
      width,
      height,
      pixelRatio,
      mimeType: 'image/png',
    });
    return { dataURL, width: bounds.width, height: bounds.height };
  } finally {
    for (const { node, visible } of hidden) {
      try { node.visible(visible); } catch { /* gone */ }
    }
    if (hidden.length) stage.batchDraw();
  }
}

async function dataUrlToBlob(dataURL: string, mime?: string, quality?: number): Promise<Blob> {
  if (!mime || mime === 'image/png' || quality == null) {
    const res = await fetch(dataURL);
    if (!res.ok) throw new Error(`Failed to fetch image data: ${res.status}`);
    return res.blob();
  }
  // Re-encode PNG data URL → jpeg/webp at quality
  const img = new Image();
  img.src = dataURL;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to decode export image'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      mime,
      quality,
    );
  });
}

/** Draw rounded rect clip path */
function clipRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw device frame and return the inner rect where the image goes */
function drawDeviceFrame(
  ctx: CanvasRenderingContext2D,
  frame: CanvasStyle['deviceFrame'],
  totalW: number, totalH: number, padding: number
): { x: number; y: number; w: number; h: number } {
  if (frame === 'none') return { x: padding, y: padding, w: totalW - padding * 2, h: totalH - padding * 2 };

  const imgX = padding;
  const imgY = padding;
  const imgW = totalW - padding * 2;
  const imgH = totalH - padding * 2;

  if (frame === 'browser') {
    const barH = 36;
    const titleBarH = 40;
    const frameW = totalW;
    const frameH = totalH + titleBarH;
    // We can't resize the canvas here, so draw the frame inside the padding area
    // Actually, let's just draw a simple title bar above the image
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, totalW, titleBarH);
    // Dots
    const dotY = titleBarH / 2;
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(16, dotY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eab308'; ctx.beginPath(); ctx.arc(36, dotY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(56, dotY, 6, 0, Math.PI * 2); ctx.fill();
    // URL bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(80, dotY - 12, totalW - 120, 24);
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1;
    ctx.strokeRect(80, dotY - 12, totalW - 120, 24);
    ctx.fillStyle = '#9ca3af'; ctx.font = '12px sans-serif';
    ctx.fillText('snapty.pages.dev', 90, dotY + 4);
    return { x: 0, y: titleBarH, w: totalW, h: totalH - titleBarH };
  }

  if (frame === 'iphone') {
    const r = 24;
    const bezel = 12;
    const frameX = 0;
    const frameY = 0;
    const frameW = totalW + bezel * 2;
    const frameH = totalH + bezel * 2 + 40;
    // Draw phone body
    ctx.fillStyle = '#1a1a1a';
    clipRoundedRect(ctx, frameX, frameY, totalW, totalH, r);
    ctx.fill();
    // Notch
    const notchW = 120;
    const notchH = 28;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect((totalW - notchW) / 2, 0, notchW, notchH + bezel);
    return { x: bezel, y: bezel + 20, w: totalW - bezel * 2, h: totalH - bezel - 20 };
  }

  if (frame === 'macbook') {
    const baseH = 16;
    ctx.fillStyle = '#c0c0c0';
    // Base
    ctx.beginPath();
    ctx.moveTo(0, totalH);
    ctx.lineTo(totalW * 0.05, totalH + baseH);
    ctx.lineTo(totalW * 0.95, totalH + baseH);
    ctx.lineTo(totalW, totalH);
    ctx.closePath();
    ctx.fill();
    // Screen bezel top
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, totalW, 24);
    // Camera dot
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(totalW / 2, 12, 3, 0, Math.PI * 2); ctx.fill();
    return { x: 4, y: 24, w: totalW - 8, h: totalH - 28 };
  }

  return { x: padding, y: padding, w: totalW - padding * 2, h: totalH - padding * 2 };
}

/** Render the final export with canvas styles applied */
async function renderWithCanvasStyle(
  stageDataURL: string,
  canvasStyle: CanvasStyle,
  imgW: number,
  imgH: number
): Promise<string> {
  const pad = canvasStyle.padding;
  // imgW/imgH may already include annotation overflow bounds
  const totalW = imgW + pad * 2;
  const totalH = imgH + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d')!;

  // Apply shadow
  if (canvasStyle.shadowEnabled && canvasStyle.borderRadius > 0) {
    ctx.shadowOffsetX = canvasStyle.shadowOffsetX;
    ctx.shadowOffsetY = canvasStyle.shadowOffsetY;
    ctx.shadowBlur = canvasStyle.shadowBlur;
    ctx.shadowColor = canvasStyle.shadowColor;
    ctx.fillStyle = '#ffffff';
    clipRoundedRect(ctx, 0, 0, totalW, totalH, canvasStyle.borderRadius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }

  // Clip to border radius
  if (canvasStyle.borderRadius > 0) {
    clipRoundedRect(ctx, 0, 0, totalW, totalH, canvasStyle.borderRadius);
    ctx.clip();
  }

  // Draw background
  if (canvasStyle.bgStyle === 'solid') {
    ctx.fillStyle = canvasStyle.bgColor;
    ctx.fillRect(0, 0, totalW, totalH);
  } else if (canvasStyle.bgStyle === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, totalW, totalH);
    grad.addColorStop(0, canvasStyle.bgGradientStart);
    grad.addColorStop(1, canvasStyle.bgGradientEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, totalW, totalH);
  } else if (canvasStyle.bgStyle === 'glass') {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, totalW, totalH);
    // Glass overlay
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, totalW, totalH);
  } else {
    // none - transparent (will show checkerboard if needed, but export is transparent)
    // For JPG, fill white
  }

  // Draw device frame (if any)
  let drawRect = { x: pad, y: pad, w: imgW, h: imgH };
  if (canvasStyle.deviceFrame !== 'none') {
    drawRect = drawDeviceFrame(ctx, canvasStyle.deviceFrame, totalW, totalH, pad);
  }

  // Draw the stage image once it has fully loaded
  const img = new Image();
  img.src = stageDataURL;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load stage image for export'));
  });
  ctx.drawImage(img, drawRect.x, drawRect.y, drawRect.w, drawRect.h);

  return canvas.toDataURL('image/png');
}

async function waitForStage(maxAttempts = 8): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if ((window as any).__snapty_stage && useEditorStore.getState().imageSize.width) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function buildExportDataURL(): Promise<{ dataURL: string; width: number; height: number }> {
  await waitForStage();
  const captured = await captureStagePng();
  const canvasStyle = useEditorStore.getState().canvasStyle;
  const hasStyle =
    canvasStyle.padding > 0
    || canvasStyle.borderRadius > 0
    || canvasStyle.shadowEnabled
    || canvasStyle.bgStyle !== 'none'
    || canvasStyle.deviceFrame !== 'none';

  if (!hasStyle) return captured;

  const styled = await renderWithCanvasStyle(
    captured.dataURL,
    canvasStyle,
    captured.width,
    captured.height,
  );
  // Styled canvas may differ in size; decode to get dimensions if needed later
  return { dataURL: styled, width: captured.width, height: captured.height };
}

async function exportImage(format: ExportFormat, quality: number): Promise<Blob | null> {
  const fmt = formats.find((f) => f.id === format);
  if (!fmt) return null;
  try {
    const { dataURL } = await buildExportDataURL();
    if (format === 'png') return dataUrlToBlob(dataURL);
    return dataUrlToBlob(dataURL, fmt.mime, quality);
  } catch (error) {
    console.error('Export failed:', error);
    return null;
  }
}

async function copyToClipboard() {
  try {
    const { dataURL } = await buildExportDataURL();
    const blob = await dataUrlToBlob(dataURL);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    throw error;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

const ExportDialog: React.FC = () => {
  const showExportDialog = useEditorStore((s) => s.showExportDialog);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const exportQuality = useEditorStore((s) => s.exportQuality);
  const setExportQuality = useEditorStore((s) => s.setExportQuality);
  const imageSize = useEditorStore((s) => s.imageSize);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const elements = useEditorStore((s) => s.elements);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);

  const hasPadding = canvasStyle.padding > 0;
  const exportW = imageSize.width + canvasStyle.padding * 2;
  const exportH = imageSize.height + canvasStyle.padding * 2;

  // Debounced real size estimate when dialog is open (uses same pipeline as download)
  useEffect(() => {
    if (!showExportDialog || !imageSize.width) {
      setEstimatedBytes(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const timer = window.setTimeout(async () => {
      try {
        const q = exportFormat === 'png' ? 1 : exportQuality / 100;
        const blob = await exportImage(exportFormat, q);
        if (!cancelled && blob) setEstimatedBytes(blob.size);
      } catch {
        if (!cancelled) setEstimatedBytes(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showExportDialog, exportFormat, exportQuality, imageSize.width, imageSize.height, canvasStyle, elements]);

  const handleDownload = async () => {
    setExporting(true);
    setProgress(30);
    try {
      const q = exportFormat === 'png' ? 1 : exportQuality / 100;
      setProgress(60);
      const blob = await exportImage(exportFormat, q);
      if (!blob) {
        toastError('Download failed', 'Couldn’t prepare the image');
        return;
      }
      setEstimatedBytes(blob.size);
      setProgress(90);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = formats.find((f) => f.id === exportFormat)?.ext || '.png';
      a.download = `snapty-export${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
      toastSuccess(
        'Downloaded',
        `${exportFormat.toUpperCase()} · ${formatBytes(blob.size)}`,
      );
    } catch {
      toastError('Download failed', 'Something went wrong - try again');
    } finally {
      setTimeout(() => { setExporting(false); setProgress(0); }, 300);
    }
  };

  const handleCopy = async () => {
    setExporting(true);
    setCopied(false);
    setProgress(30);
    try {
      setProgress(60);
      await copyToClipboard();
      setProgress(100);
      setCopied(true);
      toastSuccess('Copied', 'Image on clipboard - ready to paste');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      setCopied(false);
      setProgress(0);
      toastError('Couldn’t copy', 'Allow clipboard access and try again');
    } finally {
      setTimeout(() => { setExporting(false); setProgress(0); }, 300);
    }
  };

  return (
    <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
      <DialogContent className="bg-background border-border text-foreground max-w-sm">
        <DialogHeader><DialogTitle className="text-lg">Export Image</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 space-y-1">
            <p className="text-xs text-muted-foreground">
              Dimensions:{' '}
              <span className="text-foreground font-medium tabular-nums">
                {imageSize.width} × {imageSize.height}px
              </span>
              {hasPadding && (
                <span className="text-muted-foreground">
                  {' '}→ {exportW} × {exportH}px
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              Estimated size:{' '}
              <span className="text-foreground font-medium tabular-nums">
                {estimating && estimatedBytes == null
                  ? 'Calculating…'
                  : formatBytes(estimatedBytes ?? 0)}
              </span>
              {estimating && estimatedBytes != null && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={cn(
                    'px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-center cursor-pointer',
                    exportFormat === f.id
                      ? 'bg-accent text-accent-foreground border border-accent'
                      : 'bg-secondary text-muted-foreground border border-border hover:border-muted-foreground',
                  )}
                  onClick={() => setExportFormat(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {exportFormat !== 'png' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Quality</Label>
                <span className="text-xs text-muted-foreground font-mono tabular-nums">{exportQuality}%</span>
              </div>
              <Slider
                value={[exportQuality]}
                onValueChange={([v]) => setExportQuality(v)}
                min={10}
                max={100}
                step={5}
              />
              <p className="text-[11px] text-muted-foreground/60">
                Preference is saved for next export
              </p>
            </div>
          )}
          {exportFormat === 'png' && (
            <p className="text-[11px] text-muted-foreground/60">PNG is lossless - always full quality</p>
          )}
          {exporting && progress > 0 && (
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 bg-secondary border-border text-foreground hover:bg-accent hover:text-accent-foreground h-10 min-w-[7.5rem] justify-center cursor-pointer"
              onClick={handleCopy}
              disabled={exporting}
            >
              <span className="relative w-4 h-4 mr-2 shrink-0">
                {exporting ? (
                  <Loader2 className="w-4 h-4 absolute inset-0 animate-spin" />
                ) : copied ? (
                  <Check className="w-3.5 h-3.5 absolute inset-0 m-auto" />
                ) : (
                  <Copy className="w-3.5 h-3.5 absolute inset-0 m-auto" />
                )}
              </span>
              <span className="tabular-nums">{exporting ? 'Copying…' : copied ? 'Copied' : 'Copy'}</span>
            </Button>
            <Button
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-10 cursor-pointer"
              onClick={handleDownload}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { exportImage, copyToClipboard };
export default ExportDialog;
