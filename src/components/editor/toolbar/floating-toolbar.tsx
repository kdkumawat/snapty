'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer2, Hand, MoveUpRight, Square, Circle,
  Diamond, Minus, Pencil, Highlighter, Type, Droplets, Grid3x3, ListOrdered,
  Crop, Search, Eraser, ScanSearch,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { Kbd } from '@/components/editor/ui/kbd';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { cn } from '@/lib/utils';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { TOOL_SHORTCUTS, formatToolKeys } from '@/lib/tool-shortcuts';

type ToolDef = {
  id: ToolType | 'sep' | 'search';
  label: string;
  shortcut?: string;
  badge?: string;
  icon: React.ReactNode | null;
};

const shortcutById = Object.fromEntries(TOOL_SHORTCUTS.map((t) => [t.id, t]));

const tools: ToolDef[] = [
  { id: 'select', label: 'Selection', badge: '1', icon: <MousePointer2 className="w-[18px] h-[18px]" /> },
  { id: 'hand', label: 'Hand', badge: '2', icon: <Hand className="w-[18px] h-[18px]" /> },
  { id: 'magnifier', label: 'Magnifier', badge: '3', icon: <ScanSearch className="w-[18px] h-[18px]" /> },
  { id: 'sep', label: '', icon: null },
  { id: 'rectangle', label: 'Rectangle', badge: '4', icon: <Square className="w-[18px] h-[18px]" /> },
  { id: 'diamond', label: 'Diamond', badge: '5', icon: <Diamond className="w-[18px] h-[18px]" /> },
  { id: 'circle', label: 'Ellipse', badge: '6', icon: <Circle className="w-[18px] h-[18px]" /> },
  { id: 'arrow', label: 'Arrow', badge: '7', icon: <MoveUpRight className="w-[18px] h-[18px]" /> },
  { id: 'line', label: 'Line', badge: '8', icon: <Minus className="w-[18px] h-[18px]" /> },
  { id: 'pencil', label: 'Draw', badge: '9', icon: <Pencil className="w-[18px] h-[18px]" /> },
  { id: 'text', label: 'Text', badge: '0', icon: <Type className="w-[18px] h-[18px]" /> },
  { id: 'step', label: 'Number', badge: 'N', icon: <ListOrdered className="w-[18px] h-[18px]" /> },
  { id: 'sep', label: '', icon: null },
  { id: 'highlighter', label: 'Highlighter', badge: 'K', icon: <Highlighter className="w-[18px] h-[18px]" /> },
  { id: 'blur', label: 'Blur', badge: 'B', icon: <Droplets className="w-[18px] h-[18px]" /> },
  { id: 'pixelate', label: 'Pixelate', badge: 'X', icon: <Grid3x3 className="w-[18px] h-[18px]" /> },
  { id: 'crop', label: 'Crop', badge: 'C', icon: <Crop className="w-[18px] h-[18px]" /> },
  { id: 'eraser', label: 'Eraser', badge: 'E', icon: <Eraser className="w-[18px] h-[18px]" /> },
  { id: 'sep', label: '', icon: null },
  { id: 'search', label: 'Command palette', shortcut: `${modKey}+K`, icon: <Search className="w-[18px] h-[18px]" /> },
];

export default function FloatingToolbar({
  onOpenPalette,
  embedded = false,
}: {
  onOpenSettings?: () => void;
  onOpenPalette?: () => void;
  embedded?: boolean;
}) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const stickyTool = useEditorStore((s) => s.stickyTool);
  const setStickyTool = useEditorStore((s) => s.setStickyTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const lastClickRef = React.useRef<{ id: string; t: number }>({ id: '', t: 0 });

  const handleToolClick = (id: ToolType) => {
    const now = Date.now();
    const last = lastClickRef.current;
    const isDouble = last.id === id && now - last.t < 350;
    lastClickRef.current = { id, t: now };
    if (isDouble) setStickyTool(true);
    setActiveTool(id);
  };

  let sepCount = 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'pointer-events-auto max-w-full',
        !embedded && 'absolute top-3 left-1/2 -translate-x-1/2 z-[100] max-w-[calc(100vw-9.5rem)]',
      )}
    >
      <FloatingSurface
        pill
        data-snapty-toolbar
        className="h-11 px-1.5 flex items-center gap-0.5 w-fit max-w-full overflow-x-auto scrollbar-none mx-auto"
      >
        {tools.map((tool) => {
          if (tool.id === 'sep') {
            sepCount += 1;
            return <div key={`sep-${sepCount}`} className="w-px h-5 mx-0.5 bg-border shrink-0" aria-hidden />;
          }

          if (tool.id === 'search') {
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button type="button" className="toolbar-btn !w-9 !h-9 shrink-0" aria-label={tool.label} onClick={() => onOpenPalette?.()}>
                    {tool.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="flex items-center gap-2">
                  <span>{tool.label}</span>
                  {tool.shortcut && <Kbd>{tool.shortcut}</Kbd>}
                </TooltipContent>
              </Tooltip>
            );
          }

          const id = tool.id as ToolType;
          const drawingDisabled = !hasImage && !['select', 'hand'].includes(id);
          const active = activeTool === id;
          const keys = shortcutById[id] ? formatToolKeys(shortcutById[id]) : tool.shortcut;

          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'toolbar-btn !w-9 !h-9 shrink-0',
                    active && 'toolbar-btn-active',
                    stickyTool && active && 'ring-1 ring-inset ring-accent/40',
                    drawingDisabled && 'opacity-30 pointer-events-none',
                  )}
                  aria-label={tool.label}
                  aria-pressed={active}
                  onClick={() => handleToolClick(id)}
                >
                  {tool.icon}
                  {tool.badge && <span className="toolbar-btn-shortcut">{tool.badge}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-2">
                <span>{tool.label}</span>
                {keys && (
                  <span className="flex gap-1">
                    {keys.split(' / ').map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </FloatingSurface>
    </motion.div>
  );
}

const TOOL_TIPS: Record<string, string> = {
  select: 'Click to select. Shift multi-select. Drag empty space for marquee.',
  hand: 'Drag to pan. Hold Space anytime.',
  magnifier: 'Drag a circle on a detail. Preview bubble enlarges it automatically.',
  arrow: 'Drag to draw. Shift constrains. Alt from center. Double-click sticky.',
  line: 'Drag to draw. Shift constrains. Alt from center.',
  rectangle: 'Drag to draw. Shift for square. Alt from center.',
  'rounded-rect': 'Drag to draw. Shift for square. Alt from center.',
  circle: 'Drag to draw. Shift for circle. Alt from center.',
  diamond: 'Drag to draw. Shift constrains. Alt from center.',
  text: 'Click to place text. Enter commits. Esc cancels. Double-click to edit.',
  pencil: 'Draw freely. Release to finish.',
  highlighter: 'Semi-transparent freehand highlight.',
  blur: 'Drag a region to blur sensitive details.',
  pixelate: 'Drag a region to pixelate.',
  crop: 'Drag a crop region, then confirm.',
  step: 'Click to place numbered badges.',
  eraser: 'Drag over annotations to erase.',
};

export function ToolbarTips() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const stickyTool = useEditorStore((s) => s.stickyTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const modalOpen = useEditorStore((s) =>
    s.showHelpDialog || s.showExportDialog || s.showCommandPalette || s.showSettings,
  );

  const tip = React.useMemo(() => {
    if (!hasImage) return 'Open, paste, or drop an image to start annotating';
    if (stickyTool) return 'Sticky mode: keep drawing. Esc returns to Selection.';
    return TOOL_TIPS[activeTool] || `Press ? for shortcuts. ${modKey}+K commands`;
  }, [activeTool, stickyTool, hasImage]);

  if (modalOpen) return null;

  return (
    <div className="absolute top-[3.85rem] left-1/2 -translate-x-1/2 z-[90] pointer-events-none max-w-[min(36rem,calc(100vw-2rem))]">
      <AnimatePresence mode="wait">
        <motion.p
          key={tip}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="text-center text-[11px] text-muted-foreground/90 px-3 py-1"
        >
          {tip}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
