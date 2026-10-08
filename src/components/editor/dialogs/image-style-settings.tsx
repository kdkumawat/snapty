'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEditorStore } from '@/store/editor-store';
import type { BgStyle, DeviceFrame } from '@/types/editor';
import { DEVICE_FRAME_LABELS, DEVICE_FRAME_OPTIONS } from '@/lib/editor/device-frames';
import { SegmentedControl } from '@/components/editor/ui/segmented-control';
import { cn } from '@/lib/utils';

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {value && <span className="text-xs text-muted-foreground font-mono tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * How the exported image is framed: padding, background, shadow, device frame
 * and corner radius. Shown in the export dialog; the canvas previews it live.
 */
export default function ImageStyleSettings() {
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const keepOriginal = useEditorStore((s) => s.keepOriginal);
  const setKeepOriginal = useEditorStore((s) => s.setKeepOriginal);
  const begin = () => useEditorStore.getState().beginSettingGesture();
  const end = () => useEditorStore.getState().endSettingGesture();

  return (
    <div className="space-y-4">
      <Row label="Padding" value={`${canvasStyle.padding}px`}>
        <Slider
          value={[canvasStyle.padding]}
          min={0}
          max={120}
          step={4}
          onPointerDown={begin}
          onValueCommit={end}
          onValueChange={([v]) => setCanvasStyle({ padding: v })}
        />
      </Row>

      <Row label="Background">
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
      </Row>

      <Row label="Device frame">
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
      </Row>

      <Row label="Corner radius" value={`${canvasStyle.borderRadius}px`}>
        <Slider
          value={[canvasStyle.borderRadius]}
          min={0}
          max={48}
          step={2}
          onPointerDown={begin}
          onValueCommit={end}
          onValueChange={([v]) => setCanvasStyle({ borderRadius: v })}
        />
      </Row>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-xs text-muted-foreground">Shadow</span>
        <Switch checked={canvasStyle.shadowEnabled} onCheckedChange={(v) => setCanvasStyle({ shadowEnabled: v })} />
      </label>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-xs text-muted-foreground">Keep full resolution on huge images</span>
        <Switch checked={keepOriginal} onCheckedChange={setKeepOriginal} />
      </label>
    </div>
  );
}
