'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2, Hand, MoveUpRight, Square, Circle,
  Diamond, Minus, Pencil, Highlighter, Type, Droplets, Grid3x3, ListOrdered,
  Crop, Search, Eraser, ScanSearch, ScanText,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { Kbd } from '@/components/editor/ui/kbd';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { cn } from '@/lib/utils';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { TOOL_SHORTCUTS, formatToolKeys } from '@/lib/tool-shortcuts';
import { cycleToolSetting } from '@/lib/editor/tool-setting-cycle';

type ToolDef = {
  id: ToolType;
  label: string;
  icon: React.ReactNode;
};

const shortcutById = Object.fromEntries(TOOL_SHORTCUTS.map((t) => [t.id, t]));

const tools: ToolDef[] = [
  { id: 'select', label: 'Selection', icon: <MousePointer2 className="w-[18px] h-[18px]" /> },
  { id: 'arrow', label: 'Arrow', icon: <MoveUpRight className="w-[18px] h-[18px]" /> },
  { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-[18px] h-[18px]" /> },
  { id: 'text', label: 'Text', icon: <Type className="w-[18px] h-[18px]" /> },
  { id: 'step', label: 'Number', icon: <ListOrdered className="w-[18px] h-[18px]" /> },
  { id: 'blur', label: 'Blur', icon: <Droplets className="w-[18px] h-[18px]" /> },
  { id: 'pencil', label: 'Draw', icon: <Pencil className="w-[18px] h-[18px]" /> },
  { id: 'circle', label: 'Ellipse', icon: <Circle className="w-[18px] h-[18px]" /> },
  { id: 'line', label: 'Line', icon: <Minus className="w-[18px] h-[18px]" /> },
  { id: 'magnifier', label: 'Magnifier', icon: <ScanSearch className="w-[18px] h-[18px]" /> },
  { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="w-[18px] h-[18px]" /> },
  { id: 'pixelate', label: 'Pixelate', icon: <Grid3x3 className="w-[18px] h-[18px]" /> },
  { id: 'diamond', label: 'Diamond', icon: <Diamond className="w-[18px] h-[18px]" /> },
  { id: 'crop', label: 'Crop', icon: <Crop className="w-[18px] h-[18px]" /> },
  { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-[18px] h-[18px]" /> },
  { id: 'hand', label: 'Hand', icon: <Hand className="w-[18px] h-[18px]" /> },
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
    if (isDouble) {
      setStickyTool(true);
      setActiveTool(id);
      return;
    }
    if (activeTool === id) {
      cycleToolSetting(id);
      return;
    }
    setActiveTool(id);
  };

  const renderTool = (tool: ToolDef) => {
    const drawingDisabled = !hasImage && !['select', 'hand'].includes(tool.id);
    const active = activeTool === tool.id;
    const keys = shortcutById[tool.id] ? formatToolKeys(shortcutById[tool.id]) : undefined;
    const badge = shortcutById[tool.id]?.letter;

    return (
      <Tooltip key={tool.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'toolbar-btn shrink-0',
              active && 'toolbar-btn-active',
              stickyTool && active && 'ring-1 ring-inset ring-accent/40',
              drawingDisabled && 'opacity-30 pointer-events-none',
            )}
            aria-label={tool.label}
            aria-pressed={active}
            onClick={() => handleToolClick(tool.id)}
          >
            {tool.icon}
            {badge && <span className="toolbar-btn-shortcut">{badge}</span>}
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
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative pointer-events-auto min-w-0',
        embedded ? 'max-w-full' : 'absolute top-3 left-1/2 -translate-x-1/2 z-[80] max-w-[calc(100vw-9.5rem)]',
      )}
    >
      <FloatingSurface
        pill
        data-snapty-toolbar
        className="px-1.5 flex items-center gap-0.5 w-full max-w-full"
      >
        {tools.map(renderTool)}

        <div className="w-px h-5 mx-0.5 bg-border shrink-0" aria-hidden />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="toolbar-btn shrink-0"
              disabled={!hasImage}
              aria-label="Extract text"
              onClick={() => window.dispatchEvent(new CustomEvent('snapty-ocr'))}
            >
              <ScanText className="w-[18px] h-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Extract text (OCR)</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 mx-0.5 bg-border shrink-0" aria-hidden />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="toolbar-btn shrink-0"
              aria-label="Command palette"
              onClick={() => onOpenPalette?.()}
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            <span>Command palette</span>
            <Kbd>{`${modKey}+K`}</Kbd>
          </TooltipContent>
        </Tooltip>
      </FloatingSurface>
    </motion.div>
  );
}

const TOOL_TIPS: Record<string, string> = {
  select: 'Click to select. Shift multi-select. Drag empty space for marquee.',
  hand: 'Drag to pan. Hold Space anytime.',
  magnifier: 'Drag an ellipse on a detail. Shift for a circle. Drag the bubble anywhere.',
  arrow: 'Drag to draw. Press A again to cycle stroke style. Double-click sticky.',
  line: 'Drag to draw. Press L again to cycle stroke style.',
  rectangle: 'Drag to draw. Press R again to cycle fill style.',
  'rounded-rect': 'Drag to draw. Shift for square. Alt from center.',
  circle: 'Drag to draw. Press O again to cycle fill style.',
  diamond: 'Drag to draw. Press D again to cycle fill style.',
  text: 'Click to place text. Press T again to toggle font.',
  pencil: 'Draw freely. Press P again to cycle stroke width.',
  highlighter: 'Semi-transparent highlight. Press K again to cycle thickness.',
  blur: 'Drag a region to blur. Press B again to cycle intensity.',
  pixelate: 'Drag a region to pixelate. Press X again to cycle size.',
  crop: 'Drag a crop region, then confirm.',
  step: 'Click to place numbered badges. Press N again to bump start number.',
  eraser: 'Drag over annotations to erase.',
};

export function ToolbarTips() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const stickyTool = useEditorStore((s) => s.stickyTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const modalOpen = useEditorStore((s) =>
    s.showHelpDialog || s.showExportDialog || s.showCommandPalette,
  );

  const tip = React.useMemo(() => {
    if (!hasImage) return 'Open, paste, or drop an image to start annotating';
    if (stickyTool) return 'Sticky mode: keep drawing. Esc returns to Selection.';
    return TOOL_TIPS[activeTool] || `Press ? for shortcuts. ${modKey}+K commands`;
  }, [activeTool, stickyTool, hasImage]);

  if (modalOpen) return null;

  return (
    <div className="absolute top-[3.85rem] left-1/2 -translate-x-1/2 z-[40] pointer-events-none max-w-[min(36rem,calc(100vw-2rem))] px-2">
      <motion.p
        key={tip}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="text-center text-[10px] sm:text-[11px] text-muted-foreground/90 py-0.5 leading-snug"
      >
        {tip}
      </motion.p>
    </div>
  );
}
