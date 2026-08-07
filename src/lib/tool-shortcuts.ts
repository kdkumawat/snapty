import type { ToolType } from '@/types/editor';

/** Canonical tool shortcuts: letter (Excalidraw-style) + digit badge (toolbar). */
export type ToolShortcutDef = {
  id: ToolType;
  label: string;
  hint: string;
  letter: string;
  /** Digit shown on toolbar; also triggers the tool when pressed alone. */
  digit?: string;
};

export const TOOL_SHORTCUTS: ToolShortcutDef[] = [
  { id: 'select', label: 'Selection', hint: 'Select and move shapes', letter: 'V', digit: '1' },
  { id: 'hand', label: 'Hand', hint: 'Pan the canvas', letter: 'H', digit: '2' },
  { id: 'magnifier', label: 'Magnifier', hint: 'Circle a detail to enlarge it', letter: 'M', digit: '3' },
  { id: 'rectangle', label: 'Rectangle', hint: 'Box a region', letter: 'R', digit: '4' },
  { id: 'diamond', label: 'Diamond', hint: 'Diamond shape', letter: 'D', digit: '5' },
  { id: 'circle', label: 'Ellipse', hint: 'Ellipse or circle', letter: 'O', digit: '6' },
  { id: 'arrow', label: 'Arrow', hint: 'Point at details', letter: 'A', digit: '7' },
  { id: 'line', label: 'Line', hint: 'Draw a straight line', letter: 'L', digit: '8' },
  { id: 'pencil', label: 'Draw', hint: 'Freehand draw', letter: 'P', digit: '9' },
  { id: 'text', label: 'Text', hint: 'Add a handwritten label', letter: 'T', digit: '0' },
  { id: 'step', label: 'Number', hint: 'Step callouts', letter: 'N' },
  { id: 'highlighter', label: 'Highlighter', hint: 'Semi-transparent stroke', letter: 'K' },
  { id: 'blur', label: 'Blur', hint: 'Blur a sensitive region', letter: 'B' },
  { id: 'pixelate', label: 'Pixelate', hint: 'Pixelate a region', letter: 'X' },
  { id: 'crop', label: 'Crop', hint: 'Crop the image', letter: 'C' },
  { id: 'eraser', label: 'Eraser', hint: 'Remove annotations', letter: 'E' },
  { id: 'rounded-rect', label: 'Rounded rectangle', hint: 'Soft-corner box', letter: 'U' },
  { id: 'spotlight', label: 'Spotlight', hint: 'Dim around a focus area', letter: 'S' },
];

export const letterToTool: Record<string, ToolType> = Object.fromEntries(
  TOOL_SHORTCUTS.map((t) => [t.letter.toLowerCase(), t.id]),
);

/** Extra letter aliases (legacy). */
letterToTool.i = 'highlighter';

export const digitToTool: Record<string, ToolType> = Object.fromEntries(
  TOOL_SHORTCUTS.filter((t) => t.digit != null).map((t) => [t.digit!, t.id]),
);

export function formatToolKeys(t: ToolShortcutDef): string {
  return t.digit ? `${t.letter} / ${t.digit}` : t.letter;
}
