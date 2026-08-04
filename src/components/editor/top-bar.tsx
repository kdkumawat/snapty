'use client';

import React, { useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Download, Copy, Check, HelpCircle, Monitor, Sun, Moon, Trash2, Clipboard, RotateCcw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { copyToClipboard } from './export-dialog';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import ScissorLogo from '@/components/scissor-logo';

const TopBar: React.FC = () => {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const zoom = useEditorStore((s) => s.zoom);
  const _hi = useEditorStore((s) => s._historyIndex);
  const _hl = useEditorStore((s) => s._history.length);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const setZoom = useEditorStore((s) => s.setZoom);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const resetView = useEditorStore((s) => s.resetView);
  const clearElements = useEditorStore((s) => s.clearElements);
  const resetAll = useEditorStore((s) => s.resetAll);
  const goToLanding = useEditorStore((s) => s.goToLanding);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const { theme, setTheme } = useTheme();

  const [copied, setCopied] = useState(false);

  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light';

  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'paste.png', { type });
            const reader = new FileReader();
            reader.onload = () => {
              const img = new Image();
              img.onload = () => useEditorStore.getState().setBackgroundImage(img);
              img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    } catch { /* no image in clipboard */ }
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-12 h-auto sm:h-12 bg-background border-b border-border flex flex-wrap sm:flex-nowrap items-center px-2 sm:px-3 gap-0.5 sm:gap-1 shrink-0 z-40 relative">
        {/* Logo */}
        <button
          className="flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-3 cursor-pointer group shrink-0"
          onClick={() => { if (!isStandalone) goToLanding(); }}
          title={isStandalone ? 'SnapKit' : 'Back to home'}
        >
          <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
            <ScissorLogo size={14} />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">SnapKit</span>
        </button>

        {/* Undo/Redo */}
        <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!_hi} onClick={undo}>
              <Undo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[200]">Undo ({modKey}+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={_hi >= _hl - 1} onClick={redo}>
              <Redo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[200]">Redo ({modKey}+Shift+Z)</TooltipContent>
        </Tooltip>

        {/* Zoom */}
        <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={() => setZoom(zoom / 1.2)}>
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[200]">Zoom Out</TooltipContent>
          </Tooltip>
          <button
            className="h-8 px-1.5 sm:px-2 text-[11px] text-muted-foreground bg-secondary rounded-md border border-border min-w-[44px] sm:min-w-[48px] hover:border-muted-foreground transition-colors font-mono cursor-pointer"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={() => setZoom(zoom * 1.2)}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[200]">Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={resetView}>
                <Maximize className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[200]">Fit to Screen</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1 min-w-2" />

        {backgroundImage && (
          <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap sm:flex-nowrap justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={clearElements}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Clear Annotations</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={handlePasteImage}>
                  <Clipboard className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Paste New Image</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={resetAll}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Reset image</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0 hidden xs:block" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent sm:hidden" onClick={() => setShowHelpDialog(true)}>
                  <HelpCircle className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Shortcuts</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-accent gap-1.5 hidden sm:inline-flex" onClick={() => setShowHelpDialog(true)}>
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Shortcuts</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Keyboard Shortcuts</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" onClick={cycleTheme}>
                  <ThemeIcon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Theme: {themeLabel}</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button id="copy-image-button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 px-2 sm:px-3 min-w-0 sm:min-w-[108px] justify-center shrink-0" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Image'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Copy Image to Clipboard</TooltipContent>
            </Tooltip>

            <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 text-xs gap-1.5 px-2 sm:px-3 font-medium shrink-0" onClick={() => setShowExportDialog(true)}>
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        )}

        {!backgroundImage && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" onClick={cycleTheme}>
                  <ThemeIcon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="z-[200]">Theme: {themeLabel}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default TopBar;
