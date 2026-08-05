'use client';

import React, { useState } from 'react';
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

function getStageConfig() {
  const stage = (window as any).__snapty_stage;
  if (!stage) return null;
  const st = useEditorStore.getState();
  const { imageSize } = st;
  if (!imageSize.width || !imageSize.height) return null;
  return {
    stage,
    imageSize,
    origWidth: stage.width() as number,
    origHeight: stage.height() as number,
    origScaleX: stage.scaleX() as number,
    origScaleY: stage.scaleY() as number,
    origX: stage.x() as number,
    origY: stage.y() as number,
    hiddenNodes: [] as { node: any; visible: boolean }[],
    exportBounds: { x: 0, y: 0, width: imageSize.width, height: imageSize.height },
  };
}

function setupStageForExport(config: NonNullable<ReturnType<typeof getStageConfig>>) {
  const bounds = getContentBounds();
  config.exportBounds = bounds;

  // Hide transformer so selection anchors aren't baked into the export
  config.hiddenNodes = [];
  try {
    const transformers = config.stage.find?.('Transformer') || [];
    transformers.forEach((node: any) => {
      config.hiddenNodes.push({ node, visible: node.visible() });
      node.visible(false);
    });
  } catch { /* ignore */ }

  config.stage.width(bounds.width);
  config.stage.height(bounds.height);
  config.stage.scaleX(1);
  config.stage.scaleY(1);
  // Shift content so the union of image + annotations starts at (0,0)
  config.stage.x(-bounds.x);
  config.stage.y(-bounds.y);
  config.stage.batchDraw();
}

function restoreStage(config: NonNullable<ReturnType<typeof getStageConfig>>) {
  for (const { node, visible } of config.hiddenNodes || []) {
    try { node.visible(visible); } catch { /* node may be gone */ }
  }
  config.stage.width(config.origWidth);
  config.stage.height(config.origHeight);
  config.stage.scaleX(config.origScaleX);
  config.stage.scaleY(config.origScaleY);
  config.stage.x(config.origX);
  config.stage.y(config.origY);
  config.stage.batchDraw();
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

async function exportImage(format: ExportFormat, quality: number): Promise<Blob | null> {
  const config = getStageConfig();
  if (!config) return null;
  const fmt = formats.find(f => f.id === format);
  if (!fmt) return null;

  setupStageForExport(config);
  try {
    const st = useEditorStore.getState();
    const canvasStyle = st.canvasStyle;
    const hasStyle = canvasStyle.padding > 0 || canvasStyle.borderRadius > 0 ||
      canvasStyle.shadowEnabled || canvasStyle.bgStyle !== 'none' || canvasStyle.deviceFrame !== 'none';

    const exportW = config.exportBounds?.width ?? config.imageSize.width;
    const exportH = config.exportBounds?.height ?? config.imageSize.height;

    let finalDataURL: string;
    if (hasStyle) {
      // Render full content bounds (image + out-of-frame annotations)
      const stageDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
      finalDataURL = await renderWithCanvasStyle(stageDataURL, canvasStyle, exportW, exportH);
      const res = await fetch(finalDataURL);
      const pngBlob = await res.blob();
      if (format === 'png') return pngBlob;
      const tmpCanvas = document.createElement('canvas');
      const tmpImg = new Image();
      tmpImg.src = finalDataURL;
      await new Promise(r => { tmpImg.onload = r; });
      tmpCanvas.width = tmpImg.naturalWidth;
      tmpCanvas.height = tmpImg.naturalHeight;
      const tmpCtx = tmpCanvas.getContext('2d')!;
      if (format === 'jpg') {
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
      }
      tmpCtx.drawImage(tmpImg, 0, 0);
      return new Promise(resolve => tmpCanvas.toBlob(b => resolve(b), fmt.mime, quality));
    } else {
      const isLossless = format === 'png';
      const q = isLossless ? undefined : quality;
      // For JPEG fill transparent overflow with white first via intermediate canvas
      if (format === 'jpg') {
        const pngUrl = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = exportW;
        tmpCanvas.height = exportH;
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, exportW, exportH);
        const tmpImg = new Image();
        tmpImg.src = pngUrl;
        await new Promise(r => { tmpImg.onload = r; });
        tmpCtx.drawImage(tmpImg, 0, 0);
        return new Promise(resolve => tmpCanvas.toBlob(b => resolve(b), fmt.mime, quality));
      }
      finalDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: fmt.mime, quality: q });
      const res = await fetch(finalDataURL);
      return res.blob();
    }
  } finally {
    restoreStage(config);
  }
}

async function copyToClipboard() {
  let config = getStageConfig();
  if (!config) {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      config = getStageConfig();
      if (config) break;
    }
  }
  if (!config) {
    throw new Error('No stage configuration available for copying');
  }

  try {
    setupStageForExport(config);
    const st = useEditorStore.getState();
    const canvasStyle = st.canvasStyle;
    const hasStyle = canvasStyle.padding > 0 || canvasStyle.borderRadius > 0 ||
      canvasStyle.shadowEnabled || canvasStyle.bgStyle !== 'none' || canvasStyle.deviceFrame !== 'none';
    const exportW = config.exportBounds?.width ?? config.imageSize.width;
    const exportH = config.exportBounds?.height ?? config.imageSize.height;

    let dataURL: string;
    if (hasStyle) {
      const stageDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
      dataURL = await renderWithCanvasStyle(stageDataURL, canvasStyle, exportW, exportH);
    } else {
      dataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
    }
    const res = await fetch(dataURL);
    if (!res.ok) {
      throw new Error(`Failed to fetch image data: ${res.status} ${res.statusText}`);
    }
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    throw error;
  } finally {
    restoreStage(config);
  }
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
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const hasPadding = canvasStyle.padding > 0;
  // Approximate export size (full bounds computed at export time may be larger if annotations overflow)
  const exportW = imageSize.width + canvasStyle.padding * 2;
  const exportH = imageSize.height + canvasStyle.padding * 2;

  const handleDownload = async () => {
    setExporting(true);
    setProgress(30);
    try {
      const q = exportFormat === 'png' ? 1 : exportQuality / 100;
      setProgress(60);
      const blob = await exportImage(exportFormat, q);
      if (!blob) return;
      setProgress(90);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapty-export${formats.find(f => f.id === exportFormat)?.ext || '.png'}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
    } finally { setTimeout(() => { setExporting(false); setProgress(0); }, 300); }
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
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      // Show error state briefly
      setCopied(false);
      setProgress(0);
      // Optionally show a toast notification here
    } finally { setTimeout(() => { setExporting(false); setProgress(0); }, 300); }
  };

  return (
    <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
      <DialogContent className="bg-background border-border text-foreground max-w-sm">
        <DialogHeader><DialogTitle className="text-lg">Export Image</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <p className="text-xs text-muted-foreground">
            Original: {imageSize.width} × {imageSize.height}px
            {hasPadding && <span className="text-foreground"> → Export: {exportW} × {exportH}px</span>}
          </p>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((f) => (
                <button key={f.id} className={cn(
                  'px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-center cursor-pointer',
                  exportFormat === f.id
                    ? 'bg-accent text-accent-foreground border border-accent'
                    : 'bg-secondary text-muted-foreground border border-border hover:border-muted-foreground'
                )} onClick={() => setExportFormat(f.id)}>{f.label}</button>
              ))}
            </div>
          </div>
          {exportFormat !== 'png' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Quality</Label>
                <span className="text-xs text-muted-foreground font-mono">{exportQuality}%</span>
              </div>
              <Slider value={[exportQuality]} onValueChange={([v]) => setExportQuality(v)} min={10} max={100} step={5} />
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
            <Button variant="outline" className="flex-1 bg-secondary border-border text-foreground hover:bg-accent hover:text-accent-foreground h-10 min-w-[108px] justify-center cursor-pointer" onClick={handleCopy} disabled={exporting}>
              {exporting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : copied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
              {exporting ? 'Copying...' : copied ? 'Copied' : 'Copy Image'}
            </Button>
            <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 h-10 cursor-pointer" onClick={handleDownload} disabled={exporting}>
              {exporting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Download className="w-4 h-4 mr-2" />}
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
