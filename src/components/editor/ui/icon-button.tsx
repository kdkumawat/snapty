'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: 'default' | 'sm';
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, active, size = 'default', type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'icon-btn',
        size === 'sm' && 'w-8 h-8 rounded-lg',
        active && 'icon-btn-active',
        className,
      )}
      aria-pressed={active || undefined}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
