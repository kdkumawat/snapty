'use client';

import { useEditorStore } from '@/store/editor-store';
import { settingsForTypes, TOOL_SETTINGS, visibleSettingsFor } from '@/lib/editor/tool-settings';
import { isClosedShape, isLabelPairGroup, labelPairPartner } from '@/lib/editor/text-labels';
import type { ToolType } from '@/types/editor';

function prettyType(t: string): string {
  if (t === 'circle') return 'ellipse';
  if (t === 'step') return 'number';
  return t.replace('-', ' ');
}

/** Shared state for the expanded panel and the compact settings rail. */
export function useToolSettingsPanel() {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const activeTool = useEditorStore((s) => s.activeTool);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const fillColor = useEditorStore((s) => s.fillColor);
  const fillStyle = useEditorStore((s) => s.fillStyle);

  const selected = elements.filter((el) => selectedElementIds.includes(el.id));
  const types: ToolType[] = selected.length > 0
    ? [...new Set(selected.map((el) => el.type))]
    : (TOOL_SETTINGS[activeTool]?.length ? [activeTool] : []);

  let hasClosedLabel = false;
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
  const fillIsPainted = fillColor !== 'transparent' && fillStyle !== 'none';
  const keys = visibleSettingsFor(rawKeys, { handDrawn, hasClosedLabel, fillIsPainted });
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
