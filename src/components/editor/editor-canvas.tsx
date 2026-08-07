'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Stage, Layer, Rect, Ellipse, Line, Arrow, Text, Group,
  Image as KonvaImage, Circle, Transformer,
} from 'react-konva';
import Konva from 'konva';
import { ScanText, Copy, Check, X } from 'lucide-react';
import { useEditorStore, generateId, getImageToolScale } from '@/store/editor-store';
import { loadImageFileIntoEditor } from '@/lib/image-load';
import {
  handDrawnPolyline,
  handDrawnEllipsePoints,
  wobbleFreehandPoint,
} from '@/lib/hand-drawn';
import { getSelectionTheme, styleSelectionAnchor, selectionHandleProps } from '@/lib/selection-theme';
import RoughKonvaShape from '@/components/editor/canvas/rough-konva-shape';
import CachedKonvaImage from '@/components/editor/canvas/cached-konva-image';
import MagnifierKonva from '@/components/editor/canvas/magnifier-konva';
import { arrowHeadPoints } from '@/lib/rough-renderer';
import { snapBounds, type GuideLine } from '@/lib/editor/snap-guides';
import { getElementBounds, boundsIntersect } from '@/lib/editor/selection';
import type {
  EditorElement, ShapeElement, ArrowElement, LineElement,
  PencilElement, CircleElement, TextElement, StepElement, DiamondElement,
  MagnifierElement, ToolType,
} from '@/types/editor';
import { HANDWRITTEN_FONT } from '@/types/editor';

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

// Create a Figma-like dot grid pattern
function createGridPattern(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const gap = 20;
  canvas.width = gap;
  canvas.height = gap;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d4d4d4';
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

  useEffect(() => {
    const onOcr = () => { void runOCR(); };
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

  // Cursor based on tool (+ next step number for the stepper tool)
  const cursorCSS = useMemo(
    () => getToolCursorCSS(activeTool, isHandDragging, {
      color: strokeColor,
      stepNumber: stepCounter,
    }, hoverSelectMode),
    [activeTool, isHandDragging, strokeColor, stepCounter, hoverSelectMode],
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
  const gridPattern = useMemo(() => createGridPattern(), []);

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
      const layer = st.findOne('.annotation-layer');
      if (!layer) return;
      const skipTypes = new Set(['arrow', 'line', 'magnifier', 'pencil', 'highlighter']);
      const nodes = selectedElementIds
        .filter((id) => {
          const el = elements.find((e) => e.id === id);
          return el && !skipTypes.has(el.type) && !el.locked;
        })
        .map((id) => (layer as Konva.Layer).findOne(`#${id}`))
        .filter(Boolean) as Konva.Node[];
      tr.nodes(nodes);
      tr.getLayer()?.batchDraw();
    };
    attach();
    const onReady = () => attach();
    window.addEventListener('snapty-overlay-image-ready', onReady);
    const t = window.setTimeout(attach, 50);
    return () => {
      window.removeEventListener('snapty-overlay-image-ready', onReady);
      window.clearTimeout(t);
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
        fontSize: Math.round(st.fontSize * scale),
        fontFamily: HANDWRITTEN_FONT,
        fill: st.strokeColor,
        opacity: st.opacity,
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
    return {
      x: (pos.x - s.stagePosition.x) / s.zoom - pad,
      y: (pos.y - s.stagePosition.y) / s.zoom - pad,
    };
  }

  // Create a blurred or pixelated image data URL for a region
  function createBlurImage(
    x: number, y: number, w: number, h: number, type: 'blur' | 'pixelate'
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
        const radius = Math.round((s.blurRadius || 12) * scale);
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, aw, ah);
      } else {
        const px = Math.max(2, Math.round((s.pixelSize || 10) * scale));
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

        // Alt+drag duplicate: mark for duplication on drag start
        if (e.evt.altKey) {
          altDuplicateRef.current = clickedId;
        }

        if (e.evt.shiftKey) {
          const currentIds = s.selectedElementIds;
          s.setSelectedElementIds(
            currentIds.includes(clickedId)
              ? currentIds.filter((i) => i !== clickedId)
              : [...currentIds, clickedId]
          );
        } else if (clicked?.groupId) {
          const groupIds = s.elements.filter((el) => el.groupId === clicked.groupId).map((el) => el.id);
          s.setSelectedElementIds(groupIds);
        } else {
          s.setSelectedElementIds([clickedId]);
        }
        // Sync property panel from selection (unscale so tool defaults don't double-scale)
        const el = s.elements.find((x) => x.id === clickedId);
        if (el) {
          const scale = getImageToolScale(s.imageSize.width, s.imageSize.height) || 1;
          const patch: Record<string, unknown> = {};
          if ('stroke' in el && (el as any).stroke) patch.strokeColor = (el as any).stroke;
          if (el.type === 'text' && (el as TextElement).fill) patch.strokeColor = (el as TextElement).fill;
          if (el.type === 'step' && (el as StepElement).fill) patch.strokeColor = (el as StepElement).fill;
          if ('strokeWidth' in el && (el as any).strokeWidth != null) {
            patch.strokeWidth = Math.max(1, Math.round((el as any).strokeWidth / scale));
          }
          if (el.type === 'text' && (el as TextElement).fontSize) {
            patch.fontSize = Math.max(8, Math.round(((el as TextElement).fontSize || 24) / scale));
          }
          if (el.type === 'step' && (el as StepElement).radius) {
            patch.stepRadius = Math.max(8, Math.round(((el as StepElement).radius || 16) / scale));
          }
          if (el.opacity != null) patch.opacity = el.opacity;
          if (el.strokeStyle) patch.strokeStyle = el.strokeStyle;
          if (el.fillStyle) patch.fillStyle = el.fillStyle;
          if (el.roughness != null) patch.roughness = el.roughness;
          if (Object.keys(patch).length) useEditorStore.setState(patch as any);
        }
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
    const sw = Math.max(1, Math.round(s.strokeWidth * scale));
    const hw = Math.max(4, Math.round((s.highlighterWidth || 24) * scale));
    const pointerSize = Math.max(8, Math.round(12 * scale));

    // Step tool: place a numbered step circle
    if (s.activeTool === 'step') {
      const pos = getCanvasPoint();
      if (!pos) return;
      const r = Math.max(8, Math.round(s.stepRadius * scale));
      const num = s.stepCounter;
      s.addElement({
        id: generateId(),
        type: 'step',
        x: pos.x,
        y: pos.y,
        stepNumber: num,
        radius: r,
        fill: s.strokeColor,
        fontSize: Math.round(r * 0.8),
        opacity: 1,
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
        ...(s.activeTool === 'magnifier' ? { magnification: 2.25, roughness: s.roughness } : {}),
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
        cornerRadius: s.activeTool === 'rounded-rect' ? Math.round(s.cornerRadius * scale) : 0,
        blurRadius: s.activeTool === 'blur' ? s.blurRadius : undefined,
        pixelSize: s.activeTool === 'pixelate' ? s.pixelSize : undefined,
      } as ShapeElement);
    }
  }

  function handleMouseMove(e?: Konva.KonvaEventObject<any>) {
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
      if (e?.evt?.shiftKey || drawingElement.type === 'magnifier') {
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
        .filter((el) => !el.locked && boundsIntersect(box, getElementBounds(el)))
        .map((el) => el.id);
      if (hit.length) {
        const next = marqueeAdditiveRef.current
          ? [...new Set([...s.selectedElementIds, ...hit])]
          : hit;
        s.setSelectedElementIds(next);
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
      const toRemove = s.elements.filter((el) => {
        // Get element bounding box
        let elX = el.x;
        let elY = el.y;
        let elRight = elX;
        let elBottom = elY;

        if (el.type === 'pencil' || el.type === 'highlighter') {
          const pts = (el as any).points;
          if (pts && pts.length >= 2) {
            elX = Math.min(...pts.filter((_: number, i: number) => i % 2 === 0));
            elY = Math.min(...pts.filter((_: number, i: number) => i % 2 === 1));
            elRight = Math.max(...pts.filter((_: number, i: number) => i % 2 === 0));
            elBottom = Math.max(...pts.filter((_: number, i: number) => i % 2 === 1));
          }
        } else if ('width' in el) {
          elRight = el.x + (el as any).width;
          elBottom = el.y + (el as any).height;
        } else if (el.type === 'arrow' || el.type === 'line') {
          const pts = (el as any).points;
          if (pts && pts.length >= 4) {
            elRight = el.x + pts[2];
            elBottom = el.y + pts[3];
          }
        } else if (el.type === 'step') {
          const r = (el as any).radius ?? 16;
          elX = el.x - r;
          elY = el.y - r;
          elRight = el.x + r;
          elBottom = el.y + r;
        }

        // Check if bounding boxes intersect (not just containment)
        return elX < x2 && elRight > x1 && elY < y2 && elBottom > y1;
      }).map((el) => el.id);
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
        const url = await createBlurImage(x, y, w, h, drawingElement.type);
        if (url) {
          addElement({
            ...shape, x, y, width: w, height: h,
            imageDataURL: url,
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

  // Pinch-to-zoom (touch)
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
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
        pinchRef.current = {
          dist: touchDist(e.touches),
          zoom: useEditorStore.getState().zoom,
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
      const scale = dist / pinchRef.current.dist;
      const center = touchCenter(e.touches);
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

  function handleSelect(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    const s = useEditorStore.getState();
    // Selection is intentionally tool-independent: clicking an annotation always
    // selects it, which makes quick corrections much less frustrating.
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      const currentIds = s.selectedElementIds;
      s.setSelectedElementIds(
        currentIds.includes(id)
          ? currentIds.filter((i) => i !== id)
          : [...currentIds, id]
      );
    } else {
      s.setSelectedElementIds([id]);
    }
  }

  function handleTextDblClick(el: TextElement, e: Konva.KonvaEventObject<any>) {
    const st = useEditorStore.getState();
    if (st.activeTool !== 'select' && !hoverSelectModeRef.current) return;
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
    if (el.fill) useEditorStore.setState({ strokeColor: el.fill });
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

    if (el && ('width' in el)) {
      const w = Math.max(5, Math.abs((node.width() || (el as ShapeElement).width || 0) * scaleX));
      const h = Math.max(5, Math.abs((node.height() || (el as ShapeElement).height || 0) * scaleY));
      (updates as Partial<ShapeElement>).width = w;
      (updates as Partial<ShapeElement>).height = h;
      node.width(w);
      node.height(h);
      // Keep overlay bitmap children in sync when transforming a Group
      if (node.getClassName?.() === 'Group') {
        (node as Konva.Group).getChildren().forEach((child) => {
          child.width(w);
          child.height(h);
          child.scaleX(1);
          child.scaleY(1);
        });
      }
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
        .map(getElementBounds);
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
      .map(getElementBounds);
    const snapped = snapBounds(moving, others);
    setGuides(snapped.guides);
    e.target.position({ x: snapped.x, y: snapped.y });
  }

  // --- Element rendering ---

  const handleElementTransformEnd = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      const node = stage?.findOne(`#${id}`);
      if (node) handleTransform(id, node);
    });
  }, []);

  function renderElement(el: EditorElement, isDraft = false) {
    const s = useEditorStore.getState();
    const isSelectMode = s.activeTool === 'select' || hoverSelectModeRef.current;
    const isSelected = s.selectedElementIds.includes(el.id);
    const draggable = !isDraft && (isSelectMode || isSelected) && !el.locked && !s.annotationsLocked;
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
        const length = Math.max(1, Math.hypot(ex - sx, ey - sy));
        const bend = arrow.bend ?? 0;
        const controlX = (sx + ex) / 2 + (-ey + sy) / length * bend * length * 0.55;
        const controlY = (sy + ey) / 2 + (ex - sx) / length * bend * length * 0.55;
        const showHandles = !isDraft && isSelected;
        const handleProps = selectionHandleProps('endpoint');
        const bendHandleProps = selectionHandleProps('bend');
        const updateBendFromHandle = (node: Konva.Node, commit = false) => {
          const midX = (sx + ex) / 2;
          const midY = (sy + ey) / 2;
          const normalX = (-ey + sy) / length;
          const normalY = (ex - sx) / length;
          const localX = node.x() - arrow.x;
          const localY = node.y() - arrow.y;
          const next = ((localX - midX) * normalX + (localY - midY) * normalY) / (length * 0.55);
          const bendVal = Math.max(-1, Math.min(1, next));
          if (commit) commitElementUpdate(arrow.id, { bend: bendVal });
          else updateElementSilent(arrow.id, { bend: bendVal });
        };
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false) => {
          const localX = node.x() - arrow.x;
          const localY = node.y() - arrow.y;
          const newPoints: [number, number, number, number] = which === 'start'
            ? [localX, localY, ex, ey]
            : [sx, sy, localX, localY];
          if (commit) commitElementUpdate(arrow.id, { points: newPoints, bend: arrow.bend ?? 0 });
          else updateElementSilent(arrow.id, { points: newPoints });
        };

        const headSize = arrow.pointerLength ?? Math.max(10, (arrow.strokeWidth || 2) * 4);
        const showHead = (arrow.endArrowhead ?? 'arrow') !== 'none';
        const showStartHead = (arrow.startArrowhead ?? 'none') !== 'none';

        if (handDrawn && bend === 0) {
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
                  />
                  <Circle x={arrow.x + controlX} y={arrow.y + controlY} {...bendHandleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
                  />
                  <Circle x={arrow.x + ex} y={arrow.y + ey} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                  />
                </>
              )}
            </React.Fragment>
          );
        }

        const points = bend === 0 ? arrow.points : [0, 0, controlX, controlY, ex, ey];
        let renderPoints = points;
        if (handDrawn) {
          renderPoints = handDrawnPolyline(points, arrow.id, arrow.strokeWidth || 2, 0.2);
        }
        return (
          <React.Fragment key={arrow.id}>
            <Arrow
              {...baseProps}
              points={renderPoints}
              stroke={arrow.stroke}
              strokeWidth={arrow.strokeWidth}
              fill={arrow.fill}
              pointerLength={showHead ? headSize : 0}
              pointerWidth={showHead ? (arrow.pointerWidth ?? headSize) : 0}
              tension={handDrawn ? (bend === 0 ? 0.2 : 0.45) : (bend === 0 ? 0 : 0.5)}
            />
            {showStartHead && (() => {
              const tri = arrowHeadPoints(ex, ey, sx, sy, headSize);
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
                <Circle x={arrow.x + sx} y={arrow.y + sy} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                />
                <Circle x={arrow.x + controlX} y={arrow.y + controlY} {...bendHandleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateBendFromHandle(e.target, true); }}
                />
                <Circle x={arrow.x + ex} y={arrow.y + ey} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
                />
              </>
            )}
          </React.Fragment>
        );
      }

      case 'line': {
        const line = el as LineElement;
        const [sx, sy, ex, ey] = line.points;
        const showHandles = !isDraft && isSelected;
        const handleProps = selectionHandleProps('endpoint');
        const updateEndpoint = (which: 'start' | 'end', node: Konva.Node, commit = false) => {
          const localX = node.x() - line.x;
          const localY = node.y() - line.y;
          const newPoints: [number, number, number, number] = which === 'start'
            ? [localX, localY, ex, ey]
            : [sx, sy, localX, localY];
          if (commit) commitElementUpdate(line.id, { points: newPoints });
          else updateElementSilent(line.id, { points: newPoints });
        };

        if (handDrawn) {
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
                  />
                  <Circle x={line.x + ex} y={line.y + ey} {...handleProps} draggable
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                    onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
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
              points={line.points}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              hitStrokeWidth={16}
            />
            {showHandles && (
              <>
                <Circle x={line.x + sx} y={line.y + sy} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('start', e.target, true); }}
                />
                <Circle x={line.x + ex} y={line.y + ey} {...handleProps} draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onDragMove={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, false); }}
                  onDragEnd={(e) => { e.cancelBubble = true; updateEndpoint('end', e.target, true); }}
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
            fontFamily={textEl.fontFamily ?? HANDWRITTEN_FONT}
            fontStyle={textEl.fontStyle}
            fill={textEl.fill ?? '#000000'}
            stroke={textEl.stroke}
            strokeWidth={textEl.strokeWidth}
            padding={textEl.padding ?? 4}
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
                fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
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
              fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
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

  // Render eraser draft (red dotted box while dragging)
  function renderEraserDraft() {
    if (!isErasing || !eraserStart || !eraserEnd) return null;
    const x = Math.min(eraserStart.x, eraserEnd.x);
    const y = Math.min(eraserStart.y, eraserEnd.y);
    const w = Math.abs(eraserEnd.x - eraserStart.x);
    const h = Math.abs(eraserEnd.y - eraserStart.y);
    return (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(239,68,68,0.06)"
        stroke="#ef4444"
        strokeWidth={1.5}
        dash={[6, 4]}
        listening={false}
      />
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
  const frameW = (imageSize.width || 0) + contentPad * 2;
  const frameH = (imageSize.height || 0) + contentPad * 2;
  const showFrame = !!backgroundImage && (contentPad > 0 || canvasStyle.bgStyle !== 'none' || canvasStyle.shadowEnabled || canvasStyle.borderRadius > 0);

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
      {/* Workspace background - always visible behind everything, follows theme */}
      <div className="absolute inset-0 bg-canvas" />
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
          <Group x={contentPad} y={contentPad}>
            <Rect
              name="background"
              x={0}
              y={0}
              width={imageSize.width || dimensions.width}
              height={imageSize.height || dimensions.height}
              fillPatternImage={gridEnabled ? (gridPattern as unknown as HTMLImageElement) : undefined}
              fillPatternScale={{ x: 1, y: 1 }}
              fill={gridEnabled ? undefined : (showFrame ? undefined : '#ffffff')}
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
        </Layer>

        {/* Annotation layer (same content pad as image) */}
        <Layer name="annotation-layer" x={contentPad} y={contentPad}>
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
            keepRatio={
              selectedElementIds.length === 1
              && !!((elements.find((e) => e.id === selectedElementIds[0]) as ShapeElement | undefined)?.imageDataURL)
            }
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
            enabledAnchors={
              annotationsLocked
                ? []
                : selectedElementIds.length === 1
                  && !!((elements.find((e) => e.id === selectedElementIds[0]) as ShapeElement | undefined)?.imageDataURL)
                  ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                  : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
            }
          />
        </Layer>
      </Stage>

      {/* Text input overlay */}
      {textInput.visible && (() => {
        const scale = getImageToolScale(imageSize.width, imageSize.height);
        const editEl = textInput.editId
          ? (elements.find((el) => el.id === textInput.editId) as TextElement | undefined)
          : undefined;
        const displayFont = editEl?.fontSize ?? Math.round(fontSize * scale);
        const displayColor = editEl?.fill ?? strokeColor;
        return (
          <textarea
            ref={textAreaRef}
            className="absolute z-50 bg-transparent border-2 border-dashed border-accent outline-none resize-none p-1"
            style={{
              left: currentStagePos.x + (textInput.x + contentPad) * currentZoom,
              top: currentStagePos.y + (textInput.y + contentPad) * currentZoom,
              fontSize: displayFont * currentZoom,
              fontFamily: HANDWRITTEN_FONT,
              color: displayColor,
              minWidth: 100,
              minHeight: 40,
              lineHeight: 1.2,
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

      {ocrOpen && (
        <div className="absolute bottom-16 right-3 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-2xl floating-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold">Recognized text</p>
              <p className="text-[10px] text-muted-foreground">Runs locally in your browser</p>
            </div>
            <button type="button" className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary cursor-pointer" onClick={() => setOcrOpen(false)} aria-label="Close OCR panel">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={ocrBusy ? 'Reading text…' : ocrText}
            readOnly
            placeholder="OCR text will appear here"
            className="w-full min-h-32 max-h-56 resize-y rounded-lg border border-border bg-secondary/30 p-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" disabled={ocrBusy || !ocrText} onClick={() => void copyOCRText()} className="mt-2 h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50 cursor-pointer">
            {ocrCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {ocrCopied ? 'Copied' : 'Copy text'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EditorCanvas;
