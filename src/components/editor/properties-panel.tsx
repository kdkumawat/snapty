'use client';

import React from 'react';
import { useEditorStore, generateId } from '@/store/editor-store';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { DEFAULT_COLORS } from '@/types/editor';
import type { BgStyle, DeviceFrame } from '@/types/editor';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Palette, Layers, Frame, Sparkles, Trash2, Copy, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown, RotateCcw, Grid3x3, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

function loadPanelSections(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('snapkit-panel-sections') || '{}'); } catch { return {}; }
}
function savePanelSections(sections: Record<string, boolean>) {
  try { localStorage.setItem('snapkit-panel-sections', JSON.stringify(sections)); } catch {}
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

const PropertiesPanel: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const opacity = useEditorStore((s) => s.opacity);
  const cornerRadius = useEditorStore((s) => s.cornerRadius);
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
  const removeElements = useEditorStore((s) => s.removeElements);
  const clearElements = useEditorStore((s) => s.clearElements);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const setStepRadius = useEditorStore((s) => s.setStepRadius);
  const setStepStartNumber = useEditorStore((s) => s.setStepStartNumber);
  const hasSelection = selectedElementIds.length > 0;

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

  return (
    <div className="w-56 bg-background border-l border-border flex flex-col shrink-0 h-full">
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

        <Section title="Size" icon={<Layers className="w-3 h-3" />}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Width</Label>
              <span className="text-[10px] text-muted-foreground">{strokeWidth}px</span>
            </div>
            <Slider value={[strokeWidth]} onValueChange={([v]) => setStrokeWidth(v)} min={1} max={20} step={1} />
          </div>
          {(activeTool === 'text' || hasSelection) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Font Size</Label>
                <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
              </div>
              <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={8} max={96} step={1} />
            </div>
          )}
          {activeTool === 'step' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">Circle Size</Label>
                  <span className="text-[10px] text-muted-foreground">{stepRadius}px</span>
                </div>
                <Slider value={[stepRadius]} onValueChange={([v]) => setStepRadius(v)} min={8} max={40} step={1} />
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

        <Section title="Opacity" icon={<Sparkles className="w-3 h-3" />} defaultOpen={false}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Opacity</Label>
              <span className="text-[10px] text-muted-foreground">{Math.round(opacity * 100)}%</span>
            </div>
            <Slider value={[opacity * 100]} onValueChange={([v]) => setOpacity(v / 100)} min={0} max={100} step={1} />
          </div>
        </Section>

        {activeTool === 'rounded-rect' && (
          <Section title="Corner Radius" icon={<Frame className="w-3 h-3" />} defaultOpen={false}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Radius</Label>
                <span className="text-[10px] text-muted-foreground">{cornerRadius}px</span>
              </div>
              <Slider value={[cornerRadius]} onValueChange={([v]) => setCornerRadius(v)} min={0} max={50} step={1} />
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
            <p className="text-[9px] text-muted-foreground/60">Paste or drop images onto the canvas</p>
          </div>
        </Section>

        <div className="px-3 py-3 pb-6">
          <Button variant="ghost" size="sm" className="w-full text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer" onClick={clearElements}>
            <Trash2 className="w-3 h-3 mr-1" />Clear All Annotations
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
