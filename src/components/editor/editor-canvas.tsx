'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Stage, Layer, Rect, Ellipse, Line, Arrow, Text, Group,
  Image as KonvaImage, Circle, Transformer,
} from 'react-konva';
import Konva from 'konva';
import { useEditorStore, generateId } from '@/store/editor-store';
import type {
  EditorElement, ShapeElement, ArrowElement, LineElement,
  PencilElement, CircleElement, TextElement, StepElement,
  ToolType,
} from '@/types/editor';

// SVG cursor definitions for each tool
function toolCursorSVG(tool: ToolType): string {
  const size = 24;
  const half = size / 2;
  switch (tool) {
    case 'select': return '';
    case 'hand': return '';
    case 'eraser':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><rect x='${half-6}' y='${half-6}' width='12' height='12' rx='2' fill='none' stroke='%23ef4444' stroke-width='1.5'/><line x1='${half-3}' y1='${half-3}' x2='${half+3}' y2='${half+3}' stroke='%23ef4444' stroke-width='1.5'/><line x1='${half+3}' y1='${half-3}' x2='${half-3}' y2='${half+3}' stroke='%23ef4444' stroke-width='1.5'/></svg>`;
    case 'text':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><text x='${half}' y='${half+4}' text-anchor='middle' font-size='14' font-family='sans-serif' font-weight='bold' fill='%23ef4444'>T</text></svg>`;
    case 'arrow':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><line x1='4' y1='${half+4}' x2='${size-4}' y2='${half-4}' stroke='%23ef4444' stroke-width='2'/><polyline points='${size-8},${half-4} ${size-4},${half-4} ${size-4},${half}' fill='none' stroke='%23ef4444' stroke-width='2'/></svg>`;
    case 'rectangle':
    case 'rounded-rect':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><rect x='4' y='4' width='${size-8}' height='${size-8}' rx='${tool === 'rounded-rect' ? 3 : 0}' fill='none' stroke='%23ef4444' stroke-width='1.5'/></svg>`;
    case 'circle':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><ellipse cx='${half}' cy='${half}' rx='${half-4}' ry='${half-4}' fill='none' stroke='%23ef4444' stroke-width='1.5'/></svg>`;
    case 'line':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><line x1='4' y1='${size-4}' x2='${size-4}' y2='4' stroke='%23ef4444' stroke-width='2'/></svg>`;
    case 'pencil':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><path d='M${size-6} 4 L${size-4} 6 L8 ${size-4} L6 ${size-6} Z' fill='%23ef4444'/><path d='M6 ${size-6} L4 ${size-4}' stroke='%23ef4444' stroke-width='1.5'/></svg>`;
    case 'highlighter':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><rect x='4' y='${size-7}' width='${size-8}' height='5' rx='1.5' fill='%23f59e0b' opacity='0.7'/></svg>`;
    case 'blur':
    case 'pixelate':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><rect x='4' y='4' width='${size-8}' height='${size-8}' rx='2' fill='none' stroke='%23ef4444' stroke-width='1.5' stroke-dasharray='3 2'/><text x='${half}' y='${half+3}' text-anchor='middle' font-size='8' fill='%23ef4444'>${tool === 'blur' ? '~' : '#'}</text></svg>`;
    case 'spotlight':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${half}' cy='${half}' r='${half-3}' fill='none' stroke='%23facc15' stroke-width='1.5'/><circle cx='${half}' cy='${half}' r='2' fill='%23facc15'/></svg>`;
    case 'step':
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${half}' cy='${half}' r='${half-3}' fill='%23ef4444'/><text x='${half}' y='${half+4}' text-anchor='middle' font-size='11' fill='white' font-weight='bold'>1</text></svg>`;
    default:
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><line x1='${half-4}' y1='0' x2='${half-4}' y2='${size}' stroke='%23999' stroke-width='0.5'/><line x1='0' y1='${half-4}' x2='${size}' y2='${half-4}' stroke='%23999' stroke-width='0.5'/></svg>`;
  }
}

function getToolCursorCSS(tool: ToolType, isDragging: boolean): string {
  switch (tool) {
    case 'select': return 'default';
    case 'hand': return isDragging ? 'grabbing' : 'grab';
    default: {
      const svg = toolCursorSVG(tool);
      if (!svg) return 'crosshair';
      const encoded = encodeURIComponent(svg.replace(/'/g, "\\'"));
      const hotspot = tool === 'text' ? '4 14' : '12 12';
      return `url("data:image/svg+xml,${encoded}") ${hotspot}, crosshair`;
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
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserStart, setEraserStart] = useState<{ x: number; y: number } | null>(null);
  const [eraserEnd, setEraserEnd] = useState<{ x: number; y: number } | null>(null);

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
  const stepRadius = useEditorStore((s) => s.stepRadius);
  const addElement = useEditorStore((s) => s.addElement);
  const updateElement = useEditorStore((s) => s.updateElement);
  const removeElements = useEditorStore((s) => s.removeElements);
  const setSelectedElementIds = useEditorStore((s) => s.setSelectedElementIds);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setStagePosition = useEditorStore((s) => s.setStagePosition);
  const resetView = useEditorStore((s) => s.resetView);

  // Cursor based on tool
  const cursorCSS = useMemo(() => getToolCursorCSS(activeTool, isHandDragging), [activeTool, isHandDragging]);

  // Grid pattern (created once)
  const gridPattern = useMemo(() => createGridPattern(), []);

  // Resize observer for container dimensions with debounced resetView
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      setDimensions({ width: c.offsetWidth, height: c.offsetHeight });
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resetView();
      }, 150);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(c);
    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [resetView]);

  // Reset view when background image changes
  useEffect(() => {
    if (backgroundImage) {
      const timer = setTimeout(() => resetView(), 50);
      return () => clearTimeout(timer);
    }
  }, [backgroundImage, resetView]);

  // Register stage globally for export
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stageRef.current) (window as any).__snapkit_stage = stageRef.current;
    }, 100);
    return () => clearTimeout(timer);
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
          textAreaRef.current.value = '';
        }
      });
    }
  }, [textInput.visible]);

  // --- Text input ---

  const commitText = useCallback(() => {
    if (!textAreaRef.current) return;
    const text = textAreaRef.current.value;
    if (text.trim()) {
      const st = useEditorStore.getState();
      const ti = textInputRef.current;
      st.addElement({
        id: generateId(),
        type: 'text',
        x: ti.x,
        y: ti.y,
        text: text.trim(),
        fontSize: st.fontSize,
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
        ctx.filter = 'blur(12px)';
        ctx.drawImage(s.backgroundImage, ax, ay, aw, ah, 0, 0, aw, ah);
      } else {
        const pixelSize = 10;
        const sw = Math.max(1, Math.ceil(aw / pixelSize));
        const sh = Math.max(1, Math.ceil(ah / pixelSize));
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

  // Create a spotlight image: darken everything except the selected area
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

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, iw, ih);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.globalCompositeOperation = 'source-over';

      resolve(offscreen.toDataURL('image/png'));
    });
  }

  // --- Find annotation element by traversing up from click target ---
  function findAnnotationId(node: Konva.Node): string | null {
    let current: Konva.Node | null = node;
    while (current) {
      const id = current.id();
      if (id && id !== 'background' && id !== 'grid-bg') return id;
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

    // Select tool: click on empty area to deselect
    if (s.activeTool === 'select') {
      if (e.target === st || e.target.name() === 'background') {
        s.setSelectedElementIds([]);
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

    // Text tool: show text input at click position
    if (s.activeTool === 'text') {
      const pos = getCanvasPoint();
      if (!pos) return;
      setTextInput({ x: pos.x, y: pos.y, visible: true });
      return;
    }

    // Step tool: place a numbered step circle
    if (s.activeTool === 'step') {
      const pos = getCanvasPoint();
      if (!pos) return;
      const r = s.stepRadius;
      const num = s.stepCounter;
      s.addElement({
        id: generateId(),
        type: 'step',
        x: pos.x - r,
        y: pos.y - r,
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
        strokeWidth: s.activeTool === 'highlighter' ? 24 : s.strokeWidth,
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
        strokeWidth: s.strokeWidth,
        fill: s.strokeColor,
        pointerLength: 12,
        pointerWidth: 12,
      } as ArrowElement);
    } else if (s.activeTool === 'line') {
      setDrawingElement({
        ...base,
        type: 'line',
        x: pos.x, y: pos.y,
        points: [0, 0, 0, 0],
        stroke: s.strokeColor,
        strokeWidth: s.strokeWidth,
      } as LineElement);
    } else if (s.activeTool === 'circle') {
      setDrawingElement({
        ...base,
        type: 'circle',
        x: pos.x, y: pos.y,
        width: 0, height: 0,
        stroke: s.strokeColor,
        fill: s.fillColor === 'transparent' ? 'transparent' : s.fillColor,
        strokeWidth: s.strokeWidth,
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
        strokeWidth: ['blur', 'pixelate', 'spotlight'].includes(s.activeTool) ? 0 : s.strokeWidth,
        cornerRadius: s.activeTool === 'rounded-rect' ? s.cornerRadius : 0,
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

  // --- Wheel zoom ---

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    const pointer = st.getPointerPosition();
    if (!pointer) return;
    const s = useEditorStore.getState();
    const oldZoom = s.zoom;
    const oldPos = s.stagePosition;
    const mousePointTo = {
      x: (pointer.x - oldPos.x) / oldZoom,
      y: (pointer.y - oldPos.y) / oldZoom,
    };
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(0.1, Math.min(5, direction > 0 ? oldZoom * 1.06 : oldZoom / 1.06));
    s.setZoom(newZoom);
    s.setStagePosition({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    });
    st.batchDraw();
  }

  // --- Selection ---

  function handleSelect(id: string, e: Konva.KonvaEventObject<MouseEvent>) {
    const s = useEditorStore.getState();
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

  function renderElement(el: EditorElement, isDraft = false) {
    const s = useEditorStore.getState();
    const draggable = !isDraft && s.activeTool === 'select';
    const baseProps = {
      id: el.id,
      x: el.x,
      y: el.y,
      opacity: el.opacity ?? 1,
      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      draggable,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onTap: (e: Konva.KonvaEventObject<MouseEvent>) => handleSelect(el.id, e),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el.id, e),
      onTransformEnd: () => {
        const node = stageRef.current?.findOne(`#${el.id}`);
        if (node) handleTransform(el.id, node);
      },
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
          />
        );
      }

      case 'spotlight': {
        const shape = el as ShapeElement;
        if (shape.imageDataURL) {
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
      className="relative w-full h-full overflow-hidden"
      style={{
        cursor: cursorCSS,
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
            <KonvaImage
              image={backgroundImage}
              x={0}
              y={0}
              width={imageSize.width}
              height={imageSize.height}
              name="background"
            />
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
      {textInput.visible && (
        <textarea
          ref={textAreaRef}
          className="absolute z-50 bg-transparent border-2 border-dashed border-blue-500 outline-none resize-none p-1"
          style={{
            left: currentStagePos.x + textInput.x * currentZoom,
            top: currentStagePos.y + textInput.y * currentZoom,
            fontSize: fontSize * currentZoom,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: strokeColor,
            minWidth: 100,
            minHeight: 40,
            lineHeight: 1.2,
          }}
          onKeyDown={handleTextAreaKeyDown}
          onBlur={() => commitTextRef.current()}
          rows={2}
        />
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm pointer-events-none select-none">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
};

export default EditorCanvas;
