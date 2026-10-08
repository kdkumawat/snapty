'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import {
  MousePointer2, Hand, ScanSearch, Square, Circle, MoveUpRight, Minus, Pencil,
  Type, ListOrdered, Highlighter, Droplets, Crop, Eraser, MessageCircle,
  MonitorUp, FolderOpen, Download, Copy, Share2, ImageOff, RotateCcw, Keyboard,
  Maximize2, ZoomIn, Undo2, Redo2, Trash2, Sun, Search, ImagePlus, ScanText,
  Save, FileJson,
} from '@/components/editor/ui/icons';
import { Kbd } from '@/components/editor/ui/kbd';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { isScreenCaptureSupported } from '@/lib/screen-capture';
import { toastSuccess } from '@/lib/app-toast';
import { TOOL_SHORTCUTS, formatToolKeys } from '@/lib/tool-shortcuts';
import { openOverlayImagePicker } from '@/lib/image-load';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';

const I = 'w-4 h-4';
// Tool icons by id; the tool list itself comes from TOOL_SHORTCUTS, so a tool
// without an entry here still appears (with a generic icon).
const TOOL_ICONS: Partial<Record<ToolType, React.ReactNode>> = {
  select: <MousePointer2 className={I} />,
  hand: <Hand className={I} />,
  magnifier: <ScanSearch className={I} />,
  rectangle: <Square className={I} />,
  circle: <Circle className={I} />,
  arrow: <MoveUpRight className={I} />,
  line: <Minus className={I} />,
  pencil: <Pencil className={I} />,
  text: <Type className={I} />,
  step: <ListOrdered className={I} />,
  highlighter: <Highlighter className={I} />,
  blur: <Droplets className={I} />,
  crop: <Crop className={I} />,
  eraser: <Eraser className={I} />,
  callout: <MessageCircle className={I} />,
};

type Cmd = {
  label: string;
  icon: React.ReactNode;
  keys?: string[];
  keywords?: string[];
  needsImage?: boolean;
  hidden?: boolean;
  run: () => void;
};

const emit = (name: string) => () => window.dispatchEvent(new CustomEvent(name));

export default function CommandPalette() {
  const open = useEditorStore((s) => s.showCommandPalette);
  const setOpen = useEditorStore((s) => s.setShowCommandPalette);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const st = () => useEditorStore.getState();
  const groups: { heading: string; items: Cmd[] }[] = [
    {
      heading: 'Tools',
      items: TOOL_SHORTCUTS.map((t) => ({
        label: t.label,
        icon: TOOL_ICONS[t.id] ?? <MousePointer2 className={I} />,
        keys: formatToolKeys(t).split(' / '),
        keywords: [t.hint, 'tool'],
        run: () => st().setActiveTool(t.id),
      })),
    },
    {
      heading: 'Edit',
      items: [
        { label: 'Undo', icon: <Undo2 className={I} />, keys: [modKey, 'Z'], run: () => st().undo() },
        { label: 'Redo', icon: <Redo2 className={I} />, keys: [modKey, 'Shift', 'Z'], run: () => st().redo() },
        { label: 'Add image to canvas', icon: <ImagePlus className={I} />, keywords: ['overlay', 'logo'], needsImage: true, run: openOverlayImagePicker },
        { label: 'Extract text', icon: <ScanText className={I} />, keywords: ['ocr', 'recognize', 'copy text'], needsImage: true, run: emit('snapty-ocr') },
        { label: 'Clear annotations', icon: <Trash2 className={I} />, keys: [modKey, 'Shift', 'Backspace'], keywords: ['remove', 'delete', 'all'], needsImage: true, run: () => st().clearElements() },
        {
          label: 'Reset tool defaults', icon: <RotateCcw className={I} />, keywords: ['stroke', 'style', 'restore'],
          run: () => { st().resetToolSettings(); toastSuccess('Tools reset', 'Snapty defaults restored'); },
        },
      ],
    },
    {
      heading: 'File',
      items: [
        { label: 'Open image', icon: <FolderOpen className={I} />, keys: [modKey, 'O'], keywords: ['upload', 'choose file'], run: emit('snapty-open-file') },
        { label: 'Capture screen', icon: <MonitorUp className={I} />, keys: [modKey, 'Shift', 'S'], keywords: ['screenshot', 'grab'], hidden: !isScreenCaptureSupported(), run: emit('snapty-capture') },
        { label: 'Close image', icon: <ImageOff className={I} />, keys: [modKey, 'Shift', 'X'], keywords: ['clear', 'new', 'start over'], needsImage: true, run: emit('snapty-clear') },
        {
          label: 'Save project', icon: <Save className={I} />, keys: [modKey, 'S'], keywords: ['snapty file'], needsImage: true,
          run: () => {
            void import('@/lib/editor/project-file').then((m) => m.downloadProject());
            toastSuccess('Project saved', 'Downloaded .snapty file. Reopen it to continue editing');
          },
        },
        { label: 'Open project', icon: <FileJson className={I} />, keywords: ['snapty file', 'load'], run: () => void import('@/lib/editor/project-file').then((m) => m.openProjectPicker()) },
      ],
    },
    {
      heading: 'View',
      items: [
        { label: 'Fit to screen', icon: <Maximize2 className={I} />, keys: [modKey, '0'], keywords: ['zoom', 'reset view'], needsImage: true, run: () => st().resetView() },
        { label: 'Actual size', icon: <ZoomIn className={I} />, keys: [modKey, '1'], keywords: ['zoom', '100%'], needsImage: true, run: () => st().zoomToActual() },
        { label: 'Toggle dark mode', icon: <Sun className={I} />, keys: ['Alt', 'Shift', 'D'], keywords: ['theme', 'light', 'dark'], run: emit('snapty-toggle-theme') },
      ],
    },
    {
      heading: 'Export',
      items: [
        { label: 'Download', icon: <Download className={I} />, keys: [modKey, 'E'], keywords: ['export', 'png', 'jpg', 'webp', 'svg', 'save image'], needsImage: true, run: () => st().setShowExportDialog(true) },
        { label: 'Copy image', icon: <Copy className={I} />, keywords: ['clipboard'], needsImage: true, run: emit('snapty-copy') },
        { label: 'Share', icon: <Share2 className={I} />, needsImage: true, run: emit('snapty-share') },
      ],
    },
    {
      heading: 'Help',
      items: [
        { label: 'Keyboard shortcuts', icon: <Keyboard className={I} />, keys: ['?'], keywords: ['help', 'keys', 'guide'], run: () => st().setShowHelpDialog(true) },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'p-0 overflow-hidden bg-surface border-border gap-0 flex flex-col rounded-[8px] shadow-[var(--floating-shadow)]',
          'w-[min(32rem,calc(100vw-1.5rem))] max-w-lg',
          'top-[max(12vh,2rem)] translate-y-0 max-h-[min(90dvh,34rem)]',
        )}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="bg-transparent flex flex-col min-h-0 flex-1" loop>
          <div className="shrink-0 flex items-center gap-2 px-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search tools and commands"
              className="w-full h-11 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="shrink-0 hidden sm:inline-flex">Esc</Kbd>
          </div>
          <Command.List className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No matching commands
            </Command.Empty>
            {groups.map((g) => (
              <Command.Group
                key={g.heading}
                heading={g.heading}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {g.items.filter((c) => !c.hidden).map((c) => (
                  <Command.Item
                    key={c.label}
                    value={`${g.heading} ${c.label}`}
                    keywords={c.keywords}
                    disabled={c.needsImage && !hasImage}
                    onSelect={() => { setOpen(false); c.run(); }}
                    className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-sm cursor-pointer text-foreground data-[selected=true]:bg-[var(--accent-container)] data-[selected=true]:text-[var(--on-accent-container)] data-[disabled=true]:opacity-40 data-[disabled=true]:cursor-default"
                  >
                    <span className="shrink-0 text-muted-foreground">{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.keys && (
                      <span className="flex gap-1 shrink-0 max-sm:hidden">
                        {c.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
