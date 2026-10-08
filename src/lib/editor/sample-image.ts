'use client';

import { loadImageFromUrl } from '@/lib/image-load';

/**
 * Load the sample screenshot (a made-up analytics dashboard, the same clean
 * original the landing page's bug-report example starts from) into the editor.
 * The landing hero and the editor's empty state both call this.
 *
 * Returns true on success, false on failure.
 */
export async function loadSampleImageIntoEditor(): Promise<boolean> {
  try {
    await loadImageFromUrl('/examples/bug-report-before.webp', { mode: 'background', clearAnnotations: true });
    return true;
  } catch {
    return false;
  }
}
