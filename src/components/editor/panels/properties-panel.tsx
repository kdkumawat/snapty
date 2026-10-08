'use client';

import React from 'react';
import { Droplets, Grid3x3, Lock, Unlock } from '@/components/editor/ui/icons';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { useEditorStore } from '@/store/editor-store';
import { useFormFactor } from '@/hooks/use-form-factor';
import { useToolSettingsPanel } from '@/hooks/use-tool-settings-panel';
import { SETTING_SPECS } from '@/lib/editor/tool-settings';
import { SettingControl, PanelButton, ButtonRow } from '@/components/editor/panels/setting-controls';
import {
  SendToBackIcon, SendBackwardIcon, BringForwardIcon, BringToFrontIcon,
  AlignLeftIcon, CenterHorizontallyIcon, AlignRightIcon,
  AlignTopIcon, CenterVerticallyIcon, AlignBottomIcon,
  DistributeHorizontallyIcon, DistributeVerticallyIcon,
  DuplicateIcon, TrashIcon, GroupIcon, UngroupIcon, paintIcon,
} from '@/components/editor/ui/excalidraw-icons';
import { cn } from '@/lib/utils';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[0.75rem] text-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

/**
 * The properties panel, laid out like Excalidraw's: one island on the left
 * with a labelled row per setting, then Layers, Align and Actions for a
 * selection. On phones it becomes a bottom sheet behind a toggle button.
 */
export default function FloatingPropertiesPanel() {
  const formFactor = useFormFactor();
  const isMobile = formFactor === 'phone';
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // Compact column: which single colour the popover shows, or null for all options.
  const [only, setOnly] = React.useState<'strokeColor' | 'fillColor' | null>(null);
  const { selectedElementIds, selected, keys, visible, locked } = useToolSettingsPanel();

  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);
  const alignSelected = useEditorStore((s) => s.alignSelected);
  const distributeSelected = useEditorStore((s) => s.distributeSelected);
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroupSelected = useEditorStore((s) => s.ungroupSelected);

  if (!visible) return null;

  const hasSelection = selected.length > 0;
  const multi = selected.length > 1;
  const grouped = hasSelection && selected.some((el) => el.groupId);
  const blurTool = !hasSelection && (activeTool === 'blur' || activeTool === 'pixelate');

  const body = (
    <div className="flex flex-col gap-3">
      {blurTool && (
        <Section label="Mode">
          <ButtonRow>
            <PanelButton label="Blur" active={activeTool === 'blur'} onClick={() => setActiveTool('blur')}>
              <Droplets strokeWidth={1.5} />
            </PanelButton>
            <PanelButton label="Pixelate" active={activeTool === 'pixelate'} onClick={() => setActiveTool('pixelate')}>
              <Grid3x3 strokeWidth={1.5} />
            </PanelButton>
          </ButtonRow>
        </Section>
      )}

      {keys.filter((key) => !only || formFactor !== 'compact' || key === only).map((key) => (
        <Section key={key} label={SETTING_SPECS[key].label}>
          <SettingControl spec={SETTING_SPECS[key]} />
        </Section>
      ))}

      {hasSelection && !(only && formFactor === 'compact') && (
        <>
          <Section label="Layers">
            <ButtonRow>
              <PanelButton label="Send to back" onClick={() => selectedElementIds.forEach(sendToBack)}>
                {SendToBackIcon}
              </PanelButton>
              <PanelButton label="Send backward" onClick={() => selectedElementIds.forEach(sendBackward)}>
                {SendBackwardIcon}
              </PanelButton>
              <PanelButton label="Bring forward" onClick={() => selectedElementIds.forEach(bringForward)}>
                {BringForwardIcon}
              </PanelButton>
              <PanelButton label="Bring to front" onClick={() => selectedElementIds.forEach(bringToFront)}>
                {BringToFrontIcon}
              </PanelButton>
            </ButtonRow>
          </Section>

          {multi && (
            <Section label="Align">
              <ButtonRow>
                <PanelButton label="Align left" onClick={() => alignSelected('left')}>{AlignLeftIcon}</PanelButton>
                <PanelButton label="Center horizontally" onClick={() => alignSelected('centerX')}>{CenterHorizontallyIcon}</PanelButton>
                <PanelButton label="Align right" onClick={() => alignSelected('right')}>{AlignRightIcon}</PanelButton>
                {selected.length > 2 && (
                  <PanelButton label="Distribute horizontally" onClick={() => distributeSelected('horizontal')}>
                    {DistributeHorizontallyIcon}
                  </PanelButton>
                )}
                <PanelButton label="Align top" onClick={() => alignSelected('top')}>{AlignTopIcon}</PanelButton>
                <PanelButton label="Center vertically" onClick={() => alignSelected('centerY')}>{CenterVerticallyIcon}</PanelButton>
                <PanelButton label="Align bottom" onClick={() => alignSelected('bottom')}>{AlignBottomIcon}</PanelButton>
                {selected.length > 2 && (
                  <PanelButton label="Distribute vertically" onClick={() => distributeSelected('vertical')}>
                    {DistributeVerticallyIcon}
                  </PanelButton>
                )}
              </ButtonRow>
            </Section>
          )}

          <Section label="Actions">
            <ButtonRow>
              <PanelButton label="Duplicate" onClick={duplicateSelected}>{DuplicateIcon}</PanelButton>
              <PanelButton label="Delete" onClick={() => removeElements(selectedElementIds)}>{TrashIcon}</PanelButton>
              {multi && (
                <PanelButton label="Group" onClick={groupSelected}><GroupIcon theme="light" /></PanelButton>
              )}
              {grouped && (
                <PanelButton label="Ungroup" onClick={ungroupSelected}><UngroupIcon theme="light" /></PanelButton>
              )}
              <PanelButton
                label={locked ? 'Unlock' : 'Lock'}
                active={locked}
                onClick={() => (locked ? unlockSelected() : lockSelected())}
              >
                {locked ? <Lock strokeWidth={1.5} /> : <Unlock strokeWidth={1.5} />}
              </PanelButton>
            </ButtonRow>
          </Section>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label="Shape properties"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
          className={cn(
            // Sits on the row above the bottom toolbar, like Excalidraw's style buttons.
            'toolbar-btn absolute left-4 z-[71] pointer-events-auto [&>svg]:w-4 [&>svg]:h-4',
            'bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+3.25rem)]',
            sheetOpen ? 'toolbar-btn-active' : 'bg-secondary',
          )}
        >
          {paintIcon}
        </button>
        {sheetOpen && (
          <FloatingSurface
            data-snapty-panel
            className="absolute inset-x-4 z-[72] rounded-xl p-3 pointer-events-auto overflow-y-auto panel-scroll max-h-[45dvh] bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+6rem)]"
          >
            {body}
          </FloatingSurface>
        )}
      </>
    );
  }

  // Excalidraw's compact styles panel: an icon column whose first button
  // opens the full set of options beside it.
  if (formFactor === 'compact') {
    return (
      <div className="absolute top-[4.25rem] left-4 z-[60] flex items-start gap-2 pointer-events-none">
        <FloatingSurface data-snapty-panel className="p-2 flex flex-col gap-2 pointer-events-auto">
          {/* Excalidraw leads the column with the current stroke and background. */}
          {keys.includes('strokeColor') && (
            <button type="button" aria-label="Stroke" className="toolbar-btn !w-8 !h-8" onClick={() => { setSheetOpen(!(sheetOpen && only === 'strokeColor')); setOnly('strokeColor'); }}>
              <span className="w-8 h-8 rounded-lg border border-border" style={{ background: strokeColor }} />
            </button>
          )}
          {keys.includes('fillColor') && (
            <button type="button" aria-label="Background" className="toolbar-btn !w-8 !h-8" onClick={() => { setSheetOpen(!(sheetOpen && only === 'fillColor')); setOnly('fillColor'); }}>
              <span
                className="w-8 h-8 rounded-lg border border-border"
                style={fillColor === 'transparent'
                  ? { background: 'repeating-conic-gradient(#e9e9ef 0% 25%, #fff 0% 50%) 50% / 12px 12px' }
                  : { background: fillColor }}
              />
            </button>
          )}
          <button
            type="button"
            aria-label="Shape properties"
            aria-expanded={sheetOpen && !only}
            onClick={() => { setSheetOpen(!(sheetOpen && !only)); setOnly(null); }}
            className={cn('toolbar-btn !w-8 !h-8', sheetOpen && !only && 'toolbar-btn-active')}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 6l8 0M16 6l4 0M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 12l2 0M10 12l10 0M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 18l11 0M19 18l1 0" />
            </svg>
          </button>
          {hasSelection && (
            <>
              <button type="button" aria-label="Duplicate" className="toolbar-btn !w-8 !h-8 [&>svg]:w-4 [&>svg]:h-4" onClick={duplicateSelected}>
                {DuplicateIcon}
              </button>
              <button type="button" aria-label="Delete" className="toolbar-btn !w-8 !h-8 [&>svg]:w-4 [&>svg]:h-4" onClick={() => removeElements(selectedElementIds)}>
                {TrashIcon}
              </button>
            </>
          )}
        </FloatingSurface>
        {sheetOpen && (
          <FloatingSurface className="w-[12.625rem] p-3 pointer-events-auto overflow-y-auto panel-scroll max-h-[calc(100dvh-9rem)]">
            {body}
          </FloatingSurface>
        )}
      </div>
    );
  }

  return (
    <FloatingSurface
      data-snapty-panel
      className="absolute top-[4.75rem] left-4 z-[60] w-[12.625rem] rounded-xl p-3 pointer-events-auto overflow-y-auto panel-scroll max-h-[calc(100dvh-9rem)]"
    >
      {body}
    </FloatingSurface>
  );
}
