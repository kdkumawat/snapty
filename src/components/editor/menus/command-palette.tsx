'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useTheme } from 'next-themes';
import {
  MousePointer2, Hand, ScanSearch, Square, Diamond, Circle, MoveUpRight,
  Minus, Pencil, Type, ListOrdered, Highlighter, Droplets, Grid3x3, Crop,
  Eraser, MonitorUp, FolderOpen, Download, Settings2, ImageOff, RotateCcw,
  Keyboard, Maximize2, ZoomIn, Undo2, Redo2, Trash2, Sun, Moon, Monitor,
  Search, ImagePlus, ScanText,
} from 'lucide-react';
import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { isScreenCaptureSupported, captureScreenRegion } from '@/lib/screen-capture';
import { toastError, toastInfo, toastSuccess } from '@/lib/app-toast';
import { TOOL_SHORTCUTS, formatToolKeys } from '@/lib/tool-shortcuts';
import { openOverlayImagePicker } from '@/lib/image-load';
import { cn } from '@/lib/utils';

const TOOL_ICONS: Partial<Record<ToolType, React.ReactNode>> = {
  select: <MousePointer2 className="w-4 h-4" />,
  hand: <Hand className="w-4 h-4" />,
  magnifier: <ScanSearch className="w-4 h-4" />,
  rectangle: <Square className="w-4 h-4" />,
  diamond: <Diamond className="w-4 h-4" />,
  circle: <Circle className="w-4 h-4" />,
  arrow: <MoveUpRight className="w-4 h-4" />,
  line: <Minus className="w-4 h-4" />,
  pencil: <Pencil className="w-4 h-4" />,
  text: <Type className="w-4 h-4" />,
  step: <ListOrdered className="w-4 h-4" />,
  highlighter: <Highlighter className="w-4 h-4" />,
  blur: <Droplets className="w-4 h-4" />,
  pixelate: <Grid3x3 className="w-4 h-4" />,
  crop: <Crop className="w-4 h-4" />,
  eraser: <Eraser className="w-4 h-4" />,
  spotlight: <ScanSearch className="w-4 h-4" />,
};

const itemClass =
  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer aria-selected:bg-accent/10 aria-selected:text-foreground text-foreground';

export default function CommandPalette() {
  const open = useEditorStore((s) => s.showCommandPalette);
  const setOpen = useEditorStore((s) => s.setShowCommandPalette);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const setShowSettings = useEditorStore((s) => s.setShowSettings);
  const resetView = useEditorStore((s) => s.resetView);
  const zoomToActual = useEditorStore((s) => s.zoomToActual);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const clearElements = useEditorStore((s) => s.clearElements);
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);
  const setImageLoading = useEditorStore((s) => s.setImageLoading);
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'p-0 overflow-hidden bg-surface border-border gap-0 shadow-2xl flex flex-col',
          'max-w-lg w-[min(32rem,calc(100vw-1.5rem))]',
          'top-[max(12vh,2rem)] translate-y-0 max-h-[min(90dvh,36rem)]',
        )}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="bg-transparent flex flex-col min-h-0 flex-1" shouldFilter>
          <div className="shrink-0 flex items-center gap-2 px-4 border-b border-border bg-surface">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search tools and commands..."
              className="w-full h-12 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <kbd className="snapty-kbd shrink-0 hidden sm:inline">Esc</kbd>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
          <Command.List className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results
            </Command.Empty>

            <Command.Group heading="Tools" className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
              {TOOL_SHORTCUTS.map((t) => (
                <Command.Item
                  key={t.id}
                  value={`${t.label} ${t.hint} ${t.letter} ${t.digit ?? ''}`}
                  onSelect={() => run(() => setActiveTool(t.id))}
                  className={itemClass}
                >
                  <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                    {TOOL_ICONS[t.id]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.hint}</p>
                  </div>
                  <span className="flex gap-1 shrink-0">
                    {formatToolKeys(t).split(' / ').map((k) => (
                      <kbd key={k} className="snapty-kbd">{k}</kbd>
                    ))}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Actions" className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
              {isScreenCaptureSupported() && (
                <Command.Item
                  value="Capture screen"
                  onSelect={() => run(() => {
                    setImageLoading(true);
                    void captureScreenRegion()
                      .then((result) => {
                        if (!result.ok) {
                          if (result.reason === 'denied') toastInfo('Capture cancelled', 'No screenshot was taken');
                          else toastError('Capture failed', result.message);
                          return;
                        }
                        useEditorStore.getState().setBackgroundImage(result.image);
                        toastSuccess('Captured', 'Screenshot loaded');
                      })
                      .finally(() => useEditorStore.getState().setImageLoading(false));
                  })}
                  className={itemClass}
                >
                  <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                    <MonitorUp className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Capture screen</p>
                    <p className="text-[11px] text-muted-foreground">Grab a window or display</p>
                  </div>
                </Command.Item>
              )}
              <Command.Item value="Open file" onSelect={() => run(() => {
                window.dispatchEvent(new CustomEvent('snapty-open-file'));
              })} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Open file</p>
                  <p className="text-[11px] text-muted-foreground">Adds on canvas if an image is already open</p>
                </div>
              </Command.Item>
              <Command.Item value="Add image overlay" onSelect={() => run(() => openOverlayImagePicker())} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <ImagePlus className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Add image</p>
                  <p className="text-[11px] text-muted-foreground">Place another image on the canvas</p>
                </div>
              </Command.Item>
              <Command.Item value="Export download" onSelect={() => run(() => setShowExportDialog(true))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Export</p>
                  <p className="text-[11px] text-muted-foreground">Advanced download options</p>
                </div>
              </Command.Item>
              <Command.Item value="Extract text OCR recognize" onSelect={() => run(() => {
                window.dispatchEvent(new CustomEvent('snapty-ocr'));
              })} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <ScanText className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Extract text</p>
                  <p className="text-[11px] text-muted-foreground">Read text from the image, on your device</p>
                </div>
              </Command.Item>
              <Command.Item value="Canvas settings" onSelect={() => run(() => setShowSettings(true))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Settings2 className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Settings</p>
                  <p className="text-[11px] text-muted-foreground">Theme, padding, background, locks</p>
                </div>
              </Command.Item>
              <Command.Item value="Clean clear image" onSelect={() => run(() => replaceImage())} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <ImageOff className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Clear image</p>
                  <p className="text-[11px] text-muted-foreground">Clear image and show empty state</p>
                </div>
              </Command.Item>
              <Command.Item value="Reset tools defaults" onSelect={() => run(() => {
                resetToolSettings();
                toastSuccess('Tools reset', 'Default stroke and style prefs restored');
              })} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Reset tools</p>
                  <p className="text-[11px] text-muted-foreground">Restore Snapty defaults</p>
                </div>
              </Command.Item>
              <Command.Item value="Keyboard shortcuts" onSelect={() => run(() => setShowHelpDialog(true))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Keyboard className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Keyboard shortcuts</p>
                  <p className="text-[11px] text-muted-foreground">Letters and number keys</p>
                </div>
              </Command.Item>
              <Command.Item value="Fit to screen" onSelect={() => run(resetView)} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Maximize2 className="w-4 h-4" />
                </span>
                <p className="font-medium flex-1">Fit to screen</p>
              </Command.Item>
              <Command.Item value="Actual size" onSelect={() => run(zoomToActual)} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <ZoomIn className="w-4 h-4" />
                </span>
                <p className="font-medium flex-1">Actual size</p>
              </Command.Item>
              <Command.Item value="Undo" onSelect={() => run(undo)} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Undo2 className="w-4 h-4" />
                </span>
                <p className="font-medium flex-1">Undo</p>
              </Command.Item>
              <Command.Item value="Redo" onSelect={() => run(redo)} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Redo2 className="w-4 h-4" />
                </span>
                <p className="font-medium flex-1">Redo</p>
              </Command.Item>
              <Command.Item value="Clear annotations" onSelect={() => run(clearElements)} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </span>
                <p className="font-medium flex-1">Clear annotations</p>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Theme" className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
              <Command.Item value="Light theme" onSelect={() => run(() => setTheme('light'))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Sun className="w-4 h-4" />
                </span>
                <p className="font-medium">Light theme</p>
              </Command.Item>
              <Command.Item value="Dark theme" onSelect={() => run(() => setTheme('dark'))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4" />
                </span>
                <p className="font-medium">Dark theme</p>
              </Command.Item>
              <Command.Item value="System theme" onSelect={() => run(() => setTheme('system'))} className={itemClass}>
                <span className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </span>
                <p className="font-medium">System theme</p>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
