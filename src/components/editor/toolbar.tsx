'use client';

import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import {
  MousePointer2, Hand, MoveUpRight, Square, RectangleHorizontal, Circle, Minus,
  Pencil, Highlighter, Type, Droplets, Grid3x3, Sun, ListOrdered, Eraser, Crop,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tools: { id: ToolType | string; label: string; shortcut: string; icon: React.ReactNode | null }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 className="w-4 h-4" /> },
  { id: 'hand', label: 'Hand / Pan', shortcut: 'H / Space', icon: <Hand className="w-4 h-4" /> },
  { id: 'sep1', label: '', shortcut: '', icon: null },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: <MoveUpRight className="w-4 h-4" /> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square className="w-4 h-4" /> },
  { id: 'rounded-rect', label: 'Rounded Rect', shortcut: 'U', icon: <RectangleHorizontal className="w-4 h-4" /> },
  { id: 'circle', label: 'Ellipse', shortcut: 'O', icon: <Circle className="w-4 h-4" /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus className="w-4 h-4" /> },
  { id: 'sep2', label: '', shortcut: '', icon: null },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: <Pencil className="w-4 h-4" /> },
  { id: 'highlighter', label: 'Highlighter', shortcut: 'I', icon: <Highlighter className="w-4 h-4" /> },
  { id: 'text', label: 'Text', shortcut: 'T', icon: <Type className="w-4 h-4" /> },
  { id: 'step', label: 'Step Number', shortcut: 'N', icon: <ListOrdered className="w-4 h-4" /> },
  { id: 'sep3', label: '', shortcut: '', icon: null },
  { id: 'crop', label: 'Crop', shortcut: 'C', icon: <Crop className="w-4 h-4" /> },
  { id: 'blur', label: 'Blur', shortcut: 'B', icon: <Droplets className="w-4 h-4" /> },
  { id: 'pixelate', label: 'Pixelate', shortcut: 'X', icon: <Grid3x3 className="w-4 h-4" /> },
  { id: 'spotlight', label: 'Spotlight', shortcut: 'S', icon: <Sun className="w-4 h-4" /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser className="w-4 h-4" /> },
];

const Toolbar: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Desktop / tablet: vertical rail. Mobile: horizontal bottom bar via editor-page layout. */}
      <div
        className={cn(
          'toolbar-bg border-border z-30 relative shrink-0',
          // Vertical (md+)
          'md:w-11 lg:w-12 md:h-full md:min-h-0 md:border-r md:flex md:flex-col md:items-center md:py-1.5 md:gap-0.5 md:overflow-y-auto md:overflow-x-hidden md:overscroll-contain',
          // Horizontal (mobile)
          'w-full h-12 min-h-12 border-t flex flex-row items-center px-1 gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain md:border-t-0',
        )}
        data-snapty-toolbar
      >
        {tools.map((tool) => {
          if (String(tool.id).startsWith('sep')) {
            return (
              <div
                key={tool.id}
                className="shrink-0 bg-border md:w-6 md:h-px md:my-1 w-px h-6 mx-0.5 md:mx-0"
                aria-hidden
              />
            );
          }
          const t = tool as { id: ToolType; label: string; shortcut: string; icon: React.ReactNode };
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-all duration-150 toolbar-btn cursor-pointer',
                    activeTool === t.id && 'toolbar-btn-active',
                    !hasImage && t.id !== 'select' && t.id !== 'hand' && 'opacity-30 pointer-events-none',
                  )}
                  onClick={() => setActiveTool(t.id)}
                >
                  {t.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[200]">
                <span>{t.label}</span>
                <kbd className="ml-2 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px] font-mono">{t.shortcut}</kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default Toolbar;
