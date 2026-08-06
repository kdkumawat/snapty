'use client';

import React, { useEffect, useRef, useState } from 'react';
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

function loadToolbarSettings(): { orientation: 'horizontal' | 'vertical'; position: { x: number; y: number } | null } {
  if (typeof window === 'undefined') return { orientation: 'horizontal', position: null };
  try {
    const saved = JSON.parse(localStorage.getItem('snapty-toolbar') || '{}');
    return {
      orientation: saved.orientation === 'vertical' ? 'vertical' : 'horizontal',
      position: Number.isFinite(saved.rx) && Number.isFinite(saved.ry) ? { x: saved.rx, y: saved.ry } : null,
    };
  } catch { return { orientation: 'horizontal', position: null }; }
}

const Toolbar: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() => loadToolbarSettings().orientation);
  // Don't apply a restored position until we've measured bounds — applying
  // too-early can place the toolbar relative to the wrong container.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const positionRef = useRef(position);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0, toolbarWidth: 0, toolbarHeight: 0 });

  useEffect(() => {
    const getRoot = () => (toolbarRef.current?.closest('[data-snapty-root]') as HTMLElement | null)
      ?? (document.querySelector('[data-snapty-root]') as HTMLElement | null);
    const sync = () => {
      const root = getRoot();
      const toolbar = toolbarRef.current;
      if (root && toolbar) {
        setBounds({ width: root.clientWidth, height: root.clientHeight, toolbarWidth: toolbar.offsetWidth, toolbarHeight: toolbar.offsetHeight });
        // Apply saved position once after we have a valid measurement.
        if (positionRef.current == null) {
          try {
            const saved = loadToolbarSettings();
            if (saved.position) {
              positionRef.current = saved.position;
              setPosition(saved.position);
            }
            if (saved.orientation) setOrientation(saved.orientation);
          } catch {}
        }
      }
    };
    sync();
    const observer = new ResizeObserver(sync);
    const root = getRoot();
    if (root) observer.observe(root);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    window.addEventListener('snapty-toolbar-settings', sync as EventListener);
    return () => { observer.disconnect(); window.removeEventListener('snapty-toolbar-settings', sync as EventListener); };
  }, []);

  // Clamp a restored position so the toolbar can never land off-screen
  // (e.g. after a reload with a different window size).
  useEffect(() => {
    if (!position || bounds.width === 0 || bounds.height === 0) return;
    const maxX = Math.max(0, bounds.width - bounds.toolbarWidth - 16);
    const maxY = Math.max(0, bounds.height - bounds.toolbarHeight - 16);
    const px = 8 + position.x * maxX;
    const py = 8 + position.y * maxY;
    const clampedX = Math.max(8, Math.min(px, 8 + maxX));
    const clampedY = Math.max(8, Math.min(py, 8 + maxY));
    if (clampedX !== px || clampedY !== py) {
      const nx = maxX > 0 ? (clampedX - 8) / maxX : 0;
      const ny = maxY > 0 ? (clampedY - 8) / maxY : 0;
      positionRef.current = { x: nx, y: ny };
      setPosition({ x: nx, y: ny });
      persist({ rx: nx, ry: ny });
    }
  }, [bounds, position]);

  useEffect(() => {
    const apply = () => {
      const next = loadToolbarSettings();
      setOrientation(next.orientation);
      setPosition(next.position);
      positionRef.current = next.position;
    };
    window.addEventListener('snapty-toolbar-settings', apply);
    return () => window.removeEventListener('snapty-toolbar-settings', apply);
  }, []);

  const persist = (next: { orientation?: 'horizontal' | 'vertical'; rx?: number; ry?: number }) => {
    try {
      const current = JSON.parse(localStorage.getItem('snapty-toolbar') || '{}');
      localStorage.setItem('snapty-toolbar', JSON.stringify({ ...current, ...next }));
    } catch { /* storage is optional */ }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const root = (toolbarRef.current?.closest('[data-snapty-root]') as HTMLElement | null)
      ?? (document.querySelector('[data-snapty-root]') as HTMLElement | null);
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const toolbar = toolbarRef.current;
    const maxX = Math.max(1, rect.width - (toolbar?.offsetWidth || 0) - 8);
    const maxY = Math.max(1, rect.height - (toolbar?.offsetHeight || 0) - 8);
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - dragRef.current.offsetX - 8) / maxX));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - dragRef.current.offsetY - 8) / maxY));
    positionRef.current = { x, y };
    setPosition({ x, y });
  };
  const stopDragging = () => {
    if (dragRef.current && positionRef.current) persist({ rx: positionRef.current.x, ry: positionRef.current.y });
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
  };
  const startDragging = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
    const root = e.currentTarget.closest('[data-snapty-root]') as HTMLElement | null;
    if (!root) return;
    const toolbarRect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { offsetX: e.clientX - toolbarRect.left, offsetY: e.clientY - toolbarRect.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
  };

  const left = position ? 8 + position.x * Math.max(0, bounds.width - bounds.toolbarWidth - 16) : undefined;
  const top = position ? 8 + position.y * Math.max(0, bounds.height - bounds.toolbarHeight - 16) : undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        className={cn(
          'toolbar-bg border border-border shadow-lg rounded-2xl z-40 absolute p-1.5 flex gap-0.5',
          orientation === 'vertical' ? 'toolbar-vertical flex-col' : 'toolbar-horizontal flex-row',
          !position && (orientation === 'vertical' ? 'top-1/2 left-3 -translate-y-1/2' : 'top-3 left-1/2 -translate-x-1/2'),
        )}
        style={position ? { left, top } : undefined}
        onPointerDown={startDragging}
        data-default-position={!position ? 'true' : 'false'}
        data-orientation={orientation}
        data-snapty-toolbar
      >
        {tools.map((tool) => {
          if (String(tool.id).startsWith('sep')) {
            return (
              <div
                key={tool.id}
                className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'w-6 h-px my-1' : 'w-px h-6 mx-0.5')}
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
              <TooltipContent side={orientation === 'vertical' ? 'right' : 'top'} className="z-[200]">
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
