import type { ToolType } from '@/types/editor';

/**
 * Single declarative source of truth for "which settings does this tool have".
 *
 * Before this file the answer lived in eight hand-written boolean expressions in
 * the properties panel, which had already drifted from the per-setter type lists
 * in the store (highlighter was offered `strokeWidth` while it draws with
 * `highlighterWidth`; blur/pixelate showed only Opacity and no intensity control
 * at all). The desktop panel, the mobile chip strip and the settings-sync
 * hydration all read this registry so they cannot disagree again.
 */

export type SettingKey =
  | 'strokeColor'
  | 'fillColor'
  | 'strokeWidth'
  | 'strokeStyle'
  | 'fillStyle'
  | 'roughness'
  | 'opacity'
  | 'cornerRadius'
  | 'fontSize'
  | 'fontFamily'
  | 'fontStyle'
  | 'textAlign'
  | 'textVerticalAlign'
  | 'arrowheads'
  | 'arrowPath'
  | 'magnification'
  | 'blurRadius'
  | 'pixelSize'
  | 'highlighterWidth'
  | 'stepRadius'
  | 'stepNumbering';

export type SettingSpec =
  | { kind: 'color'; key: SettingKey; label: string; allowTransparent?: boolean }
  | {
      kind: 'slider';
      key: SettingKey;
      label: string;
      min: number;
      max: number;
      step: number;
      railLabel?: string;
      /**
       * Authored unscaled: the element stores `value * getImageToolScale(...)`.
       * Sliders always show the unscaled value.
       */
      scaled?: boolean;
      format?: (v: number) => string;
    }
  | { kind: 'preset'; key: SettingKey; label: string; railLabel?: string }
  | { kind: 'action'; key: SettingKey; label: string; railLabel?: string };

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  strokeColor: { kind: 'color', key: 'strokeColor', label: 'Stroke' },
  fillColor: { kind: 'color', key: 'fillColor', label: 'Background', allowTransparent: true },
  strokeWidth: { kind: 'preset', key: 'strokeWidth', label: 'Stroke width' },
  strokeStyle: { kind: 'preset', key: 'strokeStyle', label: 'Stroke style' },
  fillStyle: { kind: 'preset', key: 'fillStyle', label: 'Fill style' },
  roughness: { kind: 'preset', key: 'roughness', label: 'Sloppiness' },
  cornerRadius: { kind: 'preset', key: 'cornerRadius', label: 'Edges' },
  arrowheads: { kind: 'preset', key: 'arrowheads', label: 'Arrowheads' },
  arrowPath: { kind: 'preset', key: 'arrowPath', label: 'Arrow path', railLabel: 'Path' },
  fontFamily: { kind: 'preset', key: 'fontFamily', label: 'Font style', railLabel: 'Style' },
  fontStyle: { kind: 'preset', key: 'fontStyle', label: 'Bold / Italic', railLabel: 'Bold' },
  textAlign: { kind: 'preset', key: 'textAlign', label: 'Alignment', railLabel: 'Align' },
  textVerticalAlign: { kind: 'preset', key: 'textVerticalAlign', label: 'Vertical', railLabel: 'VAlign' },
  fontSize: {
    kind: 'slider', key: 'fontSize', label: 'Font size', railLabel: 'Size',
    min: 12, max: 72, step: 1, scaled: true,
  },
  magnification: {
    kind: 'slider', key: 'magnification', label: 'Zoom',
    min: 1.5, max: 4, step: 0.25, format: (v) => `${v.toFixed(2).replace(/\.?0+$/, '')}x`,
  },
  blurRadius: {
    kind: 'slider', key: 'blurRadius', label: 'Blur amount',
    min: 2, max: 40, step: 1, scaled: true,
  },
  pixelSize: {
    kind: 'slider', key: 'pixelSize', label: 'Pixel size',
    min: 2, max: 40, step: 1, scaled: true,
  },
  highlighterWidth: {
    kind: 'slider', key: 'highlighterWidth', label: 'Thickness',
    min: 8, max: 60, step: 2, scaled: true,
  },
  stepRadius: {
    kind: 'slider', key: 'stepRadius', label: 'Size',
    min: 8, max: 80, step: 1, scaled: true,
  },
  opacity: {
    kind: 'slider', key: 'opacity', label: 'Opacity',
    min: 0.1, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%`,
  },
  stepNumbering: { kind: 'action', key: 'stepNumbering', label: 'Numbering' },
};

/**
 * Per-tool setting list, in display order. Order matters: it is the order the
 * desktop panel stacks sections and the mobile strip lays out chips.
 */
export const TOOL_SETTINGS: Record<ToolType, SettingKey[]> = {
  select: [],
  hand: [],
  crop: [],
  eraser: [],

  rectangle: ['strokeColor', 'fillColor', 'strokeWidth', 'strokeStyle', 'fillStyle', 'roughness', 'cornerRadius', 'opacity'],
  'rounded-rect': ['strokeColor', 'fillColor', 'strokeWidth', 'strokeStyle', 'fillStyle', 'roughness', 'cornerRadius', 'opacity'],
  circle: ['strokeColor', 'fillColor', 'strokeWidth', 'strokeStyle', 'fillStyle', 'roughness', 'opacity'],
  diamond: ['strokeColor', 'fillColor', 'strokeWidth', 'strokeStyle', 'fillStyle', 'roughness', 'opacity'],

  arrow: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'arrowheads', 'arrowPath', 'opacity'],
  line: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'arrowheads', 'opacity'],

  // Freehand ignores dash at render, so no strokeStyle.
  pencil: ['strokeColor', 'strokeWidth', 'opacity'],
  // Draws with highlighterWidth, never strokeWidth.
  highlighter: ['strokeColor', 'highlighterWidth', 'opacity'],

  text: ['strokeColor', 'fontFamily', 'fontStyle', 'textAlign', 'textVerticalAlign', 'fontSize', 'opacity'],
  step: ['strokeColor', 'stepRadius', 'stepNumbering', 'opacity'],

  magnifier: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'magnification', 'opacity'],

  blur: ['blurRadius', 'opacity'],
  pixelate: ['pixelSize', 'opacity'],
  spotlight: ['opacity'],
};

/** Order-stable union of the settings supported by every given type. */
export function settingsForTypes(types: ToolType[]): SettingKey[] {
  if (!types.length) return [];
  const seen = new Set<SettingKey>();
  const out: SettingKey[] = [];
  for (const t of types) {
    for (const key of TOOL_SETTINGS[t] ?? []) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** Short caption under rail icons (avoids duplicate "Font" from label.split). */
export function settingRailLabel(key: SettingKey): string {
  const spec = SETTING_SPECS[key];
  if ('railLabel' in spec && spec.railLabel) return spec.railLabel;
  return spec.label.split(' ')[0] ?? spec.label;
}

/** Does this tool/element type expose `key`? */
export function toolHasSetting(type: ToolType, key: SettingKey): boolean {
  return (TOOL_SETTINGS[type] ?? []).includes(key);
}

/** Tools that show a settings surface with nothing selected (i.e. before drawing). */
export const TOOLS_WITH_PANEL: ToolType[] = (Object.keys(TOOL_SETTINGS) as ToolType[])
  .filter((t) => (TOOL_SETTINGS[t] ?? []).length > 0);
