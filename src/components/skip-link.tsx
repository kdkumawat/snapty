'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Visually hidden until focused; on activation, jumps focus to the element
 * matching the `href` (defaults to #main-content). Rendered once at the top
 * of the layout so keyboard users can skip past the marketing/editor chrome.
 */
export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
  className,
}: {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[400]',
        'focus:h-9 focus:px-4 focus:inline-flex focus:items-center focus:justify-center',
        'focus:rounded-full focus:bg-accent focus:text-accent-foreground',
        'focus:text-sm focus:font-semibold focus:shadow-lg focus:shadow-accent/30',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
    </a>
  );
}
