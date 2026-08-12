import { useEditorStore, generateId } from '@/store/editor-store';
import type { ShapeElement } from '@/types/editor';
import { toastInfo, toastSuccess } from '@/lib/app-toast';
import { preloadHtmlImage } from '@/hooks/use-html-image';

/**
 * Images larger than this (longest side) are downscaled on import unless the
 * user opted to keep the original resolution. Guards against memory blowups
 * from 8K panoramas / 100MP phone shots freezing the editor.
 */
const MAX_IMAGE_DIMENSION = 4096;

/**
 * Downscale an image past MAX_IMAGE_DIMENSION unless `keepOriginal` is on.
 * Resolves with the (possibly new) image and whether it was downscaled. The
 * returned image is guaranteed loaded so callers can read naturalWidth.
 */
export async function capImageSize(img: HTMLImageElement): Promise<{
  image: HTMLImageElement;
  downscaled: boolean;
}> {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return { image: img, downscaled: false };
  if (Math.max(w, h) <= MAX_IMAGE_DIMENSION) return { image: img, downscaled: false };
  if (useEditorStore.getState().keepOriginal) return { image: img, downscaled: false };

  const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: img, downscaled: false };
  ctx.drawImage(img, 0, 0, cw, ch);
  const dataUrl = canvas.toDataURL('image/png');
  return new Promise((resolve) => {
    const out = new Image();
    out.onload = () => resolve({ image: out, downscaled: true });
    out.onerror = () => resolve({ image: img, downscaled: false });
    out.src = dataUrl;
  });
}

/** Decode a File/Blob into an HTMLImageElement. */
export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

export function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = dataUrl;
  });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

function imageToPngDataURL(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Place an image as a movable annotation on top of the current background.
 * Scales to a readable size and selects it for immediate transform.
 */
export async function addImageOverlay(file: File | Blob): Promise<void> {
  const store = useEditorStore.getState();
  if (!store.backgroundImage || !store.imageSize.width) {
    await loadImageFileIntoEditor(file, { mode: 'background' });
    return;
  }
  if (store.annotationsLocked) {
    throw new Error('Annotations are locked');
  }

  // Cap huge overlays too: the full-res blob would otherwise be encoded as a
  // data URL (100MP → hundreds of MB) before it is even scaled for display.
  const decoded = await blobToImage(file);
  const { image: img } = await capImageSize(decoded);
  const dataURL = imageToPngDataURL(img);

  const { imageSize } = useEditorStore.getState();
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const maxW = Math.max(120, imageSize.width * 0.42);
  const maxH = Math.max(120, imageSize.height * 0.42);
  const scale = Math.min(1, maxW / natW, maxH / natH);
  const w = Math.max(24, Math.round(natW * scale));
  const h = Math.max(24, Math.round(natH * scale));
  const id = generateId();

  const el: ShapeElement = {
    id,
    type: 'rectangle',
    x: Math.round((imageSize.width - w) / 2),
    y: Math.round((imageSize.height - h) / 2),
    width: w,
    height: h,
    imageDataURL: dataURL,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    cornerRadius: 0,
    opacity: 1,
  };

  useEditorStore.getState().addElement(el);
  useEditorStore.getState().setSelectedElementIds([id]);
  useEditorStore.getState().setActiveTool('select');
  // Prefetch so CachedKonvaImage hits cache and Transformer attaches immediately
  void preloadHtmlImage(dataURL).then(() => {
    window.dispatchEvent(new CustomEvent('snapty-overlay-image-ready', { detail: { id } }));
  });
  toastSuccess('Image added', 'Drag the corners to resize');
}

export type LoadImageMode = 'auto' | 'background' | 'overlay';

/**
 * Load an image into the editor.
 * - auto: sets background when empty; otherwise adds as an overlay on the canvas
 * - background: replaces/sets the main screenshot
 * - overlay: always places on top of the existing image
 */
export async function loadImageFileIntoEditor(
  file: File | Blob,
  opts?: { clearAnnotations?: boolean; mode?: LoadImageMode },
): Promise<void> {
  const store = useEditorStore.getState();
  if (store.imageLocked && store.backgroundImage) {
    throw new Error('Image is locked');
  }

  const mode = opts?.mode ?? 'auto';
  if (
    (mode === 'overlay' || (mode === 'auto' && store.backgroundImage))
    && store.backgroundImage
  ) {
    await addImageOverlay(file);
    return;
  }

  store.setImageLoading(true);
  try {
    const decoded = await blobToImage(file);
    const { image: img, downscaled } = await capImageSize(decoded);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    useEditorStore.getState().setBackgroundImage(img, opts);
    if (downscaled) notifyDownscaled();
  } finally {
    useEditorStore.getState().setImageLoading(false);
  }
}

export async function loadImageFromDataUrl(
  dataUrl: string,
  opts?: { clearAnnotations?: boolean; mode?: LoadImageMode },
): Promise<void> {
  const store = useEditorStore.getState();
  const mode = opts?.mode ?? 'auto';
  if (
    (mode === 'overlay' || (mode === 'auto' && store.backgroundImage))
    && store.backgroundImage
  ) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await addImageOverlay(blob);
    return;
  }

  store.setImageLoading(true);
  try {
    const decoded = await dataUrlToImage(dataUrl);
    const { image: img, downscaled } = await capImageSize(decoded);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    useEditorStore.getState().setBackgroundImage(img, opts);
    if (downscaled) notifyDownscaled();
  } finally {
    useEditorStore.getState().setImageLoading(false);
  }
}

function loadHtmlImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Load a remote image entirely in the browser (no server proxy).
 * Requires the image host to allow CORS.
 */
export async function loadImageFromUrl(
  url: string,
  opts?: { clearAnnotations?: boolean; mode?: LoadImageMode },
): Promise<void> {
  const store = useEditorStore.getState();
  store.setImageLoading(true);
  try {
    let img: HTMLImageElement;
    let blob: Blob | null = null;
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        throw new Error('URL is not an image');
      }
      blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        img = await loadHtmlImage(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      img = await loadHtmlImage(url, true);
    }

    const mode = opts?.mode ?? 'auto';
    const st = useEditorStore.getState();
    if (
      (mode === 'overlay' || (mode === 'auto' && st.backgroundImage))
      && st.backgroundImage
    ) {
      st.setImageLoading(false);
      if (blob) await addImageOverlay(blob);
      else {
        const dataUrl = imageToPngDataURL(img);
        const res = await fetch(dataUrl);
        await addImageOverlay(await res.blob());
      }
      return;
    }

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const { image: capped, downscaled } = await capImageSize(img);
    useEditorStore.getState().setBackgroundImage(capped, opts);
    if (downscaled) notifyDownscaled();
  } finally {
    useEditorStore.getState().setImageLoading(false);
  }
}

function notifyDownscaled() {
  toastInfo(
    'Image scaled to fit',
    'Large images are capped at 4096px to keep the editor fast. Turn off “Keep original size” in Settings to import at full resolution.',
  );
}

/** Trigger the shared open-file picker (background or overlay via auto mode). */
export function openImagePicker() {
  window.dispatchEvent(new CustomEvent('snapty-open-file'));
}

/** Explicit overlay picker event. */
export function openOverlayImagePicker() {
  window.dispatchEvent(new CustomEvent('snapty-add-image'));
}
