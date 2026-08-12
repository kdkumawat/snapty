import type { DeviceFrame } from '@/types/editor';

/**
 * Device-frame system. One source of truth for the chrome that wraps a
 * screenshot: `DEVICE_FRAME_INSETS` (how much chrome sits outside the image)
 * and the two canvas passes `drawDeviceFrameBack` / `drawDeviceFrameFront`
 * (the export painter). The live canvas previews the same chrome via
 * DeviceFrameKonva using the same constants and two passes, so what you see is
 * what you export.
 */

export type FrameInsets = { top: number; right: number; bottom: number; left: number };

export const DEVICE_FRAME_INSETS: Record<DeviceFrame, FrameInsets> = {
  none: { top: 0, right: 0, bottom: 0, left: 0 },
  // Browser chrome: a title bar + URL pill above the image.
  browser: { top: 44, right: 0, bottom: 0, left: 0 },
  // Phones: bezel around the whole screenshot.
  iphone: { top: 18, right: 18, bottom: 18, left: 18 },
  ipad: { top: 16, right: 16, bottom: 16, left: 16 },
  android: { top: 18, right: 18, bottom: 18, left: 18 },
  // Laptop: screen bezel on top + a base below the screen.
  macbook: { top: 14, right: 5, bottom: 22, left: 5 },
};

export const DEVICE_FRAME_LABELS: Record<DeviceFrame, string> = {
  none: 'None',
  browser: 'Browser',
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  macbook: 'MacBook',
};

/** Device frames offered in the UI (chrome types), in display order. */
export const DEVICE_FRAME_OPTIONS: DeviceFrame[] = ['none', 'browser', 'iphone', 'ipad', 'android', 'macbook'];

/** Inner rect (image area) for a frame, given the outer size and padding. */
export function innerRectForFrame(
  frame: DeviceFrame,
  pad: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  const i = DEVICE_FRAME_INSETS[frame];
  return { x: pad + i.left, y: pad + i.top, w: imgW, h: imgH };
}

/** Outer size including chrome insets + padding. */
export function outerSizeForFrame(
  frame: DeviceFrame,
  pad: number,
  imgW: number,
  imgH: number,
): { width: number; height: number } {
  const i = DEVICE_FRAME_INSETS[frame];
  return {
    width: imgW + pad * 2 + i.left + i.right,
    height: imgH + pad * 2 + i.top + i.bottom,
  };
}

/** Rounded-rect clip path (reused by the frame painter). */
export function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
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

/** Round to the nearest 0.5 so 1px strokes stay crisp. */
const crisp = (v: number) => Math.round(v) + 0.5;

/**
 * Chrome that sits BEHIND the screenshot: bezel bodies, title bar, laptop base.
 * Call before drawing the image into `inner`.
 */
export function drawDeviceFrameBack(
  ctx: CanvasRenderingContext2D,
  frame: DeviceFrame,
  frameUrl: string | undefined,
  outerW: number,
  outerH: number,
  inner: { x: number; y: number; w: number; h: number },
): void {
  if (frame === 'none') return;

  if (frame === 'browser') {
    const barH = inner.y;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, outerW, barH);
    const dotY = barH / 2;
    const dots: [string, number][] = [
      ['#ef4444', 16], ['#eab308', 36], ['#22c55e', 56],
    ];
    for (const [color, cx] of dots) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, dotY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const pillX = 80;
    const pillW = Math.max(120, outerW - pillX - 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pillX, dotY - 12, pillW, 24);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX, dotY - 12, pillW, 24);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frameUrl?.trim() || 'snapty.pages.dev', pillX + pillW / 2, dotY + 1);
    return;
  }

  if (frame === 'iphone' || frame === 'ipad' || frame === 'android') {
    const bezel = frame === 'iphone' ? 18 : frame === 'android' ? 18 : 16;
    const radius = frame === 'iphone' ? 34 : frame === 'android' ? 28 : 22;
    ctx.fillStyle = '#1a1a1a';
    clipRoundedRect(ctx, 0, 0, outerW, outerH, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    clipRoundedRect(ctx, crisp(bezel / 2) - 1, crisp(bezel / 2) - 1, outerW - bezel + 1, outerH - bezel + 1, Math.max(6, radius - bezel / 2));
    ctx.stroke();
    return;
  }

  // macbook
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, outerW, inner.y);
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(outerW / 2, inner.y / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath();
  ctx.moveTo(0, outerH - 12);
  ctx.lineTo(outerW * 0.06, outerH);
  ctx.lineTo(outerW * 0.94, outerH);
  ctx.lineTo(outerW, outerH - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, outerH - 12, outerW, 2);
}

/**
 * Chrome that sits ON TOP of the screenshot edge: notch, punch hole, home
 * indicator, screen-edge highlight. Call after drawing the image into `inner`.
 */
export function drawDeviceFrameFront(
  ctx: CanvasRenderingContext2D,
  frame: DeviceFrame,
  outerW: number,
  outerH: number,
  inner: { x: number; y: number; w: number; h: number },
): void {
  if (frame === 'none') return;

  if (frame === 'iphone') {
    const notchW = Math.min(outerW * 0.34, 140);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect((outerW - notchW) / 2, inner.y - 26 + 18, notchW, 26);
    return;
  }
  if (frame === 'android') {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(outerW / 2, inner.y + 4, 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (frame === 'ipad') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(outerW / 2 - 30, inner.y + inner.h + 16 - 7);
    ctx.lineTo(outerW / 2 + 30, inner.y + inner.h + 16 - 7);
    ctx.stroke();
    return;
  }
  if (frame === 'macbook') {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, inner.y - 1, outerW - 4, inner.h + 2);
  }
}
