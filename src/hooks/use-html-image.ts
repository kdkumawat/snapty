'use client';

import { useEffect, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();

/** Load and cache an HTMLImageElement from a data URL / URL (avoids recreate-on-render cut-off). */
export function useHtmlImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() =>
    src && cache.has(src) ? cache.get(src)! : null,
  );

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const cached = cache.get(src);
    if (cached?.complete && cached.naturalWidth > 0) {
      setImage(cached);
      return;
    }
    let cancelled = false;
    const img = cached ?? new window.Image();
    const onLoad = () => {
      if (cancelled) return;
      cache.set(src, img);
      setImage(img);
    };
    img.onload = onLoad;
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    if (!cached) {
      img.src = src;
    } else if (img.complete) {
      onLoad();
    }
    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

export function preloadHtmlImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = cached ?? new window.Image();
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    if (!cached) img.src = src;
  });
}
