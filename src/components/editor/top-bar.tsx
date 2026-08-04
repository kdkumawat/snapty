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
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const clearElements = useEditorStore((s) => s.clearElements);
  const resetAll = useEditorStore((s) => s.resetAll);
  const goToLanding = useEditorStore((s) => s.goToLanding);
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
              img.onload = () => {
                replaceImage();
                useEditorStore.getState().setBackgroundImage(img);
              };
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
    console.log('handleCopy function called via button click');
    try {
      await copyToClipboard();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      // Optionally show error toast here
    }
  };

  const handleCopyDirectLink = () => {
    const url = new URL('/editor', window.location.origin).toString();
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-12 bg-background border-b border-border flex items-center px-3 gap-1 shrink-0">
        {/* Logo - click to go to landing page */}
        <button
          className="flex items-center gap-2 mr-3 cursor-pointer group"
          onClick={goToLanding}
          title="Back to home"
        >
          <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
            <ScissorLogo size={14} />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">SnapKit</span>
        </button>

        {/* Undo/Redo */}
        <div className="w-px h-6 bg-border mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!_hi} onClick={undo}>
              <Undo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo ({modKey}+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={_hi >= _hl - 1} onClick={redo}>
              <Redo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo ({modKey}+Shift+Z)</TooltipContent>
        </Tooltip>

        {/* Zoom controls */}
        <div className="w-px h-6 bg-border mx-1" />
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={() => setZoom(zoom / 1.2)}>
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <button className="h-8 px-2 text-[11px] text-muted-foreground bg-secondary rounded-md border border-border min-w-[48px] hover:border-muted-foreground transition-colors font-mono cursor-pointer" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={() => setZoom(zoom * 1.2)}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" disabled={!backgroundImage} onClick={resetView}>
                <Maximize className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit to Screen</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        {backgroundImage && (
          <div className="flex items-center gap-1">
            {/* Clear Annotations */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={clearElements}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear Annotations</TooltipContent>
            </Tooltip>

            {/* Paste New Image from clipboard */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={handlePasteImage}>
                  <Clipboard className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste New Image</TooltipContent>
            </Tooltip>

            {/* Reset */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={resetAll}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Shortcuts */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-accent gap-1.5" onClick={() => setShowHelpDialog(true)}>
                  <HelpCircle className="w-3.5 h-3.5" />Shortcuts
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard Shortcuts</TooltipContent>
            </Tooltip>

            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer" onClick={cycleTheme}>
                  <ThemeIcon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Theme: {themeLabel}</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 bg-border mx-1" />

            {/* Copy Image */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button id="copy-image-button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 px-3 min-w-[108px] justify-center" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy Image'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy Image to Clipboard</TooltipContent>
            </Tooltip>

            {/* Export */}
            <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 text-xs gap-1.5 px-3 font-medium" onClick={() => setShowExportDialog(true)}>
              <Download className="w-3.5 h-3.5" />Export
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default TopBar;
