'use client';

import { useEditorStore } from '@/store/editor-store';
import type { EditorElement, CanvasStyle } from '@/types/editor';

export const SNAPTY_PROJECT_EXT = '.snapty';
export const SNAPTY_PROJECT_MIME = 'application/json';

export type SnaptyProject = {
  version: 1;
  createdAt: number;
  imageDataURL: string | null;
  imageSize: { width: number; height: number };
  elements: EditorElement[];
  canvasStyle: CanvasStyle;
  stepCounter: number;
  activeTool?: string;
};

export function buildProjectSnapshot(): SnaptyProject {
  const s = useEditorStore.getState();
  return {
    version: 1,
    createdAt: Date.now(),
    imageDataURL: s.imageDataURL,
    imageSize: s.imageSize,
    elements: s.elements,
    canvasStyle: s.canvasStyle,
    stepCounter: s.stepCounter,
    activeTool: s.activeTool,
  };
}

export function downloadProject() {
  const snap = buildProjectSnapshot();
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `snapty-${stamp}.snapty`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function loadProjectFromFile(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file.name.endsWith('.snapty') && !file.name.endsWith('.json') && file.type !== 'application/json') {
    return { ok: false, error: 'Not a .snapty file' };
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as SnaptyProject;
    if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.elements)) {
      return { ok: false, error: 'Invalid project file' };
    }
    const snap: SnaptyProject = parsed;
    // Validate image
    if (snap.imageDataURL && typeof snap.imageDataURL === 'string' && snap.imageDataURL.startsWith('data:')) {
      const img = new Image();
      const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode image in project'));
        img.src = snap.imageDataURL!;
      });
      useEditorStore.getState().loadProject(loaded, {
        imageDataURL: snap.imageDataURL,
        imageSize: snap.imageSize ?? { width: loaded.naturalWidth, height: loaded.naturalHeight },
        elements: snap.elements as EditorElement[],
        canvasStyle: snap.canvasStyle,
        stepCounter: snap.stepCounter ?? 1,
      });
      return { ok: true };
    } else if (snap.imageDataURL) {
      // Remote URL? try to load via Image
      return { ok: false, error: 'Project image is not embedded — open the original image first' };
    } else {
      // No image (empty project)
      useEditorStore.getState().loadProject(null, {
        imageDataURL: null,
        imageSize: snap.imageSize ?? { width: 0, height: 0 },
        elements: snap.elements as EditorElement[],
        canvasStyle: snap.canvasStyle,
        stepCounter: snap.stepCounter ?? 1,
      });
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read project file' };
  }
}

export function openProjectPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.snapty,.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const { toastError, toastSuccess } = await import('@/lib/app-toast');
    const res = await loadProjectFromFile(file);
    if (res.ok) toastSuccess('Project opened', `${file.name} loaded`);
    else toastError('Could not open project', res.error);
  };
  input.click();
}
