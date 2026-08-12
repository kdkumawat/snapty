'use client';

import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { TOOL_SHORTCUTS, formatToolKeys } from '@/lib/tool-shortcuts';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

const M = modKey;

type Row = { keys: string; name: string; hint: string };

const GENERAL: Row[] = [
  { keys: 'Space', name: 'Pan (hold)', hint: 'Temporary hand tool' },
  { keys: 'Esc', name: 'Back to selection', hint: 'Clear selection and exit tools' },
  { keys: '?', name: 'Shortcuts', hint: 'Open this panel' },
  { keys: `${M}+K`, name: 'Command palette', hint: 'Search tools and actions' },
  { keys: `${M}+Z`, name: 'Undo', hint: 'Undo last change' },
  { keys: `${M}+Shift+Z`, name: 'Redo', hint: 'Redo last undo' },
  { keys: 'Delete', name: 'Delete selected', hint: 'Remove selection' },
  { keys: 'Arrows', name: 'Nudge', hint: 'Move 1px (Shift moves 10px)' },
  { keys: `${M}+A`, name: 'Select all', hint: 'Select every annotation' },
  { keys: `${M}+D`, name: 'Duplicate', hint: 'Clone selection' },
  { keys: `${M}+G`, name: 'Group', hint: 'Group selection' },
  { keys: `${M}+Shift+G`, name: 'Ungroup', hint: 'Ungroup selection' },
  { keys: `${M}+C`, name: 'Copy image', hint: 'Copy canvas to clipboard' },
  { keys: `${M}+V`, name: 'Paste image', hint: 'Paste a screenshot' },
  { keys: `${M}+O`, name: 'Open file', hint: 'Browse a local image' },
  { keys: `${M}+E`, name: 'Export', hint: 'Open export dialog' },
  { keys: `${M}+Shift+S`, name: 'Capture screen', hint: 'Grab a window or display' },
  { keys: `${M}+0`, name: 'Fit to screen', hint: 'Fit image in view' },
  { keys: `${M}+1`, name: 'Actual size', hint: 'Zoom to 100%' },
  { keys: 'Shift', name: 'Constrain', hint: 'Square or snap angles' },
  { keys: 'Alt', name: 'From center', hint: 'Draw from center' },
];

function ShortcutRow({ keys, name, hint }: Row) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 px-1 rounded-lg hover:bg-secondary/40 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[9rem]">
        {keys.split(' / ').map((k) => (
          <kbd key={k} className="snapty-kbd">{k}</kbd>
        ))}
      </div>
    </div>
  );
}

export default function HelpDialog() {
  const show = useEditorStore((s) => s.showHelpDialog);
  const setShow = useEditorStore((s) => s.setShowHelpDialog);

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent
        showCloseButton
        className={cn(
          'bg-surface border-border text-foreground p-0 gap-0 overflow-hidden',
          'w-[min(40rem,calc(100vw-1.5rem))] max-w-none',
          'top-[max(1rem,4vh)] translate-y-0',
          'max-h-[min(90dvh,44rem)] flex flex-col shadow-2xl',
        )}
      >
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-surface">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl bg-accent/12 text-accent flex items-center justify-center">
              <Keyboard className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Keyboard shortcuts
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Letters and number keys both select tools
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tools
              </h3>
              <div className="divide-y divide-border/60">
                {TOOL_SHORTCUTS.map((t) => (
                  <ShortcutRow
                    key={t.id}
                    keys={formatToolKeys(t)}
                    name={t.label}
                    hint={t.hint}
                  />
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                General
              </h3>
              <div className="divide-y divide-border/60">
                {GENERAL.map((row) => (
                  <ShortcutRow key={row.keys + row.name} {...row} />
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-border bg-secondary/30">
          <p className="text-[11px] text-muted-foreground text-center">
            All processing stays in your browser. Nothing is uploaded.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
