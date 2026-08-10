import { useEditorStore } from '@/store/editor-store';
import type { ToolType } from '@/types/editor';
import { HANDWRITTEN_FONT, STANDARD_FONT } from '@/types/editor';

const STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const FILL_STYLES = ['hachure', 'cross-hatch', 'solid', 'none'] as const;
const STROKE_WIDTHS = [2, 3, 6];
const BLUR_PRESETS = [6, 12, 24, 40];
const PIXEL_PRESETS = [4, 10, 20, 40];
const HIGHLIGHTER_PRESETS = [12, 24, 40];
const MAG_PRESETS = [1.5, 2, 3, 4];

function nextIn<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

function nearestPreset(list: number[], value: number): number {
  return list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), list[0]);
}

/** Cycle the primary setting when the same tool is pressed again. */
export function cycleToolSetting(tool: ToolType): void {
  const s = useEditorStore.getState();

  switch (tool) {
    case 'arrow':
    case 'line':
      s.setStrokeStyle(nextIn(STROKE_STYLES, s.strokeStyle));
      break;
    case 'rectangle':
    case 'rounded-rect':
    case 'circle':
    case 'diamond':
      s.setFillStyle(nextIn(FILL_STYLES, s.fillStyle));
      break;
    case 'pencil':
      s.setStrokeWidth(nextIn(STROKE_WIDTHS, nearestPreset(STROKE_WIDTHS, s.strokeWidth)));
      break;
    case 'highlighter':
      s.setHighlighterWidth(nextIn(HIGHLIGHTER_PRESETS, nearestPreset(HIGHLIGHTER_PRESETS, s.highlighterWidth)));
      break;
    case 'blur':
      s.setBlurRadius(nextIn(BLUR_PRESETS, nearestPreset(BLUR_PRESETS, s.blurRadius)));
      break;
    case 'pixelate':
      s.setPixelSize(nextIn(PIXEL_PRESETS, nearestPreset(PIXEL_PRESETS, s.pixelSize)));
      break;
    case 'text':
      s.setFontFamily((s.fontFamily ?? HANDWRITTEN_FONT) === HANDWRITTEN_FONT ? STANDARD_FONT : HANDWRITTEN_FONT);
      break;
    case 'step':
      s.setStepStartNumber(s.stepStartNumber + 1);
      break;
    case 'magnifier':
      s.setMagnification(nextIn(MAG_PRESETS, nearestPreset(MAG_PRESETS, s.magnification)));
      break;
    default:
      break;
  }
}
