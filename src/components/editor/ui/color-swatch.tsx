'use client';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ColorSwatch({
  color,
  active,
  onClick,
  label,
}: {
  color: string;
  active?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const isTransparent = color === 'transparent' || color === 'none';
  const tip = label || (isTransparent ? 'Transparent' : color);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tip}
          aria-pressed={active}
          className={cn(
            'w-6 h-6 rounded-md border transition-transform duration-150 cursor-pointer',
            active ? 'border-accent scale-110 ring-2 ring-accent/25' : 'border-border/80 hover:scale-105',
          )}
          style={{
            background: isTransparent
              ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px'
              : color,
          }}
          onClick={onClick}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}
