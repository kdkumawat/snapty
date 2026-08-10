'use client';

import React, { useEffect } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useHtmlImage } from '@/hooks/use-html-image';

type Props = {
  src: string;
  width: number;
  height: number;
  cornerRadius?: number;
} & Omit<Konva.NodeConfig, 'width' | 'height'>;

/**
 * Single Konva Image node (stable id across load). Transformer resize works on
 * Image; swapping Rect→Image on load was breaking handles on pasted overlays.
 */
export default function CachedKonvaImage({
  src,
  width,
  height,
  cornerRadius,
  id,
  ...rest
}: Props) {
  const image = useHtmlImage(src);
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  useEffect(() => {
    if (!id) return;
    const fire = () => {
      window.dispatchEvent(new CustomEvent('snapty-overlay-image-ready', { detail: { id } }));
    };
    fire();
    requestAnimationFrame(fire);
  }, [image, w, h, id]);

  return (
    <KonvaImage
      {...rest}
      id={id}
      image={image ?? undefined}
      width={w}
      height={h}
      cornerRadius={cornerRadius}
      fill={image ? undefined : 'rgba(148,163,184,0.28)'}
      stroke={image ? undefined : 'rgba(100,116,139,0.5)'}
      strokeWidth={image ? 0 : 1}
      dash={image ? undefined : [6, 4]}
      hitStrokeWidth={12}
      perfectDrawEnabled={false}
    />
  );
}
