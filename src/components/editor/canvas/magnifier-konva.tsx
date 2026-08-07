'use client';

/**
 * Magnifier: circular source + linked magnified bubble.
 * Preview is baked to an offscreen canvas (skipped while drafting) for smooth resize.
 * Supports hand-drawn rings via Rough when enabled.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Group, Ellipse, Line, Circle, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { MagnifierElement } from '@/types/editor';
import RoughKonvaShape from '@/components/editor/canvas/rough-konva-shape';

type Props = {
  el: MagnifierElement;
  backgroundImage: HTMLImageElement | null;
  imageSize: { width: number; height: number };
  selected?: boolean;
  accent?: string;
  opacity?: number;
  listening?: boolean;
  draggable?: boolean;
  /** While drawing, skip the expensive zoom preview. */
  draft?: boolean;
  handDrawn?: boolean;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
};

function pickPreviewOffset(
  srcCx: number,
  srcCy: number,
  previewR: number,
  imageSize: { width: number; height: number },
  gap: number,
): { ox: number; oy: number } {
  const candidates = [
    { ox: gap + previewR, oy: -(gap + previewR) },
    { ox: -(gap + previewR), oy: -(gap + previewR) },
    { ox: gap + previewR, oy: gap + previewR },
    { ox: -(gap + previewR), oy: gap + previewR },
    { ox: 0, oy: -(gap + previewR * 2) },
    { ox: gap + previewR * 2, oy: 0 },
  ];
  for (const c of candidates) {
    const px = srcCx + c.ox;
    const py = srcCy + c.oy;
    if (
      px - previewR >= 8
      && py - previewR >= 8
      && px + previewR <= imageSize.width - 8
      && py + previewR <= imageSize.height - 8
    ) {
      return c;
    }
  }
  return candidates[0];
}

function bakePreview(
  backgroundImage: HTMLImageElement,
  imageSize: { width: number; height: number },
  absSrcCx: number,
  absSrcCy: number,
  r: number,
  previewR: number,
): HTMLCanvasElement | null {
  const size = Math.max(2, Math.ceil(previewR * 2));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const natW = backgroundImage.naturalWidth || backgroundImage.width || imageSize.width;
  const natH = backgroundImage.naturalHeight || backgroundImage.height || imageSize.height;
  const sx = natW / Math.max(1, imageSize.width);
  const sy = natH / Math.max(1, imageSize.height);

  const srcX = Math.max(0, (absSrcCx - r) * sx);
  const srcY = Math.max(0, (absSrcCy - r) * sy);
  const srcW = Math.max(1, Math.min(r * 2 * sx, natW - srcX));
  const srcH = Math.max(1, Math.min(r * 2 * sy, natH - srcY));

  ctx.beginPath();
  ctx.arc(previewR, previewR, previewR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(backgroundImage, srcX, srcY, srcW, srcH, 0, 0, size, size);
  return canvas;
}

export default function MagnifierKonva({
  el,
  backgroundImage,
  imageSize,
  selected,
  accent = '#EA580C',
  opacity = 1,
  listening = true,
  draggable = false,
  draft = false,
  handDrawn = false,
  onClick,
  onTap,
  onDragEnd,
  onDragMove,
}: Props) {
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  const gx = el.width < 0 ? el.x + el.width : el.x;
  const gy = el.height < 0 ? el.y + el.height : el.y;
  const r = Math.max(8, Math.min(w, h) / 2);
  const mag = Math.max(1.5, Math.min(4, el.magnification ?? 2.25));
  const previewR = r * mag;
  const gap = Math.max(20, r * 0.4);
  const srcCx = r;
  const srcCy = r;
  const absSrcCx = gx + w / 2;
  const absSrcCy = gy + h / 2;
  const groupX = absSrcCx - r;
  const groupY = absSrcCy - r;

  const offset = useMemo(
    () => pickPreviewOffset(absSrcCx, absSrcCy, previewR, imageSize, gap),
    [absSrcCx, absSrcCy, previewR, imageSize.width, imageSize.height, gap],
  );

  const previewCx = srcCx + offset.ox;
  const previewCy = srcCy + offset.oy;
  const stroke = el.stroke || accent;
  const strokeWidth = el.strokeWidth ?? 2.5;
  const roughness = el.roughness ?? 1.25;

  const [baked, setBaked] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (draft || !backgroundImage || r < 10) {
      setBaked(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      setBaked(bakePreview(backgroundImage, imageSize, absSrcCx, absSrcCy, r, previewR));
    }, 24);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [draft, backgroundImage, imageSize.width, imageSize.height, absSrcCx, absSrcCy, r, previewR]);

  const angle = Math.atan2(offset.oy, offset.ox);
  const leader = [
    srcCx + Math.cos(angle) * (r + 3),
    srcCy + Math.sin(angle) * (r + 3),
    previewCx - Math.cos(angle) * (previewR + 3),
    previewCy - Math.sin(angle) * (previewR + 3),
  ];

  const showPreview = !draft && baked;

  return (
    <Group
      id={el.id}
      x={groupX}
      y={groupY}
      opacity={opacity}
      rotation={el.rotation ?? 0}
      listening={listening}
      draggable={draggable}
      onClick={onClick}
      onTap={onTap as any}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
    >
      {handDrawn ? (
        <RoughKonvaShape
          kind="ellipse"
          seed={`${el.id}-src`}
          x={srcCx - r}
          y={srcCy - r}
          width={r * 2}
          height={r * 2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="transparent"
          fillStyle="none"
          roughness={roughness}
          listening={false}
        />
      ) : (
        <Ellipse
          x={srcCx}
          y={srcCy}
          radiusX={r}
          radiusY={r}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={selected ? [5, 4] : undefined}
          fill="rgba(255,255,255,0.06)"
          perfectDrawEnabled={false}
        />
      )}
      <Circle
        x={srcCx}
        y={srcCy}
        radius={Math.max(2, strokeWidth * 0.9)}
        fill={stroke}
        listening={false}
        perfectDrawEnabled={false}
      />

      {showPreview && (
        <>
          <Line
            points={leader}
            stroke={stroke}
            strokeWidth={Math.max(1.25, strokeWidth * 0.65)}
            lineCap="round"
            opacity={0.55}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();
              ctx.arc(previewCx, previewCy, previewR, 0, Math.PI * 2, false);
              ctx.closePath();
            }}
            listening={false}
          >
            <KonvaImage
              image={baked}
              x={previewCx - previewR}
              y={previewCy - previewR}
              width={previewR * 2}
              height={previewR * 2}
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
          {handDrawn ? (
            <RoughKonvaShape
              kind="ellipse"
              seed={`${el.id}-prev`}
              x={previewCx - previewR}
              y={previewCy - previewR}
              width={previewR * 2}
              height={previewR * 2}
              stroke={stroke}
              strokeWidth={strokeWidth + 0.5}
              fill="transparent"
              fillStyle="none"
              roughness={roughness}
              listening={false}
            />
          ) : (
            <>
              <Ellipse
                x={previewCx}
                y={previewCy}
                radiusX={previewR}
                radiusY={previewR}
                stroke={stroke}
                strokeWidth={strokeWidth + 0.5}
                fill="transparent"
                shadowColor="rgba(0,0,0,0.28)"
                shadowBlur={12}
                shadowOffsetY={4}
                listening={false}
                perfectDrawEnabled={false}
              />
              <Ellipse
                x={previewCx}
                y={previewCy}
                radiusX={Math.max(1, previewR - strokeWidth)}
                radiusY={Math.max(1, previewR - strokeWidth)}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1}
                listening={false}
                perfectDrawEnabled={false}
              />
            </>
          )}
        </>
      )}
    </Group>
  );
}
