'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from '@/components/editor/ui/icons';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import {
  COLOR_PALETTE, PALETTE_ORDER, STROKE_PICKS, BACKGROUND_PICKS, STROKE_SHADE, BACKGROUND_SHADE,
  ROUGHNESS_PRESETS, STROKE_WIDTHS, FONT_SIZE_PRESETS, ROUND_CORNER_RADIUS,
  FONT_HAND_DRAWN, FONT_NORMAL, FONT_CODE, STANDARD_FONT, STEP_STAMPS, STEP_FINGERS,
} from '@/types/editor';
import type { Arrowhead, FillStyle, StrokeStyle, RoughnessPreset } from '@/types/editor';
import type { SettingSpec } from '@/lib/editor/tool-settings';
import {
  StrokeWidthBaseIcon, StrokeWidthBoldIcon, StrokeWidthExtraBoldIcon,
  StrokeStyleSolidIcon, StrokeStyleDashedIcon, StrokeStyleDottedIcon,
  FillHachureIcon, FillCrossHatchIcon, FillSolidIcon,
  SloppinessArchitectIcon, SloppinessArtistIcon, SloppinessCartoonistIcon,
  EdgeSharpIcon, EdgeRoundIcon,
  ArrowheadNoneIcon, ArrowheadArrowIcon, ArrowheadTriangleIcon, ArrowheadBarIcon, ArrowheadCircleIcon,
  FontSizeSmallIcon, FontSizeMediumIcon, FontSizeLargeIcon, FontSizeExtraLargeIcon,
  FreedrawIcon, FontFamilyNormalIcon, FontFamilyCodeIcon,
  TextAlignLeftIcon, TextAlignCenterIcon, TextAlignRightIcon,
  TextAlignTopIcon, TextAlignMiddleIcon, TextAlignBottomIcon,
  sharpArrowIcon, roundArrowIcon, elbowArrowIcon,
} from '@/components/editor/ui/excalidraw-icons';
import { cn } from '@/lib/utils';

/**
 * Controls for the properties panel, laid out like Excalidraw's: a label and a
 * row of 32px icon buttons per setting, color rows with a picker popover, and
 * sliders only where a value is continuous.
 */

/** Excalidraw's panel button: 32px, 8px radius, grey chip, tinted when active. */
export function PanelButton({
  active, onClick, label, children, className, ...rest
}: {
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
} & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded' | 'aria-haspopup' | 'disabled'>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 transition-colors',
            '[&>svg]:w-4 [&>svg]:h-4 disabled:opacity-40 disabled:pointer-events-none',
            active
              ? 'bg-[var(--accent-container)] text-[var(--on-accent-container)]'
              : 'bg-[var(--button-bg)] text-foreground hover:bg-secondary',
            className,
          )}
          {...rest}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** Popover anchored beside a panel button; closes on outside press or Escape. */
function AnchoredPopover({
  anchor, onClose, label, children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  const rect = anchor.getBoundingClientRect();
  const panel = anchor.closest('[data-snapty-panel]')?.getBoundingClientRect();
  const left = (panel?.right ?? rect.right) + 8;
  const fitsRight = left + 220 < window.innerWidth;
  const style: React.CSSProperties = fitsRight
    ? { left, top: Math.max(8, Math.min(rect.top - 8, window.innerHeight - 340)) }
    // Narrow screens: sit above the bottom sheet instead of beside it.
    : { left: 8, right: 8, bottom: window.innerHeight - rect.top + 8 };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ position: 'fixed', zIndex: 300, ...style }}
      className="rounded-xl border border-border bg-surface p-3 shadow-[var(--floating-shadow)]"
    >
      {children}
    </div>,
    document.body,
  );
}

const CHECKER = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px';

function Swatch({
  color, active, onClick, size = 'sm',
}: {
  color: string;
  active?: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  const transparent = color === 'transparent';
  return (
    <button
      type="button"
      aria-label={transparent ? 'Transparent' : color}
      aria-pressed={active}
      title={transparent ? 'Transparent' : color}
      onClick={onClick}
      className={cn(
        'rounded-md border border-border/80 shrink-0 transition-shadow',
        size === 'sm' ? 'w-5 h-5' : 'w-7 h-7',
        active && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
      )}
      style={{ background: transparent ? CHECKER : color }}
    />
  );
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Which hue a color belongs to, so the Shades row can show its siblings. */
function hueOf(color: string): readonly string[] | null {
  for (const key of PALETTE_ORDER) {
    const v = COLOR_PALETTE[key];
    if (typeof v !== 'string' && (v as readonly string[]).includes(color)) return v;
  }
  return null;
}

function ColorPicker({
  value, onChange, kind,
}: {
  value: string;
  onChange: (c: string) => void;
  kind: 'stroke' | 'background';
}) {
  const shade = kind === 'stroke' ? STROKE_SHADE : BACKGROUND_SHADE;
  const shades = hueOf(value);
  const [hex, setHex] = React.useState(value === 'transparent' ? '' : value.replace('#', ''));
  React.useEffect(() => {
    setHex(value === 'transparent' ? '' : value.replace('#', ''));
  }, [value]);
  const heading = 'text-[0.75rem] text-muted-foreground mb-1.5';

  return (
    <div className="w-[11.5rem]">
      <p className={heading}>Colors</p>
      <div className="grid grid-cols-5 gap-1.5">
        {PALETTE_ORDER.map((key) => {
          const v = COLOR_PALETTE[key];
          const color = typeof v === 'string' ? v : v[shade];
          const active = typeof v === 'string' ? value === v : (v as readonly string[]).includes(value);
          return <Swatch key={key} size="md" color={color} active={active} onClick={() => onChange(color)} />;
        })}
      </div>
      <p className={cn(heading, 'mt-3')}>Shades</p>
      {shades ? (
        <div className="grid grid-cols-5 gap-1.5">
          {shades.map((c) => (
            <Swatch key={c} size="md" color={c} active={value === c} onClick={() => onChange(c)} />
          ))}
        </div>
      ) : (
        <p className="text-[0.75rem] text-muted-foreground/70 h-7 flex items-center">
          No shades available for this color
        </p>
      )}
      <p className={cn(heading, 'mt-3')}>Hex code</p>
      <div className="flex items-center h-8 rounded-lg border border-border px-2 gap-1 focus-within:ring-1 focus-within:ring-accent">
        <span className="text-xs text-muted-foreground">#</span>
        <input
          value={hex}
          spellCheck={false}
          aria-label="Hex code"
          onChange={(e) => {
            const next = e.target.value.trim();
            setHex(next);
            if (HEX_RE.test(next)) onChange(`#${next.replace('#', '').toLowerCase()}`);
          }}
          className="w-full bg-transparent text-xs outline-none"
        />
      </div>
    </div>
  );
}

/** Five quick picks, a divider, then the active color opening the full picker. */
function ColorSetting({
  value, onChange, kind, label,
}: {
  value: string;
  onChange: (c: string) => void;
  kind: 'stroke' | 'background';
  label: string;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const picks = kind === 'stroke' ? STROKE_PICKS : BACKGROUND_PICKS;
  return (
    <div className="flex items-center gap-1">
      {picks.map((c) => (
        <Swatch key={c} color={c} active={value === c} onClick={() => onChange(c)} />
      ))}
      <div className="h-5 w-px bg-border" aria-hidden />
      <button
        type="button"
        aria-label={`${label} color: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="w-[1.625rem] h-[1.625rem] rounded-md border border-border/80 shrink-0"
        style={{ background: value === 'transparent' ? CHECKER : value }}
      />
      {anchor && (
        <AnchoredPopover anchor={anchor} label={`${label} color`} onClose={() => setAnchor(null)}>
          <ColorPicker value={value} onChange={onChange} kind={kind} />
        </AnchoredPopover>
      )}
    </div>
  );
}

const ARROWHEADS: [Arrowhead, string, React.ComponentType<{ flip?: boolean }>][] = [
  ['none', 'None', ArrowheadNoneIcon],
  ['arrow', 'Arrow', ArrowheadArrowIcon],
  ['triangle', 'Triangle', ArrowheadTriangleIcon],
  ['bar', 'Bar', ArrowheadBarIcon],
  ['dot', 'Circle', ArrowheadCircleIcon],
];

/** One end of the arrow: a button showing the current head, opening the choices. */
function ArrowheadPicker({
  value, onChange, label, flip,
}: {
  value: Arrowhead;
  onChange: (v: Arrowhead) => void;
  label: string;
  flip: boolean;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const Current = (ARROWHEADS.find(([v]) => v === value) ?? ARROWHEADS[0])[2];
  return (
    <>
      <PanelButton
        label={label}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        active={!!anchor}
        className="[&>svg]:w-5 [&>svg]:h-5"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Current flip={flip} />
      </PanelButton>
      {anchor && (
        <AnchoredPopover anchor={anchor} label={label} onClose={() => setAnchor(null)}>
          <div className="flex gap-2">
            {ARROWHEADS.map(([v, name, Icon]) => (
              <PanelButton
                key={v}
                label={name}
                active={value === v}
                className="[&>svg]:w-5 [&>svg]:h-5"
                onClick={() => { onChange(v); setAnchor(null); }}
              >
                <Icon flip={flip} />
              </PanelButton>
            ))}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}

/** Snap a stored value to the nearest preset so legacy values still light one. */
function nearest<K extends string>(presets: Record<K, number>, value: number): K {
  const keys = Object.keys(presets) as K[];
  return keys.reduce((best, k) => (
    Math.abs(presets[k] - value) < Math.abs(presets[best] - value) ? k : best
  ), keys[0]);
}

function fontKind(family?: string): 'hand' | 'normal' | 'code' {
  if (family === FONT_CODE) return 'code';
  if (family === FONT_NORMAL || family === STANDARD_FONT) return 'normal';
  return 'hand';
}

/** The control body for one setting; the panel supplies the label above it. */
export function SettingControl({ spec }: { spec: SettingSpec }) {
  const s = useEditorStore();

  switch (spec.key) {
    case 'strokeColor':
      return <ColorSetting kind="stroke" label="Stroke" value={s.strokeColor} onChange={s.setStrokeColor} />;

    case 'highlighterColor':
      return <ColorSetting kind="stroke" label="Stroke" value={s.highlighterColor} onChange={s.setHighlighterColor} />;

    case 'stepStyle': {
      const options: [string, string, React.ReactNode][] = [
        ['number', 'Numbers', '1 2'],
        ['letter', 'Letters', 'A B'],
        ...STEP_FINGERS.flatMap((f): [string, string, React.ReactNode][] => [
          [`${f}number`, `Numbers with ${f}`, `1${f}`],
          [`${f}letter`, `Letters with ${f}`, `A${f}`],
        ]),
        ...STEP_STAMPS.map((e): [string, string, React.ReactNode] => [e, `Stamp ${e}`, <span key={e} className="text-base leading-none">{e}</span>]),
      ];
      return (
        <ButtonRow>
          {options.map(([v, label, content]) => (
            <PanelButton key={v} label={label} active={s.stepStyle === v} className="text-[0.7rem] font-semibold" onClick={() => s.setStepStyle(v)}>
              {content}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'fillColor':
      return <ColorSetting kind="background" label="Background" value={s.fillColor} onChange={s.setFillColor} />;

    case 'fillStyle': {
      const options: [FillStyle, string, React.ReactNode][] = [
        ['hachure', 'Hachure', FillHachureIcon],
        ['cross-hatch', 'Cross-hatch', FillCrossHatchIcon],
        ['solid', 'Solid', FillSolidIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([v, label, icon]) => (
            <PanelButton key={v} label={label} active={s.fillStyle === v} onClick={() => s.setFillStyle(v)}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'strokeWidth': {
      const current = nearest(STROKE_WIDTHS, s.strokeWidth);
      const options: [keyof typeof STROKE_WIDTHS, string, React.ReactNode][] = [
        ['thin', 'Thin', StrokeWidthBaseIcon],
        ['bold', 'Bold', StrokeWidthBoldIcon],
        ['extraBold', 'Extra bold', StrokeWidthExtraBoldIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([k, label, icon]) => (
            <PanelButton key={k} label={label} active={current === k} onClick={() => s.setStrokeWidth(STROKE_WIDTHS[k])}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'strokeStyle': {
      const options: [StrokeStyle, string, React.ReactNode][] = [
        ['solid', 'Solid', <StrokeStyleSolidIcon key="i" theme="light" />],
        ['dashed', 'Dashed', StrokeStyleDashedIcon],
        ['dotted', 'Dotted', StrokeStyleDottedIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([v, label, icon]) => (
            <PanelButton key={v} label={label} active={s.strokeStyle === v} onClick={() => s.setStrokeStyle(v)}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'roughness': {
      const current = nearest(ROUGHNESS_PRESETS, s.roughness);
      const options: [RoughnessPreset, string, React.ReactNode][] = [
        ['architect', 'Architect', SloppinessArchitectIcon],
        ['artist', 'Artist', SloppinessArtistIcon],
        ['cartoonist', 'Cartoonist', SloppinessCartoonistIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([k, label, icon]) => (
            <PanelButton key={k} label={label} active={current === k} onClick={() => s.setRoughness(ROUGHNESS_PRESETS[k])}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'cornerRadius':
      return (
        <ButtonRow>
          <PanelButton label="Sharp" active={s.cornerRadius === 0} onClick={() => s.setCornerRadius(0)}>
            {EdgeSharpIcon}
          </PanelButton>
          <PanelButton label="Round" active={s.cornerRadius > 0} onClick={() => s.setCornerRadius(ROUND_CORNER_RADIUS)}>
            {EdgeRoundIcon}
          </PanelButton>
        </ButtonRow>
      );

    case 'arrowPath':
      return (
        <ButtonRow>
          <PanelButton label="Sharp arrow" active={s.arrowPath === 'straight'} onClick={() => s.setArrowPath('straight')}>
            {sharpArrowIcon}
          </PanelButton>
          <PanelButton label="Curved arrow" active={s.arrowPath === 'curved'} onClick={() => s.setArrowPath('curved')}>
            {roundArrowIcon}
          </PanelButton>
          <PanelButton label="Elbow arrow" active={s.arrowPath === 'elbow'} onClick={() => s.setArrowPath('elbow')}>
            {elbowArrowIcon}
          </PanelButton>
        </ButtonRow>
      );

    case 'arrowheads':
      return (
        <ButtonRow>
          <ArrowheadPicker label="Start arrowhead" flip value={s.startArrowhead} onChange={s.setStartArrowhead} />
          <ArrowheadPicker label="End arrowhead" flip={false} value={s.endArrowhead} onChange={s.setEndArrowhead} />
        </ButtonRow>
      );

    case 'fontFamily': {
      const current = fontKind(s.fontFamily);
      return (
        <ButtonRow>
          <PanelButton label="Hand-drawn" active={current === 'hand'} onClick={() => s.setFontFamily(FONT_HAND_DRAWN)}>
            {FreedrawIcon}
          </PanelButton>
          <PanelButton label="Normal" active={current === 'normal'} onClick={() => s.setFontFamily(FONT_NORMAL)}>
            {FontFamilyNormalIcon}
          </PanelButton>
          <PanelButton label="Code" active={current === 'code'} onClick={() => s.setFontFamily(FONT_CODE)}>
            {FontFamilyCodeIcon}
          </PanelButton>
        </ButtonRow>
      );
    }

    case 'fontSize': {
      const current = nearest(FONT_SIZE_PRESETS, s.fontSize);
      const options: [keyof typeof FONT_SIZE_PRESETS, string, React.ReactNode][] = [
        ['S', 'Small', FontSizeSmallIcon],
        ['M', 'Medium', FontSizeMediumIcon],
        ['L', 'Large', FontSizeLargeIcon],
        ['XL', 'Very large', FontSizeExtraLargeIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([k, label, icon]) => (
            <PanelButton key={k} label={label} active={current === k} onClick={() => s.setFontSize(FONT_SIZE_PRESETS[k])}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'textAlign': {
      const options: ['left' | 'center' | 'right', string, React.ReactNode][] = [
        ['left', 'Left', TextAlignLeftIcon],
        ['center', 'Center', TextAlignCenterIcon],
        ['right', 'Right', TextAlignRightIcon],
      ];
      return (
        <ButtonRow>
          {options.map(([v, label, icon]) => (
            <PanelButton key={v} label={label} active={s.textAlign === v} onClick={() => s.setTextAlign(v)}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'textVerticalAlign': {
      const options: ['top' | 'middle' | 'bottom', string, React.ReactNode][] = [
        ['top', 'Top', <TextAlignTopIcon key="i" theme="light" />],
        ['middle', 'Middle', <TextAlignMiddleIcon key="i" theme="light" />],
        ['bottom', 'Bottom', <TextAlignBottomIcon key="i" theme="light" />],
      ];
      return (
        <ButtonRow>
          {options.map(([v, label, icon]) => (
            <PanelButton key={v} label={label} active={s.textVerticalAlign === v} onClick={() => s.setTextVerticalAlign(v)}>
              {icon}
            </PanelButton>
          ))}
        </ButtonRow>
      );
    }

    case 'stepNumbering':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={s.stepStartNumber}
              onChange={(e) => s.setStepStartNumber(Number(e.target.value))}
              aria-label="Start numbering at"
              className="h-8 w-14 rounded-lg border border-border bg-transparent px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              className="h-8 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary text-xs hover:bg-border transition-colors"
              onClick={() => s.setStepStartNumber(s.stepStartNumber)}
            >
              <RotateCcw className="w-3 h-3" />
              Restart at {s.stepStartNumber}
            </button>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">Next number: {s.stepCounter}</p>
        </div>
      );

    default: {
      // Continuous values. A drag is one undo gesture: changes apply live,
      // history is committed once on release.
      if (spec.kind !== 'slider') return null;
      const setters: Partial<Record<typeof spec.key, (v: number) => void>> = {
        opacity: s.setOpacity,
        blurRadius: s.setBlurRadius,
        pixelSize: s.setPixelSize,
        highlighterWidth: s.setHighlighterWidth,
        spotlightDim: s.setSpotlightDim,
        stepRadius: s.setStepRadius,
        magnification: s.setMagnification,
      };
      const onChange = setters[spec.key];
      if (!onChange) return null;
      const value = (s as unknown as Record<string, number>)[spec.key] ?? spec.min;
      // Excalidraw labels the opacity track's ends instead of showing a value.
      if (spec.key === 'opacity') {
        return (
          <div>
            <Slider
              value={[value]}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              aria-label={spec.label}
              onPointerDown={() => s.beginSettingGesture()}
              onValueCommit={() => s.endSettingGesture()}
              onValueChange={([v]) => onChange(v)}
            />
            <div className="mt-1.5 flex justify-between text-[0.75rem] text-foreground">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2">
          <Slider
            value={[value]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            aria-label={spec.label}
            onPointerDown={() => s.beginSettingGesture()}
            onValueCommit={() => s.endSettingGesture()}
            onValueChange={([v]) => onChange(v)}
          />
          <span className="w-7 text-right text-[0.7rem] tabular-nums text-muted-foreground">
            {spec.format ? spec.format(value) : Math.round(value)}
          </span>
        </div>
      );
    }
  }
}
