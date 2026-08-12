'use client';

import React, { useEffect, useState } from 'react';
import { X, Play, Sparkles } from 'lucide-react';
import { useEditorStore, generateId } from '@/store/editor-store';
import type { EditorElement, TextElement, ArrowElement, StepElement, ShapeElement } from '@/types/editor';
import { toastInfo } from '@/lib/app-toast';
import { Kbd } from '@/components/editor/ui/kbd';

const DISMISS_KEY = 'snapty-onboarding-dismissed';

/**
 * Layout of the sample screenshot, shared by the painter and the annotations
 * so arrows/badges/pixelate always land on the UI they are calling out.
 */
const SAMPLE = {
  w: 900,
  h: 560,
  sidebar: 168,
  headerH: 52,
  cardY: 92,
  cardH: 120,
  // Content card spans x 190..878, y 228..472.
  btn: { x: 220, y: 404, w: 148, h: 34 },
  // Payment row sits inside the content card (y ~254..312).
  px: { x: 224, y: 268, w: 200, h: 30 },
  badge: { x: 384, y: 118 },
};

function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Build a polished sample screenshot (canvas-drawn, no assets, no network). */
function makeSampleImage(): Promise<HTMLImageElement> {
  const { w, h, sidebar, headerH, cardY, cardH } = SAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Canvas backdrop + main column
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, w, h);

  // Sidebar
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, sidebar, h);
  ctx.fillStyle = '#f97316';
  rr(ctx, 18, 20, 30, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText('Acme', 60, 41);
  const nav = ['Dashboard', 'Orders', 'Customers', 'Reports', 'Settings'];
  ctx.font = '500 12.5px system-ui, sans-serif';
  nav.forEach((item, i) => {
    const y = 88 + i * 42;
    if (i === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      rr(ctx, 12, y - 11, sidebar - 24, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#a8a29e';
    }
    ctx.fillText(item, 24, y + 4);
  });

  // Header bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sidebar, 0, w - sidebar, headerH);
  ctx.fillStyle = '#1c1917';
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillText('Orders', sidebar + 22, headerH / 2 + 5);
  ctx.fillStyle = '#d4d4d8';
  rr(ctx, w - 44, 12, 28, 28, 14);
  ctx.fill();
  ctx.fillStyle = '#f4f4f5';
  rr(ctx, w - 118, 17, 64, 18, 9);
  ctx.fill();

  // Three stat cards
  const cardW = (w - sidebar - 22 * 2 - 14 * 2) / 3;
  const stats = [
    { label: 'Revenue', value: '$42,180', delta: '+12.4%', color: '#16a34a' },
    { label: 'Orders', value: '1,284', delta: '+8.1%', color: '#16a34a' },
    { label: 'Returns', value: '37', delta: '-2.0%', color: '#dc2626' },
  ];
  stats.forEach((s, i) => {
    const x = sidebar + 22 + i * (cardW + 14);
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#78716c';
    ctx.font = '500 10.5px system-ui, sans-serif';
    ctx.fillText(s.label.toUpperCase(), x + 16, cardY + 24);
    ctx.fillStyle = '#1c1917';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(s.value, x + 16, cardY + 58);
    ctx.fillStyle = s.color;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(s.delta, x + 16, cardY + 82);
    ctx.fillStyle = '#f5f5f4';
    rr(ctx, x + cardW - 44, cardY + 16, 28, 28, 7);
    ctx.fill();
  });

  // Main content card: table + action button
  const contentY = cardY + cardH + 16;
  ctx.fillStyle = '#ffffff';
  rr(ctx, sidebar + 22, contentY, w - sidebar - 44, 244, 12);
  ctx.fill();
  ctx.strokeStyle = '#e7e5e4';
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText('Order #9921', sidebar + 40, contentY + 30);
  ctx.fillStyle = '#78716c';
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.fillText('nora@acme.io', sidebar + 40, contentY + 52);

  // Payment row (the pixelate target) - inside the content card
  ctx.fillStyle = '#fafaf9';
  rr(ctx, SAMPLE.px.x - 16, SAMPLE.px.y - 14, 232, 58, 10);
  ctx.fill();
  ctx.strokeStyle = '#e7e5e4';
  ctx.stroke();
  ctx.fillStyle = '#57534e';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillText('Card ending in 4242', SAMPLE.px.x, SAMPLE.px.y + 4);
  ctx.fillStyle = '#a8a29e';
  ctx.font = '500 10.5px system-ui, sans-serif';
  ctx.fillText('Charged $51.50 on 12 Mar', SAMPLE.px.x, SAMPLE.px.y + 20);

  // Primary action button (the arrow target)
  ctx.fillStyle = '#f97316';
  rr(ctx, SAMPLE.btn.x, SAMPLE.btn.y, SAMPLE.btn.w, SAMPLE.btn.h, 9);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('Refund $51.50', SAMPLE.btn.x + 20, SAMPLE.btn.y + 22);

  // Right column list
  const listX = sidebar + 22 + (w - sidebar - 44) - 172;
  ctx.fillStyle = '#ffffff';
  rr(ctx, listX, contentY, 150, 244, 12);
  ctx.fill();
  ctx.strokeStyle = '#e7e5e4';
  ctx.stroke();
  ctx.fillStyle = '#1c1917';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText('Timeline', listX + 14, contentY + 28);
  ['Paid', 'Shipped', 'Delivered', 'Refunded'].forEach((t, i) => {
    ctx.fillStyle = i === 3 ? '#f97316' : '#a8a29e';
    ctx.beginPath();
    ctx.arc(listX + 24, contentY + 62 + i * 40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57534e';
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.fillText(t, listX + 38, contentY + 66 + i * 40);
  });

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL('image/png');
  });
}

/** Build annotations that demo the tools, targeted at the sample's real UI. */
async function makeSampleAnnotations(img: HTMLImageElement): Promise<EditorElement[]> {
  // Red arrow: starts bottom-right, lands on the Refund button's right edge.
  const arrow: ArrowElement = {
    id: generateId(), type: 'arrow', x: 648, y: 512,
    points: [0, 0, -312, -86], stroke: '#ef4444', strokeWidth: 3.5,
    fill: '#ef4444', pointerLength: 14, pointerWidth: 14,
    endArrowhead: 'arrow', startArrowhead: 'none',
    opacity: 1, strokeStyle: 'solid', roughness: 1.25,
  };
  const step: StepElement = {
    id: generateId(), type: 'step', x: SAMPLE.badge.x, y: SAMPLE.badge.y,
    stepNumber: 1, radius: 20, fill: '#3b82f6', fontSize: 16, opacity: 1,
  };
  const text: TextElement = {
    id: generateId(), type: 'text', x: 392, y: 506,
    text: 'Refund this order', fontSize: 28,
    fontFamily: 'var(--font-handwritten), "Caveat", "Segoe Print", "Comic Sans MS", cursive',
    fill: '#111827', opacity: 1, padding: 4, lineHeight: 1.25, align: 'left',
  };
  // Pixelate the payment details row so the privacy tool is demoed with real baked pixels.
  const px: ShapeElement = {
    id: generateId(), type: 'pixelate',
    x: SAMPLE.px.x, y: SAMPLE.px.y,
    width: SAMPLE.px.w, height: SAMPLE.px.h,
    opacity: 0.9, pixelSize: 8,
  };
  px.imageDataURL = await bakePixelatedRegion(img, px.x, px.y, px.width, px.height, px.pixelSize || 8);
  return [arrow, step, px, text];
}

/** Bake a pixelated data-URL for a region of the sample image (matches editor logic). */
function bakePixelatedRegion(
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number, pixelSize: number,
): Promise<string> {
  const aw = Math.max(1, Math.min(Math.round(w), img.naturalWidth - Math.round(x)));
  const ah = Math.max(1, Math.min(Math.round(h), img.naturalHeight - Math.round(y)));
  const off = document.createElement('canvas');
  off.width = aw;
  off.height = ah;
  const ctx = off.getContext('2d')!;
  const sw = Math.max(1, Math.ceil(aw / pixelSize));
  const sh = Math.max(1, Math.ceil(ah / pixelSize));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  small.getContext('2d')!.drawImage(img, Math.round(x), Math.round(y), aw, ah, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, sw, sh, 0, 0, aw, ah);
  return Promise.resolve(off.toDataURL('image/png'));
}

/**
 * First-run experience: a small card that offers a playable sample document.
 * Appears once (remembered dismissal) on an empty canvas; "Try it" loads a
 * ready-made screenshot with annotations so the tools are self-explanatory.
 */
export default function FirstRunCard({ onClose }: { onClose?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
      const hasImage = !!useEditorStore.getState().backgroundImage;
      if (!dismissed && !hasImage) setVisible(true);
    } catch { setVisible(true); }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* optional */ }
    onClose?.();
  };

  const trySample = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const img = await makeSampleImage();
      const dataURL = img.src;
      useEditorStore.getState().setBackgroundImage(img);
      useEditorStore.setState({
        imageDataURL: dataURL,
        imageSize: { width: img.naturalWidth, height: img.naturalHeight },
        elements: await makeSampleAnnotations(img),
        selectedElementIds: [],
        isEditorLaunched: true,
        _history: [{
          elements: [],
          imageDataURL: dataURL,
          imageSize: { width: img.naturalWidth, height: img.naturalHeight },
          canvasStyle: useEditorStore.getState().canvasStyle,
        }],
        _historyIndex: 0,
      });
      toastInfo('Sample loaded', 'Drag, select, or draw. Nothing is saved or uploaded');
      dismiss();
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Welcome to Snapty"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+1rem)] right-3 z-[190] w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl floating-surface shadow-[var(--floating-shadow)] p-4"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">New here? Try a sample</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            A ready-made screenshot with an arrow, a pixelated payment row, a step badge, and handwritten text. Edit or delete anything.
          </p>
          <div className="flex gap-1.5 mt-3">
            <button
              type="button"
              onClick={() => void trySample()}
              disabled={busy}
              className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5" />
              {busy ? 'Loading…' : 'Load sample'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 h-9 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
            >
              Not now
            </button>
          </div>
          <p className="mt-2.5 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <span>Paste a screenshot with <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd></span>
            <span className="opacity-70">Stays on your device</span>
          </p>
        </div>
      </div>
    </div>
  );
}
