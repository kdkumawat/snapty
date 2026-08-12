'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { loadAutosave, clearAutosave, type AutosaveSnapshot } from '@/lib/editor/autosave';
import { toastSuccess } from '@/lib/app-toast';
import type { HistorySnapshot } from '@/store/editor-store';

/** Sessions older than this are not worth offering. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'a few seconds ago';
  if (s < 3600) return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? '' : 's'} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? '' : 's'} ago`;
}

/**
 * Offers to restore the IndexedDB autosave when a fresh session exists.
 * The image + annotations + view are restored on confirm; the snapshot is
 * cleared either way so the decision is final.
 */
export default function SessionRecovery({ onResolved }: { onResolved: () => void }) {
  const [pending, setPending] = useState<AutosaveSnapshot | null>(null);
  const resolvedRef = useRef(false);

  const resolve = (fn?: () => void) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    fn?.();
    setPending(null);
    onResolved();
  };

  useEffect(() => {
    let cancelled = false;
    void loadAutosave().then((snap) => {
      if (cancelled) return;
      if (snap && snap.imageDataURL && Date.now() - (snap.updatedAt ?? 0) < MAX_AGE_MS) {
        setPending(snap);
      } else {
        resolve(() => { if (snap) void clearAutosave(); });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const recover = () => {
    if (!pending || !pending.imageDataURL) return;
    const snap = pending;
    // Narrowed by the guard above; captured so the property type survives the closure.
    const imageDataURL: string = pending.imageDataURL;
    const img = new Image();
    img.onload = () => {
      const history: HistorySnapshot[] = [{
        elements: snap.elements,
        imageDataURL: snap.imageDataURL,
        imageSize: snap.imageSize,
        activeTool: snap.activeTool,
        stepCounter: snap.stepCounter,
        canvasStyle: snap.canvasStyle,
      }];
      useEditorStore.setState({
        backgroundImage: img,
        imageDataURL: snap.imageDataURL,
        imageSize: snap.imageSize,
        elements: snap.elements,
        selectedElementIds: [],
        canvasStyle: snap.canvasStyle,
        zoom: snap.zoom || 1,
        stagePosition: snap.stagePosition || { x: 0, y: 0 },
        activeTool: snap.activeTool ?? 'select',
        stepCounter: snap.stepCounter ?? 1,
        isEditorLaunched: true,
        imageLoading: false,
        _history: history,
        _historyIndex: 0,
      });
      setTimeout(() => useEditorStore.getState().resetView(), 30);
      resolve(() => {
        void clearAutosave();
        toastSuccess('Session restored', 'Your image and annotations are back');
      });
    };
    img.onerror = () => {
      resolve(() => { void clearAutosave(); });
    };
    img.src = imageDataURL;
  };

  if (!pending) return null;

  return (
    <div
      role="dialog"
      aria-label="Recover last session"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+1rem)] right-3 z-[200] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl floating-surface shadow-[var(--floating-shadow)] p-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
          <RotateCcw className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Recover your last session?</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Edited {timeAgo(pending.updatedAt)}. Restores your image, annotations, and view.
          </p>
          <div className="flex gap-1.5 mt-2.5">
            <button
              type="button"
              className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              onClick={recover}
            >
              Recover
            </button>
            <button
              type="button"
              className="flex-1 h-9 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
              onClick={() => resolve(() => { void clearAutosave(); })}
            >
              Discard
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
        <Trash2 className="w-3 h-3" /> Stays on your device - this draft was never uploaded.
      </p>
    </div>
  );
}
