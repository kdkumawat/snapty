'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Copy, Lock, Unlock, PanelLeftOpen } from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { SETTING_SPECS, settingRailLabel } from '@/lib/editor/tool-settings';
import type { SettingKey } from '@/lib/editor/tool-settings';
import {
  SettingControl, SettingValueBadge, SettingMeter, SettingRailPreview, settingValueLabel,
} from '@/components/editor/panels/setting-controls';
import { useToolSettingsPanel } from '@/hooks/use-tool-settings-panel';
import { cn } from '@/lib/utils';

type SettingsRailProps = {
  /** Desktop: expand to the full settings panel */
  onExpandPanel?: () => void;
  className?: string;
};

const RAIL_BTN =
  'w-11 min-h-[2.75rem] rounded-xl inline-flex flex-col items-center justify-center gap-0.5 shrink-0 transition-colors px-0.5';

function SettingPopover({
  settingKey,
  anchorRect,
  onClose,
}: {
  settingKey: SettingKey;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const spec = SETTING_SPECS[settingKey];
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 280));
  const left = anchorRect.right + 8;
  const fitsRight = left + 260 < window.innerWidth - 8;
  const style: React.CSSProperties = fitsRight
    ? { position: 'fixed', top, left, zIndex: 300 }
    : { position: 'fixed', top, right: 8, left: 'auto', zIndex: 300 };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={spec.label}
      style={style}
      className={cn(
        'rounded-xl border border-border bg-surface p-3 shadow-[var(--floating-shadow)]',
        spec.kind === 'slider'
          ? 'flex flex-col items-center gap-2 w-auto'
          : 'w-[min(16rem,calc(100vw-2rem))] space-y-2',
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {spec.kind === 'slider' ? (
        <>
          <SettingValueBadge spec={spec} />
          <SettingMeter spec={spec} />
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{spec.label}</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {spec.label}
            </p>
            <SettingValueBadge spec={spec} />
          </div>
          <SettingControl spec={spec} />
        </>
      )}
    </div>,
    document.body,
  );
}

/** Compact icon rail — first control expands to the full panel on desktop. */
export default function SettingsRail({ onExpandPanel, className }: SettingsRailProps) {
  const {
    selectedElementIds, selected, keys, visible, locked, label,
  } = useToolSettingsPanel();
  const store = useEditorStore();
  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);

  const [open, setOpen] = React.useState<SettingKey | null>(null);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const btnRefs = React.useRef<Partial<Record<SettingKey, HTMLButtonElement>>>({});

  React.useEffect(() => {
    if (open && !keys.includes(open)) setOpen(null);
  }, [keys, open]);

  if (!visible) return null;

  const openSetting = (key: SettingKey) => {
    const btn = btnRefs.current[key];
    if (!btn) return;
    setAnchorRect(btn.getBoundingClientRect());
    setOpen((prev) => (prev === key ? null : key));
  };

  const renderSettingBtn = (key: SettingKey) => {
    const spec = SETTING_SPECS[key];
    const isOpen = open === key;
    const valueLabel = settingValueLabel(key, store);

    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>
          <button
            ref={(el) => { if (el) btnRefs.current[key] = el; }}
            type="button"
            aria-label={`${spec.label}${valueLabel ? `: ${valueLabel}` : ''}`}
            aria-expanded={isOpen}
            onClick={() => openSetting(key)}
            className={cn(
              RAIL_BTN,
              isOpen
                ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <SettingRailPreview settingKey={key} />
            <span className="text-[7px] leading-none uppercase tracking-wide opacity-60 max-w-[2.5rem] truncate">
              {settingRailLabel(key)}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[11rem]">
          <p className="font-medium text-xs">{spec.label}</p>
          {valueLabel && (
            <p className="text-[10px] text-muted-foreground capitalize">{valueLabel}</p>
          )}
          <p className="text-[9px] text-muted-foreground/80 mt-0.5">Click to adjust</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <div className={className}>
        <FloatingSurface className="rounded-2xl p-1 flex flex-col gap-0.5 max-h-[inherit] overflow-visible">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground truncate px-1.5 pt-1 pb-0.5 shrink-0">
            {label}
          </p>

          <div className="flex flex-col gap-0.5 max-h-[calc(100dvh-11rem)] overflow-y-auto scrollbar-none">
            {onExpandPanel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Expand full settings panel"
                    onClick={onExpandPanel}
                    className={cn(RAIL_BTN, 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand panel</TooltipContent>
              </Tooltip>
            )}

            {keys.map(renderSettingBtn)}

            {selected.length > 0 && (
              <>
                <div className="h-px mx-1.5 bg-border shrink-0" aria-hidden />
                {[
                  { label: 'Duplicate', icon: Copy, onClick: duplicateSelected },
                  {
                    label: locked ? 'Unlock' : 'Lock',
                    icon: locked ? Unlock : Lock,
                    onClick: () => (locked ? unlockSelected() : lockSelected()),
                  },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    onClick: () => removeElements(selectedElementIds),
                  },
                ].map(({ label: actionLabel, icon: Icon, onClick }) => (
                  <Tooltip key={actionLabel}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={actionLabel}
                        onClick={onClick}
                        className={cn(RAIL_BTN, 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{actionLabel}</TooltipContent>
                  </Tooltip>
                ))}
              </>
            )}
          </div>
        </FloatingSurface>
      </div>

      {open && anchorRect && (
        <SettingPopover
          settingKey={open}
          anchorRect={anchorRect}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
