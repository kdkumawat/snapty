'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Highlighter, Droplets, ListOrdered, Crop, ScanSearch, ScanText, MessageCircle, Spotlight,
} from '@/components/editor/ui/icons';
import {
  SelectionIcon, RectangleIcon, EllipseIcon, ArrowIcon, LineIcon,
  FreedrawIcon, TextIcon, ImageIcon, EraserIcon, handIcon, drawShapeToolIcon,
} from '@/components/editor/ui/excalidraw-icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { Kbd } from '@/components/editor/ui/kbd';
import { useEditorStore } from '@/store/editor-store';
import { useFormFactor } from '@/hooks/use-form-factor';
import type { ToolType } from '@/types/editor';
import { cn } from '@/lib/utils';
import { TOOL_SHORTCUTS, formatToolKeys, toolDigit } from '@/lib/tool-shortcuts';
import { openOverlayImagePicker } from '@/lib/image-load';

type ToolDef = {
  id: ToolType;
  label: string;
  icon: React.ReactNode;
};

const shortcutById = Object.fromEntries(TOOL_SHORTCUTS.map((t) => [t.id, t]));

const ICON = 'w-4 h-4';
// Excalidraw fills these tools' icons while they are the active tool.
const FILLABLE = new Set(['select', 'rectangle', 'circle']);
/** Sizes an Excalidraw icon element to the toolbar's 20px glyph box. */
const Ex = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex w-4 h-4 [&>svg]:w-full [&>svg]:h-full">{children}</span>
);
// Snapty-only tools have no Excalidraw glyph; lucide at Excalidraw's stroke
// weight keeps them in the same family.
const LUCIDE = { className: ICON, strokeWidth: 1.5 };

// Every tool; the main bar and More menu split them by the saved order.
const allDefs: ToolDef[] = [
  { id: 'select', label: 'Selection', icon: <Ex>{SelectionIcon}</Ex> },
  { id: 'arrow', label: 'Arrow', icon: <Ex>{ArrowIcon}</Ex> },
  { id: 'rectangle', label: 'Rectangle', icon: <Ex>{RectangleIcon}</Ex> },
  { id: 'text', label: 'Text', icon: <Ex>{TextIcon}</Ex> },
  { id: 'step', label: 'Number', icon: <ListOrdered {...LUCIDE} /> },
  { id: 'blur', label: 'Blur', icon: <Droplets {...LUCIDE} /> },
  { id: 'highlighter', label: 'Highlighter', icon: <Highlighter {...LUCIDE} /> },
  { id: 'callout', label: 'Callout', icon: <MessageCircle {...LUCIDE} /> },
  { id: 'crop', label: 'Crop', icon: <Crop {...LUCIDE} /> },

  { id: 'line', label: 'Line', icon: <Ex>{LineIcon}</Ex> },
  { id: 'circle', label: 'Ellipse', icon: <Ex>{EllipseIcon}</Ex> },
  { id: 'pencil', label: 'Draw', icon: <Ex>{FreedrawIcon}</Ex> },
  { id: 'eraser', label: 'Eraser', icon: <Ex>{EraserIcon}</Ex> },
  { id: 'magnifier', label: 'Magnifier', icon: <ScanSearch {...LUCIDE} /> },
  { id: 'spotlight', label: 'Spotlight', icon: <Spotlight {...LUCIDE} /> },
  { id: 'hand', label: 'Hand', icon: <Ex>{handIcon}</Ex> },
];

/** Every tool with its icon (used by the shortcuts dialog). */
export const ALL_TOOLS = allDefs;
const defById = Object.fromEntries(allDefs.map((t) => [t.id, t]));
const DRAG_TYPE = 'text/snapty-tool';

/** Quiet corner hint with the tool's key, as in Excalidraw. */
const KeyHint = ({ id }: { id: ToolType }) => (
  <span aria-hidden className="pointer-events-none absolute bottom-[2px] right-[4px] text-[10px] leading-none font-medium text-muted-foreground opacity-60">
    {shortcutById[id]?.letter}
  </span>
);

/** Native drag and drop is for mouse and pen only; touch keeps plain taps. */
function useCanDrag() {
  const [can, setCan] = React.useState(false);
  React.useEffect(() => { setCan(!window.matchMedia('(pointer: coarse)').matches); }, []);
  return can;
}
const dragProps = (id: ToolType, on: boolean) => on ? {
  draggable: true,
  onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'move'; },
} : {};

/** Pixelate is a mode of Blur (toggled in the panel), so Blur lights for both. */
const isToolActive = (id: ToolType, active: ToolType) =>
  id === active || (id === 'blur' && active === 'pixelate');

function ExtraToolsMenu({ hasImage, items, dropUp, onInsertImage, canDrag, onDropToMore }: { hasImage: boolean; items: ToolDef[]; dropUp: boolean; onInsertImage: () => void; canDrag: boolean; onDropToMore: (id: ToolType) => void }) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const imageLocked = useEditorStore((s) => s.imageLocked);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const activeExtra = items.find((t) => isToolActive(t.id, activeTool));

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

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-foreground hover:bg-secondary';

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onDragOver={canDrag ? (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.stopPropagation(); } } : undefined}
      onDrop={canDrag ? (e) => { const id = e.dataTransfer.getData(DRAG_TYPE) as ToolType; if (id) { e.preventDefault(); e.stopPropagation(); onDropToMore(id); } } : undefined}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn('toolbar-btn', (open || activeExtra) && 'toolbar-btn-active')}
            aria-label="More tools"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={!hasImage}
            onClick={() => setOpen((v) => !v)}
          >
            {/* Like Excalidraw, the trigger shows the active extra tool. */}
            {activeExtra ? activeExtra.icon : <Ex>{drawShapeToolIcon}</Ex>}
            {activeExtra && <KeyHint id={activeExtra.id} />}
          </button>
        </TooltipTrigger>
        {!open && <TooltipContent side="bottom">More tools</TooltipContent>}
      </Tooltip>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-[90] w-44 max-h-[60dvh] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[var(--floating-shadow)]',
            dropUp ? 'bottom-[calc(100%+0.5rem)]' : 'top-[calc(100%+0.5rem)]',
          )}
        >
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={isToolActive(t.id, activeTool)}
              className={cn(item, isToolActive(t.id, activeTool) && 'bg-accent/15')}
              onClick={() => { setActiveTool(t.id); setOpen(false); }}
              {...dragProps(t.id, canDrag)}
            >
              {t.icon}
              <span className="flex-1 text-left">{t.label}</span>
              <Kbd>{shortcutById[t.id]?.letter}</Kbd>
            </button>
          ))}
          <div className="my-1 h-px bg-border" aria-hidden />
          <button type="button" role="menuitem" className={item} disabled={!hasImage || imageLocked} onClick={() => { onInsertImage(); setOpen(false); }}>
            <Ex>{ImageIcon}</Ex>
            <span className="flex-1 text-left">Insert image</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => { window.dispatchEvent(new CustomEvent('snapty-ocr')); setOpen(false); }}
          >
            <ScanText {...LUCIDE} />
            <span className="flex-1 text-left">Extract text</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function FloatingToolbar({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const formFactor = useFormFactor();
  const phone = formFactor === 'phone';
  const mainTools = useEditorStore((s) => s.mainTools);
  const setMainTools = useEditorStore((s) => s.setMainTools);
  const canDrag = useCanDrag() && !phone;
  const [drop, setDrop] = React.useState<{ idx: number; x: number } | null>(null);
  const tools = mainTools.map((id) => defById[id]).filter(Boolean);
  const extraTools = allDefs.filter((t) => !mainTools.includes(t.id));

  const dropIndex = (e: React.DragEvent<HTMLElement>) => {
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-main-tool]'));
    let idx = btns.findIndex((b) => { const r = b.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
    if (idx < 0) idx = btns.length;
    const host = e.currentTarget.getBoundingClientRect();
    const ref = btns[idx] ?? btns[idx - 1];
    const rr = ref?.getBoundingClientRect();
    const x = rr ? (btns[idx] ? rr.left - 2 : rr.right + 2) - host.left : 0;
    return { idx, x };
  };
  const onBarDrop = (e: React.DragEvent<HTMLElement>) => {
    const id = e.dataTransfer.getData(DRAG_TYPE) as ToolType;
    setDrop(null);
    if (!defById[id]) return;
    e.preventDefault();
    const { idx } = dropIndex(e);
    const from = mainTools.indexOf(id);
    const rest = mainTools.filter((t) => t !== id);
    rest.splice(from >= 0 && from < idx ? idx - 1 : idx, 0, id);
    setMainTools(rest);
  };

  const renderTool = (tool: ToolDef) => {
    const drawingDisabled = !hasImage && !['select', 'hand'].includes(tool.id);
    const active = isToolActive(tool.id, activeTool);
    const def = shortcutById[tool.id];

    return (
      <Tooltip key={tool.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-main-tool={tool.id}
            {...dragProps(tool.id, canDrag)}
            className={cn('toolbar-btn shrink-0', active && 'toolbar-btn-active', FILLABLE.has(tool.id) && 'toolbar-btn-fillable')}
            aria-label={tool.label}
            aria-pressed={active}
            disabled={drawingDisabled}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.icon}
            <KeyHint id={tool.id} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{tool.label}</span>
          {def && (
            <span className="flex gap-1">
              {formatToolKeys(def, toolDigit(mainTools, tool.id)).split(' / ').map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  const divider = <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative pointer-events-auto min-w-0',
        embedded ? 'max-w-full' : 'absolute top-3 left-1/2 -translate-x-1/2 z-[80] max-w-[calc(100vw-9.5rem)]',
      )}
    >
      <FloatingSurface
        data-snapty-toolbar
        className="relative rounded-xl p-1 flex items-center gap-1 w-full max-w-full"
        onDragOver={canDrag ? (e: React.DragEvent<HTMLElement>) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          const d = dropIndex(e);
          setDrop((p) => (p && p.idx === d.idx && p.x === d.x ? p : d));
        } : undefined}
        onDragLeave={canDrag ? (e: React.DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null); } : undefined}
        onDrop={canDrag ? onBarDrop : undefined}
        onDragEnd={() => setDrop(null)}
      >
        {drop && <span aria-hidden className="pointer-events-none absolute top-1.5 bottom-1.5 w-0.5 rounded bg-accent" style={{ left: drop.x - 1 }} />}
        {phone ? (
          // Phones: the same tight row as the top bar, scrolling sideways when
          // it runs out of room. The "more tools" button stays outside the
          // scroller so its menu is not clipped.
          <div className="toolbar-scroll flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
            {tools.map(renderTool)}
          </div>
        ) : tools.map(renderTool)}
        {!phone && divider}
        <ExtraToolsMenu
          hasImage={hasImage}
          items={extraTools}
          dropUp={phone}
          onInsertImage={() => openOverlayImagePicker()}
          canDrag={canDrag}
          onDropToMore={(id) => { if (mainTools.length > 1) setMainTools(mainTools.filter((t) => t !== id)); }}
        />
      </FloatingSurface>
    </motion.div>
  );
}

// Excalidraw's hint lines (locales/en.json "hints"), used wherever Snapty has
// the same behaviour; shape tools show none, as in Excalidraw.
const TOOL_TIPS: Record<string, React.ReactNode> = {
  select: <>To move canvas, hold <Kbd>Scroll wheel</Kbd> or <Kbd>Space</Kbd> while dragging, or use the hand tool</>,
  hand: null,
  rectangle: <>Press <Kbd>R</Kbd> again for sharp or round edges</>,
  circle: null,
  arrow: <>Drag for single line. Press <Kbd>A</Kbd> again to change arrow type.</>,
  line: <>Drag for single line</>,
  text: <><Kbd>Enter</Kbd> to finish, <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> or <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> for a new line. Press <Kbd>T</Kbd> again to change font</>,
  pencil: <>Click and drag, release when you&apos;re finished</>,
  highlighter: <>Click and drag, release when you&apos;re finished. Press <Kbd>K</Kbd> again to change colour</>,
  eraser: <>Hold <Kbd>Alt</Kbd> to revert the elements marked for deletion</>,
  blur: <>Drag a region to blur. Press <Kbd>B</Kbd> again for pixelate</>,
  pixelate: <>Drag a region to pixelate. Press <Kbd>B</Kbd> again for blur</>,
  crop: <>Drag a region to crop the image</>,
  step: <>Click to place a number, letter or stamp. Press <Kbd>N</Kbd> again to change style</>,
  magnifier: <>Drag over a detail to magnify it</>,
  spotlight: <>Drag a region to keep lit; everything else is dimmed</>,
  callout: <>Press on what to point at, drag to place the bubble</>,
};

export function ToolbarTips() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const hasImage = useEditorStore((s) => s.backgroundImage !== null);
  const modalOpen = useEditorStore((s) =>
    s.showHelpDialog || s.showExportDialog || s.showCommandPalette,
  );

  const phone = useFormFactor() === 'phone';
  // What is selected changes the hint, as in Excalidraw.
  const selKind = useEditorStore((s) => {
    if (s.activeTool !== 'select' || s.selectedElementIds.length !== 1) return s.selectedElementIds.length > 1 ? 'multi' : 'none';
    const el = s.elements.find((x) => x.id === s.selectedElementIds[0]);
    if (!el) return 'none';
    if (el.type === 'text') return 'text';
    const labelled = s.elements.some((t) => t.type === 'text' && t.id !== el.id && !!el.groupId && t.groupId === el.groupId);
    return ['rectangle', 'circle', 'arrow', 'line', 'magnifier', 'callout'].includes(el.type) && !labelled ? 'bindable' : 'other';
  });
  const tipKey = `${activeTool}-${selKind}-${hasImage ? 'img' : 'noimg'}`;
  const tip = React.useMemo<React.ReactNode>(() => {
    if (!hasImage) return 'Open, paste, or drop an image to start annotating';
    if (activeTool === 'select') {
      if (selKind === 'text') return <>Double-click or press <Kbd>Enter</Kbd> to edit text; <Kbd>Enter</Kbd> finishes, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> adds a line</>;
      if (selKind === 'bindable') return <><Kbd>Enter</Kbd> to add text; <Kbd>Enter</Kbd> finishes, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> adds a line</>;
      if (selKind !== 'none') return null;
    }
    return TOOL_TIPS[activeTool] ?? null;
  }, [activeTool, hasImage, selKind]);

  if (modalOpen || phone || !tip) return null;

  return (
    <>
      {/* Screen-reader live region: mirror the visible tip so assistive tech
          announces the current tool and how to use it. The element is always
          in the DOM (a polite live region needs a stable node) and the text
          is flattened to a string so it announces cleanly. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {flattenTip(tip)}
      </div>
      <div className="absolute top-[4.25rem] left-1/2 -translate-x-1/2 z-[40] pointer-events-none w-max max-w-[min(36rem,calc(100vw-2rem))] px-2">
        <motion.p
          key={tipKey}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="text-center text-[0.75rem] text-muted-foreground py-0.5 leading-snug"
        >
          {tip}
        </motion.p>
      </div>
    </>
  );
}

/**
 * Walk the React node tree and collect plain text so the live region announces
 * something like "Drag to draw. A cycles stroke style." instead of "[object]".
 */
function flattenTip(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenTip).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return flattenTip(props.children);
  }
  return '';
}
