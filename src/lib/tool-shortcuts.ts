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

/**
 * Digits 1-9 follow the toolbar's main bar left to right; every tool also has
 * a letter. Tools in the More menu have letters only. The order is the toolbar's, then the More menu's.
 */
export const TOOL_SHORTCUTS: ToolShortcutDef[] = [
  { id: 'select', label: 'Selection', hint: 'Select and move shapes', letter: 'V', digit: '1' },
  { id: 'arrow', label: 'Arrow', hint: 'Point at details', letter: 'A', digit: '2' },
  { id: 'rectangle', label: 'Rectangle', hint: 'Box a region', letter: 'R', digit: '3' },
  { id: 'text', label: 'Text', hint: 'Add a label', letter: 'T', digit: '4' },
  { id: 'step', label: 'Number', hint: 'Number or stamp steps', letter: 'N', digit: '5' },
  { id: 'blur', label: 'Blur', hint: 'Blur or pixelate a sensitive region', letter: 'B', digit: '6' },
  { id: 'highlighter', label: 'Highlighter', hint: 'Semi-transparent stroke', letter: 'K', digit: '7' },
  { id: 'callout', label: 'Callout', hint: 'Speech bubble with configurable pointer', letter: 'U', digit: '8' },
  { id: 'crop', label: 'Crop', hint: 'Crop the image', letter: 'C', digit: '9' },
  { id: 'line', label: 'Line', hint: 'Draw a straight line', letter: 'L' },
  { id: 'circle', label: 'Ellipse', hint: 'Ellipse or circle', letter: 'O' },
  { id: 'pencil', label: 'Draw', hint: 'Freehand draw', letter: 'P' },
  { id: 'eraser', label: 'Eraser', hint: 'Remove annotations', letter: 'E', digit: '0' },
  { id: 'magnifier', label: 'Magnifier', hint: 'Circle a detail to enlarge it', letter: 'M' },
  { id: 'spotlight', label: 'Spotlight', hint: 'Dim everything outside a region', letter: 'S' },
  { id: 'hand', label: 'Hand', hint: 'Pan the canvas', letter: 'H' },
];

export const letterToTool: Record<string, ToolType> = Object.fromEntries(
  TOOL_SHORTCUTS.map((t) => [t.letter.toLowerCase(), t.id]),
);

export const digitToTool: Record<string, ToolType> = Object.fromEntries(
  TOOL_SHORTCUTS.filter((t) => t.digit != null).map((t) => [t.digit!, t.id]),
);

export function formatToolKeys(t: ToolShortcutDef): string {
  return t.digit ? `${t.letter} / ${t.digit}` : t.letter;
}
