'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanText, Copy, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type OcrPanelProps = {
  open: boolean;
  busy: boolean;
  text: string;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
};

export default function OcrPanel({ open, busy, text, copied, onClose, onCopy }: OcrPanelProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lines = text ? text.split(/\n+/).filter(Boolean) : [];
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  React.useEffect(() => {
    if (!busy && text && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [busy, text]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="absolute bottom-16 right-3 z-30 w-[min(26rem,calc(100vw-2rem))] rounded-2xl floating-surface overflow-hidden shadow-lg select-text"
          role="dialog"
          aria-label="Extract text"
        >
          <div className="shrink-0 px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2 bg-surface">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <ScanText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">Extract text</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {busy ? 'Reading…' : 'Select text or copy all'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={busy || !text}
                onClick={onCopy}
                className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy all'}
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2">
            {!busy && text && (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {lines.length} line{lines.length === 1 ? '' : 's'} · {wordCount} word{wordCount === 1 ? '' : 's'}
              </p>
            )}

            {busy ? (
              <div className="rounded-xl border border-border bg-secondary/20 min-h-[8rem] p-3 space-y-2 animate-pulse">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  Reading text from screenshot…
                </div>
                {[0.9, 0.7, 0.85, 0.6].map((w, i) => (
                  <div key={i} className="h-2.5 rounded bg-border/60" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                readOnly
                value={text}
                placeholder="No text detected in this image."
                aria-label="Recognized text"
                className={cn(
                  'w-full min-h-[8rem] max-h-56 resize-y rounded-xl border border-border',
                  'bg-secondary/20 p-3 text-xs text-foreground leading-relaxed font-mono',
                  'outline-none focus:ring-2 focus:ring-accent/30 select-text cursor-text',
                )}
                onFocus={(e) => e.currentTarget.select()}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
