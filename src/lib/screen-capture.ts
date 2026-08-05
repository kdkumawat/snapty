/**
 * Capture screen / window via the browser Screen Capture API.
 * Browsers show the OS picker (screen, window, or tab) - closest to native snipping
 * available on the web. After load we activate crop so the user can refine a region.
 */

export type CaptureResult =
  | { ok: true; image: HTMLImageElement; surface?: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'empty' | 'error'; message: string };

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((t) => {
    try { t.stop(); } catch { /* ignore */ }
  });
}

async function frameFromStream(stream: MediaStream): Promise<HTMLImageElement> {
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => resolve();
    video.onloadedmetadata = onReady;
    video.onerror = () => reject(new Error('Video track failed'));
    // Some engines need play() before dimensions settle
    void video.play().catch(() => { /* autoplay policies rarely block muted */ });
  });

  // Wait one animation frame so the first decoded frame is available
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (video.readyState >= 2) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Empty capture frame');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(video, 0, 0, w, h);

  video.pause();
  video.srcObject = null;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode capture'))),
      'image/png',
    );
  });

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode capture'));
      image.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isScreenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

/**
 * Opens the OS/browser share picker, grabs one still frame, stops the stream.
 */
export async function captureScreenRegion(): Promise<CaptureResult> {
  if (!isScreenCaptureSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Screen capture isn’t supported in this browser.',
    };
  }

  let stream: MediaStream | null = null;
  try {
    // Prefer monitor; user can still pick window/tab in the picker.
    // Extra keys are Chromium hints - cast keeps TS happy across lib.dom versions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        displaySurface: 'monitor',
        cursor: 'always',
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30, max: 30 },
      },
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: 'exclude',
    } as any);

    const track = stream.getVideoTracks()[0];
    if (!track) {
      stopStream(stream);
      return { ok: false, reason: 'empty', message: 'No video track in capture.' };
    }

    const settings = track.getSettings?.() as MediaTrackSettings & { displaySurface?: string };
    const surface = settings?.displaySurface;

    const image = await frameFromStream(stream);
    stopStream(stream);
    stream = null;

    return { ok: true, image, surface };
  } catch (err) {
    if (stream) stopStream(stream);
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return {
        ok: false,
        reason: 'denied',
        message: name === 'AbortError' ? 'Capture cancelled.' : 'Screen capture permission denied.',
      };
    }
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Screen capture failed.',
    };
  }
}
