'use client';

import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { MousePointer2, Hand, ArrowUp, Square, RectangleHorizontal, Circle, Minus, Pencil, Highlighter, Type, Droplets, Grid3x3, Sun, ListOrdered, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

const tools: { id: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 className="w-4 h-4" /> },
  { id: 'hand', label: 'Hand / Pan', shortcut: 'H / Space', icon: <Hand className="w-4 h-4" /> },
  { id: 'sep1', label: '', shortcut: '', icon: null } as any,
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: <ArrowUp className="w-4 h-4" /> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square className="w-4 h-4" /> },
  { id: 'rounded-rect', label: 'Rounded Rect', shortcut: 'U', icon: <RectangleHorizontal className="w-4 h-4" /> },
  { id: 'circle', label: 'Ellipse', shortcut: 'O', icon: <Circle className="w-4 h-4" /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus className="w-4 h-4" /> },
  { id: 'sep2', label: '', shortcut: '', icon: null } as any,
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: <Pencil className="w-4 h-4" /> },
  { id: 'highlighter', label: 'Highlighter', shortcut: 'I', icon: <Highlighter className="w-4 h-4" /> },
  { id: 'text', label: 'Text', shortcut: 'T', icon: <Type className="w-4 h-4" /> },
  { id: 'step', label: 'Step Number', shortcut: 'N', icon: <ListOrdered className="w-4 h-4" /> },
  { id: 'sep3', label: '', shortcut: '', icon: null } as any,
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
      <div className="w-12 shrink-0 flex flex-col items-center py-2 gap-0.5 toolbar-bg border-r toolbar-border">
        {tools.map((tool) => {
          if (tool.id.startsWith('sep')) return <Separator key={tool.id} className="w-6 my-1 toolbar-separator" />;
          const t = tool as { id: ToolType; label: string; shortcut: string; icon: React.ReactNode };
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 toolbar-btn cursor-pointer', activeTool === t.id && 'toolbar-btn-active', !hasImage && t.id !== 'select' && 'opacity-30 pointer-events-none')} onClick={() => setActiveTool(t.id)}>
                  {t.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
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
