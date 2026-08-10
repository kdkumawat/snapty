'use client';

import { useEditorStore } from '@/store/editor-store';
import { settingsForTypes, TOOL_SETTINGS } from '@/lib/editor/tool-settings';
import type { ToolType } from '@/types/editor';

/** Shared state for the expanded panel and the compact settings rail. */
export function useToolSettingsPanel() {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const activeTool = useEditorStore((s) => s.activeTool);

  const selected = elements.filter((el) => selectedElementIds.includes(el.id));
  const types: ToolType[] = selected.length > 0
    ? [...new Set(selected.map((el) => el.type))]
    : (TOOL_SETTINGS[activeTool]?.length ? [activeTool] : []);
  const keys = settingsForTypes(types);
  const visible = !!backgroundImage && keys.length > 0;
  const locked = selected.length > 0 && selected.every((el) => el.locked);
  const primary = selected[0];

  const label = selected.length === 1
    ? types[0].replace('-', ' ')
    : selected.length > 1
      ? `${selected.length} selected`
      : activeTool.replace('-', ' ');

  return {
    selectedElementIds,
    selected,
    types,
    keys,
    visible,
    locked,
    primary,
    label,
  };
}
