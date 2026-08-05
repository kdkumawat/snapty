'use client';

import React from 'react';
import { useEditorStore, generateId } from '@/store/editor-store';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { DEFAULT_COLORS } from '@/types/editor';
import type { ToolType } from '@/types/editor';
import { cn } from '@/lib/utils';
import {
  ChevronDown, ChevronRight, Palette, Layers, Frame, Sparkles,
  Trash2, Copy, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown,
  RotateCcw, ImagePlus, PanelRightClose, PanelRightOpen, ImageOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { useResponsivePanel } from '@/hooks/use-responsive-panel';
import { toastSuccess } from '@/lib/app-toast';

function loadPanelSections(): Record<string, boolean> {
  try {
    return JSON.parse(
      localStorage.getItem('snapty-panel-sections')
        ?? localStorage.getItem('snapkit-panel-sections')
        ?? '{}'
    );
  } catch { return {}; }
}
function savePanelSections(sections: Record<string, boolean>) {
  try { localStorage.setItem('snapty-panel-sections', JSON.stringify(sections)); } catch {}
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(() => {
    const saved = loadPanelSections();
    return title in saved ? saved[title] : defaultOpen;
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    const saved = loadPanelSections();
    saved[title] = next;
    savePanelSections(saved);
  };
  return (
    <div className="px-3 py-1">
      <button className="w-full flex items-center gap-2 text-xs font-semibold text-foreground/60 uppercase tracking-wider py-2 hover:text-foreground transition-colors cursor-pointer" onClick={toggle}>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="pb-2 space-y-3">{children}</div>}
    </div>
  );
}

/** Which size controls to show for a given tool (or selected element type). */
function sizeModeFor(tool: ToolType, selectedTypes: string[]): 'stroke' | 'font' | 'step' | 'blur' | 'pixel' | 'highlighter' | 'none' {
  // Prefer selected element type when something is selected
  if (selectedTypes.length === 1) {
    const t = selectedTypes[0];
    if (t === 'text') return 'font';
    if (t === 'step') return 'step';
    if (t === 'blur') return 'blur';
    if (t === 'pixelate') return 'pixel';
    if (t === 'highlighter') return 'highlighter';
    if (['blur', 'pixelate', 'spotlight', 'select', 'hand', 'eraser', 'crop'].includes(t)) return 'none';
    if (['arrow', 'rectangle', 'rounded-rect', 'circle', 'line', 'pencil'].includes(t)) return 'stroke';
  }
  switch (tool) {
    case 'text': return 'font';
    case 'step': return 'step';
    case 'blur': return 'blur';
    case 'pixelate': return 'pixel';
    case 'highlighter': return 'highlighter';
    case 'select':
    case 'hand':
    case 'eraser':
    case 'crop':
    case 'spotlight':
      return selectedTypes.some((t) => ['arrow', 'rectangle', 'rounded-rect', 'circle', 'line', 'pencil'].includes(t))
        ? 'stroke'
        : selectedTypes.includes('text')
          ? 'font'
          : selectedTypes.includes('step')
            ? 'step'
            : 'none';
    default:
      return 'stroke';
  }
}

function showsStrokeColor(tool: ToolType, selectedTypes: string[]): boolean {
  if (selectedTypes.length) {
    return selectedTypes.some((t) => !['blur', 'pixelate', 'spotlight'].includes(t));
  }
  return !['blur', 'pixelate', 'spotlight', 'hand', 'eraser', 'select', 'crop'].includes(tool);
}

function showsFill(tool: ToolType, selectedTypes: string[]): boolean {
  if (selectedTypes.length) {
    return selectedTypes.some((t) => ['rectangle', 'rounded-rect', 'circle'].includes(t));
  }
  return ['rectangle', 'rounded-rect', 'circle'].includes(tool);
}

const PropertiesPanel: React.FC = () => {
  const { panelCollapsed, expandPanel, collapsePanel } = useResponsivePanel();

  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const opacity = useEditorStore((s) => s.opacity);
  const cornerRadius = useEditorStore((s) => s.cornerRadius);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const pixelSize = useEditorStore((s) => s.pixelSize);
  const highlighterWidth = useEditorStore((s) => s.highlighterWidth);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const stepRadius = useEditorStore((s) => s.stepRadius);
  const stepCounter = useEditorStore((s) => s.stepCounter);
  const setStrokeColor = useEditorStore((s) => s.setStrokeColor);
  const setFillColor = useEditorStore((s) => s.setFillColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const setOpacity = useEditorStore((s) => s.setOpacity);
  const setCornerRadius = useEditorStore((s) => s.setCornerRadius);
  const setBlurRadius = useEditorStore((s) => s.setBlurRadius);
  const setPixelSize = useEditorStore((s) => s.setPixelSize);
  const setHighlighterWidth = useEditorStore((s) => s.setHighlighterWidth);
  const removeElements = useEditorStore((s) => s.removeElements);
  const clearElements = useEditorStore((s) => s.clearElements);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const setStepRadius = useEditorStore((s) => s.setStepRadius);
  const setStepStartNumber = useEditorStore((s) => s.setStepStartNumber);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);

  const handleClearAll = () => {
    const n = useEditorStore.getState().elements.length;
    if (!n) return;
    clearElements();
    toastSuccess('Annotations cleared', n === 1 ? '1 annotation removed.' : `${n} annotations removed.`);
  };
  const resetAll = useEditorStore((s) => s.resetAll);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const hasSelection = selectedElementIds.length > 0;

  const selectedTypes = React.useMemo(
    () => elements.filter((el) => selectedElementIds.includes(el.id)).map((el) => el.type),
    [elements, selectedElementIds]
  );

  const sizeMode = sizeModeFor(activeTool, selectedTypes);
  const showStroke = showsStrokeColor(activeTool, selectedTypes);
  const showFill = showsFill(activeTool, selectedTypes);
  const showCorner =
    activeTool === 'rounded-rect'
    || selectedTypes.includes('rounded-rect')
    || selectedTypes.includes('rectangle');

  const selectionActions = [
    { icon: <Trash2 className="w-3.5 h-3.5" />, label: 'Delete', fn: () => removeElements(selectedElementIds) },
    { icon: <Copy className="w-3.5 h-3.5" />, label: 'Duplicate', fn: () => {
      const dup = elements.filter((el) => selectedElementIds.includes(el.id)).map((el) => ({
        ...JSON.parse(JSON.stringify(el)), id: generateId(), x: el.x + 20, y: el.y + 20
      }));
      useEditorStore.getState().addElements(dup);
    }},
    { icon: <ArrowUpToLine className="w-3.5 h-3.5" />, label: 'Front', fn: () => selectedElementIds.forEach(bringToFront) },
    { icon: <ArrowDownToLine className="w-3.5 h-3.5" />, label: 'Back', fn: () => selectedElementIds.forEach(sendToBack) },
    { icon: <ArrowUp className="w-3.5 h-3.5" />, label: 'Forward', fn: () => selectedElementIds.forEach(bringForward) },
    { icon: <ArrowDown className="w-3.5 h-3.5" />, label: 'Backward', fn: () => selectedElementIds.forEach(sendBackward) },
  ];

  // Collapsed: thin strip with expand + reset tools + reset image
  if (panelCollapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <div data-snapty-panel className="w-9 bg-background border-l border-border flex flex-col items-center py-2 gap-1 shrink-0 h-full min-h-0 z-20 relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                onClick={expandPanel}
                aria-label="Show panel"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="z-[200]">Show settings</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                onClick={resetToolSettings}
                aria-label="Reset tool defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="z-[200]">Reset tools</TooltipContent>
          </Tooltip>
          {hasImage && elements.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  onClick={handleClearAll}
                  aria-label="Clear all annotations"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="z-[200]">
                Clear all ({modKey}+Shift+⌫)
              </TooltipContent>
            </Tooltip>
          )}
          {hasImage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  onClick={resetAll}
                  aria-label="Reset image"
                >
                  <ImageOff className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="z-[200]">Reset image</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div data-snapty-panel className="w-[min(14rem,42vw)] sm:w-52 lg:w-56 bg-background border-l border-border flex flex-col shrink-0 h-full min-h-0 max-h-full z-20 relative overflow-hidden">
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between shrink-0 gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 truncate">Settings</span>
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                  onClick={handleClearAll}
                  disabled={!elements.length}
                  aria-label="Clear all annotations"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="z-[200]">
                Clear all annotations
                <kbd className="ml-2 text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {modKey}+Shift+⌫
                </kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                  onClick={resetToolSettings}
                  aria-label="Reset tool defaults"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="z-[200]">Reset tools</TooltipContent>
            </Tooltip>
            {hasImage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    onClick={resetAll}
                    aria-label="Reset image"
                  >
                    <ImageOff className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[200]">Reset image</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            onClick={collapsePanel}
            title="Collapse settings"
            aria-label="Collapse settings"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hasSelection && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <p className="text-xs text-foreground/60">{selectedElementIds.length} selected</p>
          <div className="flex gap-1 mt-2 flex-wrap">
            {selectionActions.map(({ icon, label, fn }, i) => (
              <button key={i} className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all cursor-pointer" title={label} onClick={fn}>{icon}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showStroke && (
          <Section title="Stroke" icon={<Palette className="w-3 h-3" />}>
            <div className="grid grid-cols-5 gap-1.5">
              {DEFAULT_COLORS.map((c) => (
                <button key={c} className={cn('w-7 h-7 rounded-md border-2 transition-all cursor-pointer', strokeColor === c ? 'border-accent scale-110' : 'border-border hover:border-muted-foreground')} style={{ backgroundColor: c }} onClick={() => setStrokeColor(c)} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground w-12 shrink-0">Custom</Label>
              <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0" />
              <Input value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="h-7 text-xs bg-background border-border text-foreground" />
            </div>
          </Section>
        )}

        {showFill && (
          <Section title="Fill" icon={<Palette className="w-3 h-3" />} defaultOpen={false}>
            <div className="grid grid-cols-5 gap-1.5">
              <button className={cn('w-7 h-7 rounded-md border-2 transition-all flex items-center justify-center cursor-pointer', fillColor === 'transparent' ? 'border-accent scale-110' : 'border-border')} style={{ background: 'repeating-conic-gradient(#444 0% 25%, #666 0% 50%) 50% / 8px 8px' }} onClick={() => setFillColor('transparent')}>
                <span className="text-destructive text-xs font-bold">/</span>
              </button>
              {DEFAULT_COLORS.slice(0, 9).map((c) => (
                <button key={c} className={cn('w-7 h-7 rounded-md border-2 transition-all cursor-pointer', fillColor === c ? 'border-accent scale-110' : 'border-border hover:border-muted-foreground')} style={{ backgroundColor: c }} onClick={() => setFillColor(c)} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground w-12 shrink-0">Custom</Label>
              <input type="color" value={fillColor === 'transparent' ? '#000000' : fillColor} onChange={(e) => setFillColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0" />
            </div>
          </Section>
        )}

        {sizeMode !== 'none' && (
          <Section title="Size" icon={<Layers className="w-3 h-3" />}>
            {sizeMode === 'stroke' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Width</Label>
                  <span className="text-[10px] text-muted-foreground">{strokeWidth}px</span>
                </div>
                <Slider value={[strokeWidth]} onValueChange={([v]) => setStrokeWidth(v)} min={1} max={40} step={1} />
              </div>
            )}
            {sizeMode === 'font' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Font Size</Label>
                  <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
                </div>
                <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={8} max={200} step={1} />
              </div>
            )}
            {sizeMode === 'highlighter' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Width</Label>
                  <span className="text-[10px] text-muted-foreground">{highlighterWidth}px</span>
                </div>
                <Slider value={[highlighterWidth]} onValueChange={([v]) => setHighlighterWidth(v)} min={4} max={60} step={1} />
              </div>
            )}
            {sizeMode === 'blur' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Blur Amount</Label>
                  <span className="text-[10px] text-muted-foreground">{blurRadius}px</span>
                </div>
                <Slider value={[blurRadius]} onValueChange={([v]) => setBlurRadius(v)} min={2} max={40} step={1} />
              </div>
            )}
            {sizeMode === 'pixel' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Pixel Size</Label>
                  <span className="text-[10px] text-muted-foreground">{pixelSize}px</span>
                </div>
                <Slider value={[pixelSize]} onValueChange={([v]) => setPixelSize(v)} min={2} max={40} step={1} />
              </div>
            )}
            {sizeMode === 'step' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-muted-foreground">Circle Size</Label>
                    <span className="text-[10px] text-muted-foreground">{stepRadius}px</span>
                  </div>
                  <Slider value={[stepRadius]} onValueChange={([v]) => setStepRadius(v)} min={8} max={80} step={1} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Next: #{stepCounter}</span>
                  <button
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all cursor-pointer"
                    title="Reset to #1"
                    onClick={() => setStepStartNumber(1)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </Section>
        )}

        {showStroke && (
          <Section title="Opacity" icon={<Sparkles className="w-3 h-3" />} defaultOpen={false}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Opacity</Label>
                <span className="text-[10px] text-muted-foreground">{Math.round(opacity * 100)}%</span>
              </div>
              <Slider value={[opacity * 100]} onValueChange={([v]) => setOpacity(v / 100)} min={0} max={100} step={1} />
            </div>
          </Section>
        )}

        {showCorner && (
          <Section title="Corner Radius" icon={<Frame className="w-3 h-3" />} defaultOpen={false}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Radius</Label>
                <span className="text-[10px] text-muted-foreground">{cornerRadius}px</span>
              </div>
              <Slider value={[cornerRadius]} onValueChange={([v]) => setCornerRadius(v)} min={0} max={100} step={1} />
            </div>
          </Section>
        )}

        <Separator className="bg-border" />

        <Section title="Images" icon={<ImagePlus className="w-3 h-3" />} defaultOpen={false}>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
                input.multiple = true;
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (!files) return;
                  const store = useEditorStore.getState();
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        store.addElement({
                          id: generateId(),
                          type: 'rectangle',
                          x: 20 + i * 30,
                          y: 20 + i * 30,
                          width: img.naturalWidth,
                          height: img.naturalHeight,
                          imageDataURL: reader.result as string,
                          fill: undefined,
                          stroke: undefined,
                          strokeWidth: 0,
                        } as any);
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
            >
              <ImagePlus className="w-3 h-3 mr-1" />Add Images
            </Button>
            <p className="text-[9px] text-muted-foreground/60">Paste or drop images onto the canvas. All processing stays on your device.</p>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default PropertiesPanel;
