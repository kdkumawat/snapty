'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Download, Copy, Check, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import type { ExportFormat, CanvasStyle } from '@/types/editor';
import { cn } from '@/lib/utils';

const formats: { id: ExportFormat; label: string; ext: string; mime: string }[] = [
  { id: 'png', label: 'PNG', ext: '.png', mime: 'image/png' },
  { id: 'jpg', label: 'JPG', ext: '.jpg', mime: 'image/jpeg' },
  { id: 'webp', label: 'WEBP', ext: '.webp', mime: 'image/webp' },
];

function getStageConfig() {
  const stage = (window as any).__snapkit_stage;
  if (!stage) return null;
  const st = useEditorStore.getState();
  const { imageSize } = st;
  if (!imageSize.width || !imageSize.height) return null;
  return {
    stage,
    imageSize,
    origWidth: stage.width(),
    origHeight: stage.height(),
    origScaleX: stage.scaleX(),
    origScaleY: stage.scaleY(),
    origX: stage.x(),
    origY: stage.y(),
  };
}

function setupStageForExport(config: NonNullable<ReturnType<typeof getStageConfig>>) {
  config.stage.width(config.imageSize.width);
  config.stage.height(config.imageSize.height);
  config.stage.scaleX(1);
  config.stage.scaleY(1);
  config.stage.x(0);
  config.stage.y(0);
  config.stage.batchDraw();
}

function restoreStage(config: NonNullable<ReturnType<typeof getStageConfig>>) {
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
    ctx.fillText('snapkit.pages.dev', 90, dotY + 4);
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
function renderWithCanvasStyle(
  stageDataURL: string,
  canvasStyle: CanvasStyle,
  imgW: number,
  imgH: number
): string {
  const pad = canvasStyle.padding;
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

  // Draw the stage image
  const img = new Image();
  img.src = stageDataURL;
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

    let finalDataURL: string;
    if (hasStyle) {
      // Render stage at original size first
      const stageDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
      // Apply canvas style
      finalDataURL = renderWithCanvasStyle(stageDataURL, canvasStyle, config.imageSize.width, config.imageSize.height);
      // Convert to blob with correct format
      const res = await fetch(finalDataURL);
      const pngBlob = await res.blob();
      if (format === 'png') return pngBlob;
      // Convert to target format
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
      return new Promise(resolve => tmpCanvas.toBlob(b => resolve(b), fmt.mime, format === 'png' ? undefined : quality));
    } else {
      const isLossless = format === 'png';
      const q = isLossless ? undefined : quality;
      finalDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: fmt.mime, quality: q });
      const res = await fetch(finalDataURL);
      return res.blob();
    }
  } finally {
    restoreStage(config);
  }
}

async function copyToClipboard() {
  const config = getStageConfig();
  if (!config) return;

  setupStageForExport(config);
  try {
    const st = useEditorStore.getState();
    const canvasStyle = st.canvasStyle;
    const hasStyle = canvasStyle.padding > 0 || canvasStyle.borderRadius > 0 ||
      canvasStyle.shadowEnabled || canvasStyle.bgStyle !== 'none' || canvasStyle.deviceFrame !== 'none';

    let dataURL: string;
    if (hasStyle) {
      const stageDataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
      dataURL = renderWithCanvasStyle(stageDataURL, canvasStyle, config.imageSize.width, config.imageSize.height);
    } else {
      dataURL = config.stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
    }
    const res = await fetch(dataURL);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
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
      a.download = `snapkit-export${formats.find(f => f.id === exportFormat)?.ext || '.png'}`;
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
    } catch {} finally { setTimeout(() => { setExporting(false); setProgress(0); }, 300); }
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
