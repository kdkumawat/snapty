'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type FloatingSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  pill?: boolean;
  asChild?: boolean;
};

export const FloatingSurface = React.forwardRef<HTMLDivElement, FloatingSurfaceProps>(
  ({ className, pill, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('floating-surface', pill ? 'floating-pill' : 'rounded-2xl', className)}
      {...props}
    >
      {children}
    </div>
  ),
);
FloatingSurface.displayName = 'FloatingSurface';
