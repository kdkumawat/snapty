'use client';

import React from 'react';
import { Droplets, Grid3x3, Lock, Unlock, X } from '@/components/editor/ui/icons';
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
  // Compact layout: the one panel can fold into a single button.
  const [folded, setFolded] = React.useState(false);
  const { selectedElementIds, selected, keys, visible, locked } = useToolSettingsPanel();

  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const setBlurMode = useEditorStore((s) => s.setBlurMode);
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
  const blurSel = selected.filter((el) => el.type === 'blur' || el.type === 'pixelate');
  const blurTool = activeTool === 'blur' || activeTool === 'pixelate' || blurSel.length > 0;
  // Selected regions decide what Mode shows ('mixed' lights neither); otherwise the tool does.
  const mode = blurSel.length
    ? (blurSel.every((el) => el.type === blurSel[0].type) ? blurSel[0].type : 'mixed')
    : activeTool;

  const body = (
    <div className="flex flex-col gap-3">
      {blurTool && (
        <Section label="Mode">
          <ButtonRow>
            <PanelButton label="Blur" active={mode === 'blur'} onClick={() => setBlurMode('blur')}>
              <Droplets strokeWidth={1.5} />
            </PanelButton>
            <PanelButton label="Pixelate" active={mode === 'pixelate'} onClick={() => setBlurMode('pixelate')}>
              <Grid3x3 strokeWidth={1.5} />
            </PanelButton>
          </ButtonRow>
        </Section>
      )}

      {keys.map((key) => (
        <Section key={key} label={SETTING_SPECS[key].label}>
          <SettingControl spec={SETTING_SPECS[key]} />
        </Section>
      ))}

      {hasSelection && (
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

  // Compact windows: the same single panel, with a corner control that folds
  // it into one button (options icon plus the current colours).
  if (formFactor === 'compact' && folded) {
    return (
      <button
        type="button"
        aria-label="Show tool options"
        aria-expanded={false}
        onClick={() => setFolded(false)}
        className="floating-surface absolute top-[4.75rem] left-4 z-[60] pointer-events-auto rounded-xl p-2 flex items-center gap-2 text-foreground"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 6l8 0M16 6l4 0M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 12l2 0M10 12l10 0M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 18l11 0M19 18l1 0" />
        </svg>
        {keys.includes('strokeColor') && <span className="w-5 h-5 rounded-md border border-border" style={{ background: strokeColor }} />}
        {keys.includes('fillColor') && (
          <span
            className="w-5 h-5 rounded-md border border-border"
            style={fillColor === 'transparent'
              ? { background: 'repeating-conic-gradient(#e9e9ef 0% 25%, #fff 0% 50%) 50% / 8px 8px' }
              : { background: fillColor }}
          />
        )}
      </button>
    );
  }

  return (
    <FloatingSurface
      data-snapty-panel
      className="absolute top-[4.75rem] left-4 z-[60] w-[12.625rem] rounded-xl p-3 pointer-events-auto overflow-y-auto panel-scroll max-h-[calc(100dvh-9rem)]"
    >
      {formFactor === 'compact' && (
        <div className="-mt-1 mb-2 flex items-center justify-between">
          <span className="text-[0.75rem] text-muted-foreground">Options</span>
          <button
            type="button"
            aria-label="Hide tool options"
            aria-expanded
            onClick={() => setFolded(true)}
            className="w-6 h-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {body}
    </FloatingSurface>
  );
}
