'use client';

import React, { useEffect } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import { useHtmlImage } from '@/hooks/use-html-image';

type Props = {
  src: string;
  width: number;
  height: number;
  cornerRadius?: number;
} & Omit<Konva.NodeConfig, 'width' | 'height'>;

/**
 * Stable Group id for Transformer. Bitmap can load asynchronously without
 * unmounting the selectable node (critical for paste-to-overlay resize).
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
    if (!image) return;
    window.dispatchEvent(new CustomEvent('snapty-overlay-image-ready', { detail: { id } }));
  }, [image, id]);

  return (
    <Group {...rest} id={id} width={w} height={h}>
      {image ? (
        <KonvaImage
          image={image}
          width={w}
          height={h}
          cornerRadius={cornerRadius}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : (
        <Rect
          width={w}
          height={h}
          cornerRadius={cornerRadius}
          fill="rgba(148,163,184,0.28)"
          stroke="rgba(100,116,139,0.5)"
          strokeWidth={1}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}
