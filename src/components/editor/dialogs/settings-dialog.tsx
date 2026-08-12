'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sun, Moon, Monitor, Keyboard, Info, MonitorUp, FolderOpen,
  Copy, Download, Share2, X,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '@/store/editor-store';
import type { BgStyle, DeviceFrame } from '@/types/editor';
import { DEVICE_FRAME_LABELS, DEVICE_FRAME_OPTIONS } from '@/lib/editor/device-frames';
import { SegmentedControl } from '@/components/editor/ui/segmented-control';
import { toastSuccess } from '@/lib/app-toast';
import { openInBrowser } from '@/lib/open-external';
import { useIsMobile } from '@/hooks/use-mobile';
import { isScreenCaptureSupported } from '@/lib/screen-capture';
import { readAnalyticsConsent, setAnalyticsConsent } from '@/components/google-analytics';
import { cn } from '@/lib/utils';

const actionBtn =
  'h-10 rounded-lg border border-border text-xs font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-1.5';

/**
 * Canvas settings slide-in sidebar. Theme, locks, padding, and export actions
 * live here; tool stroke settings stay in the left properties panel.
 */
export default function SettingsDialog() {
  const open = useEditorStore((s) => s.showSettings);
  const setOpen = useEditorStore((s) => s.setShowSettings);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const setImageLocked = useEditorStore((s) => s.setImageLocked);
  const setAnnotationsLocked = useEditorStore((s) => s.setAnnotationsLocked);
  const keepOriginal = useEditorStore((s) => s.keepOriginal);
  const setKeepOriginal = useEditorStore((s) => s.setKeepOriginal);
  const [analyticsOn, setAnalyticsOn] = React.useState(() => readAnalyticsConsent());
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const setHandDrawn = useEditorStore((s) => s.setHandDrawn);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const setShowExportDialog = useEditorStore((s) => s.setShowExportDialog);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[240] bg-black/40"
            onClick={() => setOpen(false)}
          />

          <motion.aside
            role="dialog"
            aria-label="Settings"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={cn(
              'fixed top-0 right-0 z-[250] h-full flex flex-col bg-surface border-l border-border shadow-2xl',
              'w-[min(22rem,calc(100vw-1rem))]',
              'pt-[max(0px,env(safe-area-inset-top,0px))]',
            )}
          >
            <div className="shrink-0 px-4 py-3.5 border-b border-border flex items-center justify-between gap-2 bg-surface">
              <h2 className="text-base font-semibold tracking-tight">Settings</h2>
              <button
                type="button"
                className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
              {isMobile && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Actions</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {isScreenCaptureSupported() && (
                      <button
                        type="button"
                        className={actionBtn}
                        onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('snapty-capture')); }}
                      >
                        <MonitorUp className="w-4 h-4" />
                        Capture screen
                      </button>
                    )}
                    <button
                      type="button"
                      className={actionBtn}
                      onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('snapty-open-file')); }}
                    >
                      <FolderOpen className="w-4 h-4" />
                      Open image
                    </button>
                    {hasImage && (
                      <>
                        <button
                          type="button"
                          className={actionBtn}
                          onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('snapty-copy')); }}
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                        <button
                          type="button"
                          className={actionBtn}
                          onClick={() => { setOpen(false); setShowExportDialog(true); }}
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                    <button
                      type="button"
                      className={actionBtn}
                      onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('snapty-share')); }}
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </>
                )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Theme</Label>
                <SegmentedControl<'light' | 'dark' | 'system'>
                  value={(mounted ? theme : 'system') as 'light' | 'dark' | 'system'}
                  onChange={setTheme}
                  ariaLabel="Theme"
                  options={[
                    { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
                    { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
                    { value: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5" /> },
                  ]}
                />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Hand-drawn</Label>
                  <p className="text-[11px] text-muted-foreground">Sketchy Excalidraw-like strokes</p>
                </div>
                <Switch checked={handDrawn} onCheckedChange={setHandDrawn} />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Dot grid</Label>
                  <p className="text-[11px] text-muted-foreground">Workspace and exported screenshot grid</p>
                </div>
                <Switch
                  checked={canvasStyle.gridEnabled}
                  onCheckedChange={(v) => setCanvasStyle({ gridEnabled: v })}
                />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Lock image</Label>
                  <p className="text-[11px] text-muted-foreground">Block replace, drop, and capture</p>
                </div>
                <Switch checked={imageLocked} onCheckedChange={setImageLocked} />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Lock annotations</Label>
                  <p className="text-[11px] text-muted-foreground">Freeze move, resize, and draw edits</p>
                </div>
                <Switch checked={annotationsLocked} onCheckedChange={setAnnotationsLocked} />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Keep original resolution</Label>
                  <p className="text-[11px] text-muted-foreground">Huge images (8K, 100MP) are downscaled to ~4096px for speed. Enable to keep full resolution.</p>
                </div>
                <Switch checked={keepOriginal} onCheckedChange={setKeepOriginal} />
              </div>

              <div className="panel-toggle-row">
                <div>
                  <Label className="text-sm">Usage analytics</Label>
                  <p className="text-[11px] text-muted-foreground">Anonymous page views only. Your images never leave your device.</p>
                </div>
                <Switch
                  checked={analyticsOn}
                  onCheckedChange={(v) => {
                    setAnalyticsOn(v);
                    setAnalyticsConsent(v);
                    toastSuccess(v ? 'Analytics on' : 'Analytics off', v ? 'Anonymous usage data shared' : 'No usage data is sent');
                  }}
                />
              </div>

              <div className="panel-slider-group">
                <div className="panel-slider-label">
                  <Label className="text-xs text-muted-foreground">Padding</Label>
                  <span className="panel-slider-value">{canvasStyle.padding}px</span>
                </div>
                <Slider
                  value={[canvasStyle.padding]}
                  min={0}
                  max={120}
                  step={4}
                  onPointerDown={() => useEditorStore.getState().beginSettingGesture()}
                  onValueCommit={() => useEditorStore.getState().endSettingGesture()}
                  onValueChange={([v]) => setCanvasStyle({ padding: v })}
                />
                <p className="text-[11px] text-muted-foreground">Live frame around the screenshot (also used on export)</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <SegmentedControl<BgStyle>
                  value={canvasStyle.bgStyle}
                  onChange={(v) => setCanvasStyle({ bgStyle: v })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'solid', label: 'Solid' },
                    { value: 'gradient', label: 'Gradient' },
                    { value: 'glass', label: 'Glass' },
                  ]}
                />
                {canvasStyle.bgStyle === 'solid' && (
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Fill color</Label>
                    <input
                      type="color"
                      value={canvasStyle.bgColor || '#ffffff'}
                      onChange={(e) => setCanvasStyle({ bgColor: e.target.value })}
                      className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                      aria-label="Background color"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Device frame</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DEVICE_FRAME_OPTIONS.map((f: DeviceFrame) => (
                    <button
                      key={f}
                      type="button"
                      className={cn(
                        'h-9 rounded-lg border text-xs font-medium transition-colors',
                        canvasStyle.deviceFrame === f
                          ? 'border-accent bg-accent/12 text-accent'
                          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                      onClick={() => setCanvasStyle({ deviceFrame: f })}
                    >
                      {DEVICE_FRAME_LABELS[f]}
                    </button>
                  ))}
                </div>
                {canvasStyle.deviceFrame === 'browser' && (
                  <input
                    type="text"
                    value={canvasStyle.frameUrl || ''}
                    onChange={(e) => setCanvasStyle({ frameUrl: e.target.value })}
                    placeholder="snapty.pages.dev"
                    aria-label="URL shown in browser frame"
                    className="w-full h-9 rounded-lg border border-border bg-transparent px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                )}
                <p className="text-[11px] text-muted-foreground">Wrap the screenshot in device or browser chrome (live preview and export).</p>
              </div>

              <div className="panel-slider-group">
                <div className="panel-slider-label">
                  <Label className="text-xs text-muted-foreground">Corner radius</Label>
                  <span className="panel-slider-value">{canvasStyle.borderRadius}px</span>
                </div>
                <Slider
                  value={[canvasStyle.borderRadius]}
                  min={0}
                  max={48}
                  step={2}
                  onPointerDown={() => useEditorStore.getState().beginSettingGesture()}
                  onValueCommit={() => useEditorStore.getState().endSettingGesture()}
                  onValueChange={([v]) => setCanvasStyle({ borderRadius: v })}
                />
              </div>

              <div className="panel-toggle-row">
                <Label className="text-sm">Shadow</Label>
                <Switch
                  checked={canvasStyle.shadowEnabled}
                  onCheckedChange={(v) => setCanvasStyle({ shadowEnabled: v })}
                />
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <button
                  type="button"
                  className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-2"
                  onClick={() => {
                    setOpen(false);
                    setShowHelpDialog(true);
                  }}
                >
                  <Keyboard className="w-4 h-4" />
                  Keyboard shortcuts
                </button>
                <button
                  type="button"
                  className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-2"
                  onClick={() => {
                    setOpen(false);
                    openInBrowser('/privacy');
                  }}
                >
                  <Info className="w-4 h-4" />
                  Privacy
                </button>
                <button
                  type="button"
                  className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors inline-flex items-center justify-center gap-2"
                  onClick={() => {
                    setOpen(false);
                    openInBrowser('/');
                  }}
                >
                  <Info className="w-4 h-4" />
                  About Snapty
                </button>
              </div>

              <div className="pt-2 border-t border-border space-y-1.5 pb-4">
                <button
                  type="button"
                  className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
                  onClick={() => {
                    resetToolSettings();
                    toastSuccess('Tools reset', 'Snapty defaults restored');
                  }}
                >
                  Reset tools
                </button>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Restores stroke color, width, fill, arrowheads, font size, sloppiness, and hand-drawn mode to Snapty defaults. Your image and annotations stay.
                </p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
