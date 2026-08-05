'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Native-feeling skeleton while an image is pasting / loading from URL / file.
 * Soft shimmer over a muted canvas placeholder — no spinners.
 */
const ImageLoadingSkeleton: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = 'Loading image…',
}) => {
  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[2px]',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-[min(72%,28rem)] max-w-md flex flex-col gap-3 px-4">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="h-8 border-b border-border flex items-center gap-1.5 px-3 bg-secondary/40">
            <span className="w-2 h-2 rounded-full bg-border animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-border animate-pulse [animation-delay:75ms]" />
            <span className="w-2 h-2 rounded-full bg-border animate-pulse [animation-delay:150ms]" />
            <div className="ml-2 h-4 flex-1 max-w-[12rem] rounded-md bg-muted animate-pulse" />
          </div>
          <div className="relative aspect-[16/10] bg-muted/40 overflow-hidden">
            <div className="absolute inset-0 snapty-shimmer" />
            <div className="absolute inset-4 flex flex-col gap-2.5">
              <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-muted animate-pulse [animation-delay:100ms]" />
              <div className="h-3 w-3/5 rounded bg-muted animate-pulse [animation-delay:200ms]" />
              <div className="mt-auto h-16 w-full rounded-lg bg-muted/80 animate-pulse [animation-delay:150ms]" />
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground font-medium tracking-wide">
          {label}
        </p>
      </div>
    </div>
  );
};

export default ImageLoadingSkeleton;
