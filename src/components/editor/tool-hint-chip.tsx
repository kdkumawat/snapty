'use client';

import React from 'react';
import {
  sharpArrowIcon, roundArrowIcon, elbowArrowIcon, EdgeSharpIcon, EdgeRoundIcon,
  FreedrawIcon, FontFamilyNormalIcon, FontFamilyCodeIcon,
} from '@/components/editor/ui/excalidraw-icons';
import { Droplets, Grid3x3 } from '@/components/editor/ui/icons';
import { COLOR_PALETTE, parseStepStyle, stepStyleLabel } from '@/types/editor';

const glyph = (g: string) => <b className="text-[0.7rem]">{g}</b>;
const dot = (c: string) => <span className="inline-block h-4 w-4 rounded-full border border-border" style={{ background: c }} />;
const HUES = ['red', 'yellow', 'green', 'blue'] as const;

/** The icon and name the options panel uses for what a re-pressed shortcut just changed. */
function describe(kind: string, value: string): [React.ReactNode, string] | null {
  switch (kind) {
    case 'arrowPath':
      return ({ straight: [sharpArrowIcon, 'Sharp arrow'], curved: [roundArrowIcon, 'Curved arrow'], elbow: [elbowArrowIcon, 'Elbow arrow'] } as Record<string, [React.ReactNode, string]>)[value] ?? null;
    case 'stepStyle': {
      const { finger, count } = parseStepStyle(value);
      return [glyph(`${count === 'letter' ? 'A' : count ? '1' : ''}${finger}`), stepStyleLabel(value)];
    }
    case 'blurMode':
      return value === 'blur' ? [<Droplets key="i" strokeWidth={1.5} />, 'Blur'] : [<Grid3x3 key="i" strokeWidth={1.5} />, 'Pixelate'];
    case 'edges':
      return value === 'round' ? [EdgeRoundIcon, 'Round edges'] : [EdgeSharpIcon, 'Sharp edges'];
    case 'font':
      return ({ hand: [FreedrawIcon, 'Hand-drawn'], normal: [FontFamilyNormalIcon, 'Normal'], code: [FontFamilyCodeIcon, 'Code'] } as Record<string, [React.ReactNode, string]>)[value] ?? null;
    case 'hlColor': {
      const name = value === COLOR_PALETTE.black ? 'Black' : value === COLOR_PALETTE.white ? 'White'
        : HUES.map((h) => [h, COLOR_PALETTE[h]] as const).find(([, v]) => (v as readonly string[]).includes(value))?.[0];
      return [dot(value), name ? name[0].toUpperCase() + name.slice(1) : value];
    }
  }
  return null;
}

/**
 * A small chip by the mouse that names the option a shortcut re-press changed.
 * The pointer lives in a ref and, while the chip shows, the passive pointermove
 * listener moves it directly: nothing renders per move.
 */
export default function ToolHintChip() {
  const pointer = React.useRef({ x: 0, y: 0 });
  const ref = React.useRef<HTMLDivElement>(null);
  const visible = React.useRef(false);
  const [hint, setHint] = React.useState<{ n: number; kind: string; value: string } | null>(null);

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = pointer.current;
    el.style.transform = `translate(${Math.min(x + 16, window.innerWidth - el.offsetWidth - 8)}px, ${Math.min(y + 18, window.innerHeight - 48)}px)`;
  }, []);

  React.useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (visible.current) place();
    };
    let n = 0;
    const show = (e: Event) => {
      const { kind, value } = (e as CustomEvent<{ kind: string; value: string }>).detail;
      setHint({ n: ++n, kind, value });
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('snapty-tool-hint', show);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('snapty-tool-hint', show);
    };
  }, [place]);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!hint || !el) return;
    visible.current = true;
    place();
    const a = el.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
      { duration: 900, fill: 'forwards' },
    );
    a.onfinish = () => { visible.current = false; };
    return () => { a.cancel(); visible.current = false; };
  }, [hint, place]);

  const shown = hint && describe(hint.kind, hint.value);
  if (!shown) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[250] flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.8125rem] font-medium text-foreground shadow-[var(--floating-shadow)] [&_svg]:h-4 [&_svg]:w-4"
      style={{ opacity: 0 }}
    >
      <span className="inline-flex items-center text-accent">{shown[0]}</span>
      {shown[1]}
    </div>
  );
}
