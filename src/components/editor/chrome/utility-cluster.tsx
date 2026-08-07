'use client';

import { Sun, Moon, Monitor, Keyboard, ImageOff, ImagePlus, Info } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { clearAutosave } from '@/lib/editor/autosave';
import { openOverlayImagePicker } from '@/lib/image-load';

export default function UtilityCluster() {
  const { theme, setTheme } = useTheme();
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);

  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light';

  return (
    <FloatingSurface
      pill
      className="absolute z-[100] h-12 px-1.5 flex items-center gap-0.5 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton aria-label={`Theme: ${themeLabel}`} onClick={cycleTheme}>
            <ThemeIcon className="w-4 h-4" />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="top">Theme: {themeLabel}</TooltipContent>
      </Tooltip>

      {hasImage && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Add image"
                disabled={imageLocked || annotationsLocked}
                onClick={() => openOverlayImagePicker()}
              >
                <ImagePlus className="w-4 h-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Add image on canvas</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Clean"
                disabled={imageLocked}
                onClick={() => {
                  replaceImage();
                  void clearAutosave();
                }}
              >
                <ImageOff className="w-4 h-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Clean: clear image</TooltipContent>
          </Tooltip>
        </>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label="Keyboard Shortcuts"
            onClick={() => setShowHelpDialog(true)}
          >
            <Keyboard className="w-4 h-4" />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="top">Shortcuts (?)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/info"
            aria-label="About Snapty"
            className="icon-btn"
          >
            <Info className="w-4 h-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top">About / Info</TooltipContent>
      </Tooltip>
    </FloatingSurface>
  );
}
