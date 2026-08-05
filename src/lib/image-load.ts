import { useEditorStore } from '@/store/editor-store';

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

/**
 * Load an image file into the editor with native-feeling skeleton state.
 * Shows loading immediately, then swaps in the image when ready.
 */
export async function loadImageFileIntoEditor(
  file: File | Blob,
  opts?: { clearAnnotations?: boolean },
): Promise<void> {
  const store = useEditorStore.getState();
  store.setImageLoading(true);
  try {
    const img = await blobToImage(file);
    // Yield so the skeleton paints at least one frame on fast machines
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    useEditorStore.getState().setBackgroundImage(img, opts);
  } finally {
    useEditorStore.getState().setImageLoading(false);
  }
}

export async function loadImageFromDataUrl(
  dataUrl: string,
  opts?: { clearAnnotations?: boolean },
): Promise<void> {
  const store = useEditorStore.getState();
  store.setImageLoading(true);
  try {
    const img = await dataUrlToImage(dataUrl);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    useEditorStore.getState().setBackgroundImage(img, opts);
  } finally {
    useEditorStore.getState().setImageLoading(false);
  }
}
