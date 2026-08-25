'use client';

import React, { useEffect, useState } from 'react';
import { X, Play, Sparkles } from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import { loadSampleImageIntoEditor } from '@/lib/editor/sample-image';
import { Kbd } from '@/components/editor/ui/kbd';

const DISMISS_KEY = 'snapty-onboarding-dismissed';

/**
 * First-run experience: a small card that offers a playable sample document.
 * Appears once (remembered dismissal) on an empty canvas; "Load sample" pulls
 * in a ready-made screenshot with annotations so the tools are self-explanatory.
 */
export default function FirstRunCard({ onClose }: { onClose?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
      const hasImage = !!useEditorStore.getState().backgroundImage;
      if (!dismissed && !hasImage) setVisible(true);
    } catch { setVisible(true); }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* optional */ }
    onClose?.();
  };

  const trySample = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await loadSampleImageIntoEditor();
      if (ok) dismiss();
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Welcome to Snapty"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+1rem)] right-3 z-[190] w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl floating-surface shadow-[var(--floating-shadow)] p-4"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">New here? Try a sample</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            A ready-made screenshot with an arrow, a pixelated payment row, a step badge, and handwritten text. Edit or delete anything.
          </p>
          <div className="flex gap-1.5 mt-3">
            <button
              type="button"
              onClick={() => void trySample()}
              disabled={busy}
              className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5" />
              {busy ? 'Loading…' : 'Load sample'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 h-9 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
            >
              Not now
            </button>
          </div>
          <p className="mt-2.5 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <span>Paste with <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd></span>
            <span className="opacity-70">Stays on your device</span>
          </p>
          <p className="mt-1.5 text-[10px] text-muted-foreground flex items-center flex-wrap gap-x-1.5 gap-y-1">
            <span>Try</span>
            <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
            <span>for every action, or</span>
            <Kbd>?</Kbd>
            <span>for shortcuts.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
