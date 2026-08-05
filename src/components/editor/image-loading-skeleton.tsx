'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * App-native loading state: soft surface + content blocks (not a fake OS window).
 */
const ImageLoadingSkeleton: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = 'Loading image…',
}) => {
  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/75 backdrop-blur-[3px]',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-[min(78%,20rem)] flex flex-col items-center gap-4 px-4">
        {/* App card - content placeholder, not browser chrome */}
        <div className="w-full rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="relative aspect-[4/3] bg-secondary/50 overflow-hidden">
            <div className="absolute inset-0 snapty-shimmer" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 animate-pulse" />
              <div className="w-full max-w-[11rem] space-y-2">
                <div className="h-2.5 w-3/4 mx-auto rounded-full bg-muted animate-pulse" />
                <div className="h-2.5 w-full rounded-full bg-muted/80 animate-pulse [animation-delay:100ms]" />
                <div className="h-2.5 w-2/3 mx-auto rounded-full bg-muted/70 animate-pulse [animation-delay:180ms]" />
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-border bg-secondary/20 flex items-center gap-2">
            <div className="h-2 w-16 rounded-full bg-muted animate-pulse" />
            <div className="h-2 flex-1 rounded-full bg-muted/50 animate-pulse [animation-delay:80ms]" />
            <div className="h-6 w-14 rounded-md bg-accent/20 animate-pulse [animation-delay:120ms]" />
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
