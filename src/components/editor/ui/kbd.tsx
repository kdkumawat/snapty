'use client';

import { cn } from '@/lib/utils';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('snapty-kbd', className)}>{children}</kbd>;
}
