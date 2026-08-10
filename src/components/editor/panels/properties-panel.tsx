'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Copy, Lock, Unlock,
  ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown, ChevronLeft,
} from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { IconButton } from '@/components/editor/ui/icon-button';
import { useEditorStore } from '@/store/editor-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useResponsivePanel } from '@/hooks/use-responsive-panel';
import { useToolSettingsPanel } from '@/hooks/use-tool-settings-panel';
import { SETTING_SPECS } from '@/lib/editor/tool-settings';
import {
  SettingControl, SettingValueBadge, IconToggle,
} from '@/components/editor/panels/setting-controls';
import SettingsRail from '@/components/editor/panels/settings-rail';
import { copyStyleToClipboard, hasClipboardStyle, getClipboardStyle } from '@/lib/editor/clipboard-style';
import { toastSuccess } from '@/lib/app-toast';

/**
 * Desktop: full floating panel with all settings visible; minimize to a compact
 * icon rail with right-side popovers. Mobile / narrow: always the rail.
 */
export default function FloatingPropertiesPanel() {
  const isMobile = useIsMobile();
  const { panelCollapsed, togglePanel } = useResponsivePanel();

  const {
    selectedElementIds, selected, keys, visible, locked, primary, label,
  } = useToolSettingsPanel();

  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);
  const updateSelectedElements = useEditorStore((s) => s.updateSelectedElements);

  const useRail = isMobile || panelCollapsed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute top-[4.5rem] sm:top-[4.75rem] left-2 sm:left-3 z-[60] pointer-events-auto max-h-[calc(100dvh-7.5rem)]"
        >
          {useRail ? (
            <SettingsRail
              onExpandPanel={!isMobile ? () => togglePanel(false) : undefined}
              className="max-h-[inherit]"
            />
          ) : (
            <FloatingSurface className="overflow-hidden flex flex-col w-[13.5rem] max-h-[inherit] rounded-xl shadow-lg">
              <div className="px-2 py-2 border-b border-border/80 flex items-center gap-1 shrink-0">
                <IconButton
                  size="sm"
                  aria-label="Minimize to icon rail"
                  onClick={() => togglePanel(true)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </IconButton>
                <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground truncate flex-1 min-w-0">
                  {label}
                </p>
                {selected.length > 0 && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconButton size="sm" aria-label="Duplicate" onClick={duplicateSelected}>
                      <Copy className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      aria-label={locked ? 'Unlock' : 'Lock'}
                      onClick={() => (locked ? unlockSelected() : lockSelected())}
                    >
                      {locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    </IconButton>
                    <IconButton size="sm" aria-label="Delete" onClick={() => removeElements(selectedElementIds)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                )}
              </div>

              <div className="overflow-y-auto panel-scroll p-3 flex flex-col gap-4 min-h-0">
                {keys.map((key) => {
                  const spec = SETTING_SPECS[key];
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {spec.label}
                        </p>
                        <SettingValueBadge spec={spec} />
                      </div>
                      <SettingControl spec={spec} />
                    </div>
                  );
                })}

                {selected.length > 0 && (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Layers</p>
                      <div className="flex gap-0.5">
                        <IconToggle label="Send to back" onClick={() => selectedElementIds.forEach(sendToBack)}>
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                        </IconToggle>
                        <IconToggle label="Send backward" onClick={() => selectedElementIds.forEach(sendBackward)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </IconToggle>
                        <IconToggle label="Bring forward" onClick={() => selectedElementIds.forEach(bringForward)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </IconToggle>
                        <IconToggle label="Bring to front" onClick={() => selectedElementIds.forEach(bringToFront)}>
                          <ArrowUpToLine className="w-3.5 h-3.5" />
                        </IconToggle>
                      </div>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        type="button"
                        className="flex-1 h-7 text-[11px] rounded-lg border border-border hover:bg-secondary"
                        onClick={() => {
                          if (primary) {
                            copyStyleToClipboard(primary);
                            toastSuccess('Style copied', 'Paste onto another shape');
                          }
                        }}
                      >
                        Copy style
                      </button>
                      <button
                        type="button"
                        className="flex-1 h-7 text-[11px] rounded-lg border border-border hover:bg-secondary disabled:opacity-40"
                        disabled={!hasClipboardStyle()}
                        onClick={() => {
                          const style = getClipboardStyle();
                          if (style) {
                            updateSelectedElements(style);
                            toastSuccess('Style pasted', 'Applied to selection');
                          }
                        }}
                      >
                        Paste style
                      </button>
                    </div>
                  </>
                )}
              </div>
            </FloatingSurface>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
