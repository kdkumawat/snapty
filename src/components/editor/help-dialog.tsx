'use client';

import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { modKey } from '@/hooks/use-keyboard-shortcuts';
import { TOOL_SHORTCUTS } from '@/lib/tool-shortcuts';
import { ALL_TOOLS } from '@/components/editor/toolbar/floating-toolbar';
import { Kbd } from '@/components/editor/ui/kbd';
import { Search } from '@/components/editor/ui/icons';
import { cn } from '@/lib/utils';

// Each alternative is a space-separated key combo; "Mod" is Ctrl or Cmd.
type Row = { name: string; hint?: string; keys: string[]; icon?: React.ReactNode };
type Section = { title: string; rows: Row[] };

const toolIcon = Object.fromEntries(ALL_TOOLS.map((t) => [t.id, t.icon]));

// Ordered by how often a screenshot annotator reaches for them. Tool rows come
// from the shared tool list, so they cannot drift from the toolbar.
const SECTIONS: Section[] = [
  {
    title: 'Tools',
    rows: TOOL_SHORTCUTS.map((t) => ({
      name: t.label,
      hint: t.hint,
      keys: t.digit ? [t.letter, t.digit] : [t.letter],
      icon: toolIcon[t.id],
    })),
  },
  {
    title: 'Drawing',
    rows: [
      { name: 'Constrain', hint: 'Square or circle, or lock a line to 15° steps', keys: ['Shift'] },
      { name: 'From center', hint: 'Draw outward from where you start', keys: ['Alt'] },
      { name: 'Skip binding', hint: 'Hold to keep an arrow from attaching to shapes', keys: ['Mod'] },
      { name: 'Arrow type', hint: 'With the Arrow tool: straight, curved, elbow', keys: ['A'] },
      { name: 'Restore erased', hint: 'With the Eraser: hold to un-mark shapes', keys: ['Alt'] },
      { name: 'Restart numbering', hint: 'The next Number is 1', keys: ['Mod Shift 0'] },
    ],
  },
  {
    title: 'Text',
    rows: [
      { name: 'Add or edit text', hint: 'On a selected shape or text', keys: ['Enter'] },
      { name: 'Add text', hint: 'Double-click the canvas or a shape', keys: ['Double-click'] },
      { name: 'Finish typing', hint: 'Keeps what you typed', keys: ['Enter', 'Esc'] },
      { name: 'New line', keys: ['Shift Enter', 'Mod Enter'] },
    ],
  },
  {
    title: 'Selection and editing',
    rows: [
      { name: 'Undo', keys: ['Mod Z'] },
      { name: 'Redo', keys: ['Mod Shift Z', 'Mod Y'] },
      { name: 'Delete', hint: 'Remove the selection', keys: ['Delete', 'Backspace'] },
      { name: 'Select all', keys: ['Mod A'] },
      { name: 'Invert selection', keys: ['Mod Shift A'] },
      { name: 'Select next', hint: 'Cycle through annotations', keys: ['Tab', 'Shift Tab'] },
      { name: 'Add to selection', keys: ['Shift Click'] },
      { name: 'Deselect', hint: 'Also returns to the Selection tool', keys: ['Esc'] },
      { name: 'Nudge', hint: '1px, or 10px with Shift', keys: ['Arrows', 'Shift Arrows'] },
      { name: 'Copy', hint: 'The selection, or the whole image when nothing is selected', keys: ['Mod C'] },
      { name: 'Cut', keys: ['Mod X'] },
      { name: 'Paste', hint: 'Annotations, or an image from the clipboard', keys: ['Mod V'] },
      { name: 'Duplicate', keys: ['Mod D', 'Alt Drag'] },
      { name: 'Duplicate in place', keys: ['Mod Shift D'] },
      { name: 'Copy style', keys: ['Mod Alt C'] },
      { name: 'Paste style', keys: ['Mod Alt V'] },
      { name: 'Clear drawings', hint: 'Removes every annotation, undo brings them back', keys: ['Mod Shift Backspace'] },
    ],
  },
  {
    title: 'Arrange',
    rows: [
      { name: 'Group', keys: ['Mod G'] },
      { name: 'Ungroup', keys: ['Mod Shift G'] },
      { name: 'Bring forward', keys: [']'] },
      { name: 'Send backward', keys: ['['] },
      { name: 'Flip horizontal', keys: ['Shift H'] },
      { name: 'Flip vertical', keys: ['Shift V'] },
    ],
  },
  {
    title: 'View',
    rows: [
      { name: 'Pan', hint: 'Hold to use the hand, release to go back', keys: ['Space'] },
      { name: 'Fit to screen', keys: ['Mod 0'] },
      { name: 'Actual size', hint: 'Zoom to 100%', keys: ['Mod 1'] },
      { name: 'Zoom to selection', keys: ['Mod 2'] },
      { name: 'Zoom in', keys: ['Mod +'] },
      { name: 'Zoom out', keys: ['Mod -'] },
    ],
  },
  {
    title: 'File and export',
    rows: [
      { name: 'Open image', keys: ['Mod O'] },
      { name: 'Download', hint: 'Opens the download options', keys: ['Mod E'] },
      { name: 'Save project', hint: 'A .snapty file you can reopen', keys: ['Mod S'] },
      { name: 'Capture screen', hint: 'Grab a window or display', keys: ['Mod Shift S'] },
      { name: 'Close image', hint: 'Removes the image and its drawings, undo brings them back', keys: ['Mod Shift X'] },
    ],
  },
  {
    title: 'App',
    rows: [
      { name: 'Command palette', keys: ['Mod K'] },
      { name: 'Keyboard shortcuts', keys: ['?'] },
      { name: 'Toggle dark mode', keys: ['Alt Shift D'] },
    ],
  },
];

const tokens = (alt: string) => alt.split(' ').map((k) => (k === 'Mod' ? modKey : k));
const aliases: Record<string, string> = { ctrl: modKey.toLowerCase(), cmd: modKey.toLowerCase(), command: modKey.toLowerCase(), control: modKey.toLowerCase() };

// Words match the name or hint anywhere; a single character must be a whole
// key, so "z" finds Undo but not every row containing the letter.
function matches(row: Row, query: string) {
  const text = `${row.name} ${row.hint ?? ''}`.toLowerCase();
  const keys = row.keys.map((a) => tokens(a).map((k) => k.toLowerCase()));
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((raw) => {
    const w = aliases[raw] ?? raw;
    return w.length > 1
      ? text.includes(w) || keys.some((a) => a.some((k) => k.includes(w)))
      : keys.some((a) => a.includes(w));
  });
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap justify-end items-center gap-x-1.5 gap-y-1 shrink-0 max-w-[55%]">
      {keys.map((alt, i) => (
        <React.Fragment key={alt}>
          {i > 0 && <span className="text-xs text-muted-foreground">or</span>}
          <span className="inline-flex gap-1">
            {tokens(alt).map((k, j) => <Kbd key={j} className="!text-foreground">{k}</Kbd>)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

export default function HelpDialog() {
  const show = useEditorStore((s) => s.showHelpDialog);
  const setShow = useEditorStore((s) => s.setShowHelpDialog);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const sections = SECTIONS
    .map((s) => ({ ...s, rows: s.rows.filter((r) => matches(r, query)) }))
    .filter((s) => s.rows.length);

  return (
    <Dialog open={show} onOpenChange={(v) => { setShow(v); if (!v) setQuery(''); }}>
      <DialogContent
        showCloseButton
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
        // Escape clears the search first, then closes.
        onEscapeKeyDown={(e) => { if (query) { e.preventDefault(); setQuery(''); } }}
        className={cn(
          'bg-surface border-border text-foreground p-0 gap-0 overflow-hidden flex flex-col rounded-[8px] shadow-[var(--floating-shadow)]',
          'w-[min(46rem,calc(100vw-1.5rem))] max-w-none sm:max-w-none',
          'top-[max(1rem,4vh)] translate-y-0 max-h-[min(90dvh,48rem)]',
          'max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:w-full max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none',
        )}
      >
        <div className="shrink-0 border-b border-border">
          <DialogTitle className="px-4 pt-3.5 pb-1 text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <div className="flex items-center gap-2 px-4">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search shortcuts"
              placeholder="Search by name or key"
              className="w-full h-10 text-sm bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
          {sections.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No shortcuts match &ldquo;{query}&rdquo;</p>
          ) : (
            <div className={cn(!query && 'sm:columns-2 sm:gap-8')}>
              {sections.map((s) => (
                <section key={s.title} className="mb-4">
                  {s.rows.map((r, i) => (
                    // The heading rides inside the first row's unbreakable block,
                    // so a column never ends on a heading with its rows overleaf.
                    <div key={r.name} className="break-inside-avoid">
                    {i === 0 && <h3 className="py-1 text-xs font-medium text-muted-foreground">{s.title}</h3>}
                    <div className="flex items-start justify-between gap-3 py-1.5">
                      <div className="flex items-start gap-2 min-w-0">
                        {r.icon && <span className="mt-0.5 text-muted-foreground shrink-0">{r.icon}</span>}
                        <div className="min-w-0">
                          <p className="text-sm text-foreground leading-tight">{r.name}</p>
                          {r.hint && <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{r.hint}</p>}
                        </div>
                      </div>
                      <Keys keys={r.keys} />
                    </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
