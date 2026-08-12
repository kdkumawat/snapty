'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Stage, Layer, Rect, Ellipse, Line, Arrow, Text, Group,
  Image as KonvaImage, Circle, Transformer,
} from 'react-konva';
import Konva from 'konva';
import { useTheme } from 'next-themes';
import OcrPanel from '@/components/editor/panels/ocr-panel';
import { useEditorStore, generateId, getImageToolScale } from '@/store/editor-store';
import { loadImageFileIntoEditor } from '@/lib/image-load';
import {
  handDrawnPolyline,
  handDrawnEllipsePoints,
  wobbleFreehandPoint,
} from '@/lib/hand-drawn';
import { getSelectionTheme, styleSelectionAnchor, selectionHandleProps, handleHoverEvents } from '@/lib/selection-theme';
import RoughKonvaShape from '@/components/editor/canvas/rough-konva-shape';
import CachedKonvaImage from '@/components/editor/canvas/cached-konva-image';
import MagnifierKonva from '@/components/editor/canvas/magnifier-konva';
import DeviceFrameKonva from '@/components/editor/canvas/device-frame-konva';
import { DEVICE_FRAME_INSETS } from '@/lib/editor/device-frames';
import { arrowHeadPoints } from '@/lib/rough-renderer';
import { snapBounds, type GuideLine } from '@/lib/editor/snap-guides';
import { getElementBounds, boundsIntersect } from '@/lib/editor/selection';
import { hydrateSettingsFromSelection } from '@/lib/editor/settings-sync';
import { magnifierSourceCenter } from '@/lib/editor/magnifier-geometry';
import {
  controlPoint, renderPoints, bendFromHandle, tangentAtStart,
} from '@/lib/editor/curve';
import type {
  EditorElement, ShapeElement, ArrowElement, LineElement,
  PencilElement, CircleElement, TextElement, StepElement, DiamondElement,
  MagnifierElement, ToolType,
} from '@/types/editor';
import {
  HANDWRITTEN_FONT, BADGE_FONT, TEXT_PADDING, TEXT_LINE_HEIGHT, fontFamilyForCanvas,
} from '@/types/editor';
import { cn } from '@/lib/utils';

/** Find a top-level annotation node by id (safe for ids that start with digits). */
function findAnnotationNode(stage: Konva.Stage, id: string): Konva.Node | undefined {
  const layer = stage.findOne('.annotation-layer') as Konva.Layer | undefined;
  if (!layer) return undefined;
  return layer.getChildren((node) => node.id() === id)[0];
}

/** True when the event target is a Transformer anchor, border, or rotation handle. */
function isTransformerTarget(target: Konva.Node): boolean {
  let node: Konva.Node | null = target;
  while (node) {
    if (node.getClassName?.() === 'Transformer') return true;
    node = node.getParent();
  }
  return false;
}

/** Axis-aligned hit box of an element, used by the eraser (shared by commit + preview). */
function getElementHitBox(el: EditorElement): { x1: number; y1: number; x2: number; y2: number } {
  let elX = el.x;
  let elY = el.y;
  let elRight = elX;
  let elBottom = elY;

  if (el.type === 'pencil' || el.type === 'highlighter') {
    const pts = (el as PencilElement).points;
    if (pts && pts.length >= 2) {
      elX = Math.min(...pts.filter((_, i) => i % 2 === 0));
      elY = Math.min(...pts.filter((_, i) => i % 2 === 1));
      elRight = Math.max(...pts.filter((_, i) => i % 2 === 0));
      elBottom = Math.max(...pts.filter((_, i) => i % 2 === 1));
    }
  } else if ('width' in el) {
    elRight = el.x + (el as ShapeElement).width;
    elBottom = el.y + (el as ShapeElement).height;
  } else if (el.type === 'arrow' || el.type === 'line') {
    const pts = (el as ArrowElement | LineElement).points;
    if (pts && pts.length >= 4) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxX = Math.max(maxX, pts[i]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      elX = el.x + minX;
      elY = el.y + minY;
      elRight = el.x + maxX;
      elBottom = el.y + maxY;
    }
  } else if (el.type === 'step') {
    const r = (el as StepElement).radius ?? 16;
    elX = el.x - r;
    elY = el.y - r;
    elRight = el.x + r;
    elBottom = el.y + r;
  }

  return {
    x1: Math.min(elX, elRight),
    y1: Math.min(elY, elBottom),
    x2: Math.max(elX, elRight),
    y2: Math.max(elY, elBottom),
  };
}

/** True when the element's hit box intersects the given rect (any overlap). */
function elementIntersectsRect(el: EditorElement, x1: number, y1: number, x2: number, y2: number): boolean {
  const b = getElementHitBox(el);
  return b.x1 < x2 && b.x2 > x1 && b.y1 < y2 && b.y2 > y1;
}

/** Dash pattern for dashed/dotted strokes (matches the other shapes' styling). */
function strokeDash(strokeStyle?: string): number[] | undefined {
  return strokeStyle === 'dashed' ? [8, 6] : strokeStyle === 'dotted' ? [2, 4] : undefined;
}

/**
 * Tool cursors: high-contrast SVG (white halo + solid color) encoded as base64
 * so browsers don't drop them (raw # + encodeURIComponent double-encoding was invisible).
 */
type CursorOpts = { color?: string; stepNumber?: number };

function sanitizeHexColor(c?: string): string {
  if (!c || c === 'transparent') return '#ef4444';
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  return '#ef4444';
}

function toolCursorSVG(tool: ToolType, opts: CursorOpts = {}): string {
  const size = 32;
  const half = size / 2;
  const color = sanitizeHexColor(opts.color);
  // Halo makes the glyph visible on both light and dark screenshots
  const halo = '#ffffff';
  const ink = '#111111';

  switch (tool) {
    case 'select':
    case 'hand':
      return '';
    case 'arrow':
      // Neutral crosshair + small right-pointing arrow badge (doesn't imply a fixed draw direction)
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <line x1="${half}" y1="4" x2="${half}" y2="28" stroke="${halo}" stroke-width="4" stroke-linecap="round"/>
        <line x1="4" y1="${half}" x2="28" y2="${half}" stroke="${halo}" stroke-width="4" stroke-linecap="round"/>
        <line x1="${half}" y1="4" x2="${half}" y2="28" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <line x1="4" y1="${half}" x2="28" y2="${half}" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <path d="M20 9 L28 12 L20 15 Z" fill="${halo}"/>
        <path d="M21 10 L26 12 L21 14 Z" fill="${color}"/>
      </svg>`;
    case 'crop':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M8 4v20h20" fill="none" stroke="${halo}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 8h20v20" fill="none" stroke="${halo}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 4v20h20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 8h20v20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'rectangle':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M16 4v24M4 16h24" stroke="${halo}" stroke-width="4" stroke-linecap="round"/><path d="M16 4v24M4 16h24" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <rect x="19" y="5" width="8" height="7" fill="${halo}"/><rect x="20" y="6" width="6" height="5" fill="none" stroke="${color}" stroke-width="1.5"/>
      </svg>`;
    case 'rounded-rect':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M16 4v24M4 16h24" stroke="${halo}" stroke-width="4" stroke-linecap="round"/><path d="M16 4v24M4 16h24" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <rect x="19" y="5" width="8" height="7" rx="2" fill="${halo}"/><rect x="20" y="6" width="6" height="5" rx="1.5" fill="none" stroke="${color}" stroke-width="1.5"/>
      </svg>`;
    case 'circle':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M16 4v24M4 16h24" stroke="${halo}" stroke-width="4" stroke-linecap="round"/><path d="M16 4v24M4 16h24" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <circle cx="23" cy="9" r="4" fill="${halo}"/><circle cx="23" cy="9" r="3" fill="none" stroke="${color}" stroke-width="1.5"/>
      </svg>`;
    case 'diamond':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M16 4v24M4 16h24" stroke="${halo}" stroke-width="4" stroke-linecap="round"/><path d="M16 4v24M4 16h24" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>
        <path d="M23 5 L28 9 L23 13 L18 9 Z" fill="${halo}"/><path d="M23 6 L27 9 L23 12 L19 9 Z" fill="none" stroke="${color}" stroke-width="1.5"/>
      </svg>`;
    case 'line':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <line x1="5" y1="27" x2="27" y2="5" stroke="${halo}" stroke-width="5" stroke-linecap="round"/>
        <line x1="5" y1="27" x2="27" y2="5" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case 'pencil':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M20 3l9 9L12 29l-9 2 2-9L20 3z" fill="${halo}"/>
        <path d="M20 3l9 9L12 29l-9 2 2-9L20 3z" fill="${color}"/>
        <path d="M17 7l8 8" stroke="${halo}" stroke-width="1.5"/>
        <path d="M3 31l6-2" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`;
    case 'highlighter':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="3" y="17" width="26" height="10" rx="2" fill="${halo}"/>
        <rect x="4" y="18" width="24" height="8" rx="2" fill="#f59e0b" opacity="0.9"/>
        <path d="M8 18V9l4-4h8l4 4v9" fill="none" stroke="${ink}" stroke-width="1.5"/>
      </svg>`;
    case 'text':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="M5 5h22M16 5v22" stroke="${halo}" stroke-width="5" stroke-linecap="round"/>
        <path d="M8 27h16" stroke="${halo}" stroke-width="4" stroke-linecap="round"/>
        <path d="M5 5h22M16 5v22" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M8 27h16" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'step': {
      const n = Math.max(1, Math.min(999, opts.stepNumber ?? 1));
      const label = String(n);
      const fs = label.length >= 3 ? 9 : label.length === 2 ? 11 : 14;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="13" fill="${halo}"/>
        <circle cx="${half}" cy="${half}" r="11" fill="${color}"/>
        <text x="${half}" y="${half + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="#ffffff" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${label}</text>
      </svg>`;
    }
    case 'blur':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="5" y="5" width="22" height="22" rx="3" fill="none" stroke="${halo}" stroke-width="4"/>
        <rect x="5" y="5" width="22" height="22" rx="3" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 2"/>
        <circle cx="12" cy="14" r="2.5" fill="${color}" opacity="0.45"/>
        <circle cx="19" cy="17" r="3.5" fill="${color}" opacity="0.4"/>
      </svg>`;
    case 'pixelate':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="5" y="5" width="22" height="22" fill="none" stroke="${halo}" stroke-width="4"/>
        <rect x="5" y="5" width="22" height="22" fill="none" stroke="${color}" stroke-width="2"/>
        <rect x="8" y="8" width="6" height="6" fill="${color}" opacity="0.85"/>
        <rect x="18" y="8" width="6" height="6" fill="${color}" opacity="0.45"/>
        <rect x="8" y="18" width="6" height="6" fill="${color}" opacity="0.55"/>
        <rect x="18" y="18" width="6" height="6" fill="${color}" opacity="0.9"/>
      </svg>`;
    case 'spotlight':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="12" fill="none" stroke="${halo}" stroke-width="4"/>
        <circle cx="${half}" cy="${half}" r="12" fill="none" stroke="#eab308" stroke-width="2"/>
        <circle cx="${half}" cy="${half}" r="3" fill="#eab308"/>
      </svg>`;
    case 'eraser':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="7" y="9" width="16" height="14" rx="2" transform="rotate(-28 15 16)" fill="${halo}"/>
        <rect x="8" y="10" width="14" height="12" rx="2" transform="rotate(-28 15 16)" fill="#f87171"/>
        <rect x="10" y="12" width="10" height="5" rx="1" transform="rotate(-28 15 16)" fill="#fecaca"/>
      </svg>`;
    case 'magnifier':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="14" cy="14" r="9" fill="none" stroke="${halo}" stroke-width="4"/>
        <circle cx="14" cy="14" r="9" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="21" y1="21" x2="28" y2="28" stroke="${halo}" stroke-width="4" stroke-linecap="round"/>
        <line x1="21" y1="21" x2="28" y2="28" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <line x1="${half}" y1="4" x2="${half}" y2="28" stroke="${halo}" stroke-width="3"/>
        <line x1="4" y1="${half}" x2="28" y2="${half}" stroke="${halo}" stroke-width="3"/>
        <line x1="${half}" y1="4" x2="${half}" y2="28" stroke="${color}" stroke-width="1.5"/>
        <line x1="4" y1="${half}" x2="28" y2="${half}" stroke="${color}" stroke-width="1.5"/>
      </svg>`;
  }
}

function svgToCursor(svg: string, hotspot: string): string {
  // base64 is the most reliable custom-cursor transport across Chromium / Firefox / Safari
  const base64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : '';
  if (!base64) {
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") ${hotspot}, crosshair`;
  }
  return `url("data:image/svg+xml;base64,${base64}") ${hotspot}, crosshair`;
}

function getToolCursorCSS(
  tool: ToolType,
  isDragging: boolean,
  opts: CursorOpts = {},
  hoverSelect = false,
): string {
  switch (tool) {
    case 'select':
      return 'default';
    case 'hand':
      return isDragging ? 'grabbing' : 'grab';
    default: {
      if (hoverSelect) return 'default';
      const svg = toolCursorSVG(tool, opts);
      if (!svg) return 'crosshair';
      const hotspot =
        tool === 'pencil' || tool === 'highlighter' ? '4 28'
        : tool === 'text' ? '6 6'
        : tool === 'line' ? '5 27'
        : tool === 'arrow' || tool === 'crop' || tool === 'step' || tool === 'magnifier' ? '16 16'
        : '16 16';
      return svgToCursor(svg, hotspot);
    }
  }
}

// Create a Figma-like dot grid pattern. The dot color is passed in (resolved
// from the theme) rather than hardcoded, which used to leave it light grey and
// effectively invisible on dark screenshots.
function createGridPattern(dotColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const gap = 20;
  canvas.width = gap;
  canvas.height = gap;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(gap / 2, gap / 2, 1, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

const EditorCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingElement, setDrawingElement] = useState<EditorElement | null>(null);
  const drawOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const middlePanRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const altDuplicateRef = useRef<string | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean; editId?: string; initialText?: string }>({ x: 0, y: 0, visible: false });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrCopied, setOcrCopied] = useState(false);
  const hoverPreviousToolRef = useRef<ToolType | null>(null);
  const hoveredAnnotationRef = useRef<string | null>(null);
  /** Temporary select-on-hover without changing toolbar activeTool. */
  const [hoverSelectMode, setHoverSelectMode] = useState(false);
  const hoverSelectModeRef = useRef(false);
  useEffect(() => { hoverSelectModeRef.current = hoverSelectMode; }, [hoverSelectMode]);
  const handDrawn = useEditorStore((s) => s.handDrawn);
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeOriginRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeAdditiveRef = useRef(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserStart, setEraserStart] = useState<{ x: number; y: number } | null>(null);
  const [eraserEnd, setEraserEnd] = useState<{ x: number; y: number } | null>(null);
  const [spotlightOverlayImage, setSpotlightOverlayImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!middlePanRef.current) return;
      const s = useEditorStore.getState();
      const dx = e.clientX - middlePanRef.current.lastX;
      const dy = e.clientY - middlePanRef.current.lastY;
      middlePanRef.current = { lastX: e.clientX, lastY: e.clientY };
      s.setStagePosition({ x: s.stagePosition.x + dx, y: s.stagePosition.y + dy });
    };
    const onUp = () => { middlePanRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  /*
    OCR is triggered by a window event so the palette and context menu can reach
    it without prop drilling. The handler is held in a ref: with `runOCR` closed
    over directly and `[]` deps, the listener captured the first render's
    `backgroundImage` (always null) and its own guard returned immediately,
    which is why OCR silently did nothing.
  */
  const runOCRRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onOcr = () => { runOCRRef.current(); };
    window.addEventListener('snapty-ocr', onOcr);
    return () => window.removeEventListener('snapty-ocr', onOcr);
  }, []);

  // Use ref for textInput visibility to avoid stale closures in event handlers
  const textInputRef = useRef(textInput);
  useEffect(() => { textInputRef.current = textInput; }, [textInput]);

  const backgroundImage = useEditorStore((s) => s.backgroundImage);
  const imageSize = useEditorStore((s) => s.imageSize);
  const zoom = useEditorStore((s) => s.zoom);
  const stagePosition = useEditorStore((s) => s.stagePosition);
  const activeTool = useEditorStore((s) => s.activeTool);
  const strokeColor = useEditorStore((s) => s.strokeColor);
  const fillColor = useEditorStore((s) => s.fillColor);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const opacity = useEditorStore((s) => s.opacity);
  const cornerRadius = useEditorStore((s) => s.cornerRadius);
  const elements = useEditorStore((s) => s.elements);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const canvasStyle = useEditorStore((s) => s.canvasStyle);
  const gridEnabled = useEditorStore((s) => s.canvasStyle.gridEnabled);
  const stepCounter = useEditorStore((s) => s.stepCounter);
  const addElement = useEditorStore((s) => s.addElement);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateElementSilent = useEditorStore((s) => s.updateElementSilent);
  const commitElementUpdate = useEditorStore((s) => s.commitElementUpdate);
  const removeElements = useEditorStore((s) => s.removeElements);
  const setSelectedElementIds = useEditorStore((s) => s.setSelectedElementIds);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setStagePosition = useEditorStore((s) => s.setStagePosition);
  const resetView = useEditorStore((s) => s.resetView);

  async function runOCR() {
    if (!backgroundImage || ocrBusy) return;
    setOcrOpen(true);
    setOcrBusy(true);
    setOcrText('');
    let worker: { recognize: (image: Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | null = null;
    try {
      const source = document.createElement('canvas');
      source.width = backgroundImage.naturalWidth || backgroundImage.width;
      source.height = backgroundImage.naturalHeight || backgroundImage.height;
      const sourceCtx = source.getContext('2d');
      if (!sourceCtx) throw new Error('Could not prepare OCR image');
      sourceCtx.drawImage(backgroundImage, 0, 0, source.width, source.height);
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        source.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare OCR image')), 'image/png');
      });
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tesseract/lang-data',
        cachePath: 'tesseract-cache',
      });
      const result = await worker.recognize(imageBlob);
      setOcrText(result.data.text.trim());
    } catch (error) {
      console.error('OCR failed:', error);
      setOcrText('OCR could not read this image. Try a higher-resolution screenshot.');
    } finally {
      await worker?.terminate();
      setOcrBusy(false);
    }
  }

  async function copyOCRText() {
    if (!ocrText) return;
    await navigator.clipboard.writeText(ocrText);
    setOcrCopied(true);
    window.setTimeout(() => setOcrCopied(false), 1500);
  }

  // Keep the event listener pointing at the current closure.
  runOCRRef.current = () => { void runOCR(); };

  // Cursor based on tool (+ next step number for the stepper tool)
  // With a drawing tool active the pointer moves whatever annotation is
  // selected, so swap to the plain arrow cursor while a selection exists and
  // hand the tool cursor back the moment it is cleared.
  const selectionCursorActive =
    activeTool !== 'select'
    && activeTool !== 'hand'
    && selectedElementIds.length > 0
    && !isDrawing
    && !isErasing;
  const cursorCSS = useMemo(
    () => getToolCursorCSS(activeTool, isHandDragging, {
      color: strokeColor,
      stepNumber: stepCounter,
    }, hoverSelectMode || selectionCursorActive),
    [activeTool, isHandDragging, strokeColor, stepCounter, hoverSelectMode, selectionCursorActive],
  );

  // Apply cursor on container + every Konva canvas layer (they override parent cursor)
  useEffect(() => {
    const apply = () => {
      const root = containerRef.current;
      if (root) root.style.cursor = cursorCSS;
      const st = stageRef.current;
      if (!st) return;
      const container = st.container();
      container.style.cursor = cursorCSS;
      container.querySelectorAll('canvas').forEach((c) => {
        (c as HTMLCanvasElement).style.cursor = cursorCSS;
      });
    };
    apply();
    // Konva may recreate canvases after resize / image load; apply after both
    // layout frames so the cursor hotspot remains aligned with the draw point.
    const frame = window.requestAnimationFrame(apply);
    const t = window.setTimeout(apply, 100);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(t); };
  }, [cursorCSS, dimensions, backgroundImage, activeTool]);

  // Grid pattern (created once)
  // Grid pattern. Rebuilt when the theme flips so the dots stay readable on
  // both light and dark screenshots.
  const { resolvedTheme } = useTheme();
  const gridPattern = useMemo(
    () => {
      if (typeof document === 'undefined') return null;
      const fg = getComputedStyle(document.documentElement)
        .getPropertyValue('--foreground')
        .trim() || '#1C1917';
      return createGridPattern(`color-mix(in srgb, ${fg} 20%, transparent)`);
    },
    // resolvedTheme is the trigger; the value itself is read from CSS.
     
    [resolvedTheme],
  );

  // Resize observer for container dimensions - update stage size without auto-resetting zoom
  // (auto resetView on every resize felt jumpy; fit-to-screen remains available on toolbar)
  // When the shell first gains real height (common Mac PWA / flex fix), re-fit the image.
  const lastSizeRef = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const update = () => {
      const width = Math.max(0, Math.floor(c.clientWidth));
      const height = Math.max(0, Math.floor(c.clientHeight));
      if (width === 0 || height === 0) return;
      const prev = lastSizeRef.current;
      const gainedSize = (prev.width === 0 || prev.height === 0) && width > 0 && height > 0;
      const largeChange =
        prev.width > 0
        && (Math.abs(prev.width - width) > 80 || Math.abs(prev.height - height) > 80);
      lastSizeRef.current = { width, height };
      setDimensions({ width, height });
      // First real size or big shell resize (window drag on Mac) - re-fit
      if (gainedSize || largeChange) {
        if (useEditorStore.getState().backgroundImage) {
          requestAnimationFrame(() => useEditorStore.getState().resetView());
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(c);
    // visualViewport covers mobile browser chrome + some desktop PWA resizes
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Reset view when background image changes
  useEffect(() => {
    if (backgroundImage) {
      const timer = setTimeout(() => resetView(), 50);
      return () => clearTimeout(timer);
    }
  }, [backgroundImage, resetView]);

  // Calculate if there are any spotlights
  const hasSpotlights = elements.some(el => el.type === 'spotlight');

  useEffect(() => {
    if (!backgroundImage || !hasSpotlights) {
      const empty = document.createElement('canvas');
      empty.width = backgroundImage?.width ?? 1;
      empty.height = backgroundImage?.height ?? 1;
      const emptyCtx = empty.getContext('2d');
      if (emptyCtx && backgroundImage) {
        emptyCtx.drawImage(backgroundImage, 0, 0);
      }
      const overlay = new window.Image();
      overlay.src = empty.toDataURL('image/png');
      overlay.onload = () => {
        setSpotlightOverlayImage(overlay);
      };
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = backgroundImage.width;
    canvas.height = backgroundImage.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(backgroundImage, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const spotlightElements = elements.filter((el): el is ShapeElement & { imageDataURL?: string } => {
      return el.type === 'spotlight' && Boolean((el as ShapeElement & { imageDataURL?: string }).imageDataURL);
    });

    const loadImages = spotlightElements.map((el) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = (el as ShapeElement & { imageDataURL?: string }).imageDataURL!;
      });
    });

    if (!loadImages.length) {
      const overlay = new window.Image();
      overlay.onload = () => setSpotlightOverlayImage(overlay);
      overlay.src = canvas.toDataURL('image/png');
      return;
    }

    Promise.all(loadImages)
      .then((images) => {
        images.forEach((img) => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        });
        const overlay = new window.Image();
        overlay.onload = () => setSpotlightOverlayImage(overlay);
        overlay.src = canvas.toDataURL('image/png');
      })
      .catch(() => setSpotlightOverlayImage(null));
  }, [backgroundImage, elements, hasSpotlights]);

  // Register stage globally for export
  useEffect(() => {
    const registerStage = () => {
      if (stageRef.current) (window as any).__snapty_stage = stageRef.current;
    };
    registerStage();
    const timer = window.setTimeout(registerStage, 100);
    const raf = window.requestAnimationFrame(registerStage);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    };
  }, [backgroundImage]);

  // Update transformer nodes when selection changes (skip line-like shapes, custom handles)
  useEffect(() => {
    const attach = () => {
      const tr = transformerRef.current;
      const st = stageRef.current;
      if (!tr || !st) return;
      if (!selectedElementIds.length) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }
      const skipTypes = new Set(['arrow', 'line', 'magnifier']);
      const nodes = selectedElementIds
        .filter((id) => {
          const el = elements.find((e) => e.id === id);
          return el && !skipTypes.has(el.type) && !el.locked;
        })
        .map((id) => findAnnotationNode(st, id))
        .filter(Boolean) as Konva.Node[];
      tr.nodes(nodes);
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
    };
    attach();
    const onReady = () => {
      attach();
      requestAnimationFrame(attach);
    };
    window.addEventListener('snapty-overlay-image-ready', onReady);
    const retries = [16, 50, 120, 250].map((ms) => window.setTimeout(attach, ms));
    return () => {
      window.removeEventListener('snapty-overlay-image-ready', onReady);
      retries.forEach((t) => window.clearTimeout(t));
    };
  }, [selectedElementIds, elements]);

  const textIgnoreBlurRef = useRef(0);

  // Auto-focus text area when text input becomes visible
  useEffect(() => {
    if (textInput.visible && textAreaRef.current) {
      textIgnoreBlurRef.current = Date.now() + 250;
      requestAnimationFrame(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.value = textInput.initialText ?? '';
          if (textInput.editId) {
            textAreaRef.current.select();
          }
        }
      });
    }
  }, [textInput.visible, textInput.initialText, textInput.editId]);

  // --- Text input ---

  const commitText = useCallback(() => {
    if (!textAreaRef.current) return;
    const text = textAreaRef.current.value;
    const st = useEditorStore.getState();
    const ti = textInputRef.current;
    if (ti.editId) {
      // Update existing text annotation
      if (text.trim()) {
        st.updateElement(ti.editId, { text: text.trim() } as Partial<TextElement>);
      } else {
        st.removeElements([ti.editId]);
      }
    } else if (text.trim()) {
      const scale = getImageToolScale(st.imageSize.width, st.imageSize.height);
      st.addElement({
        id: generateId(),
        type: 'text',
        x: ti.x,
        y: ti.y,
        text: text.trim(),
        // Unrounded: the settings <-> element round trip must be lossless.
        fontSize: st.fontSize * scale,
        fontFamily: st.fontFamily || HANDWRITTEN_FONT,
        fontStyle: st.fontStyle || 'normal',
        align: st.textAlign || 'left',
        fill: st.strokeColor,
        opacity: st.opacity,
        padding: TEXT_PADDING,
        lineHeight: TEXT_LINE_HEIGHT,
      } as TextElement);
    }
    setTextInput({ x: 0, y: 0, visible: false });
  }, []);

  const commitTextRef = useRef(commitText);
  useEffect(() => { commitTextRef.current = commitText; }, [commitText]);

  function handleTextAreaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitTextRef.current();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setTextInput({ x: 0, y: 0, visible: false });
    }
  }

  // Container mousedown listener to commit text when clicking outside textarea.
  // Must NOT commit if the click target is inside the konvajs-content div,
  // because the Konva stage mousedown handler will handle it (and call cancelBubble = true).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    function handleContainerMouseDown(e: MouseEvent) {
      if (!textInputRef.current.visible) return;
      if (e.target === textAreaRef.current) return;
      // Skip if target is inside the konvajs-content div (the canvas area)
      const target = e.target as HTMLElement;
      if (target.closest('.konvajs-content')) return;
      commitTextRef.current();
    }
    c.addEventListener('mousedown', handleContainerMouseDown);
    return () => c.removeEventListener('mousedown', handleContainerMouseDown);
  }, []); // No deps - uses refs

  // Get pointer position in canvas (image) coordinates - uses getState() for fresh values
  function getCanvasPoint(): { x: number; y: number } | null {
    const st = stageRef.current;
    if (!st) return null;
    const pos = st.getPointerPosition();
    if (!pos) return null;
    const s = useEditorStore.getState();
    const pad = s.canvasStyle.padding || 0;
    const ins = DEVICE_FRAME_INSETS[s.canvasStyle.deviceFrame];
    const ox = pad + ins.left;
    const oy = pad + ins.top;
    return {
      x: (pos.x - s.stagePosition.x) / s.zoom - ox,
      y: (pos.y - s.stagePosition.y) / s.zoom - oy,
    };
  }

  // Create a blurred or pixelated image data URL for a region.
  // Intensity comes in as an argument rather than being read from the store, so
  // an existing element can be re-baked with its own settings after the fact.
  function createBlurImage(
    x: number, y: number, w: number, h: number, type: 'blur' | 'pixelate',
    intensity?: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      const s = useEditorStore.getState();
      if (!s.backgroundImage) { resolve(''); return; }
      const imgSize = s.imageSize;
      const scale = getImageToolScale(imgSize.width, imgSize.height);
      const ax = Math.max(0, Math.round(x));
      const ay = Math.max(0, Math.round(y));
      const aw = Math.min(Math.round(w), imgSize.width - ax);
      const ah = Math.min(Math.round(h), imgSize.height - ay);
      if (aw <= 0 || ah <= 0) { resolve(''); return; }

      const offscreen = document.createElement('canvas');
      offscreen.width = aw;
      offscreen.height = ah;
      const ctx = offscreen.getContext('2d')!;

      if (type === 'blur') {
        const radius = Math.round((intensity ?? s.blurRadius ?? 12) * scale);
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, aw, ah);
      } else {
        const px = Math.max(2, Math.round((intensity ?? s.pixelSize ?? 10) * scale));
        const sw = Math.max(1, Math.ceil(aw / px));
        const sh = Math.max(1, Math.ceil(ah / px));
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = sw;
        smallCanvas.height = sh;
        smallCanvas.getContext('2d')!.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(smallCanvas, 0, 0, sw, sh, 0, 0, aw, ah);
      }
      resolve(offscreen.toDataURL('image/png'));
    });
  }

  /**
   * Re-bake blur/pixelate regions when their geometry or intensity changes.
   *
   * The effect is rasterised into a PNG at commit time, which keeps raster and
   * SVG export trivially correct but means the bitmap goes stale the moment the
   * region is moved, resized, or its intensity is edited - previously a resized
   * pixelate just stretched its old tile, and the intensity had no UI at all.
   * Debounced so a drag produces one re-bake rather than one per frame, and
   * written silently so a gesture stays a single undo step.
   */
  const rebakeRef = useRef<Map<string, string>>(new Map());
  const rebakeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const targets = elements.filter(
      (el): el is ShapeElement =>
        (el.type === 'blur' || el.type === 'pixelate') && !!(el as ShapeElement).imageDataURL,
    );
    if (!targets.length || !backgroundImage) return;

    // Signature of everything the baked bitmap depends on.
    const signatureOf = (el: ShapeElement) =>
      [
        Math.round(el.x), Math.round(el.y),
        Math.round(Math.abs(el.width)), Math.round(Math.abs(el.height)),
        el.type === 'blur' ? el.blurRadius : el.pixelSize,
      ].join(':');

    const stale = targets.filter((el) => rebakeRef.current.get(el.id) !== signatureOf(el));
    // First sight of an element is not stale: it was just baked at commit time.
    const unseen = stale.filter((el) => !rebakeRef.current.has(el.id));
    unseen.forEach((el) => rebakeRef.current.set(el.id, signatureOf(el)));
    const needsWork = stale.filter((el) => !unseen.includes(el));
    if (!needsWork.length) return;

    if (rebakeTimerRef.current !== null) window.clearTimeout(rebakeTimerRef.current);
    rebakeTimerRef.current = window.setTimeout(() => {
      rebakeTimerRef.current = null;
      void Promise.all(
        needsWork.map(async (el) => {
          const w = Math.abs(el.width);
          const h = Math.abs(el.height);
          const x = el.width < 0 ? el.x + el.width : el.x;
          const y = el.height < 0 ? el.y + el.height : el.y;
          const intensity = el.type === 'blur' ? el.blurRadius : el.pixelSize;
          const url = await createBlurImage(x, y, w, h, el.type as 'blur' | 'pixelate', intensity);
          rebakeRef.current.set(el.id, signatureOf(el));
          if (url) updateElementSilent(el.id, { imageDataURL: url } as Partial<EditorElement>);
        }),
      );
    }, 120);

    return () => {
      if (rebakeTimerRef.current !== null) {
        window.clearTimeout(rebakeTimerRef.current);
        rebakeTimerRef.current = null;
      }
    };
     
  }, [elements, backgroundImage, updateElementSilent]);

  // Create a spotlight image: show only the selected area at full brightness, transparent elsewhere
  function createSpotlightImage(
    x: number, y: number, w: number, h: number
  ): Promise<string> {
    return new Promise((resolve) => {
      const s = useEditorStore.getState();
      if (!s.backgroundImage) { resolve(''); return; }
      const iw = s.imageSize.width;
      const ih = s.imageSize.height;
      if (iw <= 0 || ih <= 0) { resolve(''); return; }

      const cx = Math.max(0, Math.round(x));
      const cy = Math.max(0, Math.round(y));
      const cw = Math.min(Math.round(w), iw - cx);
      const ch = Math.min(Math.round(h), ih - cy);
      if (cw <= 0 || ch <= 0) { resolve(''); return; }

      const offscreen = document.createElement('canvas');
      offscreen.width = iw;
      offscreen.height = ih;
      const ctx = offscreen.getContext('2d')!;

      // Clear the canvas to transparent
      ctx.clearRect(0, 0, iw, ih);
      // Draw the spotlight area from the original image
      ctx.drawImage(s.backgroundImage, cx, cy, cw, ch, cx, cy, cw, ch);

      resolve(offscreen.toDataURL('image/png'));
    });
  }

  // --- Find annotation element by traversing up from click target ---
  function findAnnotationId(node: Konva.Node): string | null {
    const known = new Set(useEditorStore.getState().elements.map((el) => el.id));
    let current: Konva.Node | null = node;
    while (current) {
      const id = current.id();
      if (id && known.has(id)) return id;
      current = current.getParent();
    }
    return null;
  }

  // --- Mouse handlers ---

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Read ALL values from the store to avoid stale closure issues with React Konva
    const s = useEditorStore.getState();

    // Let Konva Transformer own corner / edge / rotate handles (any active tool).
    if (isTransformerTarget(e.target)) {
      e.cancelBubble = true;
      return;
    }

    // Middle mouse button → pan
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      middlePanRef.current = { lastX: e.evt.clientX, lastY: e.evt.clientY };
      return;
    }

    if (s.annotationsLocked && s.activeTool !== 'hand' && s.activeTool !== 'select') return;

    // If text input is visible, commit it first and stop propagation
    // so the container mousedown listener does NOT double-commit
    if (textInputRef.current.visible) {
      commitTextRef.current();
      e.cancelBubble = true;
      return;
    }

    const st = stageRef.current;
    if (!st) return;

    const isBg = e.target === st
      || e.target.name() === 'background'
      || e.target.name() === 'background-darkened'
      || e.target.id() === 'grid-bg';

    // Double-click empty canvas deselects
    if (e.evt.detail >= 2 && isBg) {
      s.setSelectedElementIds([]);
      return;
    }

    // Annotations are always directly selectable. This keeps selection predictable
    // even when a drawing tool is active; the drawing gesture only starts on empty
    // canvas, while an existing annotation receives the click/drag interaction.
    const clickedId = findAnnotationId(e.target);
    if (clickedId && !isBg) {
        const clicked = s.elements.find((x) => x.id === clickedId);
        if (clicked?.locked) return;

        // Double-click a text annotation to edit it in place (select tool, text
        // tool, or hover-select from any drawing tool). Uses the native click
        // count rather than Konva's dblclick, which a draggable node can
        // swallow - the same pattern as the double-click-to-deselect above.
        if (e.evt.detail >= 2 && clicked?.type === 'text') {
          if (s.activeTool === 'select' || s.activeTool === 'text' || hoverSelectModeRef.current) {
            e.cancelBubble = true;
            s.setSelectedElementIds([]);
            setTextInput({
              x: clicked.x,
              y: clicked.y,
              visible: true,
              editId: clicked.id,
              initialText: (clicked as TextElement).text,
            });
            return;
          }
        }

        // Alt+drag duplicate: mark for duplication on drag start
        if (e.evt.altKey) {
          altDuplicateRef.current = clickedId;
        }

        let nextIds: string[];
        if (e.evt.shiftKey) {
          const currentIds = s.selectedElementIds;
          nextIds = currentIds.includes(clickedId)
            ? currentIds.filter((i) => i !== clickedId)
            : [...currentIds, clickedId];
        } else if (clicked?.groupId) {
          nextIds = s.elements.filter((el) => el.groupId === clicked.groupId).map((el) => el.id);
        } else {
          nextIds = [clickedId];
        }
        s.setSelectedElementIds(nextIds);
        syncSettingsFromSelection(nextIds);
        return;
    }

    // Hand tool: pan only (Stage.draggable)
    if (s.activeTool === 'hand') return;

    const isSelectInteraction = s.activeTool === 'select' || hoverSelectModeRef.current;
    if (isSelectInteraction) {
      // Empty area → start marquee selection
      if (isBg || !clickedId) {
        const pos = getCanvasPoint();
        if (pos) {
          marqueeOriginRef.current = pos;
          marqueeAdditiveRef.current = e.evt.shiftKey;
          setMarquee({ x: pos.x, y: pos.y, w: 0, h: 0 });
          if (!e.evt.shiftKey) s.setSelectedElementIds([]);
        }
        const previous = hoverPreviousToolRef.current;
        hoveredAnnotationRef.current = null;
        hoverPreviousToolRef.current = null;
        if (hoverSelectModeRef.current) {
          setHoverSelectMode(false);
        }
        if (previous) s.setActiveTool(previous, { clearSelection: false });
      }
      return;
    }

    // Eraser tool: start dotted selection drag
    if (s.activeTool === 'eraser') {
      const pos = getCanvasPoint();
      if (!pos) return;
      setIsErasing(true);
      setEraserStart(pos);
      setEraserEnd(pos);
      return;
    }

    // Crop tool: drag a region to crop the image
    if (s.activeTool === 'crop') {
      const pos = getCanvasPoint();
      if (!pos) return;
      setIsDrawing(true);
      // Temporary rect used only as a crop marquee (never committed as an annotation)
      setDrawingElement({
        id: '__crop_marquee__',
        type: 'rectangle',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        stroke: '#3b82f6',
        fill: 'rgba(59,130,246,0.15)',
        strokeWidth: Math.max(1, Math.round(2 * getImageToolScale(s.imageSize.width, s.imageSize.height))),
        opacity: 1,
      } as ShapeElement);
      return;
    }

    // Text tool: show text input at click position
    if (s.activeTool === 'text') {
      const pos = getCanvasPoint();
      if (!pos) return;
      textIgnoreBlurRef.current = Date.now() + 250;
      setTextInput({ x: pos.x, y: pos.y, visible: true });
      e.cancelBubble = true;
      return;
    }

    const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
    // Unrounded: settings are canonical, elements are settings*scale, and
    // hydration divides straight back out. Rounding either leg made repeated
    // select/deselect drift the value.
    const sw = Math.max(0.5, s.strokeWidth * scale);
    const hw = Math.max(2, (s.highlighterWidth || 24) * scale);
    const pointerSize = Math.max(8, 12 * scale);

    // Step tool: place a numbered step circle
    if (s.activeTool === 'step') {
      const pos = getCanvasPoint();
      if (!pos) return;
      const r = Math.max(8, s.stepRadius * scale);
      const num = s.stepCounter;
      s.addElement({
        id: generateId(),
        type: 'step',
        x: pos.x,
        y: pos.y,
        stepNumber: num,
        radius: r,
        fill: s.strokeColor,
        fontSize: r * 0.8,
        opacity: s.opacity,
      } as StepElement);
      return;
    }

    // Shape / drawing tools
    const pos = getCanvasPoint();
    if (!pos) return;
    setIsDrawing(true);
    drawOriginRef.current = { x: pos.x, y: pos.y };
    const base: Partial<EditorElement> = {
      id: generateId(),
      opacity: s.opacity,
      strokeStyle: s.strokeStyle,
      fillStyle: s.fillStyle,
      roughness: s.roughness,
    };

    if (s.activeTool === 'pencil' || s.activeTool === 'highlighter') {
      setDrawingElement({
        ...base,
        type: s.activeTool,
        x: 0, y: 0,
        points: [pos.x, pos.y],
        stroke: s.strokeColor,
        strokeWidth: s.activeTool === 'highlighter' ? hw : sw,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.5,
        ...(s.activeTool === 'highlighter' ? { opacity: 0.4 } : {}),
      } as PencilElement);
    } else if (s.activeTool === 'arrow') {
      setDrawingElement({
        ...base,
        type: 'arrow',
        x: pos.x, y: pos.y,
        points: [0, 0, 0, 0],
        stroke: s.strokeColor,
        strokeWidth: sw,
        fill: s.strokeColor,
        pointerLength: pointerSize,
        pointerWidth: pointerSize,
        endArrowhead: s.endArrowhead,
        startArrowhead: s.startArrowhead,
      } as ArrowElement);
    } else if (s.activeTool === 'line') {
      setDrawingElement({
        ...base,
        type: 'line',
        x: pos.x, y: pos.y,
        points: [0, 0, 0, 0],
        stroke: s.strokeColor,
        strokeWidth: sw,
        endArrowhead: s.endArrowhead,
        startArrowhead: s.startArrowhead,
      } as LineElement);
    } else if (s.activeTool === 'circle' || s.activeTool === 'magnifier') {
      setDrawingElement({
        ...base,
        type: s.activeTool === 'magnifier' ? 'magnifier' : 'circle',
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        stroke: s.strokeColor,
        fill: s.activeTool === 'magnifier' ? 'transparent' : (s.fillColor === 'transparent' ? 'transparent' : s.fillColor),
        strokeWidth: sw,
        ...(s.activeTool === 'magnifier' ? { magnification: s.magnification, roughness: s.roughness } : {}),
      } as CircleElement | MagnifierElement);
    } else if (s.activeTool === 'diamond') {
      setDrawingElement({
        ...base,
        type: 'diamond',
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        stroke: s.strokeColor,
        fill: s.fillColor === 'transparent' ? 'transparent' : s.fillColor,
        strokeWidth: sw,
      } as DiamondElement);
    } else {
      // rectangle, rounded-rect, blur, pixelate, spotlight
      setDrawingElement({
        ...base,
        type: s.activeTool as ShapeElement['type'],
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        stroke: ['blur', 'pixelate', 'spotlight'].includes(s.activeTool) ? undefined : s.strokeColor,
        fill: (s.activeTool === 'blur' || s.activeTool === 'pixelate')
          ? undefined
          : (s.activeTool === 'spotlight' ? undefined : s.fillColor),
        strokeWidth: ['blur', 'pixelate', 'spotlight'].includes(s.activeTool) ? 0 : sw,
        cornerRadius: s.activeTool === 'rounded-rect' ? s.cornerRadius * scale : 0,
        blurRadius: s.activeTool === 'blur' ? s.blurRadius : undefined,
        pixelSize: s.activeTool === 'pixelate' ? s.pixelSize : undefined,
      } as ShapeElement);
    }
  }

  function handleMouseMove(e?: Konva.KonvaEventObject<any>) {
    if (e && isTransformerTarget(e.target)) return;

    // Hover-to-select: enable selection cursor/interaction without changing toolbar tool
    if (e && !isDrawing && !isErasing) {
      const s = useEditorStore.getState();
      const hoveredId = findAnnotationId(e.target);
      const drawingTools = !['select', 'hand', 'eraser', 'crop', 'magnifier'].includes(s.activeTool);
      if (hoveredId && drawingTools) {
        if (!hoveredAnnotationRef.current) hoverPreviousToolRef.current = s.activeTool;
        hoveredAnnotationRef.current = hoveredId;
        if (!hoverSelectModeRef.current) setHoverSelectMode(true);
      } else if (
        !hoveredId
        && hoveredAnnotationRef.current
        && s.selectedElementIds.length === 0
      ) {
        hoveredAnnotationRef.current = null;
        hoverPreviousToolRef.current = null;
        if (hoverSelectModeRef.current) setHoverSelectMode(false);
      }
    }

    // Marquee multi-select
    if (marqueeOriginRef.current) {
      const pos = getCanvasPoint();
      if (pos) {
        const o = marqueeOriginRef.current;
        setMarquee({
          x: Math.min(o.x, pos.x),
          y: Math.min(o.y, pos.y),
          w: Math.abs(pos.x - o.x),
          h: Math.abs(pos.y - o.y),
        });
      }
      return;
    }

    // Eraser: update selection rectangle
    if (isErasing) {
      const pos = getCanvasPoint();
      if (pos) setEraserEnd(pos);
      return;
    }

    if (!isDrawing || !drawingElement) return;
    const pos = getCanvasPoint();
    if (!pos) return;

    if (drawingElement.type === 'pencil' || drawingElement.type === 'highlighter') {
      const pencil = drawingElement as PencilElement;
      const pts = pencil.points;
      const ptCount = pts.length / 2;
      let nx = pos.x;
      let ny = pos.y;
      if (handDrawn && ptCount > 0) {
        [nx, ny] = wobbleFreehandPoint(pos.x, pos.y, ptCount, pencil.strokeWidth ?? 3);
      }
      setDrawingElement({
        ...drawingElement,
        points: [...pts, nx, ny],
      });
    } else if (drawingElement.type === 'arrow' || drawingElement.type === 'line') {
      let dx = pos.x - drawingElement.x;
      let dy = pos.y - drawingElement.y;
      if (e?.evt?.shiftKey) {
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        dx = Math.cos(snap) * len;
        dy = Math.sin(snap) * len;
      }
      if (e?.evt?.altKey && drawOriginRef.current) {
        const ox = drawOriginRef.current.x;
        const oy = drawOriginRef.current.y;
        setDrawingElement({
          ...drawingElement,
          x: ox - dx,
          y: oy - dy,
          points: [0, 0, dx * 2, dy * 2],
        } as ArrowElement | LineElement);
      } else {
        setDrawingElement({
          ...drawingElement,
          points: [0, 0, dx, dy],
        } as ArrowElement | LineElement);
      }
    } else {
      const origin = drawOriginRef.current || { x: drawingElement.x, y: drawingElement.y };
      let w = pos.x - origin.x;
      let h = pos.y - origin.y;
      // Magnifiers draw elliptically like every other shape; Shift constrains
      // to a circle rather than the tool being permanently square-locked.
      if (e?.evt?.shiftKey) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * size;
        h = Math.sign(h || 1) * size;
      }
      if (e?.evt?.altKey) {
        setDrawingElement({
          ...drawingElement,
          x: origin.x - w,
          y: origin.y - h,
          width: w * 2,
          height: h * 2,
        } as ShapeElement | CircleElement | DiamondElement | MagnifierElement);
      } else {
        setDrawingElement({
          ...drawingElement,
          x: origin.x,
          y: origin.y,
          width: w,
          height: h,
        } as ShapeElement | CircleElement | DiamondElement | MagnifierElement);
      }
    }
  }

  function handleMouseLeave() {
    const s = useEditorStore.getState();
    if (s.selectedElementIds.length) return;
    hoveredAnnotationRef.current = null;
    hoverPreviousToolRef.current = null;
    if (hoverSelectModeRef.current) setHoverSelectMode(false);
  }

  async function handleMouseUp() {
    // Marquee multi-select commit
    if (marqueeOriginRef.current && marquee) {
      const s = useEditorStore.getState();
      const box = {
        x: marquee.x,
        y: marquee.y,
        w: Math.max(marquee.w, 1),
        h: Math.max(marquee.h, 1),
      };
      const hit = s.elements
        .filter((el) => !el.locked && boundsIntersect(box, getElementBounds(el, s.imageSize)))
        .map((el) => el.id);
      if (hit.length) {
        const next = marqueeAdditiveRef.current
          ? [...new Set([...s.selectedElementIds, ...hit])]
          : hit;
        s.setSelectedElementIds(next);
        syncSettingsFromSelection(next);
      }
      marqueeOriginRef.current = null;
      marqueeAdditiveRef.current = false;
      setMarquee(null);
      return;
    }

    // Eraser: commit - remove all elements that INTERSECT the selection rect
    if (isErasing && eraserStart && eraserEnd) {
      const s = useEditorStore.getState();
      const x1 = Math.min(eraserStart.x, eraserEnd.x);
      const y1 = Math.min(eraserStart.y, eraserEnd.y);
      const x2 = Math.max(eraserStart.x, eraserEnd.x);
      const y2 = Math.max(eraserStart.y, eraserEnd.y);
      const toRemove = s.elements
        .filter((el) => elementIntersectsRect(el, x1, y1, x2, y2))
        .map((el) => el.id);
      if (toRemove.length) s.removeElements(toRemove);
      setIsErasing(false);
      setEraserStart(null);
      setEraserEnd(null);
      return;
    }

    if (!isDrawing || !drawingElement) return;
    setIsDrawing(false);
    const MIN_SIZE = 3;
    let valid = false;

    // Crop commit (marquee only - never saved as an annotation)
    if (drawingElement.id === '__crop_marquee__' && drawingElement.type === 'rectangle') {
      const shape = drawingElement as ShapeElement;
      const x = Math.min(shape.x, shape.x + shape.width);
      const y = Math.min(shape.y, shape.y + shape.height);
      const w = Math.abs(shape.width);
      const h = Math.abs(shape.height);
      setDrawingElement(null);
      if (w > MIN_SIZE && h > MIN_SIZE) {
        useEditorStore.getState().cropToRegion({ x, y, width: w, height: h });
      }
      return;
    }

    if (drawingElement.type === 'pencil' || drawingElement.type === 'highlighter') {
      valid = (drawingElement as PencilElement).points.length > 4;
    } else if (drawingElement.type === 'arrow' || drawingElement.type === 'line') {
      const pts = (drawingElement as ArrowElement | LineElement).points;
      valid = Math.abs(pts[2]) > MIN_SIZE || Math.abs(pts[3]) > MIN_SIZE;
    } else {
      const w = Math.abs((drawingElement as ShapeElement | CircleElement).width);
      const h = Math.abs((drawingElement as ShapeElement | CircleElement).height);
      valid = w > MIN_SIZE || h > MIN_SIZE;
    }

    if (valid) {
      if (drawingElement.type === 'blur' || drawingElement.type === 'pixelate') {
        const shape = drawingElement as ShapeElement;
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        const w = Math.abs(shape.width);
        const h = Math.abs(shape.height);
        const s = useEditorStore.getState();
        const intensity = drawingElement.type === 'blur' ? s.blurRadius : s.pixelSize;
        const url = await createBlurImage(x, y, w, h, drawingElement.type, intensity);
        if (url) {
          addElement({
            ...shape, x, y, width: w, height: h,
            imageDataURL: url,
            // Persisted so the region can be re-baked when it is moved,
            // resized, or its intensity is changed from the panel.
            ...(drawingElement.type === 'blur'
              ? { blurRadius: intensity }
              : { pixelSize: intensity }),
            stroke: undefined,
            fill: undefined,
          } as ShapeElement);
        }
      } else if (drawingElement.type === 'spotlight') {
        const shape = drawingElement as ShapeElement;
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        const w = Math.abs(shape.width);
        const h = Math.abs(shape.height);
        const url = await createSpotlightImage(x, y, w, h);
        if (url) {
          const imgSize = useEditorStore.getState().imageSize;
          addElement({
            ...shape, x: 0, y: 0, width: imgSize.width, height: imgSize.height,
            imageDataURL: url,
            stroke: undefined,
            fill: undefined,
          } as ShapeElement);
        }
      } else {
        let el = { ...drawingElement };
        if ('width' in el && 'height' in el) {
          if ((el as ShapeElement).width < 0) {
            el.x += (el as ShapeElement).width;
            (el as ShapeElement).width *= -1;
          }
          if ((el as ShapeElement).height < 0) {
            el.y += (el as ShapeElement).height;
            (el as ShapeElement).height *= -1;
          }
        }
        addElement(el);
      }
    }
    setDrawingElement(null);
    drawOriginRef.current = null;
    // Keep the active drawing tool so consecutive annotations stay fast
  }

  // --- Zoom helpers (wheel + pinch) ---

  function applyZoomAt(clientX: number, clientY: number, newZoom: number) {
    const st = stageRef.current;
    const root = containerRef.current;
    if (!st || !root) return;
    const rect = root.getBoundingClientRect();
    const pointer = { x: clientX - rect.left, y: clientY - rect.top };
    const s = useEditorStore.getState();
    const oldZoom = s.zoom;
    const oldPos = s.stagePosition;
    const clamped = Math.max(0.1, Math.min(5, newZoom));
    const mousePointTo = {
      x: (pointer.x - oldPos.x) / oldZoom,
      y: (pointer.y - oldPos.y) / oldZoom,
    };
    s.setZoom(clamped);
    s.setStagePosition({
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    });
    st.batchDraw();
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    const pointer = st.getPointerPosition();
    if (!pointer) return;
    const s = useEditorStore.getState();
    let delta = e.evt.deltaY;
    if (e.evt.deltaMode === 1) delta *= 16; // lines → pixels
    if (e.evt.deltaMode === 2) delta *= 400; // pages → pixels
    const factor = Math.exp(-delta * 0.0012);
    const root = containerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    applyZoomAt(rect.left + pointer.x, rect.top + pointer.y, s.zoom * factor);
  }

  // Pinch-to-zoom + two-finger pan (touch)
  const pinchRef = useRef<
    { dist: number; zoom: number; cx: number; cy: number } | null
  >(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const touchDist = (t: TouchList) => {
      if (t.length < 2) return 0;
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };
    const touchCenter = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const center = touchCenter(e.touches);
        pinchRef.current = {
          dist: touchDist(e.touches),
          zoom: useEditorStore.getState().zoom,
          cx: center.x,
          cy: center.y,
        };
        // Cancel any in-progress draw so pinch doesn't create a stroke
        setIsDrawing(false);
        setDrawingElement(null);
        setIsErasing(false);
        setEraserStart(null);
        setEraserEnd(null);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const dist = touchDist(e.touches);
      if (dist < 1 || pinchRef.current.dist < 1) return;
      const center = touchCenter(e.touches);

      // Two-finger pan: the centroid's own movement translates the stage.
      // Without this the canvas could only be panned with the hand tool, which
      // is an awkward mode switch on a phone.
      const dx = center.x - pinchRef.current.cx;
      const dy = center.y - pinchRef.current.cy;
      if (dx || dy) {
        const s = useEditorStore.getState();
        s.setStagePosition({ x: s.stagePosition.x + dx, y: s.stagePosition.y + dy });
        pinchRef.current.cx = center.x;
        pinchRef.current.cy = center.y;
      }

      const scale = dist / pinchRef.current.dist;
      applyZoomAt(center.x, center.y, pinchRef.current.zoom * scale);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // --- Selection ---

  /**
   * Pull the selected elements' real values into the tool settings.
   *
   * Every path that changes the selection must call this. Previously only the
   * stage-mousedown path hydrated (and only a subset of fields), so clicking a
   * shape - the common case - left the panel showing whatever was set last.
   */
  const syncSettingsFromSelection = useCallback((ids: string[]) => {
    const s = useEditorStore.getState();
    const els = s.elements.filter((el) => ids.includes(el.id));
    if (!els.length) return;
    const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
    const patch = hydrateSettingsFromSelection(els, scale);
    if (Object.keys(patch).length) useEditorStore.setState(patch as Partial<typeof s>);
  }, []);

  function handleSelect(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    const s = useEditorStore.getState();
    // Selection is intentionally tool-independent: clicking an annotation always
    // selects it, which makes quick corrections much less frustrating.
    e.cancelBubble = true;
    let nextIds: string[];
    if (e.evt.shiftKey) {
      const currentIds = s.selectedElementIds;
      nextIds = currentIds.includes(id)
        ? currentIds.filter((i) => i !== id)
        : [...currentIds, id];
    } else {
      nextIds = [id];
    }
    s.setSelectedElementIds(nextIds);
    syncSettingsFromSelection(nextIds);
  }

  function handleTextDblClick(el: TextElement, e: Konva.KonvaEventObject<any>) {
    const st = useEditorStore.getState();
    // Select and text tools edit on double-click; other drawing tools fall
    // back to the temporary hover-select mode.
    if (st.activeTool !== 'select' && st.activeTool !== 'text' && !hoverSelectModeRef.current) return;
    e.cancelBubble = true;
    const s = useEditorStore.getState();
    s.setSelectedElementIds([]);
    setTextInput({
      x: el.x,
      y: el.y,
      visible: true,
      editId: el.id,
      initialText: el.text,
    });
    // Hydrate before the overlay mounts so it renders in this element's own
    // font and size rather than the last-used defaults.
    syncSettingsFromSelection([el.id]);
  }

  function loadDroppedImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    void loadImageFileIntoEditor(file);
  }

  // --- Transform ---

  function handleTransform(id: string, node: Konva.Node) {
    const el = useEditorStore.getState().elements.find((e) => e.id === id);
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    if (el?.type === 'circle' && node.getClassName?.() === 'Ellipse') {
      const ellipse = node as Konva.Ellipse;
      const rx = Math.max(2.5, ellipse.radiusX() * scaleX);
      const ry = Math.max(2.5, ellipse.radiusY() * scaleY);
      ellipse.radiusX(rx);
      ellipse.radiusY(ry);
      ellipse.scaleX(1);
      ellipse.scaleY(1);
      updateElement(id, {
        x: ellipse.x() - rx,
        y: ellipse.y() - ry,
        width: rx * 2,
        height: ry * 2,
        rotation: ellipse.rotation(),
        scaleX: 1,
        scaleY: 1,
      });
      return;
    }

    const updates: Partial<EditorElement> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: 1,
      scaleY: 1,
    };

    /*
      Types whose size is not `width`/`height`. Without these branches the
      generic path below silently discarded the resize (the `'width' in el`
      guard was false), so text and step badges showed handles that did nothing.
    */
    if (el?.type === 'text') {
      const textEl = el as TextElement;
      const baseWidth = node.width() || textEl.width || 0;
      // Side handles re-wrap; corner handles scale the type itself, which is
      // what "make this label bigger" means.
      const corner = Math.abs(scaleX - scaleY) < 0.01 && Math.abs(scaleX - 1) > 0.01;
      const nextWidth = Math.max(20, baseWidth * scaleX);
      updateElement(id, {
        ...updates,
        width: nextWidth,
        ...(corner
          ? { fontSize: Math.max(4, (textEl.fontSize ?? 24) * Math.sqrt(scaleX * scaleY)) }
          : {}),
      } as Partial<TextElement>);
      node.scaleX(1);
      node.scaleY(1);
      node.width(nextWidth);
      return;
    }

    if (el?.type === 'step') {
      const stepEl = el as StepElement;
      const r = Math.max(8, (stepEl.radius ?? 16) * Math.max(scaleX, scaleY));
      updateElement(id, {
        ...updates,
        radius: r,
        fontSize: r * 0.8,
      } as Partial<StepElement>);
      node.scaleX(1);
      node.scaleY(1);
      return;
    }

    if (el?.type === 'pencil' || el?.type === 'highlighter') {
      // Freehand points are absolute image coordinates with the element pinned
      // at 0,0 - an invariant cropToRegion relies on. Scale the points about
      // their own bounding box and leave x/y alone.
      const pencilEl = el as PencilElement;
      const pts = pencilEl.points ?? [];
      if (pts.length >= 2) {
        let minX = Infinity;
        let minY = Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]);
          minY = Math.min(minY, pts[i + 1]);
        }
        const scaled = pts.map((v, i) =>
          i % 2 === 0 ? minX + (v - minX) * scaleX : minY + (v - minY) * scaleY,
        );
        updateElement(id, {
          x: 0,
          y: 0,
          rotation: node.rotation(),
          scaleX: 1,
          scaleY: 1,
          points: scaled,
        } as Partial<PencilElement>);
      }
      node.scaleX(1);
      node.scaleY(1);
      node.position({ x: 0, y: 0 });
      return;
    }

    if (el && ('width' in el)) {
      const baseW = node.width() || (el as ShapeElement).width || 0;
      const baseH = node.height() || (el as ShapeElement).height || 0;
      const w = Math.max(5, Math.abs(baseW * scaleX));
      const h = Math.max(5, Math.abs(baseH * scaleY));
      (updates as Partial<ShapeElement>).width = w;
      (updates as Partial<ShapeElement>).height = h;
      node.width(w);
      node.height(h);
    }

    node.scaleX(1);
    node.scaleY(1);
    updateElement(id, updates);
  }

  // --- Drag end ---

  function handleDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    setGuides([]);
    let x = e.target.x();
    let y = e.target.y();
    const s = useEditorStore.getState();
    const el = s.elements.find((item) => item.id === id);
    if (el) {
      const moving = { ...getElementBounds(el), x, y };
      // Approximate: for positioned elements use node x/y as top-left when applicable
      if ('width' in el) {
        moving.x = x;
        moving.y = y;
        moving.w = Math.abs((el as ShapeElement).width || 0);
        moving.h = Math.abs((el as ShapeElement).height || 0);
      }
      const others = s.elements
        .filter((item) => item.id !== id && !s.selectedElementIds.includes(item.id))
        .map((item) => getElementBounds(item, s.imageSize));
      const snapped = snapBounds(moving, others);
      x = snapped.x;
      y = snapped.y;
      e.target.position({ x, y });
    }

    if (altDuplicateRef.current === id) {
      altDuplicateRef.current = null;
      const source = s.elements.find((item) => item.id === id);
      if (source) {
        const clone = {
          ...JSON.parse(JSON.stringify(source)),
          id: generateId(),
          x,
          y,
        } as EditorElement;
        // Restore original position, add clone at new position
        const orig = s.elements.find((item) => item.id === id);
        if (orig) {
          e.target.position({ x: orig.x, y: orig.y });
          s.addElement(clone);
          s.setSelectedElementIds([clone.id]);
          return;
        }
      }
    }

    updateElement(id, { x, y });
  }

  function handleDragMove(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    const s = useEditorStore.getState();
    const el = s.elements.find((item) => item.id === id);
    if (!el || !('width' in el)) {
      setGuides([]);
      return;
    }
    const moving = {
      x: e.target.x(),
      y: e.target.y(),
      w: Math.abs((el as ShapeElement).width || 0),
      h: Math.abs((el as ShapeElement).height || 0),
    };
    const others = s.elements
      .filter((item) => item.id !== id)
      .map((item) => getElementBounds(item, s.imageSize));
    const snapped = snapBounds(moving, others);
    setGuides(snapped.guides);
    e.target.position({ x: snapped.x, y: snapped.y });
  }

  // --- Element rendering ---

  const handleElementTransformEnd = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const node = findAnnotationNode(stage, id);
      if (node) handleTransform(id, node);
    });
  }, []);

  /**
   * Live-update an arrow/line node while one of its handles is dragged.
   *
   * The handle's drag is Konva-owned; writing the geometry to the store on
   * every pointermove re-renders the handle at the recomputed position, which
   * fights Konva's drag and makes the first drag barely bend (the handle keeps
   * snapping back toward the chord). Instead the node is mutated in place and
   * the store is only touched on commit, so one continuous drag deforms
   * smoothly and stays a single undo step. Works for the legacy 2-point + bend
   * form and for multi-point polylines, and carries the stroke dash so a bent
   * dotted arrow stays dotted.
   */
  const applyArrowLineLive = (
    id: string,
    points: number[],
    bendVal: number,
    strokeWidth: number,
    handDrawnStyle: boolean,
    strokeStyle?: string,
  ) => {
    const st = stageRef.current;
    if (!st) return;
    const node = findAnnotationNode(st, id);
    if (!node) return;
    const multi = points.length > 4;
    const basePoints = multi
      ? points
      : renderPoints(points[0] ?? 0, points[1] ?? 0, points[2] ?? 0, points[3] ?? 0, bendVal);
    const drawPoints = handDrawnStyle
      ? handDrawnPolyline(basePoints, id, strokeWidth, 0.2)
      : basePoints;
    // Multi-point stays straight-segment: Konva's tension spline only
    // interpolates every other vertex past 4 points (the line would skip the
    // interior dots). The jitter already provides the hand-drawn wobble.
    const tension = multi
      ? 0
      : (handDrawnStyle ? (bendVal ? 0.45 : 0.2) : (bendVal ? 0.5 : 0));
    node.setAttrs({
      points: drawPoints,
      tension,
      dash: strokeDash(strokeStyle),
    });
    node.getLayer()?.batchDraw();
  };

  function renderElement(el: EditorElement, isDraft = false) {
    const s = useEditorStore.getState();
    const isSelectMode = s.activeTool === 'select' || hoverSelectModeRef.current;
    const isSelected = s.selectedElementIds.includes(el.id);
    const canManipulate = isSelectMode || isSelected;
    const draggable = !isDraft && canManipulate && !el.locked && !s.annotationsLocked;
    const listening = !isDraft;
    const baseProps = {
      id: el.id,
      x: el.x,
      y: el.y,
      opacity: el.opacity ?? 1,
      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      draggable: draggable && !el.locked,
      listening,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onTap: ((e: Konva.KonvaEventObject<Event>) => handleSelect(el.id, e as Konva.KonvaEventObject<MouseEvent>)) as any,
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e),
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(el.id, e),
      onTransformEnd: () => handleElementTransformEnd(el.id),
    };

    switch (el.type) {
      case 'rectangle':
      case 'rounded-rect': {
        const shape = el as ShapeElement;
        // If element has imageDataURL (pasted image), render as image
        if (shape.imageDataURL) {
          return (
            <CachedKonvaImage
              key={shape.id}
              {...baseProps}
              src={shape.imageDataURL}
              width={shape.width}
              height={shape.height}
              cornerRadius={shape.cornerRadius ?? 0}
            />
          );
        }
        const isCropMarquee = shape.id === '__crop_marquee__';
        if (isCropMarquee) {
          return (
            <Rect
              key={shape.id}
              {...baseProps}
              width={shape.width}
              height={shape.height}
              fill={shape.fill}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              dash={[8, 4]}
              listening={false}
            />
          );
        }
        if (handDrawn) {
          const w = Math.abs(shape.width || 0);
          const h = Math.abs(shape.height || 0);
          return (
            <RoughKonvaShape
              key={shape.id}
              kind="rectangle"
              seed={shape.id}
              id={shape.id}
              x={shape.width < 0 ? shape.x + shape.width : shape.x}
              y={shape.height < 0 ? shape.y + shape.height : shape.y}
              width={w}
              height={h}
              stroke={shape.stroke}
              fill={shape.fill}
              strokeWidth={shape.strokeWidth}
              strokeStyle={shape.strokeStyle}
              fillStyle={shape.fillStyle}
              roughness={shape.roughness ?? 1.25}
              cornerRadius={shape.cornerRadius}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Rect
            key={shape.id}
            {...baseProps}
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            cornerRadius={shape.cornerRadius ?? 0}
            dash={shape.strokeStyle === 'dashed' ? [8, 6] : shape.strokeStyle === 'dotted' ? [2, 4] : undefined}
          />
        );
      }

      case 'diamond': {
        const diamond = el as DiamondElement;
        const w = Math.abs(diamond.width || 0);
        const h = Math.abs(diamond.height || 0);
        const x = diamond.width < 0 ? diamond.x + diamond.width : diamond.x;
        const y = diamond.height < 0 ? diamond.y + diamond.height : diamond.y;
        if (handDrawn) {
          return (
            <RoughKonvaShape
              key={diamond.id}
              kind="diamond"
              seed={diamond.id}
              id={diamond.id}
              x={x}
              y={y}
              width={w}
              height={h}
              stroke={diamond.stroke}
              fill={diamond.fill}
              strokeWidth={diamond.strokeWidth}
              strokeStyle={diamond.strokeStyle}
              fillStyle={diamond.fillStyle}
              roughness={diamond.roughness ?? 1.25}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Line
            key={diamond.id}
            {...baseProps}
            x={x}
            y={y}
            points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
            closed
            fill={diamond.fill}
            stroke={diamond.stroke}
            strokeWidth={diamond.strokeWidth}
          />
        );
      }

      case 'spotlight': {
        return null;
      }

      case 'blur':
      case 'pixelate': {
        const shape = el as ShapeElement;
        if (isDraft && !shape.imageDataURL) {
          return (
            <Rect
              key={shape.id}
              {...baseProps}
              x={Math.min(shape.x, shape.x + shape.width)}
              y={Math.min(shape.y, shape.y + shape.height)}
              width={Math.abs(shape.width)}
              height={Math.abs(shape.height)}
              fill="rgba(59,130,246,0.1)"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
          );
        }
        if (!shape.imageDataURL) return null;
        return (
          <CachedKonvaImage
            key={shape.id}
            {...baseProps}
            src={shape.imageDataURL}
            width={shape.width}
            height={shape.height}
          />
        );
      }

      case 'magnifier': {
        const mag = el as MagnifierElement;
        // Resizing keeps the source centered, so the magnified region stays put.
        const resizeToRadii = (radii: { rx: number; ry: number }, commit: boolean) => {
          const { cx, cy } = magnifierSourceCenter(mag);
          const updates = {
            x: cx - radii.rx,
            y: cy - radii.ry,
            width: radii.rx * 2,
            height: radii.ry * 2,
          };
          if (commit) commitElementUpdate(mag.id, updates);
          else updateElementSilent(mag.id, updates);
        };
        return (
          <MagnifierKonva
            key={mag.id}
            el={mag}
            backgroundImage={backgroundImage}
            imageSize={imageSize}
            selected={isSelected}
            accent={getSelectionTheme().accent}
            opacity={baseProps.opacity}
            listening={baseProps.listening}
            draggable={baseProps.draggable}
            draft={isDraft}
            handDrawn={handDrawn}
            onClick={baseProps.onClick}
            onTap={baseProps.onTap}
            onDragEnd={baseProps.onDragEnd}
            onDragMove={baseProps.onDragMove}
            onPreviewOffsetMove={(offset) => updateElementSilent(mag.id, { previewOffset: offset })}
            onPreviewOffsetCommit={(offset) => commitElementUpdate(mag.id, { previewOffset: offset })}
            onRadiiMove={(radii) => resizeToRadii(radii, false)}
            onRadiiCommit={(radii) => resizeToRadii(radii, true)}
            onLeaderBendMove={(bend) => updateElementSilent(mag.id, { leaderBend: bend })}
            onLeaderBendCommit={(bend) => commitElementUpdate(mag.id, { leaderBend: bend })}
          />
        );
      }

      case 'circle': {
        const circle = el as CircleElement;
        const w = Math.abs(circle.width);
        const h = Math.abs(circle.height);
        const x = circle.width < 0 ? circle.x + circle.width : circle.x;
        const y = circle.height < 0 ? circle.y + circle.height : circle.y;
        if (handDrawn) {
          return (
            <RoughKonvaShape
              key={circle.id}
              kind="ellipse"
              seed={circle.id}
              id={circle.id}
              x={x}
              y={y}
              width={w}
              height={h}
              stroke={circle.stroke}
              fill={circle.fill}
              strokeWidth={circle.strokeWidth}
              strokeStyle={circle.strokeStyle}
              fillStyle={circle.fillStyle}
              roughness={circle.roughness ?? 1.25}
              opacity={baseProps.opacity}
              listening={baseProps.listening}
              draggable={baseProps.draggable}
              rotation={baseProps.rotation}
              scaleX={baseProps.scaleX}
              scaleY={baseProps.scaleY}
              onClick={baseProps.onClick}
              onTap={baseProps.onTap}
              onDragEnd={baseProps.onDragEnd}
              onTransformEnd={baseProps.onTransformEnd}
            />
          );
        }
        return (
          <Ellipse
            key={circle.id}
            {...baseProps}
            x={x + w / 2}
            y={y + h / 2}
            radiusX={Math.max(2.5, w / 2)}
            radiusY={Math.max(2.5, h / 2)}
            fill={circle.fill}
            stroke={circle.stroke}
            strokeWidth={circle.strokeWidth}
            dash={circle.strokeStyle === 'dashed' ? [8, 6] : circle.strokeStyle === 'dotted' ? [2, 4] : undefined}
          />
        );
      }

      case 'arrow': {
        const arrow = el as ArrowElement;
        const [sx, sy, ex, ey] = arrow.points;
        const bend = arrow.bend ?? 0;
        const control = controlPoint(sx, sy, ex, ey, bend);
        const showHandles = !isDraft && isSelected;
        const handleProps = selectionHandleProps('endpoint');
        const bendHandleProps = selectionHandleProps('bend');
        const styleDash = strokeDash(arrow.strokeStyle);
        const isMulti = arrow.points.length > 4;
        const multiPoints = isMulti ? arrow.points : [];
        const hoverHandles = handleHoverEvents();

        // Simple 3-dot editing: start, middle (bend), end. In hand-drawn mode
        // the polyline is jittered, so handles must sit on the *drawn* points
        // or the dots visibly float off the line.
        const basePoints = isMulti ? arrow.points : renderPoints(sx, sy, ex, ey, bend);
        const drawPoints = handDrawn
          ? handDrawnPolyline(basePoints, arrow.id, arrow.strokeWidth || 2, 0.2)
          : basePoints;
        /** Per-index jitter delta (0 when not hand-drawn). */
        const jit = handDrawn ? basePoints.map((v, i) => drawPoints[i] - v) : null;
        const offAt = (i: number) => (jit ? jit[i] : 0);

        /** Middle vertex index for multi-point elements (mid handle target). */
        const midVertexIdx = isMulti ? Math.floor(multiPoints.length / 4) * 2 : -1;

        const updatePoint = (idx: number, node: Konva.Node, commit: boolean) => {
          // The handle sits on the drawn point; store the raw point so the
          // drawn vertex stays glued to the pointer through the jitter.
          const localX = node.x() - arrow.x - offAt(idx);
          const localY = node.y() - arrow.y - offAt(idx + 1);
          const newPoints = [...arrow.points];
          newPoints[idx] = localX;
          newPoints[idx + 1] = localY;
          if (commit) commitElementUpdate(arrow.id, { points: newPoints });
          else applyArrowLineLive(arrow.id, newPoints, 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
        };
        const updateBendFromHandle = (node: Konva.Node, commit = false) => {
          // The bend handle sits on the drawn control point; only the bent
          // (6-coordinate) form has a jittered middle point to compensate.
          const hasDrawnControl = drawPoints.length > 4;
          const bendVal = bendFromHandle(
            sx, sy, ex, ey,
            node.x() - arrow.x - (hasDrawnControl ? offAt(2) : 0),
            node.y() - arrow.y - (hasDrawnControl ? offAt(3) : 0),
          );
          if (commit) {
            // A click on the handle without movement fires dragEnd too; do not
            // push a history entry for a bend that never changed. Compare with
            // the live store value: the hand-drawn path may have already
            // written a silent bend on the first move.
            const current = useEditorStore.getState().elements.find((x) => x.id === arrow.id) as ArrowElement | undefined;
            if (bendVal !== (current?.bend ?? 0)) commitElementUpdate(arrow.id, { bend: bendVal });
          } else if (handDrawn) {
            // Rough shapes bake their path at render, so a rough arrow cannot
            // bend live: one silent write switches it to the jittered curve
            // path, after which the drag continues imperatively.
            const live = useEditorStore.getState().elements.find((x) => x.id === arrow.id);
            if (!(live as ArrowElement | undefined)?.bend) {
              updateElementSilent(arrow.id, { bend: bendVal });
            }
            applyArrowLineLive(arrow.id, [sx, sy, ex, ey], bendVal, arrow.strokeWidth ?? 2, true, arrow.strokeStyle);
          } else {
            applyArrowLineLive(arrow.id, [sx, sy, ex, ey], bendVal, arrow.strokeWidth ?? 2, false, arrow.strokeStyle);
          }
        };
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false) => {
          // Copy the points and replace only the dragged endpoint, so multi-point
          // polylines keep their interior vertices instead of collapsing to two.
          const eIdx = which === 'start' ? 0 : arrow.points.length - 2;
          const newPoints = [...arrow.points];
          newPoints[eIdx] = node.x() - arrow.x - offAt(eIdx);
          newPoints[eIdx + 1] = node.y() - arrow.y - offAt(eIdx + 1);
          if (commit) commitElementUpdate(arrow.id, { points: newPoints, bend: arrow.bend ?? 0 });
          else applyArrowLineLive(arrow.id, newPoints, arrow.bend ?? 0, arrow.strokeWidth ?? 2, handDrawn, arrow.strokeStyle);
        };

        const headSize = arrow.pointerLength ?? Math.max(10, (arrow.strokeWidth || 2) * 4);
        const showHead = (arrow.endArrowhead ?? 'arrow') !== 'none';
        const showStartHead = (arrow.startArrowhead ?? 'none') !== 'none';
        const startTangent = isMulti
          ? (() => {
              const dx = multiPoints[2] - multiPoints[0];
              const dy = multiPoints[3] - multiPoints[1];
              const len = Math.hypot(dx, dy) || 1;
              return { x: dx / len, y: dy / len };
            })()
          : tangentAtStart(sx, sy, ex, ey, bend);

        if (handDrawn && bend === 0 && !isMulti) {
          return (
            <React.Fragment key={arrow.id}>
              <RoughKonvaShape
                kind="arrow"
                seed={arrow.id}
                id={arrow.id}
                x={arrow.x}
                y={arrow.y}
                points={[sx, sy, ex, ey]}
                stroke={arrow.stroke}
                strokeWidth={arrow.strokeWidth}
                strokeStyle={arrow.strokeStyle}
                roughness={arrow.roughness ?? 1.25}
                arrowheadSize={showHead ? headSize : 0}
                showArrowhead={showHead}
                showStartArrowhead={showStartHead}
                opacity={baseProps.opacity}
                listening={baseProps.listening}
                draggable={baseProps.draggable}
                rotation={baseProps.rotation}
                scaleX={baseProps.scaleX}
                scaleY={baseProps.scaleY}
                onClick={baseProps.onClick}
                onTap={baseProps.onTap}
                onDragEnd={baseProps.onDragEnd}
                onDragMove={baseProps.onDragMove}
                onTransformEnd={baseProps.onTransformEnd}
                hitStrokeWidth={18}
              />
              {showHandles && (
                <>
                  <Circle x={arrow.x + sx} y={arrow.y + sy} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                    {...hoverHandles}
                  />
                  <Circle x={arrow.x + control.x} y={arrow.y + control.y} {...bendHandleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
                    {...hoverHandles}
                  />
                  <Circle x={arrow.x + ex} y={arrow.y + ey} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                    {...hoverHandles}
                  />
                </>
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={arrow.id}>
            <Arrow
              {...baseProps}
              points={drawPoints}
              stroke={arrow.stroke}
              strokeWidth={arrow.strokeWidth}
              fill={arrow.fill}
              pointerLength={showHead ? headSize : 0}
              pointerWidth={showHead ? (arrow.pointerWidth ?? headSize) : 0}
              dash={styleDash}
              // Multi-point stays straight-segment (tension 0): Konva's tension
              // spline only interpolates every other vertex past 4 points, which
              // made the line skip the interior dots. The jitter already gives
              // hand-drawn wobble, so no smoothing is needed here.
              tension={isMulti ? 0 : (handDrawn ? (bend === 0 ? 0.2 : 0.45) : (bend === 0 ? 0 : 0.5))}
            />
            {showStartHead && (() => {
              // Point the head along the curve's own tangent: using the straight
              // chord aimed it visibly wrong on a bent arrow.
              const tri = arrowHeadPoints(sx + startTangent.x, sy + startTangent.y, sx, sy, headSize);
              return (
                <Line
                  x={arrow.x}
                  y={arrow.y}
                  points={tri.flat()}
                  closed
                  fill={arrow.fill || arrow.stroke}
                  stroke={arrow.stroke}
                  strokeWidth={1}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              );
            })()}
            {showHandles && (
              <>
                <Circle x={arrow.x + drawPoints[0]} y={arrow.y + drawPoints[1]} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                  {...hoverHandles}
                />
                {isMulti ? (
                  // Multi-point polylines keep just the middle vertex handle;
                  // everything else is the classic 3-dot model.
                  <Circle x={arrow.x + drawPoints[midVertexIdx]}
                    y={arrow.y + drawPoints[midVertexIdx + 1]}
                    {...bendHandleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, true); }}
                    {...hoverHandles}
                  />
                ) : (
                  <Circle x={arrow.x + (drawPoints.length > 4 ? drawPoints[2] : control.x)}
                    y={arrow.y + (drawPoints.length > 4 ? drawPoints[3] : control.y)}
                    {...bendHandleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
                    {...hoverHandles}
                  />
                )}
                <Circle x={arrow.x + drawPoints[drawPoints.length - 2]}
                  y={arrow.y + drawPoints[drawPoints.length - 1]}
                  {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                  {...hoverHandles}
                />
              </>
            )}
          </React.Fragment>
        );
      }

      case 'line': {
        const line = el as LineElement;
        const [sx, sy, ex, ey] = line.points;
        const bend = line.bend ?? 0;
        const control = controlPoint(sx, sy, ex, ey, bend);
        const showHandles = !isDraft && isSelected;
        const handleProps = selectionHandleProps('endpoint');
        const bendHandleProps = selectionHandleProps('bend');
        const styleDash = strokeDash(line.strokeStyle);
        const isMulti = line.points.length > 4;
        const multiPoints = isMulti ? line.points : [];
        const hoverHandles = handleHoverEvents();

        // Simple 3-dot editing: start, middle (bend), end. In hand-drawn mode
        // the polyline is jittered, so handles must sit on the *drawn* points
        // or the dots visibly float off the line.
        const basePoints = isMulti ? line.points : renderPoints(sx, sy, ex, ey, bend);
        const drawPoints = handDrawn
          ? handDrawnPolyline(basePoints, line.id, line.strokeWidth || 2, 0.2)
          : basePoints;
        /** Per-index jitter delta (0 when not hand-drawn). */
        const jit = handDrawn ? basePoints.map((v, i) => drawPoints[i] - v) : null;
        const offAt = (i: number) => (jit ? jit[i] : 0);

        /** Middle vertex index for multi-point elements (mid handle target). */
        const midVertexIdx = isMulti ? Math.floor(multiPoints.length / 4) * 2 : -1;

        const updatePoint = (idx: number, node: Konva.Node, commit: boolean) => {
          // The handle sits on the drawn point; store the raw point so the
          // drawn vertex stays glued to the pointer through the jitter.
          const localX = node.x() - line.x - offAt(idx);
          const localY = node.y() - line.y - offAt(idx + 1);
          const newPoints = [...line.points];
          newPoints[idx] = localX;
          newPoints[idx + 1] = localY;
          if (commit) commitElementUpdate(line.id, { points: newPoints });
          else applyArrowLineLive(line.id, newPoints, 0, line.strokeWidth ?? 2, handDrawn, line.strokeStyle);
        };
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false) => {
          // Copy the points and replace only the dragged endpoint, so multi-point
          // polylines keep their interior vertices instead of collapsing to two.
          const eIdx = which === 'start' ? 0 : line.points.length - 2;
          const newPoints = [...line.points];
          newPoints[eIdx] = node.x() - line.x - offAt(eIdx);
          newPoints[eIdx + 1] = node.y() - line.y - offAt(eIdx + 1);
          if (commit) commitElementUpdate(line.id, { points: newPoints });
          else applyArrowLineLive(line.id, newPoints, line.bend ?? 0, line.strokeWidth ?? 2, handDrawn, line.strokeStyle);
        };
        const updateBendFromHandle = (node: Konva.Node, commit = false) => {
          // The bend handle sits on the drawn control point; only the bent
          // (6-coordinate) form has a jittered middle point to compensate.
          const hasDrawnControl = drawPoints.length > 4;
          const bendVal = bendFromHandle(
            sx, sy, ex, ey,
            node.x() - line.x - (hasDrawnControl ? offAt(2) : 0),
            node.y() - line.y - (hasDrawnControl ? offAt(3) : 0),
          );
          if (commit) {
            const current = useEditorStore.getState().elements.find((x) => x.id === line.id) as LineElement | undefined;
            if (bendVal !== (current?.bend ?? 0)) commitElementUpdate(line.id, { bend: bendVal });
          } else if (handDrawn) {
            const live = useEditorStore.getState().elements.find((x) => x.id === line.id);
            if (!(live as LineElement | undefined)?.bend) {
              updateElementSilent(line.id, { bend: bendVal });
            }
            applyArrowLineLive(line.id, [sx, sy, ex, ey], bendVal, line.strokeWidth ?? 2, true, line.strokeStyle);
          } else {
            applyArrowLineLive(line.id, [sx, sy, ex, ey], bendVal, line.strokeWidth ?? 2, false, line.strokeStyle);
          }
        };
        const bendHandle = showHandles && !isMulti ? (
          <Circle
            x={line.x + (drawPoints.length > 4 ? drawPoints[2] : control.x)}
            y={line.y + (drawPoints.length > 4 ? drawPoints[3] : control.y)}
            {...bendHandleProps} draggable
            onMouseDown={(e) => { e.cancelBubble = true; }}
            onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
            onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
            {...hoverHandles}
          />
        ) : null;

        // Rough draws straight segments only; a bent line falls back to the
        // jittered polyline the arrow tool already uses for its curves.
        if (handDrawn && bend === 0 && !isMulti) {
          return (
            <React.Fragment key={line.id}>
              <RoughKonvaShape
                kind="line"
                seed={line.id}
                id={line.id}
                x={line.x}
                y={line.y}
                points={[sx, sy, ex, ey]}
                stroke={line.stroke}
                strokeWidth={line.strokeWidth}
                strokeStyle={line.strokeStyle}
                roughness={line.roughness ?? 1.25}
                opacity={baseProps.opacity}
                listening={baseProps.listening}
                draggable={baseProps.draggable}
                rotation={baseProps.rotation}
                scaleX={baseProps.scaleX}
                scaleY={baseProps.scaleY}
                onClick={baseProps.onClick}
                onTap={baseProps.onTap}
                onDragEnd={baseProps.onDragEnd}
                onDragMove={baseProps.onDragMove}
                onTransformEnd={baseProps.onTransformEnd}
                hitStrokeWidth={18}
              />
              {showHandles && (
                <>
                  <Circle x={line.x + sx} y={line.y + sy} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                    {...hoverHandles}
                  />
                  {bendHandle}
                  <Circle x={line.x + ex} y={line.y + ey} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                    {...hoverHandles}
                  />
                </>
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={line.id}>
            <Line
              {...baseProps}
              points={drawPoints}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              dash={styleDash}
              // Multi-point stays straight-segment (tension 0): see the arrow.
              tension={isMulti ? 0 : (handDrawn ? (bend === 0 ? 0.2 : 0.45) : (bend === 0 ? 0 : 0.5))}
              hitStrokeWidth={16}
            />
            {showHandles && (
              <>
                <Circle x={line.x + drawPoints[0]} y={line.y + drawPoints[1]} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                  {...hoverHandles}
                />
                {isMulti ? (
                  <Circle x={line.x + drawPoints[midVertexIdx]}
                    y={line.y + drawPoints[midVertexIdx + 1]}
                    {...bendHandleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updatePoint(midVertexIdx, e.target, true); }}
                    {...hoverHandles}
                  />
                ) : (
                  bendHandle
                )}
                <Circle x={line.x + drawPoints[drawPoints.length - 2]}
                  y={line.y + drawPoints[drawPoints.length - 1]}
                  {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                  {...hoverHandles}
                />
              </>
            )}
          </React.Fragment>
        );
      }

      case 'pencil':
      case 'highlighter': {
        const pencil = el as PencilElement;
        return (
          <Line
            key={pencil.id}
            {...baseProps}
            points={pencil.points}
            stroke={pencil.stroke}
            strokeWidth={pencil.strokeWidth}
            lineCap={pencil.lineCap ?? 'round'}
            lineJoin={pencil.lineJoin ?? 'round'}
            tension={handDrawn ? 0.55 : (pencil.tension ?? 0.5)}
            hitStrokeWidth={20}
          />
        );
      }

      case 'text': {
        const textEl = el as TextElement;
        // Hide while editing in the textarea overlay
        if (textInput.visible && textInput.editId === textEl.id) return null;
        return (
          <Text
            key={textEl.id}
            {...baseProps}
            text={textEl.text}
            fontSize={textEl.fontSize ?? 24}
            fontFamily={fontFamilyForCanvas(textEl.fontFamily)}
            fontStyle={textEl.fontStyle}
            fill={textEl.fill ?? '#000000'}
            stroke={textEl.stroke}
            strokeWidth={textEl.strokeWidth}
            padding={textEl.padding ?? TEXT_PADDING}
            // Konva defaults to 1, the edit overlay to 1.25: multi-line text
            // reflowed the moment it was committed.
            lineHeight={textEl.lineHeight ?? TEXT_LINE_HEIGHT}
            width={textEl.width}
            wrap={textEl.width ? 'word' : 'none'}
            align={textEl.align ?? 'left'}
            listening={true}
            onDblClick={(e) => handleTextDblClick(textEl, e)}
            onDblTap={(e) => handleTextDblClick(textEl, e)}
          />
        );
      }

      case 'step': {
        const step = el as StepElement;
        const r = step.radius ?? 16;
        const fs = step.fontSize ?? Math.round(r * 0.8);
        if (handDrawn) {
          const points = handDrawnEllipsePoints(r, r, step.id, 2, 24);
          return (
            <Group key={step.id} {...baseProps} listening={true}>
              <Line
                points={points}
                closed
                fill={step.fill ?? '#ef4444'}
                stroke="#ffffff"
                strokeWidth={2}
                tension={0.15}
                lineJoin="round"
              />
              <Text
                text={String(step.stepNumber)}
                fontSize={fs}
                fontFamily={BADGE_FONT}
                fontStyle="bold"
                fill="#ffffff"
                align="center"
                verticalAlign="middle"
                width={r * 2}
                height={r * 2}
                offsetX={r}
                offsetY={r}
              />
            </Group>
          );
        }
        return (
          <Group key={step.id} {...baseProps} listening={true}>
            <Circle
              radius={r}
              fill={step.fill ?? '#ef4444'}
              stroke="#ffffff"
              strokeWidth={2}
              hitFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.arc(0, 0, r + 4, 0, Math.PI * 2, false);
                ctx.closePath();
                ctx.fillStrokeShape(shape);
              }}
            />
            <Text
              text={String(step.stepNumber)}
              fontSize={fs}
              fontFamily={BADGE_FONT}
              fontStyle="bold"
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              width={r * 2}
              height={r * 2}
              offsetX={r}
              offsetY={r}
            />
          </Group>
        );
      }

      default:
        return null;
    }
  }

  // Render eraser draft: red dotted box while dragging + red tint on every
  // element that would be deleted, so the eraser is a preview instead of a
  // surprise. Both use the same hit test as the commit, so what you see is
  // exactly what gets removed on mouse-up.
  function renderEraserDraft() {
    if (!isErasing || !eraserStart || !eraserEnd) return null;
    const x1 = Math.min(eraserStart.x, eraserEnd.x);
    const y1 = Math.min(eraserStart.y, eraserEnd.y);
    const x2 = Math.max(eraserStart.x, eraserEnd.x);
    const y2 = Math.max(eraserStart.y, eraserEnd.y);
    const w = x2 - x1;
    const h = y2 - y1;
    const hitIds = new Set(
      useEditorStore.getState().elements
        .filter((el) => elementIntersectsRect(el, x1, y1, x2, y2))
        .map((el) => el.id),
    );
    return (
      <>
        <Rect
          x={x1}
          y={y1}
          width={w}
          height={h}
          fill="rgba(239,68,68,0.06)"
          stroke="#ef4444"
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
        {elements
          .filter((el) => hitIds.has(el.id))
          .map((el) => {
            const b = getElementHitBox(el);
            return (
              <Group key={`erase-preview-${el.id}`} listening={false}>
                <Rect
                  x={b.x1 - 2}
                  y={b.y1 - 2}
                  width={b.x2 - b.x1 + 4}
                  height={b.y2 - b.y1 + 4}
                  fill="rgba(239,68,68,0.22)"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dash={[4, 3]}
                />
              </Group>
            );
          })}
      </>
    );
  }

  // Render spotlight draft (dotted box while dragging)
  function renderSpotlightDraft() {
    if (!drawingElement || drawingElement.type !== 'spotlight') return null;
    const shape = drawingElement as ShapeElement;
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    const w = Math.abs(shape.width);
    const h = Math.abs(shape.height);
    return (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(250,204,21,0.08)"
        stroke="#facc15"
        strokeWidth={1.5}
        dash={[6, 4]}
        listening={false}
      />
    );
  }

  // Premium selection chrome follows theme tokens
  const selectionTheme = useMemo(() => getSelectionTheme(), [activeTool, selectedElementIds]);

  // Style transformer anchors when theme changes
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    tr.anchorStyleFunc(styleSelectionAnchor);
    tr.getLayer()?.batchDraw();
  }, [selectionTheme, selectedElementIds]);
  const bgFill = useMemo(() => {
    const cs = canvasStyle;
    if (cs.bgStyle === 'solid') return cs.bgColor || '#ffffff';
    if (cs.bgStyle === 'glass') return '#f0f0f0';
    if (cs.bgStyle === 'gradient') return undefined; // handled via linear gradient props
    if (cs.padding > 0) return 'transparent';
    return undefined;
  }, [canvasStyle.bgStyle, canvasStyle.bgColor, canvasStyle.padding]);

  const annotationsLocked = useEditorStore((s) => s.annotationsLocked);
  const contentPad = canvasStyle.padding || 0;
  // Device chrome extends the frame beyond the image + padding (live ≈ export).
  const frameInsets = DEVICE_FRAME_INSETS[canvasStyle.deviceFrame];
  const contentOffsetX = contentPad + frameInsets.left;
  const contentOffsetY = contentPad + frameInsets.top;
  const frameW = (imageSize.width || 0) + contentPad * 2 + frameInsets.left + frameInsets.right;
  const frameH = (imageSize.height || 0) + contentPad * 2 + frameInsets.top + frameInsets.bottom;
  const showFrame = !!backgroundImage && (contentPad > 0 || canvasStyle.bgStyle !== 'none' || canvasStyle.shadowEnabled || canvasStyle.borderRadius > 0 || canvasStyle.deviceFrame !== 'none');
  const frameInner = { x: contentOffsetX, y: contentOffsetY, w: imageSize.width || 0, h: imageSize.height || 0 };

  // Get current zoom/position for textarea positioning using fresh values
  const currentZoom = useEditorStore((s) => s.zoom);
  const currentStagePos = useEditorStore((s) => s.stagePosition);

  return (
    <div
      ref={containerRef}
      data-snapty-canvas
      className={`relative w-full h-full overflow-hidden z-0 ${dragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
      style={{
        cursor: cursorCSS,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) loadDroppedImage(file);
      }}
    >
      {/* Workspace dots follow the same toggle as the exported in-image grid */}
      <div className={cn('absolute inset-0 bg-canvas', gridEnabled && 'canvas-dot-grid')} />
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePosition.x}
        y={stagePosition.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        dragDistance={2}
        onTouchStart={handleMouseDown as any}
        onTouchMove={handleMouseMove as any}
        onTouchEnd={handleMouseUp as any}
        onWheel={handleWheel}
        draggable={activeTool === 'hand'}
        onDragStart={() => {
          if (useEditorStore.getState().activeTool === 'hand') setIsHandDragging(true);
        }}
        onDragMove={(e) => {
          if (useEditorStore.getState().activeTool === 'hand') {
            setStagePosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onDragEnd={(e) => {
          if (useEditorStore.getState().activeTool === 'hand') {
            setStagePosition({ x: e.target.x(), y: e.target.y() });
            setIsHandDragging(false);
          }
        }}
      >
        {/* Background + framed image (padding / bgStyle live preview) */}
        <Layer>
          {showFrame && (
            <Rect
              x={0}
              y={0}
              width={frameW}
              height={frameH}
              fill={
                canvasStyle.bgStyle === 'none'
                  ? (contentPad > 0 ? '#ffffff' : undefined)
                  : bgFill
              }
              fillLinearGradientStartPoint={
                canvasStyle.bgStyle === 'gradient' ? { x: 0, y: 0 } : undefined
              }
              fillLinearGradientEndPoint={
                canvasStyle.bgStyle === 'gradient' ? { x: frameW, y: frameH } : undefined
              }
              fillLinearGradientColorStops={
                canvasStyle.bgStyle === 'gradient'
                  ? [0, canvasStyle.bgGradientStart || '#ffffff', 1, canvasStyle.bgGradientEnd || '#e5e5e5']
                  : undefined
              }
              cornerRadius={canvasStyle.borderRadius || 0}
              shadowEnabled={canvasStyle.shadowEnabled}
              shadowBlur={canvasStyle.shadowBlur || 24}
              shadowOffsetX={canvasStyle.shadowOffsetX || 0}
              shadowOffsetY={canvasStyle.shadowOffsetY || 12}
              shadowColor={canvasStyle.shadowColor || 'rgba(0,0,0,0.25)'}
              listening={false}
            />
          )}
          {canvasStyle.deviceFrame !== 'none' && (
            <DeviceFrameKonva frame={canvasStyle.deviceFrame} frameUrl={canvasStyle.frameUrl} outerW={frameW} outerH={frameH} inner={frameInner} pass="behind" />
          )}
          <Group x={contentOffsetX} y={contentOffsetY}>
            <Rect
              name="background"
              x={0}
              y={0}
              width={imageSize.width || dimensions.width}
              height={imageSize.height || dimensions.height}
              fillPatternImage={gridEnabled && gridPattern ? (gridPattern as unknown as HTMLImageElement) : undefined}
              fillPatternScale={{ x: 1, y: 1 }}
              fill={gridEnabled ? undefined : '#ffffff'}
              id="grid-bg"
            />
            {backgroundImage && (
              hasSpotlights && spotlightOverlayImage ? (
                <KonvaImage
                  image={spotlightOverlayImage}
                  x={0}
                  y={0}
                  width={imageSize.width}
                  height={imageSize.height}
                  name="background-darkened"
                />
              ) : (
                <KonvaImage
                  image={backgroundImage}
                  x={0}
                  y={0}
                  width={imageSize.width}
                  height={imageSize.height}
                  name="background"
                />
              )
            )}
          </Group>
          {canvasStyle.deviceFrame !== 'none' && (
            <DeviceFrameKonva frame={canvasStyle.deviceFrame} frameUrl={canvasStyle.frameUrl} outerW={frameW} outerH={frameH} inner={frameInner} pass="overlay" />
          )}
        </Layer>

        {/* Annotation layer (same offset as the framed image) */}
        <Layer name="annotation-layer" x={contentOffsetX} y={contentOffsetY}>
          {elements.map((el) => renderElement(el))}
          {drawingElement && renderElement(drawingElement, true)}
          {renderSpotlightDraft()}
          {renderEraserDraft()}
          {guides.map((g, i) => (
            g.orientation === 'vertical' ? (
              <Line
                key={`guide-v-${i}`}
                points={[g.position, g.start, g.position, g.end]}
                stroke="#F97316"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            ) : (
              <Line
                key={`guide-h-${i}`}
                points={[g.start, g.position, g.end, g.position]}
                stroke="#F97316"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            )
          ))}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(234,88,12,0.08)"
              stroke={selectionTheme.accent}
              strokeWidth={1}
              dash={[6, 4]}
              listening={false}
            />
          )}
          <Transformer
            ref={transformerRef}
            shouldOverdrawWholeArea
            keepRatio={(() => {
              const sole = selectedElementIds.length === 1
                ? elements.find((e) => e.id === selectedElementIds[0])
                : undefined;
              // Uniform-scale: pasted overlay images and step badges.
              const soleEl = sole as ShapeElement | undefined;
              const isOverlay = soleEl?.type === 'rectangle' && !!soleEl.imageDataURL;
              return isOverlay || sole?.type === 'step';
            })()}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
            padding={8}
            anchorSize={10}
            anchorCornerRadius={5}
            borderStroke={selectionTheme.accent}
            borderStrokeWidth={1.5}
            borderDash={[6, 4]}
            anchorStroke={selectionTheme.accent}
            anchorFill={selectionTheme.surface}
            rotateEnabled={!annotationsLocked}
            resizeEnabled={!annotationsLocked}
            rotateAnchorOffset={28}
            rotateAnchorSize={12}
            rotateAnchorCursor="grab"
            anchorStyleFunc={styleSelectionAnchor}
            enabledAnchors={(() => {
              if (annotationsLocked) return [];
              const sole = selectedElementIds.length === 1
                ? elements.find((e) => e.id === selectedElementIds[0])
                : undefined;
              // Uniform-scale types get corners only; a side handle there would
              // imply a non-uniform resize the element cannot represent.
              const soleEl = sole as ShapeElement | undefined;
              const isOverlay = soleEl?.type === 'rectangle' && !!soleEl.imageDataURL;
              if (isOverlay || sole?.type === 'step') {
                return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
              }
              return [
                'top-left', 'top-right', 'bottom-left', 'bottom-right',
                'middle-left', 'middle-right', 'top-center', 'bottom-center',
              ];
            })()}
          />
        </Layer>
      </Stage>

      {/* Text input overlay */}
      {textInput.visible && (() => {
        const scale = getImageToolScale(imageSize.width, imageSize.height);
        const editEl = textInput.editId
          ? (elements.find((el) => el.id === textInput.editId) as TextElement | undefined)
          : undefined;
        // Everything below is expressed in the same units the Konva `Text` node
        // uses, then multiplied by zoom once. Padding used to be a raw CSS `p-1`
        // while Konva padded in image units, so the text shifted on commit by an
        // amount that grew with zoom.
        const displayFont = editEl?.fontSize ?? fontSize * scale;
        const displayColor = editEl?.fill ?? strokeColor;
        const displayFamily = editEl?.fontFamily ?? fontFamily ?? HANDWRITTEN_FONT;
        // Bold/italic come from the element when editing, else the live setting;
        // the overlay must preview the exact style the committed node will use.
        const displayFontStyle = editEl?.fontStyle ?? useEditorStore.getState().fontStyle;
        const displayAlign = editEl?.align ?? useEditorStore.getState().textAlign;
        const pad = (editEl?.padding ?? TEXT_PADDING) * currentZoom;
        return (
          <textarea
            ref={textAreaRef}
            className="absolute z-50 bg-transparent border border-dashed border-accent outline-none resize-none"
            style={{
              left: currentStagePos.x + (textInput.x + contentOffsetX) * currentZoom,
              top: currentStagePos.y + (textInput.y + contentOffsetY) * currentZoom,
              fontSize: displayFont * currentZoom,
              fontFamily: displayFamily,
              color: displayColor,
              padding: pad,
              // The 1px dashed border must not add to the box, or the caret sits
              // one pixel off from where the glyph lands after commit.
              boxSizing: 'border-box',
              margin: -1,
              minWidth: 100,
              minHeight: 40,
              lineHeight: editEl?.lineHeight ?? TEXT_LINE_HEIGHT,
              fontStyle: displayFontStyle === 'normal' || displayFontStyle === 'italic'
                ? displayFontStyle
                : 'normal',
              fontWeight: displayFontStyle.includes('bold') ? 'bold' : 'normal',
              textAlign: displayAlign ?? 'left',
            }}
            onKeyDown={handleTextAreaKeyDown}
            onBlur={() => {
              // Ignore the synthetic blur that fires while the textarea mounts/focuses
              if (Date.now() < textIgnoreBlurRef.current) {
                requestAnimationFrame(() => textAreaRef.current?.focus());
                return;
              }
              commitTextRef.current();
            }}
            rows={2}
          />
        );
      })()}

      <OcrPanel
        open={ocrOpen}
        busy={ocrBusy}
        text={ocrText}
        copied={ocrCopied}
        onClose={() => setOcrOpen(false)}
        onCopy={() => void copyOCRText()}
      />
    </div>
  );
};

export default EditorCanvas;
