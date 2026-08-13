'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import {
  listAutosaves, removeAutosave, clearAutosave,
  isRecoveryPromptEnabled, setRecoveryPromptEnabled,
  type AutosaveSnapshot,
} from '@/lib/editor/autosave';
import { toastInfo, toastSuccess } from '@/lib/app-toast';
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
 * Offers to restore the recent IndexedDB autosaves. Up to three sessions are
 * listed (newest first); each can be recovered or discarded individually. A
 * "Don't ask again" checkbox persists to Settings - drafts are kept either way
 * so re-enabling the prompt brings them back.
 */
export default function SessionRecovery({ onResolved }: { onResolved: () => void }) {
  const [pending, setPending] = useState<AutosaveSnapshot[]>([]);
  const [dontAsk, setDontAsk] = useState(false);
  const resolvedRef = useRef(false);

  const resolve = (fn?: () => void) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    fn?.();
    setPending([]);
    onResolved();
  };

  useEffect(() => {
    let cancelled = false;
    if (!isRecoveryPromptEnabled()) {
      resolve();
      return;
    }
    void listAutosaves().then((snaps) => {
      if (cancelled) return;
      const fresh = snaps.filter(
        (s) => s.imageDataURL && Date.now() - (s.updatedAt ?? 0) < MAX_AGE_MS,
      );
      if (fresh.length) setPending(fresh);
      else resolve();
    });
    return () => { cancelled = true; };
  }, []);

  const recover = (snap: AutosaveSnapshot) => {
    if (!snap.imageDataURL) return;
    const imageDataURL: string = snap.imageDataURL;
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

  const discard = (snap: AutosaveSnapshot) => {
    void removeAutosave(snap.updatedAt).then(() => {
      const next = pending.filter((s) => s.updatedAt !== snap.updatedAt);
      if (!next.length) resolve();
      else setPending(next);
    });
  };

  if (!pending.length) return null;

  const multiple = pending.length > 1;

  return (
    <div
      role="dialog"
      aria-label="Recover a recent session"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+1rem)] right-3 z-[200] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl floating-surface shadow-[var(--floating-shadow)] p-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
          <RotateCcw className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {multiple ? 'Recover a recent session?' : 'Recover your last session?'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Restores the image, annotations, and view. Drafts stay on your device.
          </p>

          <div className="mt-2.5 space-y-1.5">
            {pending.map((snap) => (
              <div
                key={snap.updatedAt}
                className="rounded-xl border border-border bg-secondary/25 px-3 py-2"
              >
                <p className="text-[11px] text-muted-foreground">
                  Edited {timeAgo(snap.updatedAt)}
                  {' · '}
                  {snap.elements.length} annotation{snap.elements.length === 1 ? '' : 's'}
                </p>
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    className="flex-1 h-8 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                    onClick={() => recover(snap)}
                  >
                    Recover
                  </button>
                  <button
                    type="button"
                    className="flex-1 h-8 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
                    onClick={() => discard(snap)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className="mt-2.5 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => {
                const checked = e.target.checked;
                setDontAsk(checked);
                setRecoveryPromptEnabled(!checked);
                toastInfo(checked ? 'Recovery prompt off' : 'Recovery prompt on', checked
                  ? 'You can re-enable it in Settings'
                  : 'You will be asked again next time');
              }}
              className="w-3.5 h-3.5 accent-[var(--accent)]"
            />
            <span className="text-[11px] text-muted-foreground">Don't ask again</span>
          </label>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
        <Trash2 className="w-3 h-3" /> Stays on your device - these drafts were never uploaded.
      </p>
    </div>
  );
}
