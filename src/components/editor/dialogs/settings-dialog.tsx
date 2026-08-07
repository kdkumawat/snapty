'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '@/store/editor-store';
import type { BgStyle } from '@/types/editor';
import { SegmentedControl } from '@/components/editor/ui/segmented-control';

export default function SettingsDialog() {
  const open = useEditorStore((s) => s.showSettings);
  const setOpen = useEditorStore((s) => s.setShowSettings);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const setImageLocked = useEditorStore((s) => s.setImageLocked);
  const setAnnotationsLocked = useEditorStore((s) => s.setAnnotationsLocked);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const setHandDrawn = useEditorStore((s) => s.setHandDrawn);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-surface border-border text-foreground max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Canvas Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="panel-toggle-row">
            <div>
              <Label className="text-sm">Hand-Drawn</Label>
              <p className="text-[11px] text-muted-foreground">Sketchy Excalidraw-like strokes</p>
            </div>
            <Switch checked={handDrawn} onCheckedChange={setHandDrawn} />
          </div>

          <div className="panel-toggle-row">
            <div>
              <Label className="text-sm">Lock Image</Label>
              <p className="text-[11px] text-muted-foreground">Block replace, drop, and capture</p>
            </div>
            <Switch checked={imageLocked} onCheckedChange={setImageLocked} />
          </div>

          <div className="panel-toggle-row">
            <div>
              <Label className="text-sm">Lock Annotations</Label>
              <p className="text-[11px] text-muted-foreground">Freeze move, resize, and draw edits</p>
            </div>
            <Switch checked={annotationsLocked} onCheckedChange={setAnnotationsLocked} />
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
                <Label className="text-xs">Fill Color</Label>
                <input
                  type="color"
                  value={canvasStyle.bgColor || '#ffffff'}
                  onChange={(e) => setCanvasStyle({ bgColor: e.target.value })}
                  className="h-8 w-10 rounded border border-border cursor-pointer bg-transparent"
                />
              </div>
            )}
          </div>

          <div className="panel-slider-group">
            <div className="panel-slider-label">
              <Label className="text-xs text-muted-foreground">Corner Radius</Label>
              <span className="panel-slider-value">{canvasStyle.borderRadius}px</span>
            </div>
            <Slider
              value={[canvasStyle.borderRadius]}
              min={0}
              max={48}
              step={2}
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

          <div className="pt-2 border-t border-border space-y-1.5">
            <button
              type="button"
              className="w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
              onClick={() => resetToolSettings()}
            >
              Reset tools
            </button>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Restores stroke color, width, fill, arrowheads, font size, sloppiness, and hand-drawn mode to Snapty defaults. Your image and annotations stay.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
