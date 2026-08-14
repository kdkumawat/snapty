'use client';

import React from 'react';
import { Minus, RotateCcw } from 'lucide-react';
import { ColorSwatch } from '@/components/editor/ui/color-swatch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import {
  DEFAULT_COLORS, ROUGHNESS_PRESETS, HANDWRITTEN_FONT, STANDARD_FONT,
} from '@/types/editor';
import type { FillStyle, StrokeStyle, RoughnessPreset } from '@/types/editor';
import { SETTING_SPECS, type SettingKey, type SettingSpec } from '@/lib/editor/tool-settings';
import { cn } from '@/lib/utils';

/**
 * One renderer for every tool setting, shared by the desktop panel and the
 * mobile chip strip. Both read the same registry, so a setting can never appear
 * in one surface and not the other.
 */

export function IconToggle({
  active, onClick, label, children, tooltipSide = 'top',
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'w-9 h-9 rounded-lg inline-flex items-center justify-center transition-colors shrink-0',
            active
              ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Compact visual for the vertical settings rail - shows the active value at a glance. */
export function SettingRailPreview({ settingKey }: { settingKey: SettingKey }) {
  const s = useEditorStore();
  const label = settingValueLabel(settingKey, s);

  if (settingKey === 'strokeColor') {
    return (
      <span
        aria-hidden
        className="w-5 h-5 rounded-full border border-border/80 shrink-0"
        style={{
          background: s.strokeColor === 'transparent'
            ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 5px 5px'
            : s.strokeColor,
        }}
      />
    );
  }
  if (settingKey === 'fillColor') {
    return (
      <span
        aria-hidden
        className="w-5 h-5 rounded-md border border-border/80 shrink-0"
        style={{
          background: s.fillColor === 'transparent'
            ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 5px 5px'
            : s.fillColor,
        }}
      />
    );
  }
  if (settingKey === 'strokeStyle') {
    const dash = s.strokeStyle === 'dashed' ? '4 2' : s.strokeStyle === 'dotted' ? '1.5 2' : undefined;
    return (
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
        <line x1="1" y1="4" x2="19" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
      </svg>
    );
  }
  if (settingKey === 'strokeWidth') {
    const w = s.strokeWidth <= 2 ? 1.5 : s.strokeWidth <= 4 ? 2.5 : 3.5;
    return (
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
        <line x1="1" y1="4" x2="19" y2="4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
      </svg>
    );
  }
  if (settingKey === 'roughness') {
    const d = s.roughness < 0.9 ? 'M1 4 L19 4' : s.roughness < 2 ? 'M1 5 Q7 1 13 4 T19 3' : 'M1 6 Q5 1 9 5 T17 3';
    return (
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
        <path d={d} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (settingKey === 'arrowheads') {
    const sym = s.startArrowhead !== 'none' && s.endArrowhead !== 'none'
      ? '↔' : s.endArrowhead !== 'none' ? '→' : '-';
    return <span className="text-xs font-medium leading-none">{sym}</span>;
  }
  if (settingKey === 'fontFamily') {
    const family = isHandwritten(s.fontFamily) ? HANDWRITTEN_FONT : STANDARD_FONT;
    return (
      <span
        aria-hidden
        className="text-base leading-none shrink-0"
        style={{ fontFamily: family }}
      >
        Aa
      </span>
    );
  }
  if (settingKey === 'fontSize') {
    return (
      <span className="text-[11px] font-semibold tabular-nums leading-none">
        {Math.round(s.fontSize)}
      </span>
    );
  }

  return (
    <span className="text-[9px] font-medium uppercase tracking-wide leading-none text-center max-w-[2.75rem] truncate">
      {label || '···'}
    </span>
  );
}

/** Human-readable current value for a setting, shown on the mobile chips. */
export function settingValueLabel(
  key: SettingKey,
  s: ReturnType<typeof useEditorStore.getState>,
): string {
  const spec = SETTING_SPECS[key];
  switch (key) {
    case 'strokeColor':
    case 'fillColor':
      return '';
    case 'strokeWidth':
      return s.strokeWidth <= 2 ? 'Thin' : s.strokeWidth <= 4 ? 'Bold' : 'Extra';
    case 'strokeStyle':
      return s.strokeStyle;
    case 'fillStyle':
      return s.fillStyle;
    case 'roughness':
      return s.roughness < 0.9 ? 'Architect' : s.roughness < 2 ? 'Artist' : 'Cartoonist';
    case 'cornerRadius':
      return s.cornerRadius > 0 ? 'Round' : 'Sharp';
    case 'arrowheads':
      if (s.startArrowhead !== 'none' && s.endArrowhead !== 'none') return 'Both';
      if (s.endArrowhead !== 'none') return 'End';
      return 'None';
    case 'fontFamily':
      return isHandwritten(s.fontFamily) ? 'Handwritten' : 'Standard';
    case 'fontStyle':
      return s.fontStyle.includes('bold')
        ? s.fontStyle.includes('italic') ? 'Bold italic' : 'Bold'
        : s.fontStyle.includes('italic') ? 'Italic' : 'Normal';
    case 'textAlign':
      return s.textAlign[0].toUpperCase() + s.textAlign.slice(1);
    case 'textVerticalAlign':
      return s.textVerticalAlign[0].toUpperCase() + s.textVerticalAlign.slice(1);
    case 'stepNumbering':
      return String(s.stepCounter);
    default: {
      const v = (s as unknown as Record<string, number>)[key];
      if (typeof v !== 'number') return '';
      return spec.kind === 'slider' && spec.format ? spec.format(v) : String(Math.round(v));
    }
  }
}

export function isHandwritten(family?: string): boolean {
  // Compare against the constants rather than sniffing for "cursive": the old
  // substring check misreported any custom stack that happened to contain it.
  return (family ?? HANDWRITTEN_FONT) !== STANDARD_FONT;
}

const STROKE_STYLES: [StrokeStyle, string][] = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
];

const FILL_STYLES: [FillStyle, string][] = [
  ['hachure', 'Hachure'],
  ['cross-hatch', 'Cross'],
  ['solid', 'Solid'],
  ['none', 'None'],
];

const ROUGH_PRESETS: [RoughnessPreset, string][] = [
  ['architect', 'Architect'],
  ['artist', 'Artist'],
  ['cartoonist', 'Cartoonist'],
];

/**
 * The control body for one setting. Callers supply the surrounding label /
 * layout, since the panel stacks sections while the strip renders popovers.
 */
export function SettingControl({ spec }: { spec: SettingSpec }) {
  const s = useEditorStore();

  switch (spec.key) {
    case 'strokeColor':
      return (
        <div className="flex flex-wrap gap-1">
          {DEFAULT_COLORS.map((c) => (
            <ColorSwatch key={c} color={c} active={s.strokeColor === c} onClick={() => s.setStrokeColor(c)} />
          ))}
        </div>
      );

    case 'fillColor':
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            <ColorSwatch
              color="transparent"
              active={s.fillColor === 'transparent'}
              onClick={() => s.setFillColor('transparent')}
              label="Transparent"
            />
            {DEFAULT_COLORS.map((c) => (
              <ColorSwatch key={c} color={c} active={s.fillColor === c} onClick={() => s.setFillColor(c)} />
            ))}
          </div>
          <div className="flex gap-0.5 pt-1">
            {FILL_STYLES.map(([v, label]) => (
              <IconToggle key={v} active={s.fillStyle === v} label={label} onClick={() => s.setFillStyle(v)}>
                <span className="text-[10px] font-medium">{label.slice(0, 1)}</span>
              </IconToggle>
            ))}
          </div>
        </div>
      );

    case 'strokeWidth': {
      const preset = s.strokeWidth <= 2 ? 1 : s.strokeWidth <= 4 ? 2 : 3;
      const set = (p: 1 | 2 | 3) => s.setStrokeWidth(p === 1 ? 2 : p === 2 ? 3 : 6);
      return (
        <div className="flex gap-0.5">
          <IconToggle active={preset === 1} label="Thin" onClick={() => set(1)}>
            <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
          </IconToggle>
          <IconToggle active={preset === 2} label="Bold" onClick={() => set(2)}>
            <Minus className="w-4 h-4" strokeWidth={2.5} />
          </IconToggle>
          <IconToggle active={preset === 3} label="Extra bold" onClick={() => set(3)}>
            <Minus className="w-5 h-5" strokeWidth={3.5} />
          </IconToggle>
        </div>
      );
    }

    case 'strokeStyle':
      return (
        <div className="flex gap-0.5">
          {STROKE_STYLES.map(([v, label]) => (
            <IconToggle key={v} active={s.strokeStyle === v} label={label} onClick={() => s.setStrokeStyle(v)}>
              <svg width="18" height="10" viewBox="0 0 18 10" className="overflow-visible">
                <line
                  x1="1" y1="5" x2="17" y2="5"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={v === 'dashed' ? '4 3' : v === 'dotted' ? '1.5 3' : undefined}
                />
              </svg>
            </IconToggle>
          ))}
        </div>
      );

    case 'fillStyle':
      return (
        <div className="flex gap-0.5">
          {FILL_STYLES.map(([v, label]) => (
            <IconToggle key={v} active={s.fillStyle === v} label={label} onClick={() => s.setFillStyle(v)}>
              <span className="text-[10px] font-medium">{label.slice(0, 1)}</span>
            </IconToggle>
          ))}
        </div>
      );

    case 'roughness': {
      const preset: RoughnessPreset =
        s.roughness < 0.9 ? 'architect' : s.roughness < 2 ? 'artist' : 'cartoonist';
      return (
        <div className="space-y-1.5">
          <div className="flex gap-0.5">
            {ROUGH_PRESETS.map(([v, label]) => (
              <IconToggle
                key={v}
                active={s.handDrawn && preset === v}
                label={label}
                onClick={() => {
                  if (!s.handDrawn) s.setHandDrawn(true);
                  s.setRoughness(ROUGHNESS_PRESETS[v]);
                }}
              >
                <svg width="18" height="12" viewBox="0 0 18 12">
                  {v === 'architect' && <path d="M1 6 L17 6" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                  {v === 'artist' && <path d="M1 7 Q5 3 9 6 T17 5" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                  {v === 'cartoonist' && <path d="M1 8 Q4 2 7 7 T13 4 T17 8" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                </svg>
              </IconToggle>
            ))}
          </div>
          {!s.handDrawn && (
            <button type="button" className="text-[10px] text-accent hover:underline" onClick={() => s.setHandDrawn(true)}>
              Enable hand-drawn
            </button>
          )}
        </div>
      );
    }

    case 'cornerRadius':
      return (
        <div className="flex gap-0.5">
          <IconToggle active={s.cornerRadius === 0} label="Sharp" onClick={() => s.setCornerRadius(0)}>
            <span className="w-3.5 h-3.5 border-2 border-current rounded-[1px]" />
          </IconToggle>
          <IconToggle active={s.cornerRadius > 0} label="Round" onClick={() => s.setCornerRadius(16)}>
            <span className="w-3.5 h-3.5 border-2 border-current rounded-md" />
          </IconToggle>
        </div>
      );

    case 'arrowheads': {
      const both = s.startArrowhead !== 'none' && s.endArrowhead !== 'none';
      const set = (start: typeof s.startArrowhead, end: typeof s.endArrowhead) => {
        s.setStartArrowhead(start);
        s.setEndArrowhead(end);
      };
      return (
        <div className="flex gap-0.5">
          <IconToggle
            active={s.endArrowhead === 'none' && s.startArrowhead === 'none'}
            label="None"
            onClick={() => set('none', 'none')}
          >
            <span className="text-[10px] font-medium">None</span>
          </IconToggle>
          <IconToggle
            active={s.endArrowhead !== 'none' && s.startArrowhead === 'none'}
            label="End"
            onClick={() => set('none', 'arrow')}
          >
            <span className="text-[10px] font-medium">&rarr;</span>
          </IconToggle>
          <IconToggle active={both} label="Double-sided" onClick={() => set('arrow', 'arrow')}>
            <span className="text-[10px] font-medium">&harr;</span>
          </IconToggle>
          <IconToggle
            active={s.endArrowhead === 'triangle' && s.startArrowhead === 'none'}
            label="Triangle end"
            onClick={() => set('none', 'triangle')}
          >
            <span className="text-[10px] font-medium">&#9650;</span>
          </IconToggle>
        </div>
      );
    }

    case 'fontFamily':
      return (
        <div className="flex gap-0.5">
          <IconToggle
            active={isHandwritten(s.fontFamily)}
            label="Handwritten"
            onClick={() => s.setFontFamily(HANDWRITTEN_FONT)}
          >
            <span className="text-sm" style={{ fontFamily: HANDWRITTEN_FONT }}>Aa</span>
          </IconToggle>
          <IconToggle
            active={!isHandwritten(s.fontFamily)}
            label="Standard"
            onClick={() => s.setFontFamily(STANDARD_FONT)}
          >
            <span className="text-xs font-sans">Aa</span>
          </IconToggle>
        </div>
      );

    case 'fontStyle': {
      const isBold = s.fontStyle.includes('bold');
      const isItalic = s.fontStyle.includes('italic');
      const apply = (bold: boolean, italic: boolean) => {
        // Konva fontStyle is a single string: 'normal' | 'bold' | 'italic' | 'bold italic'.
        const next = bold && italic ? 'bold italic' : bold ? 'bold' : italic ? 'italic' : 'normal';
        s.setFontStyle(next);
      };
      return (
        <div className="flex gap-0.5">
          <IconToggle active={isBold} label="Bold" onClick={() => apply(!isBold, isItalic)}>
            <span className="text-xs font-bold">B</span>
          </IconToggle>
          <IconToggle active={isItalic} label="Italic" onClick={() => apply(isBold, !isItalic)}>
            <span className="text-xs italic">I</span>
          </IconToggle>
        </div>
      );
    }

    case 'textAlign':
      return (
        <div className="flex gap-0.5">
          {(['left', 'center', 'right'] as const).map((a) => (
            <IconToggle
              key={a}
              active={s.textAlign === a}
              label={a[0].toUpperCase() + a.slice(1)}
              onClick={() => s.setTextAlign(a)}
            >
              <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden>
                <line
                  x1={a === 'right' ? 4 : 1} y1="1" x2="15" y2="1"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                />
                <line
                  x1={a === 'left' ? 1 : a === 'center' ? 4.5 : 7} y1="5" x2="15" y2="5"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                />
                <line
                  x1={a === 'left' ? 1 : a === 'center' ? 3 : 10} y1="9" x2="15" y2="9"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                />
              </svg>
            </IconToggle>
          ))}
        </div>
      );

    case 'textVerticalAlign':
      return (
        <div className="flex gap-0.5">
          {(['top', 'middle', 'bottom'] as const).map((a) => (
            <IconToggle
              key={a}
              active={s.textVerticalAlign === a}
              label={a[0].toUpperCase() + a.slice(1)}
              onClick={() => s.setTextVerticalAlign(a)}
            >
              <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
                {(['top', 'middle', 'bottom'] as const).map((row, i) => {
                  const y = 2 + i * 4;
                  const active = a === row;
                  const x1 = active ? 2 : row === 'top' ? 5 : row === 'middle' ? 4 : 3;
                  return (
                    <line
                      key={row}
                      x1={x1} y1={y} x2="14" y2={y}
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                      opacity={active ? 1 : 0.4}
                    />
                  );
                })}
              </svg>
            </IconToggle>
          ))}
        </div>
      );

    case 'stepNumbering':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              value={s.stepStartNumber}
              onChange={(e) => s.setStepStartNumber(Number(e.target.value))}
              aria-label="Start numbering at"
              className="h-8 w-16 rounded-lg border border-border bg-transparent px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              className="h-8 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-[11px] hover:bg-secondary transition-colors"
              onClick={() => s.setStepStartNumber(s.stepStartNumber)}
            >
              <RotateCcw className="w-3 h-3" />
              Reset to {s.stepStartNumber}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">Next badge: {s.stepCounter}</p>
        </div>
      );

    default: {
      // Every remaining setting is a plain numeric slider. A drag is one undo
      // gesture: changes apply live, history is committed once on release.
      if (spec.kind !== 'slider') return null;
      const value = (s as unknown as Record<string, number>)[spec.key] ?? spec.min;
      const onChange = sliderSetterFor(s, spec.key);
      if (!onChange) return null;
      return (
        <Slider
          value={[value]}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onPointerDown={() => s.beginSettingGesture()}
          onValueCommit={() => s.endSettingGesture()}
          onValueChange={([v]) => onChange(v)}
        />
      );
    }
  }
}

/** Right-aligned current value shown next to a slider's label. */
export function SettingValueBadge({ spec }: { spec: SettingSpec }) {
  const s = useEditorStore();
  if (spec.kind !== 'slider') return null;
  const value = (s as unknown as Record<string, number>)[spec.key] ?? spec.min;
  return (
    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
      {spec.format ? spec.format(value) : Math.round(value)}
    </span>
  );
}

/**
 * Subscribed value label for the compact rail. A component rather than a bare
 * call so the row re-renders when the setting changes; reading `getState()`
 * during render would show a stale value until something else re-rendered.
 */
export function SettingChipValue({ settingKey }: { settingKey: SettingKey }) {
  const s = useEditorStore();
  const label = settingValueLabel(settingKey, s);
  if (!label) return null;
  return <span className="text-[10px] font-mono tabular-nums opacity-80">{label}</span>;
}

/** Setters for the numeric settings, shared by the slider and the meter. */
function sliderSetterFor(
  s: ReturnType<typeof useEditorStore.getState>,
  key: SettingKey,
): ((v: number) => void) | undefined {
  const setters: Partial<Record<SettingKey, (v: number) => void>> = {
    fontSize: s.setFontSize,
    opacity: s.setOpacity,
    blurRadius: s.setBlurRadius,
    pixelSize: s.setPixelSize,
    highlighterWidth: s.setHighlighterWidth,
    stepRadius: s.setStepRadius,
    magnification: s.setMagnification,
  };
  return setters[key];
}

/**
 * Upright volume-style meter for numeric settings on the compact rail.
 * A vertical track reads faster than a horizontal one in a narrow popover and
 * gives a full-height drag target on touch.
 */
export function SettingMeter({ spec }: { spec: SettingSpec }) {
  const s = useEditorStore();
  if (spec.kind !== 'slider') return null;
  const onChange = sliderSetterFor(s, spec.key);
  if (!onChange) return null;
  const value = (s as unknown as Record<string, number>)[spec.key] ?? spec.min;
  return (
    <Slider
      orientation="vertical"
      className="h-32"
      value={[value]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      onPointerDown={() => s.beginSettingGesture()}
      onValueCommit={() => s.endSettingGesture()}
      onValueChange={([v]) => onChange(v)}
      aria-label={spec.label}
    />
  );
}
