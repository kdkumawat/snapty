'use client';

import React, { useState } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Undo2, Redo2, Download, Copy, Check, HelpCircle, Monitor, Sun, Moon,
  Camera, Loader2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { copyToClipboard } from './export-dialog';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import ScissorLogo from '@/components/scissor-logo';
import { captureScreenRegion, isScreenCaptureSupported } from '@/lib/screen-capture';
import { toastError, toastSuccess, toastInfo } from '@/lib/app-toast';

const TopBar: React.FC = () => {
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const _hi = useEditorStore((s) => s._historyIndex);
  const _hl = useEditorStore((s) => s._history.length);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const goToLanding = useEditorStore((s) => s.goToLanding);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const { theme, setTheme } = useTheme();

  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const captureSupported = typeof window !== 'undefined' && isScreenCaptureSupported();

  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light';

  const handleCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      await copyToClipboard();
      setCopied(true);
      toastSuccess('Copied', 'Image on clipboard - ready to paste');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      toastError('Couldn’t copy', 'Allow clipboard access and try again');
    } finally {
      setCopying(false);
    }
  };

  const handleCapture = async () => {
    if (capturing) return;
    if (!captureSupported) {
      toastError('Capture unavailable', 'Not supported in this browser');
      return;
    }
    setCapturing(true);
    const store = useEditorStore.getState();
    store.setImageLoading(true);
    try {
      const result = await captureScreenRegion();
      if (!result.ok) {
        if (result.reason === 'denied') {
          toastInfo('Capture cancelled', 'No screenshot was taken');
        } else {
          toastError('Capture failed', result.message);
        }
        return;
      }
      // Keep current tool - don’t force crop
      store.setBackgroundImage(result.image);
      toastSuccess('Captured', 'Screenshot loaded in the editor');
    } catch (err) {
      console.error(err);
      toastError('Capture failed', 'Something went wrong - try again');
    } finally {
      useEditorStore.getState().setImageLoading(false);
      setCapturing(false);
    }
  };

  const captureControl = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={capturing}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
          onClick={handleCapture}
          aria-label="Capture screen"
        >
          {capturing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="z-[200]">
        <span className="font-medium">Capture screen</span>
        <kbd className="ml-2 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px] font-mono">
          {modKey}+Shift+S
        </kbd>
        <span className="block text-[10px] text-muted-foreground mt-1 max-w-[15rem] leading-snug">
          Choose a screen or window. Your current tool stays selected.
        </span>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-snapty-titlebar
        className="h-12 min-h-12 bg-background border-b border-border flex items-center px-2 sm:px-3 gap-0.5 sm:gap-1 shrink-0 z-40 relative overflow-x-auto"
      >
        <button
          type="button"
          className="flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-3 cursor-pointer group shrink-0"
          onClick={() => { if (!isStandalone) goToLanding(); }}
          title={isStandalone ? 'Snapty' : 'Back to home'}
        >
          <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
            <ScissorLogo size={14} />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline">Snapty</span>
        </button>

        <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer" disabled={!_hi} onClick={undo}>
              <Undo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[200]">Undo ({modKey}+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer" disabled={_hi >= _hl - 1} onClick={redo}>
              <Redo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[200]">Redo ({modKey}+Shift+Z)</TooltipContent>
        </Tooltip>

        <div className="flex-1 min-w-2" />

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Capture - always available (before Shortcuts) */}
          {captureControl}

          {backgroundImage ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer sm:hidden"
                    onClick={() => setShowHelpDialog(true)}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Shortcuts</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-accent gap-1.5 hidden sm:inline-flex cursor-pointer"
                    onClick={() => setShowHelpDialog(true)}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Shortcuts</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Keyboard Shortcuts</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    onClick={cycleTheme}
                  >
                    <ThemeIcon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Theme: {themeLabel}</TooltipContent>
              </Tooltip>

              <div className="w-px h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    id="copy-image-button"
                    variant="outline"
                    size="sm"
                    disabled={copying}
                    className="h-8 w-[5.75rem] text-xs gap-1.5 px-2 justify-center shrink-0 cursor-pointer tabular-nums"
                    onClick={handleCopy}
                  >
                    <span className="relative w-3.5 h-3.5 shrink-0">
                      {copied ? (
                        <Check className="w-3.5 h-3.5 absolute inset-0 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 absolute inset-0" />
                      )}
                    </span>
                    <span className="w-11 text-center">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Copy image ({modKey}+C)</TooltipContent>
              </Tooltip>

              <Button
                size="sm"
                className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 text-xs gap-1.5 px-2 sm:px-3 font-medium shrink-0 cursor-pointer"
                onClick={() => setShowExportDialog(true)}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                    onClick={() => setShowHelpDialog(true)}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Shortcuts</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    onClick={cycleTheme}
                  >
                    <ThemeIcon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="z-[200]">Theme: {themeLabel}</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default TopBar;
