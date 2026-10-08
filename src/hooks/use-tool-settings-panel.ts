'use client';

import { useEditorStore } from '@/store/editor-store';
import { settingsForTypes, TOOL_SETTINGS, visibleSettingsFor } from '@/lib/editor/tool-settings';
import { isClosedShape, isLabelPairGroup, labelPairPartner } from '@/lib/editor/text-labels';
import type { ToolType } from '@/types/editor';

const PANEL_ORDER: string[] = [
  'strokeColor', 'fillColor', 'fillStyle', 'strokeWidth', 'highlighterWidth', 'strokeStyle',
  'roughness', 'cornerRadius', 'arrowPath', 'fontFamily', 'fontSize', 'textAlign',
  'textVerticalAlign', 'arrowheads',
];

function prettyType(t: string): string {
  if (t === 'circle') return 'ellipse';
  if (t === 'step') return 'number';
  return t.replace('-', ' ');
}

/** What the properties panel shows for the current selection or tool. */
export function useToolSettingsPanel() {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const activeTool = useEditorStore((s) => s.activeTool);
  const fillColor = useEditorStore((s) => s.fillColor);

  const selected = elements.filter((el) => selectedElementIds.includes(el.id));
  const types: ToolType[] = selected.length > 0
    ? [...new Set(selected.map((el) => el.type))]
    : (TOOL_SETTINGS[activeTool]?.length ? [activeTool] : []);

  let hasClosedLabel = false;
  let pathLabel = false;
  let title = '';
  if (selected.length === 1) {
    const el = selected[0];
    const partner = labelPairPartner(el, elements);
    if (partner && el.groupId && isLabelPairGroup(el.groupId, elements)) {
      const shape = el.type === 'text' ? partner : el;
      const text = el.type === 'text' ? el : partner;
      if (text.type === 'text' && isClosedShape(shape)) {
        hasClosedLabel = true;
        if (!types.includes('text')) types.push('text');
        title = `${prettyType(shape.type)} + text`;
      } else if (text.type === 'text') {
        if (el.type === 'text') title = 'label';
        else {
          pathLabel = true;
          if (!types.includes('text')) types.push('text');
          title = `${prettyType(shape.type)} + text`;
        }
      }
    }
    if (!title) title = prettyType(types[0] ?? el.type);
  } else if (selected.length > 1) {
    title = `${selected.length} selected`;
  } else {
    title = prettyType(activeTool);
  }

  const rawKeys = settingsForTypes(types);
  const fillIsPainted = fillColor !== 'transparent';
  const visibleKeys = visibleSettingsFor(rawKeys, { hasClosedLabel, fillIsPainted });
  // One canonical order, as in Excalidraw's styles panel, whichever tools
  // contributed the settings; opacity always closes the list. Text on an
  // arrow or line has no alignment of its own.
  const rank = (k: string) => (k === 'opacity' ? Infinity : PANEL_ORDER.indexOf(k) >= 0 ? PANEL_ORDER.indexOf(k) : PANEL_ORDER.length);
  const keys = visibleKeys
    .filter((k) => !(pathLabel && (k === 'textAlign' || k === 'textVerticalAlign')))
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((x) => x.k);
  const visible = !!backgroundImage && keys.length > 0;
  const locked = selected.length > 0 && selected.every((el) => el.locked);
  const primary = selected[0];

  return {
    selectedElementIds,
    selected,
    types,
    keys,
    visible,
    locked,
    primary,
    label: title,
  };
}
