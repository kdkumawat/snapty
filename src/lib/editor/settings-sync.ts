import type { EditorElement, ToolType, Arrowhead, StrokeStyle, FillStyle } from '@/types/editor';
import { HANDWRITTEN_FONT } from '@/types/editor';
import { toolHasSetting, type SettingKey } from '@/lib/editor/tool-settings';

/**
 * The one place that maps between the flat tool-settings state and element props.
 *
 * Two directions, one registry:
 *   element -> settings   `hydrateSettingsFromElement` (every selection entry point)
 *   settings -> element   `applySettingToElement`      (every setter in the store)
 *
 * ## Scale invariant
 * Settings are canonical and **unscaled**. An element stores `setting * scale`
 * and hydration divides straight back out. Neither direction rounds: the old
 * code rounded on both legs, so select -> deselect -> select drifted values.
 * Konva accepts fractional fontSize / strokeWidth / radius, and the panel
 * rounds only for display.
 */

/** Settings fields this module reads and writes. Subset of the store. */
export type ToolSettingsState = {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  textAlign: 'left' | 'center' | 'right';
  textVerticalAlign: 'top' | 'middle' | 'bottom';
  opacity: number;
  cornerRadius: number;
  blurRadius: number;
  pixelSize: number;
  highlighterWidth: number;
  stepRadius: number;
  strokeStyle: StrokeStyle;
  fillStyle: FillStyle;
  roughness: number;
  magnification: number;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
};

type Patch = Partial<EditorElement> & Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Element patch for one setting change, or `null` when the setting does not
 * apply to this element. Gated on the registry so it cannot drift from the UI.
 *
 * @param scale `getImageToolScale(imageSize)` - size-like settings are multiplied by it.
 */
export function applySettingToElement(
  key: SettingKey,
  value: unknown,
  el: EditorElement,
  scale: number,
): Patch | null {
  if (!toolHasSetting(el.type as ToolType, key)) return null;
  const s = scale || 1;

  switch (key) {
    case 'strokeColor': {
      const color = String(value);
      // Text and step badges carry their colour in `fill`; arrows need both so
      // the head matches the shaft.
      if (el.type === 'text' || el.type === 'step') return { fill: color };
      if (el.type === 'arrow') return { stroke: color, fill: color };
      return { stroke: color };
    }
    case 'fillColor':
      return { fill: String(value) };
    case 'strokeWidth': {
      const v = num(value);
      return v === null ? null : { strokeWidth: Math.max(0.5, v * s) };
    }
    case 'highlighterWidth': {
      const v = num(value);
      return v === null ? null : { strokeWidth: Math.max(2, v * s) };
    }
    case 'fontSize': {
      const v = num(value);
      return v === null ? null : { fontSize: Math.max(4, v * s) };
    }
    case 'fontFamily':
      return { fontFamily: String(value) };
    case 'fontStyle':
      return { fontStyle: String(value) };
    case 'textAlign':
      return { align: String(value) as 'left' | 'center' | 'right' };
    case 'textVerticalAlign':
      return { verticalAlign: String(value) as 'top' | 'middle' | 'bottom' };
    case 'opacity': {
      const v = num(value);
      return v === null ? null : { opacity: Math.max(0, Math.min(1, v)) };
    }
    case 'cornerRadius': {
      const v = num(value);
      return v === null ? null : { cornerRadius: Math.max(0, v * s) };
    }
    case 'stepRadius': {
      const v = num(value);
      if (v === null) return null;
      const radius = Math.max(8, v * s);
      // The badge label is always 80% of the circle, matching draw-time sizing.
      return { radius, fontSize: radius * 0.8 };
    }
    case 'blurRadius': {
      const v = num(value);
      return v === null ? null : { blurRadius: Math.max(2, Math.min(40, v)) };
    }
    case 'pixelSize': {
      const v = num(value);
      return v === null ? null : { pixelSize: Math.max(2, Math.min(40, v)) };
    }
    case 'magnification': {
      const v = num(value);
      return v === null ? null : { magnification: Math.max(1.5, Math.min(4, v)) };
    }
    case 'strokeStyle':
      return { strokeStyle: value as StrokeStyle };
    case 'fillStyle':
      return { fillStyle: value as FillStyle };
    case 'roughness': {
      const v = num(value);
      return v === null ? null : { roughness: Math.max(0, Math.min(3, v)) };
    }
    case 'arrowheads':
      // Written as a pair by the panel: { startArrowhead, endArrowhead }.
      return value && typeof value === 'object' ? { ...(value as object) } : null;
    case 'stepNumbering':
      // Numbering is store-only; existing badges keep the number they were given.
      return null;
  }
  return null;
}

/**
 * Settings patch describing `el`, for the store. Every selection path calls
 * this so the panel always shows the selected element's real values - the old
 * code only hydrated from one of three entry points, which is why settings
 * looked stale until you clicked a second time.
 */
export function hydrateSettingsFromElement(
  el: EditorElement,
  scale: number,
): Partial<ToolSettingsState> {
  const s = scale || 1;
  const type = el.type as ToolType;
  const has = (k: SettingKey) => toolHasSetting(type, k);
  const out: Partial<ToolSettingsState> = {};
  // Read element props generically: the union's members disagree on which keys
  // exist, and every access below is guarded by the registry anyway.
  const e = el as unknown as Record<string, unknown>;

  if (has('strokeColor')) {
    const color =
      type === 'text' || type === 'step' ? e.fill : type === 'arrow' ? e.stroke : e.stroke;
    if (typeof color === 'string' && color && color !== 'transparent') out.strokeColor = color;
  }
  if (has('fillColor') && typeof e.fill === 'string') out.fillColor = e.fill;

  if (has('strokeWidth')) {
    const v = num(e.strokeWidth);
    if (v !== null && v > 0) out.strokeWidth = v / s;
  }
  if (has('highlighterWidth')) {
    const v = num(e.strokeWidth);
    if (v !== null && v > 0) out.highlighterWidth = v / s;
  }
  if (has('fontSize')) {
    const v = num(e.fontSize);
    if (v !== null && v > 0) out.fontSize = v / s;
  }
  if (has('fontFamily') && typeof e.fontFamily === 'string' && e.fontFamily) {
    out.fontFamily = e.fontFamily;
  } else if (has('fontFamily')) {
    out.fontFamily = HANDWRITTEN_FONT;
  }
  if (has('fontStyle') && typeof e.fontStyle === 'string' && e.fontStyle) {
    out.fontStyle = e.fontStyle;
  } else if (has('fontStyle')) {
    out.fontStyle = 'normal';
  }
  if (has('textAlign')) {
    out.textAlign = (e.align as 'left' | 'center' | 'right') || 'left';
  }
  if (has('textVerticalAlign')) {
    out.textVerticalAlign = (e.verticalAlign as 'top' | 'middle' | 'bottom') || 'middle';
  }
  if (has('cornerRadius')) {
    const v = num(e.cornerRadius);
    if (v !== null) out.cornerRadius = v / s;
  }
  if (has('stepRadius')) {
    const v = num(e.radius);
    if (v !== null && v > 0) out.stepRadius = v / s;
  }
  if (has('blurRadius')) {
    const v = num(e.blurRadius);
    if (v !== null) out.blurRadius = v;
  }
  if (has('pixelSize')) {
    const v = num(e.pixelSize);
    if (v !== null) out.pixelSize = v;
  }
  if (has('magnification')) {
    const v = num(e.magnification);
    if (v !== null) out.magnification = v;
  }
  if (has('opacity')) {
    const v = num(e.opacity);
    if (v !== null) out.opacity = v;
  }
  if (has('strokeStyle') && e.strokeStyle) out.strokeStyle = e.strokeStyle as StrokeStyle;
  if (has('fillStyle') && e.fillStyle) out.fillStyle = e.fillStyle as FillStyle;
  if (has('roughness')) {
    const v = num(e.roughness);
    if (v !== null) out.roughness = v;
  }
  if (has('arrowheads')) {
    if (e.startArrowhead) out.startArrowhead = e.startArrowhead as Arrowhead;
    if (e.endArrowhead) out.endArrowhead = e.endArrowhead as Arrowhead;
  }
  return out;
}

/**
 * Hydrate from a selection. Mixed-type selections hydrate only the settings
 * every member shares, so selecting a rectangle plus an arrow cannot silently
 * overwrite the rectangle's fill from the arrow.
 */
export function hydrateSettingsFromSelection(
  els: EditorElement[],
  scale: number,
): Partial<ToolSettingsState> {
  if (!els.length) return {};
  const first = hydrateSettingsFromElement(els[0], scale);
  if (els.length === 1) return first;
  const sameType = els.every((el) => el.type === els[0].type);
  if (sameType) return first;
  // Keep only keys every element agrees on.
  const rest = els.slice(1).map((el) => hydrateSettingsFromElement(el, scale));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(first)) {
    if (rest.every((r) => (r as Record<string, unknown>)[k] === v)) out[k] = v;
  }
  return out as Partial<ToolSettingsState>;
}
