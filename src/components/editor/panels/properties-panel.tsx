'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Copy, Lock, Unlock,
  ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown,
  Minus,
} from 'lucide-react';
import { FloatingSurface } from '@/components/editor/ui/floating-surface';
import { ColorSwatch } from '@/components/editor/ui/color-swatch';
import { IconButton } from '@/components/editor/ui/icon-button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';
import { DEFAULT_COLORS, ROUGHNESS_PRESETS, HANDWRITTEN_FONT } from '@/types/editor';
import type { FillStyle, StrokeStyle, RoughnessPreset } from '@/types/editor';
import { copyStyleToClipboard, hasClipboardStyle, getClipboardStyle } from '@/lib/editor/clipboard-style';
import { toastSuccess } from '@/lib/app-toast';
import { cn } from '@/lib/utils';

function IconToggle({
  active, onClick, label, children,
}: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'w-9 h-9 rounded-lg inline-flex items-center justify-center transition-colors',
            active ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function FloatingPropertiesPanel() {
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const elements = useEditorStore((s) => s.elements);
  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const opacity = useEditorStore((s) => s.opacity);
  const cornerRadius = useEditorStore((s) => s.cornerRadius);
  const fontSize = useEditorStore((s) => s.fontSize);
  const strokeStyle = useEditorStore((s) => s.strokeStyle);
  const fillStyle = useEditorStore((s) => s.fillStyle);
  const roughness = useEditorStore((s) => s.roughness);
  const endArrowhead = useEditorStore((s) => s.endArrowhead);
  const startArrowhead = useEditorStore((s) => s.startArrowhead);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const setStrokeColor = useEditorStore((s) => s.setStrokeColor);
  const setFillColor = useEditorStore((s) => s.setFillColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setOpacity = useEditorStore((s) => s.setOpacity);
  const setCornerRadius = useEditorStore((s) => s.setCornerRadius);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const setStrokeStyle = useEditorStore((s) => s.setStrokeStyle);
  const setFillStyle = useEditorStore((s) => s.setFillStyle);
  const setRoughness = useEditorStore((s) => s.setRoughness);
  const setEndArrowhead = useEditorStore((s) => s.setEndArrowhead);
  const setStartArrowhead = useEditorStore((s) => s.setStartArrowhead);
  const setHandDrawn = useEditorStore((s) => s.setHandDrawn);
  const removeElements = useEditorStore((s) => s.removeElements);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const lockSelected = useEditorStore((s) => s.lockSelected);
  const unlockSelected = useEditorStore((s) => s.unlockSelected);
  const updateSelectedElements = useEditorStore((s) => s.updateSelectedElements);

  const selected = elements.filter((el) => selectedElementIds.includes(el.id));
  const toolPanelTools = new Set([
    'rectangle', 'diamond', 'circle', 'arrow', 'line', 'pencil', 'text',
    'highlighter', 'step', 'blur', 'pixelate', 'magnifier', 'rounded-rect',
  ]);
  const showForTool = toolPanelTools.has(activeTool);
  const visible = !!backgroundImage && (selected.length > 0 || showForTool);

  const types = selected.length > 0
    ? [...new Set(selected.map((el) => el.type))]
    : (showForTool ? [activeTool] : []);
  const locked = selected.length > 0 && selected.every((el) => el.locked);
  const primary = selected[0];

  const showStroke = types.some((t) => !['blur', 'pixelate', 'spotlight'].includes(t));
  const showStrokeStyle = types.some((t) => !['blur', 'pixelate', 'spotlight', 'magnifier', 'text', 'step'].includes(t));
  const showFill = types.some((t) => ['rectangle', 'rounded-rect', 'circle', 'diamond'].includes(t));
  const showStrokeWidth = types.some((t) => ['arrow', 'line', 'rectangle', 'rounded-rect', 'circle', 'diamond', 'pencil', 'highlighter', 'magnifier'].includes(t));
  const showCorner = types.some((t) => ['rectangle', 'rounded-rect'].includes(t));
  const showFont = types.includes('text');
  const showArrowheads = types.some((t) => t === 'arrow' || t === 'line');
  const showRough = types.some((t) => ['rectangle', 'rounded-rect', 'circle', 'diamond', 'line', 'arrow', 'magnifier'].includes(t));
  const showMagnifier = types.includes('magnifier');
  const magValue = selected.length > 0 && selected.every((el) => el.type === 'magnifier')
    ? ((selected[0] as { magnification?: number }).magnification ?? 2.25)
    : 2.25;

  const widthPreset = strokeWidth <= 2 ? 1 : strokeWidth <= 4 ? 2 : 3;
  const setWidthPreset = (p: 1 | 2 | 3) => setStrokeWidth(p === 1 ? 2 : p === 2 ? 3 : 6);

  const roughPreset: RoughnessPreset =
    roughness < 0.9 ? 'architect' : roughness < 2 ? 'artist' : 'cartoonist';

  const label = selected.length === 1
    ? types[0].replace('-', ' ')
    : selected.length > 1
      ? `${selected.length} selected`
      : activeTool.replace('-', ' ');

  const textFont = (primary && primary.type === 'text' && (primary as { fontFamily?: string }).fontFamily)
    || HANDWRITTEN_FONT;
  const isHandwritten = textFont.includes('Caveat') || textFont.includes('cursive');
  const isDoubleArrow = startArrowhead !== 'none' && endArrowhead !== 'none';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute top-[4.75rem] left-3 z-[95] w-[13.5rem] max-h-[calc(100dvh-7.5rem)] pointer-events-auto max-md:top-[7.5rem] max-md:left-2"
        >
          <FloatingSurface className="overflow-hidden flex flex-col max-h-[inherit] rounded-xl shadow-lg">
            <div className="px-3 py-2.5 border-b border-border/80 flex items-center justify-between shrink-0">
              <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground truncate">
                {label}
              </p>
              {selected.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <IconButton size="sm" aria-label="Duplicate" onClick={duplicateSelected}>
                    <Copy className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton size="sm" aria-label={locked ? 'Unlock' : 'Lock'} onClick={() => (locked ? unlockSelected() : lockSelected())}>
                    {locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </IconButton>
                  <IconButton size="sm" aria-label="Delete" onClick={() => removeElements(selectedElementIds)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              )}
            </div>

            <div className="overflow-y-auto panel-scroll p-3 flex flex-col gap-4">
                  {showStroke && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Stroke</p>
                      <div className="flex flex-wrap gap-1">
                        {DEFAULT_COLORS.map((c) => (
                          <ColorSwatch key={c} color={c} active={strokeColor === c} onClick={() => setStrokeColor(c)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {showFill && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Background</p>
                      <div className="flex flex-wrap gap-1">
                        <ColorSwatch color="transparent" active={fillColor === 'transparent'} onClick={() => setFillColor('transparent')} label="Transparent" />
                        {DEFAULT_COLORS.map((c) => (
                          <ColorSwatch key={c} color={c} active={fillColor === c} onClick={() => setFillColor(c)} />
                        ))}
                      </div>
                      <div className="flex gap-0.5 pt-1">
                        {([
                          ['hachure', 'Hachure'],
                          ['cross-hatch', 'Cross'],
                          ['solid', 'Solid'],
                          ['none', 'None'],
                        ] as [FillStyle, string][]).map(([v, fillLabel]) => (
                          <IconToggle key={v} active={fillStyle === v} label={fillLabel} onClick={() => setFillStyle(v)}>
                            <span className="text-[10px] font-medium">{fillLabel.slice(0, 1)}</span>
                          </IconToggle>
                        ))}
                      </div>
                    </div>
                  )}

                  {showStrokeWidth && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Stroke Width</p>
                      <div className="flex gap-0.5">
                        <IconToggle active={widthPreset === 1} label="Thin" onClick={() => setWidthPreset(1)}>
                          <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </IconToggle>
                        <IconToggle active={widthPreset === 2} label="Bold" onClick={() => setWidthPreset(2)}>
                          <Minus className="w-4 h-4" strokeWidth={2.5} />
                        </IconToggle>
                        <IconToggle active={widthPreset === 3} label="Extra Bold" onClick={() => setWidthPreset(3)}>
                          <Minus className="w-5 h-5" strokeWidth={3.5} />
                        </IconToggle>
                      </div>
                    </div>
                  )}

                  {showStrokeStyle && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Stroke Style</p>
                      <div className="flex gap-0.5">
                        {([
                          ['solid', 'Solid'],
                          ['dashed', 'Dashed'],
                          ['dotted', 'Dotted'],
                        ] as [StrokeStyle, string][]).map(([v, t]) => (
                          <IconToggle key={v} active={strokeStyle === v} label={t} onClick={() => setStrokeStyle(v)}>
                            <svg width="18" height="10" viewBox="0 0 18 10" className="overflow-visible">
                              {v === 'solid' && <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                              {v === 'dashed' && <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />}
                              {v === 'dotted' && <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="1.5 3" strokeLinecap="round" />}
                            </svg>
                          </IconToggle>
                        ))}
                      </div>
                    </div>
                  )}

                  {showMagnifier && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Zoom</p>
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{magValue.toFixed(1)}x</span>
                      </div>
                      <Slider
                        value={[magValue]}
                        min={1.5}
                        max={4}
                        step={0.25}
                        onValueChange={([v]) => {
                          if (selected.length && selected.every((el) => el.type === 'magnifier')) {
                            updateSelectedElements({ magnification: v } as Partial<import('@/types/editor').EditorElement>);
                          }
                        }}
                        disabled={!selected.length || !selected.every((el) => el.type === 'magnifier')}
                      />
                      {!selected.length && (
                        <p className="text-[10px] text-muted-foreground">Select a magnifier to adjust zoom</p>
                      )}
                    </div>
                  )}

                  {showRough && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sloppiness</p>
                      <div className="flex gap-0.5">
                        {([
                          ['architect', 'Architect'],
                          ['artist', 'Artist'],
                          ['cartoonist', 'Cartoonist'],
                        ] as [RoughnessPreset, string][]).map(([v, t]) => (
                          <IconToggle
                            key={v}
                            active={handDrawn && roughPreset === v}
                            label={t}
                            onClick={() => {
                              if (!handDrawn) setHandDrawn(true);
                              setRoughness(ROUGHNESS_PRESETS[v]);
                            }}
                          >
                            <svg width="18" height="12" viewBox="0 0 18 12">
                              {v === 'architect' && <path d="M1 6 L17 6" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                              {v === 'artist' && <path d="M1 7 Q5 3 9 6 T17 5" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                              {v === 'cartoonist' && <path d="M1 8 Q4 2 7 7 T13 4 T17 8" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                            </svg>
                          </IconToggle>
                        ))}
                      </div>
                      {!handDrawn && (
                        <button type="button" className="text-[10px] text-accent hover:underline" onClick={() => setHandDrawn(true)}>
                          Enable Hand-Drawn
                        </button>
                      )}
                    </div>
                  )}

                  {showCorner && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Edges</p>
                      <div className="flex gap-0.5">
                        <IconToggle active={cornerRadius === 0} label="Sharp" onClick={() => setCornerRadius(0)}>
                          <span className="w-3.5 h-3.5 border-2 border-current rounded-[1px]" />
                        </IconToggle>
                        <IconToggle active={cornerRadius > 0} label="Round" onClick={() => setCornerRadius(16)}>
                          <span className="w-3.5 h-3.5 border-2 border-current rounded-md" />
                        </IconToggle>
                      </div>
                    </div>
                  )}

                  {showArrowheads && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Arrowheads</p>
                      <div className="flex gap-0.5">
                        <IconToggle
                          active={endArrowhead === 'none' && startArrowhead === 'none'}
                          label="None"
                          onClick={() => { setEndArrowhead('none'); setStartArrowhead('none'); }}
                        >
                          <span className="text-[10px] font-medium">None</span>
                        </IconToggle>
                        <IconToggle
                          active={endArrowhead !== 'none' && startArrowhead === 'none'}
                          label="End"
                          onClick={() => { setEndArrowhead('arrow'); setStartArrowhead('none'); }}
                        >
                          <span className="text-[10px] font-medium">→</span>
                        </IconToggle>
                        <IconToggle
                          active={isDoubleArrow}
                          label="Double-sided"
                          onClick={() => { setEndArrowhead('arrow'); setStartArrowhead('arrow'); }}
                        >
                          <span className="text-[10px] font-medium">↔</span>
                        </IconToggle>
                        <IconToggle
                          active={endArrowhead === 'triangle' && startArrowhead === 'none'}
                          label="Triangle end"
                          onClick={() => { setEndArrowhead('triangle'); setStartArrowhead('none'); }}
                        >
                          <span className="text-[10px] font-medium">▲</span>
                        </IconToggle>
                      </div>
                    </div>
                  )}

                  {showFont && (
                    <>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font Style</p>
                        <div className="flex gap-0.5">
                          <IconToggle
                            active={isHandwritten}
                            label="Handwritten"
                            onClick={() => updateSelectedElements({ fontFamily: HANDWRITTEN_FONT })}
                          >
                            <span className="text-sm" style={{ fontFamily: HANDWRITTEN_FONT }}>Aa</span>
                          </IconToggle>
                          <IconToggle
                            active={!isHandwritten}
                            label="Standard"
                            onClick={() => updateSelectedElements({ fontFamily: 'system-ui, sans-serif' })}
                          >
                            <span className="text-xs font-sans">Aa</span>
                          </IconToggle>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Font Size</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{fontSize}</span>
                        </div>
                        <Slider value={[fontSize]} min={12} max={72} step={1} onValueChange={([v]) => setFontSize(v)} />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Opacity</p>
                      <span className="text-[10px] font-mono text-muted-foreground">{Math.round(opacity * 100)}</span>
                    </div>
                    <Slider value={[opacity]} min={0.1} max={1} step={0.05} onValueChange={([v]) => setOpacity(v)} />
                  </div>

                  {selected.length > 0 && (
                    <>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Layers</p>
                    <div className="flex gap-0.5">
                      <IconToggle label="Send To Back" onClick={() => selectedElementIds.forEach(sendToBack)}>
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                      </IconToggle>
                      <IconToggle label="Send Backward" onClick={() => selectedElementIds.forEach(sendBackward)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </IconToggle>
                      <IconToggle label="Bring Forward" onClick={() => selectedElementIds.forEach(bringForward)}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </IconToggle>
                      <IconToggle label="Bring To Front" onClick={() => selectedElementIds.forEach(bringToFront)}>
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
                          toastSuccess('Style Copied', 'Paste onto another shape');
                        }
                      }}
                    >
                      Copy Style
                    </button>
                    <button
                      type="button"
                      className="flex-1 h-7 text-[11px] rounded-lg border border-border hover:bg-secondary disabled:opacity-40"
                      disabled={!hasClipboardStyle()}
                      onClick={() => {
                        const style = getClipboardStyle();
                        if (style) {
                          updateSelectedElements(style);
                          toastSuccess('Style Pasted', 'Applied to selection');
                        }
                      }}
                    >
                      Paste Style
                    </button>
                  </div>
                    </>
                  )}
            </div>
          </FloatingSurface>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
