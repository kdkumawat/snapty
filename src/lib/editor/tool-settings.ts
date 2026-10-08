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
  | 'highlighterColor'
  | 'spotlightDim'
  | 'stepStyle'
  | 'stepRadius'
  | 'stepNumbering'
  | 'pointerLength'
  | 'pointerWidth'
  | 'pointerDirection';

export type SettingSpec =
  | { kind: 'color'; key: SettingKey; label: string; allowTransparent?: boolean }
  | {
      kind: 'slider';
      key: SettingKey;
      label: string;
      min: number;
      max: number;
      step: number;
      /**
       * Authored unscaled: the element stores `value * getImageToolScale(...)`.
       * Sliders always show the unscaled value.
       */
      scaled?: boolean;
      format?: (v: number) => string;
    }
  | { kind: 'preset'; key: SettingKey; label: string }
  | { kind: 'action'; key: SettingKey; label: string };

// Labels are Excalidraw's own section names.
export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  strokeColor: { kind: 'color', key: 'strokeColor', label: 'Stroke' },
  fillColor: { kind: 'color', key: 'fillColor', label: 'Background', allowTransparent: true },
  strokeWidth: { kind: 'preset', key: 'strokeWidth', label: 'Stroke width' },
  strokeStyle: { kind: 'preset', key: 'strokeStyle', label: 'Stroke style' },
  fillStyle: { kind: 'preset', key: 'fillStyle', label: 'Fill' },
  roughness: { kind: 'preset', key: 'roughness', label: 'Sloppiness' },
  cornerRadius: { kind: 'preset', key: 'cornerRadius', label: 'Edges' },
  arrowheads: { kind: 'preset', key: 'arrowheads', label: 'Arrowheads' },
  arrowPath: { kind: 'preset', key: 'arrowPath', label: 'Arrow type' },
  fontFamily: { kind: 'preset', key: 'fontFamily', label: 'Font family' },
  fontStyle: { kind: 'preset', key: 'fontStyle', label: 'Bold / Italic' },
  textAlign: { kind: 'preset', key: 'textAlign', label: 'Text align' },
  textVerticalAlign: { kind: 'preset', key: 'textVerticalAlign', label: 'Vertical align' },
  fontSize: { kind: 'preset', key: 'fontSize', label: 'Font size' },
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
    min: 0, max: 1, step: 0.1, format: (v) => `${Math.round(v * 100)}`,
  },
  highlighterColor: { kind: 'color', key: 'highlighterColor', label: 'Stroke' },
  spotlightDim: {
    kind: 'slider', key: 'spotlightDim', label: 'Dim',
    min: 0.1, max: 0.9, step: 0.05, format: (v) => `${Math.round(v * 100)}%`,
  },
  stepStyle: { kind: 'preset', key: 'stepStyle', label: 'Style' },
  stepNumbering: { kind: 'action', key: 'stepNumbering', label: 'Numbering' },
  pointerLength: {
    kind: 'slider', key: 'pointerLength', label: 'Pointer length',
    min: 8, max: 100, step: 2, scaled: true,
  },
  pointerWidth: {
    kind: 'slider', key: 'pointerWidth', label: 'Pointer width',
    min: 8, max: 60, step: 2, scaled: true,
  },
  pointerDirection: { kind: 'preset', key: 'pointerDirection', label: 'Pointer direction' },
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

  rectangle: ['strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'cornerRadius', 'opacity'],
  'rounded-rect': ['strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'cornerRadius', 'opacity'],
  circle: ['strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity'],
  diamond: ['strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'cornerRadius', 'opacity'],

  arrow: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'arrowPath', 'arrowheads', 'opacity'],
  line: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity'],

  // Freehand ignores dash at render, so no strokeStyle.
  pencil: ['strokeColor', 'strokeWidth', 'opacity'],
  // Draws with highlighterWidth, never strokeWidth.
  highlighter: ['highlighterColor', 'highlighterWidth', 'opacity'],

  text: ['strokeColor', 'fontFamily', 'fontSize', 'textAlign', 'textVerticalAlign', 'opacity'],
  step: ['strokeColor', 'stepStyle', 'stepRadius', 'stepNumbering', 'opacity'],
  // The pointer is aimed with its canvas handle, so it has no panel controls.
  callout: ['strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'cornerRadius', 'opacity'],

  magnifier: ['strokeColor', 'strokeWidth', 'strokeStyle', 'roughness', 'magnification', 'opacity'],

  blur: ['blurRadius', 'opacity'],
  pixelate: ['pixelSize', 'opacity'],
  spotlight: ['spotlightDim', 'cornerRadius'],
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

/** Does this tool/element type expose `key`? */
export function toolHasSetting(type: ToolType, key: SettingKey): boolean {
  return (TOOL_SETTINGS[type] ?? []).includes(key);
}

export type SettingVisibilityCtx = {
  hasClosedLabel: boolean;
  fillIsPainted: boolean;
};

/**
 * Drop settings that cannot affect the current selection / tool.
 * Like Excalidraw, Fill only appears once a background color is set.
 */
export function visibleSettingsFor(
  keys: SettingKey[],
  ctx: SettingVisibilityCtx,
): SettingKey[] {
  return keys.filter((k) => {
    if (k === 'fillStyle') return ctx.fillIsPainted;
    if (k === 'textVerticalAlign') return ctx.hasClosedLabel;
    return true;
  });
}

/** Tools that show a settings surface with nothing selected (i.e. before drawing). */
export const TOOLS_WITH_PANEL: ToolType[] = (Object.keys(TOOL_SETTINGS) as ToolType[])
  .filter((t) => (TOOL_SETTINGS[t] ?? []).length > 0);
