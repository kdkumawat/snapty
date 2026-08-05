'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Stage, Layer, Rect, Ellipse, Line, Arrow, Text, Group,
  Image as KonvaImage, Circle, Transformer,
} from 'react-konva';
import Konva from 'konva';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useEditorStore, generateId, getImageToolScale } from '@/store/editor-store';
import type {
  EditorElement, ShapeElement, ArrowElement, LineElement,
  PencilElement, CircleElement, TextElement, StepElement,
  ToolType,
} from '@/types/editor';

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
        <rect x="5" y="7" width="22" height="18" fill="none" stroke="${halo}" stroke-width="4"/>
        <rect x="5" y="7" width="22" height="18" fill="none" stroke="${color}" stroke-width="2"/>
      </svg>`;
    case 'rounded-rect':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="5" y="7" width="22" height="18" rx="5" fill="none" stroke="${halo}" stroke-width="4"/>
        <rect x="5" y="7" width="22" height="18" rx="5" fill="none" stroke="${color}" stroke-width="2"/>
      </svg>`;
    case 'circle':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${half}" cy="${half}" r="11" fill="none" stroke="${halo}" stroke-width="4"/>
        <circle cx="${half}" cy="${half}" r="11" fill="none" stroke="${color}" stroke-width="2"/>
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

function getToolCursorCSS(tool: ToolType, isDragging: boolean, opts: CursorOpts = {}): string {
  switch (tool) {
    case 'select':
      return 'default';
    case 'hand':
      return isDragging ? 'grabbing' : 'grab';
    default: {
      const svg = toolCursorSVG(tool, opts);
      if (!svg) return 'crosshair';
      const hotspot =
        tool === 'pencil' || tool === 'highlighter' ? '4 28'
        : tool === 'text' ? '6 6'
        : tool === 'line' ? '5 27'
        : tool === 'arrow' || tool === 'crop' || tool === 'step' ? '16 16'
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
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean; editId?: string; initialText?: string }>({ x: 0, y: 0, visible: false });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserStart, setEraserStart] = useState<{ x: number; y: number } | null>(null);
  const [eraserEnd, setEraserEnd] = useState<{ x: number; y: number } | null>(null);
  const [spotlightOverlayImage, setSpotlightOverlayImage] = useState<HTMLImageElement | null>(null);

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
  const removeElements = useEditorStore((s) => s.removeElements);
  const setSelectedElementIds = useEditorStore((s) => s.setSelectedElementIds);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setStagePosition = useEditorStore((s) => s.setStagePosition);
  const resetView = useEditorStore((s) => s.resetView);

  // Cursor based on tool (+ next step number for the stepper tool)
  const cursorCSS = useMemo(
    () => getToolCursorCSS(activeTool, isHandDragging, {
      color: strokeColor,
      stepNumber: stepCounter,
    }),
    [activeTool, isHandDragging, strokeColor, stepCounter],
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
    // Konva may recreate canvases after resize / image load
    const t = window.setTimeout(apply, 50);
    return () => window.clearTimeout(t);
  }, [cursorCSS, dimensions, backgroundImage, activeTool]);

  // Grid pattern (created once)
  const gridPattern = useMemo(() => createGridPattern(), []);

  // Resize observer for container dimensions — update stage size without auto-resetting zoom
  // (auto resetView on every resize felt jumpy; fit-to-screen remains available on toolbar)
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const update = () => {
      setDimensions({ width: c.offsetWidth, height: c.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(c);
    return () => observer.disconnect();
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

  // Update transformer nodes when selection changes
  useEffect(() => {
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
    const nodes = selectedElementIds
      .map((id) => layer.findOne(`#${id}`))
      .filter(Boolean) as Konva.Node[];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedElementIds, elements]);

  // Auto-focus text area when text input becomes visible
  useEffect(() => {
    if (textInput.visible && textAreaRef.current) {
      requestAnimationFrame(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.value = textInput.initialText ?? '';
          if (textInput.editId) {
            // Select all when editing existing
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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    return {
      x: (pos.x - s.stagePosition.x) / s.zoom,
      y: (pos.y - s.stagePosition.y) / s.zoom,
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

    // If text input is visible, commit it first and stop propagation
    // so the container mousedown listener does NOT double-commit
    if (textInputRef.current.visible) {
      commitTextRef.current();
      e.cancelBubble = true;
      return;
    }

    const st = stageRef.current;
    if (!st) return;

    // Hand tool does nothing on mousedown (handled by drag)
    if (s.activeTool === 'hand') return;

    const isBg = e.target === st
      || e.target.name() === 'background'
      || e.target.name() === 'background-darkened'
      || e.target.id() === 'grid-bg';

    // Only the Select tool can pick / edit existing annotations.
    // Drawing tools always draw through annotations (no accidental reselection).
    if (s.activeTool === 'select') {
      const clickedId = findAnnotationId(e.target);
      if (clickedId && !isBg) {
        if (e.evt.shiftKey) {
          const currentIds = s.selectedElementIds;
          s.setSelectedElementIds(
            currentIds.includes(clickedId)
              ? currentIds.filter((i) => i !== clickedId)
              : [...currentIds, clickedId]
          );
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
          if (Object.keys(patch).length) useEditorStore.setState(patch as any);
        }
        return;
      }
      // Empty area → deselect
      if (isBg || !clickedId) s.setSelectedElementIds([]);
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
      setTextInput({ x: pos.x, y: pos.y, visible: true });
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
    const base: Partial<EditorElement> = { id: generateId(), opacity: s.opacity };

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
      } as ArrowElement);
    } else if (s.activeTool === 'line') {
      setDrawingElement({
        ...base,
        type: 'line',
        x: pos.x, y: pos.y,
        points: [0, 0, 0, 0],
        stroke: s.strokeColor,
        strokeWidth: sw,
      } as LineElement);
    } else if (s.activeTool === 'circle') {
      setDrawingElement({
        ...base,
        type: 'circle',
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        stroke: s.strokeColor,
        fill: s.fillColor === 'transparent' ? 'transparent' : s.fillColor,
        strokeWidth: sw,
      } as CircleElement);
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

  function handleMouseMove() {
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
      setDrawingElement({
        ...drawingElement,
        points: [...(drawingElement as PencilElement).points, pos.x, pos.y],
      });
    } else if (drawingElement.type === 'arrow' || drawingElement.type === 'line') {
      setDrawingElement({
        ...drawingElement,
        points: [0, 0, pos.x - drawingElement.x, pos.y - drawingElement.y],
      } as ArrowElement | LineElement);
    } else {
      setDrawingElement({
        ...drawingElement,
        width: pos.x - drawingElement.x,
        height: pos.y - drawingElement.y,
      } as ShapeElement | CircleElement);
    }
  }

  async function handleMouseUp() {
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

    // Crop commit (marquee only — never saved as an annotation)
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
    // Allow selection from select tool (drawing tools handled in mousedown)
    if (s.activeTool !== 'select') return;
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
    // Edit text only with the Select tool
    if (useEditorStore.getState().activeTool !== 'select') return;
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
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Replace background, keep tool + settings
        useEditorStore.getState().setBackgroundImage(img);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // --- Transform ---

  function handleTransform(id: string, node: Konva.Node) {
    const updates: Partial<EditorElement> = {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    };
    if (node.width()) {
      (updates as Partial<ShapeElement>).width = Math.max(5, node.width() * node.scaleX());
    }
    if (node.height()) {
      (updates as Partial<ShapeElement>).height = Math.max(5, node.height() * node.scaleY());
    }
    node.scaleX(1);
    node.scaleY(1);
    updateElement(id, updates);
  }

  // --- Drag end ---

  function handleDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>) {
    updateElement(id, {
      x: e.target.x(),
      y: e.target.y(),
    });
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
    const isSelect = s.activeTool === 'select';
    const draggable = !isDraft && isSelect;
    // Only Select tool listens on existing shapes so drawing tools can draw over them
    const listening = !isDraft && isSelect;
    const baseProps = {
      id: el.id,
      x: el.x,
      y: el.y,
      opacity: el.opacity ?? 1,
      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      draggable,
      listening,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onTap: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e),
      onTransformEnd: () => handleElementTransformEnd(el.id),
    };

    switch (el.type) {
      case 'rectangle':
      case 'rounded-rect': {
        const shape = el as ShapeElement;
        // If element has imageDataURL (pasted image), render as image
        if (shape.imageDataURL) {
          return (
            <KonvaImage
              key={shape.id}
              {...baseProps}
              image={(() => { const img = new window.Image(); img.src = shape.imageDataURL!; return img; })()}
              width={shape.width}
              height={shape.height}
              cornerRadius={shape.cornerRadius ?? 0}
            />
          );
        }
        const isCropMarquee = shape.id === '__crop_marquee__';
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
            dash={isCropMarquee ? [8, 4] : undefined}
            listening={!isCropMarquee}
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
          <KonvaImage
            key={shape.id}
            {...baseProps}
            image={(() => { const img = new window.Image(); img.src = shape.imageDataURL!; return img; })()}
            width={shape.width}
            height={shape.height}
          />
        );
      }

      case 'circle': {
        const circle = el as CircleElement;
        return (
          <Ellipse
            key={circle.id}
            {...baseProps}
            radiusX={Math.abs(circle.width) / 2}
            radiusY={Math.abs(circle.height) / 2}
            offsetX={-circle.width / 2}
            offsetY={-circle.height / 2}
            fill={circle.fill}
            stroke={circle.stroke}
            strokeWidth={circle.strokeWidth}
          />
        );
      }

      case 'arrow': {
        const arrow = el as ArrowElement;
        return (
          <Arrow
            key={arrow.id}
            {...baseProps}
            points={arrow.points}
            stroke={arrow.stroke}
            strokeWidth={arrow.strokeWidth}
            fill={arrow.fill}
            pointerLength={arrow.pointerLength ?? 12}
            pointerWidth={arrow.pointerWidth ?? 12}
          />
        );
      }

      case 'line': {
        const line = el as LineElement;
        return (
          <Line
            key={line.id}
            {...baseProps}
            points={line.points}
            stroke={line.stroke}
            strokeWidth={line.strokeWidth}
          />
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
            tension={pencil.tension ?? 0.5}
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
            fontFamily={textEl.fontFamily ?? 'sans-serif'}
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

  // Background fill color based on canvas style (for live preview)
  const bgFill = useMemo(() => {
    const cs = canvasStyle;
    if (cs.bgStyle === 'solid') return cs.bgColor;
    if (cs.bgStyle === 'glass') return '#f0f0f0';
    return '#ffffff';
  }, [canvasStyle.bgStyle, canvasStyle.bgColor]);

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
      <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-900" />
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
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
        draggable={activeTool === 'hand'}
        onDragStart={() => {
          if (useEditorStore.getState().activeTool === 'hand') setIsHandDragging(true);
        }}
        onDragEnd={(e) => {
          if (useEditorStore.getState().activeTool === 'hand') {
            setStagePosition({ x: e.target.x(), y: e.target.y() });
            setIsHandDragging(false);
          }
        }}
      >
        {/* Background layer with grid pattern */}
        <Layer>
          <Rect
            name="background"
            x={0}
            y={0}
            width={imageSize.width || dimensions.width}
            height={imageSize.height || dimensions.height}
            fillPatternImage={gridEnabled ? gridPattern : undefined}
            fillPatternScale={{ x: 1, y: 1 }}
            fill={bgFill}
            id="grid-bg"
          />
          {backgroundImage && (
            <>
              {hasSpotlights && spotlightOverlayImage ? (
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
              )}
            </>
          )}
        </Layer>

        {/* Annotation layer */}
        <Layer name="annotation-layer">
          {elements.map((el) => renderElement(el))}
          {drawingElement && renderElement(drawingElement, true)}
          {renderSpotlightDraft()}
          {renderEraserDraft()}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
            anchorSize={8}
            anchorCornerRadius={2}
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#ffffff"
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
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
            className="absolute z-50 bg-transparent border-2 border-dashed border-blue-500 outline-none resize-none p-1"
            style={{
              left: currentStagePos.x + textInput.x * currentZoom,
              top: currentStagePos.y + textInput.y * currentZoom,
              fontSize: displayFont * currentZoom,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: displayColor,
              minWidth: 100,
              minHeight: 40,
              lineHeight: 1.2,
            }}
            onKeyDown={handleTextAreaKeyDown}
            onBlur={() => commitTextRef.current()}
            rows={2}
          />
        );
      })()}

      {/* Zoom controls: percentage on top, zoom in/out/fit below */}
      {backgroundImage && (
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-stretch gap-1 select-none">
          <button
            type="button"
            className="px-2.5 py-1 rounded-md bg-black/60 hover:bg-black/75 text-white text-xs font-medium backdrop-blur-sm cursor-pointer font-mono transition-colors"
            onClick={() => setZoom(1)}
            title="Reset to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <div className="flex items-center justify-center gap-0.5 rounded-md bg-black/60 backdrop-blur-sm p-0.5">
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded text-white/90 hover:bg-white/15 cursor-pointer transition-colors"
              onClick={() => {
                const s = useEditorStore.getState();
                const root = containerRef.current;
                if (!root) { setZoom(s.zoom / 1.2); return; }
                const r = root.getBoundingClientRect();
                applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, s.zoom / 1.2);
              }}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded text-white/90 hover:bg-white/15 cursor-pointer transition-colors"
              onClick={() => {
                const s = useEditorStore.getState();
                const root = containerRef.current;
                if (!root) { setZoom(s.zoom * 1.2); return; }
                const r = root.getBoundingClientRect();
                applyZoomAt(r.left + r.width / 2, r.top + r.height / 2, s.zoom * 1.2);
              }}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded text-white/90 hover:bg-white/15 cursor-pointer transition-colors"
              onClick={resetView}
              title="Fit to screen"
              aria-label="Fit to screen"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorCanvas;
