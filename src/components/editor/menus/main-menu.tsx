'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import {
  Info, ShieldCheck, RotateCcw,
} from '@/components/editor/ui/icons';
import { Switch } from '@/components/ui/switch';
import { Kbd } from '@/components/editor/ui/kbd';
import ThemeToggle, { nextTheme } from '@/components/theme-toggle';
import {
  HamburgerMenuIcon, LoadIcon, HelpIcon, TrashIcon, searchIcon,
} from '@/components/editor/ui/excalidraw-icons';
import { useEditorStore } from '@/store/editor-store';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { readAnalyticsConsent, setAnalyticsConsent } from '@/components/google-analytics';
import { isRecoveryPromptEnabled, setRecoveryPromptEnabled } from '@/lib/editor/autosave';
import { cn } from '@/lib/utils';

const ICON = 'inline-flex w-4 h-4 shrink-0 [&>svg]:w-full [&>svg]:h-full';
const LUCIDE = { className: 'w-4 h-4 shrink-0', strokeWidth: 1.5 };

function Item({
  icon, label, shortcut, onSelect, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 h-8 text-[0.8125rem] text-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none"
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
}

function Toggle({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg px-2.5 h-8 text-[0.8125rem] hover:bg-secondary cursor-pointer">
      <span className="truncate">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </label>
  );
}

const Divider = () => <div className="my-1.5 h-px bg-border" aria-hidden />;

/**
 * Excalidraw's main menu: a hamburger in the top-left corner holding file
 * actions, help, canvas preferences and the theme. It replaces the old
 * settings sidebar; image styling (padding, background, frame) lives in the
 * export dialog instead.
 */
export default function MainMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const gridEnabled = useEditorStore((s) => s.canvasStyle.gridEnabled);
  const setCanvasStyle = useEditorStore((s) => s.setCanvasStyle);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const setImageLocked = useEditorStore((s) => s.setImageLocked);
  const setShowHelpDialog = useEditorStore((s) => s.setShowHelpDialog);
  const setShowCommandPalette = useEditorStore((s) => s.setShowCommandPalette);
  const setInfoDialog = useEditorStore((s) => s.setInfoDialog);
  const resetToolSettings = useEditorStore((s) => s.resetToolSettings);
  const [analyticsOn, setAnalyticsOn] = React.useState(() => readAnalyticsConsent());
  const [recoveryPrompt, setRecoveryPrompt] = React.useState(() => isRecoveryPromptEnabled());
  const { theme, setTheme } = useTheme();
  React.useEffect(() => {
    const toggle = () => setTheme(nextTheme(theme)); // Alt+Shift+D cycles System, Dark, Light
    window.addEventListener('snapty-toggle-theme', toggle);
    return () => window.removeEventListener('snapty-toggle-theme', toggle);
  }, [theme, setTheme]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  const emit = (name: string) => run(() => window.dispatchEvent(new CustomEvent(name)));

  return (
    <div ref={ref} className="relative pointer-events-auto">
      {/* Excalidraw's trigger is a flat grey button, not an island. */}
      <div>
        <button
          type="button"
          className={cn('toolbar-btn', open && 'toolbar-btn-active')}
          style={open ? undefined : { background: 'var(--secondary)' }}
          aria-label="Main menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="inline-flex w-4 h-4 [&>svg]:w-full [&>svg]:h-full">{HamburgerMenuIcon}</span>
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[120] w-60 max-h-[calc(100dvh-6rem)] overflow-y-auto panel-scroll rounded-xl border border-border bg-surface p-1.5 shadow-[var(--floating-shadow)]"
        >
          <Item
            icon={<span className={ICON}>{LoadIcon}</span>}
            label="Open"
            shortcut={`${modKey}+O`}
            onSelect={emit('snapty-open-file')}
          />
          <Item
            icon={<span className={ICON}>{searchIcon}</span>}
            label="Command palette"
            shortcut={`${modKey}+K`}
            onSelect={run(() => setShowCommandPalette(true))}
          />
          <Item
            icon={<span className={ICON}>{HelpIcon}</span>}
            label="Help"
            shortcut="?"
            onSelect={run(() => setShowHelpDialog(true))}
          />
          <Item
            icon={<span className={ICON}>{TrashIcon}</span>}
            label="Close image"
            shortcut={`${modKey}+Shift+X`}
            disabled={!hasImage}
            onSelect={emit('snapty-clear')}
          />

          <Divider />

          <Toggle label="Dot grid" checked={gridEnabled} onChange={(v) => setCanvasStyle({ gridEnabled: v })} />
          <Toggle label="Lock image" checked={imageLocked} onChange={setImageLocked} />
          <Toggle
            label="Recovery prompt"
            checked={recoveryPrompt}
            onChange={(v) => { setRecoveryPrompt(v); setRecoveryPromptEnabled(v); }}
          />
          <Toggle
            label="Usage analytics"
            checked={analyticsOn}
            onChange={(v) => { setAnalyticsOn(v); setAnalyticsConsent(v); }}
          />
          <Item
            icon={<RotateCcw {...LUCIDE} />}
            label="Reset tool defaults"
            onSelect={run(resetToolSettings)}
          />

          <Divider />

          <Item icon={<Info {...LUCIDE} />} label="About" onSelect={run(() => setInfoDialog('about'))} />
          <Item icon={<ShieldCheck {...LUCIDE} />} label="Privacy" onSelect={run(() => setInfoDialog('privacy'))} />

          <Divider />

          <div className="px-1 pb-1">
            <p className="px-1.5 pb-1.5 text-[0.75rem] text-muted-foreground">Theme</p>
            <ThemeToggle showName className="theme-menu-btn" />
          </div>
        </div>
      )}
    </div>
  );
}
