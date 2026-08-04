import { create } from 'zustand';
import type { EditorElement, ToolType, ExportFormat, CanvasStyle } from '@/types/editor';

// Persisted settings (restored on refresh)
const PERSIST_KEYS = [
  'activeTool', 'strokeColor', 'fillColor', 'strokeWidth', 'fontSize',
  'opacity', 'cornerRadius', 'exportFormat', 'stepStartNumber', 'stepRadius',
  'exportQuality', 'gridEnabled', 'blurRadius', 'pixelSize', 'highlighterWidth',
  'panelCollapsed',
] as const;
type PersistKey = typeof PERSIST_KEYS[number];

function loadPersisted(): Partial<Record<PersistKey, any>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('snapkit-settings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePersisted(state: Record<string, any>) {
  if (typeof window === 'undefined') return;
  try {
    const toSave: Record<string, any> = {};
    for (const k of PERSIST_KEYS) toSave[k] = state[k];
    // gridEnabled lives on canvasStyle
    toSave.gridEnabled = state.canvasStyle?.gridEnabled ?? state.gridEnabled;
    localStorage.setItem('snapkit-settings', JSON.stringify(toSave));
  } catch { /* quota exceeded */ }
}

/** Scale tool sizes so annotations stay readable on large screenshots. */
export function getImageToolScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  if (longest <= 0) return 1;
  // 1200px baseline → 1×; 2400px → 2×; cap at 4×
  return Math.max(1, Math.min(4, longest / 1200));
}

interface EditorState {
  isEditorLaunched: boolean;
  backgroundImage: HTMLImageElement | null;
  imageSize: { width: number; height: number };
  zoom: number;
  stagePosition: { x: number; y: number };
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
  cornerRadius: number;
  blurRadius: number;
  pixelSize: number;
  highlighterWidth: number;
  elements: EditorElement[];
  selectedElementIds: string[];
  stepCounter: number;
  stepStartNumber: number;
  stepRadius: number;
  setStepRadius: (r: number) => void;
  _history: EditorElement[][];
  _historyIndex: number;
  canvasStyle: CanvasStyle;
  exportFormat: ExportFormat;
  exportQuality: number;
  showHelpDialog: boolean;
  showExportDialog: boolean;
  panelCollapsed: boolean;

  launchEditor: () => void;
  setBackgroundImage: (img: HTMLImageElement, opts?: { clearAnnotations?: boolean }) => void;
  clearImage: () => void;
  replaceImage: () => void;
  setZoom: (zoom: number) => void;
  setStagePosition: (pos: { x: number; y: number }) => void;
  resetView: () => void;
  setActiveTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFontSize: (size: number) => void;
  setOpacity: (opacity: number) => void;
  setCornerRadius: (radius: number) => void;
  setBlurRadius: (r: number) => void;
  setPixelSize: (s: number) => void;
  setHighlighterWidth: (w: number) => void;
  setStepStartNumber: (n: number) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  /** Reset stroke/fill/size prefs to factory defaults (keeps image + annotations). */
  resetToolSettings: () => void;
  addElement: (element: EditorElement) => void;
  addElements: (elements: EditorElement[]) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
  updateSelectedElements: (updates: Partial<EditorElement>) => void;
  removeElements: (ids: string[]) => void;
  setSelectedElementIds: (ids: string[]) => void;
  clearElements: () => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setCanvasStyle: (style: Partial<CanvasStyle>) => void;
  setExportFormat: (format: ExportFormat) => void;
  setExportQuality: (quality: number) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowHelpDialog: (show: boolean) => void;
  resetAll: () => void;
  goToLanding: () => void;
  getToolScale: () => number;
}

const initialCanvasStyle: CanvasStyle = {
  padding: 0, borderRadius: 0, shadowEnabled: false,
  shadowBlur: 20, shadowOffsetX: 0, shadowOffsetY: 4,
  shadowColor: 'rgba(0,0,0,0.3)', bgStyle: 'glass',
  bgColor: '#ffffff', bgGradientStart: '#667eea', bgGradientEnd: '#764ba2',
  deviceFrame: 'none', gridEnabled: false,
};

const defaults: Record<string, any> = {
  // First visit: arrow. After that, last used tool is restored from localStorage.
  activeTool: 'arrow' as ToolType,
  strokeColor: '#ef4444',
  fillColor: 'transparent',
  strokeWidth: 3,
  fontSize: 24,
  opacity: 1,
  cornerRadius: 8,
  exportFormat: 'png' as ExportFormat,
  stepStartNumber: 1,
  stepRadius: 16,
  blurRadius: 12,
  pixelSize: 10,
  highlighterWidth: 24,
  exportQuality: 1,
  panelCollapsed: false,
};

const persisted = loadPersisted();
const editorPath = '/editor';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || nav.standalone === true;
}

function syncEditorRoute(launched: boolean) {
  if (typeof window === 'undefined') return;
  // In installed PWA, stay on /editor — no landing route churn
  if (isStandalonePwa()) {
    if (window.location.pathname !== editorPath) {
      window.history.replaceState({}, '', editorPath);
    }
    return;
  }
  const nextPath = launched ? editorPath : '/';
  const samePath = window.location.pathname === nextPath;
  const hasLegacyHash = window.location.hash === '#editor';
  if (!samePath || hasLegacyHash) {
    const method = hasLegacyHash && window.location.pathname === '/' ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextPath);
  }
}

// Auto-launch: /editor path, legacy hash, or installed PWA (skip landing)
const shouldAutoLaunch = typeof window !== 'undefined' && (
  window.location.pathname === editorPath
  || window.location.hash === '#editor'
  || isStandalonePwa()
);

const generateId = () => Math.random().toString(36).substring(2, 11);
const cloneElements = (els: EditorElement[]) => JSON.parse(JSON.stringify(els));

export const useEditorStore = create<EditorState>((set, get) => ({
  isEditorLaunched: shouldAutoLaunch,
  backgroundImage: null,
  imageSize: { width: 0, height: 0 },
  zoom: 1,
  stagePosition: { x: 0, y: 0 },
  activeTool: persisted.activeTool ?? defaults.activeTool,
  strokeColor: persisted.strokeColor ?? defaults.strokeColor,
  fillColor: persisted.fillColor ?? defaults.fillColor,
  strokeWidth: persisted.strokeWidth ?? defaults.strokeWidth,
  fontSize: persisted.fontSize ?? defaults.fontSize,
  opacity: persisted.opacity ?? defaults.opacity,
  cornerRadius: persisted.cornerRadius ?? defaults.cornerRadius,
  blurRadius: persisted.blurRadius ?? defaults.blurRadius,
  pixelSize: persisted.pixelSize ?? defaults.pixelSize,
  highlighterWidth: persisted.highlighterWidth ?? defaults.highlighterWidth,
  elements: [],
  selectedElementIds: [],
  stepCounter: persisted.stepStartNumber ?? defaults.stepStartNumber,
  stepStartNumber: persisted.stepStartNumber ?? defaults.stepStartNumber,
  stepRadius: persisted.stepRadius ?? defaults.stepRadius,
  _history: [[]],
  _historyIndex: 0,
  canvasStyle: { ...initialCanvasStyle, gridEnabled: persisted.gridEnabled ?? initialCanvasStyle.gridEnabled },
  exportFormat: persisted.exportFormat ?? defaults.exportFormat,
  exportQuality: persisted.exportQuality ?? defaults.exportQuality,
  showExportDialog: false,
  showHelpDialog: false,
  panelCollapsed: persisted.panelCollapsed ?? defaults.panelCollapsed,

  launchEditor: () => {
    syncEditorRoute(true);
    set({ isEditorLaunched: true });
  },

  // Replace/load image. Preserves active tool and all drawing settings.
  // Clears annotations by default (new screenshot = fresh canvas).
  setBackgroundImage: (img, opts) => {
    const clearAnnotations = opts?.clearAnnotations !== false;
    const start = get().stepStartNumber;
    syncEditorRoute(true);
    if (clearAnnotations) {
      set({
        backgroundImage: img,
        imageSize: { width: img.naturalWidth, height: img.naturalHeight },
        elements: [], selectedElementIds: [],
        _history: [[]], _historyIndex: 0,
        stepCounter: start, isEditorLaunched: true,
      });
    } else {
      set({
        backgroundImage: img,
        imageSize: { width: img.naturalWidth, height: img.naturalHeight },
        isEditorLaunched: true,
      });
    }
  },

  clearImage: () => {
    // In PWA, stay in editor rather than bouncing to landing
    if (isStandalonePwa()) {
      return set({
        backgroundImage: null,
        imageSize: { width: 0, height: 0 },
        elements: [], selectedElementIds: [],
        _history: [[]], _historyIndex: 0,
        stepCounter: get().stepStartNumber,
        zoom: 1, stagePosition: { x: 0, y: 0 },
        isEditorLaunched: true,
      });
    }
    syncEditorRoute(false);
    return set({
      backgroundImage: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      isEditorLaunched: false,
    });
  },

  // Clear image to show welcome/drop zone WITHOUT resetting tool or style settings
  replaceImage: () => {
    syncEditorRoute(true);
    return set({
      backgroundImage: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      // intentionally keep activeTool, colors, sizes, canvasStyle
    });
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setStagePosition: (pos) => set({ stagePosition: pos }),
  resetView: () => {
    const { imageSize } = get();
    if (!imageSize.width || !imageSize.height) return;
    // Prefer measuring the actual canvas container when available
    const container = document.querySelector('[data-snapkit-canvas]') as HTMLElement | null;
    const cw = container?.clientWidth || Math.max(200, window.innerWidth - 96);
    const ch = container?.clientHeight || Math.max(200, window.innerHeight - 96);
    const pad = Math.min(80, Math.max(16, Math.min(cw, ch) * 0.08));
    const z = Math.min((cw - pad) / imageSize.width, (ch - pad) / imageSize.height, 1);
    set({
      zoom: Math.max(0.05, z),
      stagePosition: {
        x: (cw - imageSize.width * z) / 2,
        y: (ch - imageSize.height * z) / 2,
      },
    });
  },

  setActiveTool: (tool) => { set({ activeTool: tool, selectedElementIds: [] }); savePersisted({ ...get(), activeTool: tool }); },
  setStrokeColor: (color) => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        els = s.elements.map((el) => {
          if (!ids.has(el.id)) return el;
          if (el.type === 'text' || el.type === 'step') return { ...el, fill: color } as EditorElement;
          if (el.type === 'arrow') return { ...el, stroke: color, fill: color } as EditorElement;
          if (['blur', 'pixelate', 'spotlight'].includes(el.type)) return el;
          return { ...el, stroke: color } as EditorElement;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { strokeColor: color, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { strokeColor: color };
    });
    savePersisted({ ...get(), strokeColor: color });
  },
  setFillColor: (color) => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        els = s.elements.map((el) => {
          if (!ids.has(el.id)) return el;
          if (['rectangle', 'rounded-rect', 'circle'].includes(el.type)) return { ...el, fill: color } as EditorElement;
          return el;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { fillColor: color, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { fillColor: color };
    });
    savePersisted({ ...get(), fillColor: color });
  },
  setStrokeWidth: (width) => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        // Apply image scale so edits match draw-time sizing on large screenshots
        const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
        const scaled = Math.max(1, Math.round(width * scale));
        els = s.elements.map((el) => {
          if (!ids.has(el.id) || !('strokeWidth' in el)) return el;
          return { ...el, strokeWidth: scaled } as EditorElement;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { strokeWidth: width, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { strokeWidth: width };
    });
    savePersisted({ ...get(), strokeWidth: width });
  },
  setFontSize: (size) => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
        const scaled = Math.max(8, Math.round(size * scale));
        els = s.elements.map((el) => {
          if (!ids.has(el.id) || el.type !== 'text') return el;
          return { ...el, fontSize: scaled } as EditorElement;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { fontSize: size, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { fontSize: size };
    });
    savePersisted({ ...get(), fontSize: size });
  },
  setOpacity: (opacity) => {
    const o = Math.max(0, Math.min(1, opacity));
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      if (!ids.size) return { opacity: o };
      const els = s.elements.map((el) => ids.has(el.id) ? { ...el, opacity: o } as EditorElement : el);
      return { opacity: o, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
    savePersisted({ ...get(), opacity: o });
  },
  setCornerRadius: (radius) => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        els = s.elements.map((el) => {
          if (!ids.has(el.id) || (el.type !== 'rounded-rect' && el.type !== 'rectangle')) return el;
          return { ...el, cornerRadius: radius } as EditorElement;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { cornerRadius: radius, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { cornerRadius: radius };
    });
    savePersisted({ ...get(), cornerRadius: radius });
  },
  setBlurRadius: (r) => { set({ blurRadius: Math.max(2, Math.min(40, r)) }); savePersisted({ ...get(), blurRadius: r }); },
  setPixelSize: (s) => { set({ pixelSize: Math.max(2, Math.min(40, s)) }); savePersisted({ ...get(), pixelSize: s }); },
  setHighlighterWidth: (w) => { set({ highlighterWidth: Math.max(4, Math.min(60, w)) }); savePersisted({ ...get(), highlighterWidth: w }); },
  setStepStartNumber: (n) => { set({ stepStartNumber: n, stepCounter: n }); savePersisted({ ...get(), stepStartNumber: n }); },
  setStepRadius: (r) => {
    const radius = Math.max(8, Math.min(80, r));
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      let els = s.elements;
      let historyExtra = false;
      if (ids.size) {
        const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
        const scaled = Math.max(8, Math.round(radius * scale));
        els = s.elements.map((el) => {
          if (!ids.has(el.id) || el.type !== 'step') return el;
          return { ...el, radius: scaled, fontSize: Math.round(scaled * 0.8) } as EditorElement;
        });
        historyExtra = true;
      }
      return historyExtra
        ? { stepRadius: radius, elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 }
        : { stepRadius: radius };
    });
    savePersisted({ ...get(), stepRadius: radius });
  },
  setPanelCollapsed: (collapsed) => {
    set({ panelCollapsed: collapsed });
    savePersisted({ ...get(), panelCollapsed: collapsed });
  },

  resetToolSettings: () => {
    // Preserve activeTool — only reset stroke/fill/size prefs
    const next = {
      strokeColor: defaults.strokeColor as string,
      fillColor: defaults.fillColor as string,
      strokeWidth: defaults.strokeWidth as number,
      fontSize: defaults.fontSize as number,
      opacity: defaults.opacity as number,
      cornerRadius: defaults.cornerRadius as number,
      blurRadius: defaults.blurRadius as number,
      pixelSize: defaults.pixelSize as number,
      highlighterWidth: defaults.highlighterWidth as number,
      stepRadius: defaults.stepRadius as number,
      stepStartNumber: defaults.stepStartNumber as number,
      stepCounter: defaults.stepStartNumber as number,
    };
    set(next);
    savePersisted({ ...get(), ...next });
  },

  addElement: (element) => {
    set((s) => {
      const els = [...s.elements, element];
      return { elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
    if (element.type === 'step') set((s) => ({ stepCounter: s.stepCounter + 1 }));
  },
  addElements: (elements) => {
    set((s) => {
      const els = [...s.elements, ...elements];
      return { elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
  },
  updateElement: (id, updates) => {
    set((s) => {
      const els = s.elements.map((el) => el.id === id ? { ...el, ...updates } as EditorElement : el);
      return { elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
  },
  updateSelectedElements: (updates) => {
    set((s) => {
      if (!s.selectedElementIds.length) return s;
      const els = s.elements.map((el) =>
        s.selectedElementIds.includes(el.id) ? { ...el, ...updates } as EditorElement : el
      );
      return { elements: els, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
  },
  removeElements: (ids) => {
    set((s) => {
      const els = s.elements.filter((el) => !ids.includes(el.id));
      return { elements: els, selectedElementIds: s.selectedElementIds.filter((id) => !ids.includes(id)), _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(els)], _historyIndex: s._historyIndex + 1 };
    });
  },
  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  clearElements: () => set((s) => ({ elements: [], selectedElementIds: [], _history: [...s._history.slice(0, s._historyIndex + 1), []], _historyIndex: s._historyIndex + 1 })),

  bringForward: (id) => set((s) => { const i = s.elements.findIndex((el) => el.id === id); if (i < 0 || i >= s.elements.length - 1) return s; const e = [...s.elements]; [e[i], e[i+1]] = [e[i+1], e[i]]; return { elements: e, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(e)], _historyIndex: s._historyIndex + 1 }; }),
  sendBackward: (id) => set((s) => { const i = s.elements.findIndex((el) => el.id === id); if (i <= 0) return s; const e = [...s.elements]; [e[i], e[i-1]] = [e[i-1], e[i]]; return { elements: e, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(e)], _historyIndex: s._historyIndex + 1 }; }),
  bringToFront: (id) => set((s) => { const i = s.elements.findIndex((el) => el.id === id); if (i < 0) return s; const e = [...s.elements]; const [el] = e.splice(i, 1); e.push(el); return { elements: e, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(e)], _historyIndex: s._historyIndex + 1 }; }),
  sendToBack: (id) => set((s) => { const i = s.elements.findIndex((el) => el.id === id); if (i < 0) return s; const e = [...s.elements]; const [el] = e.splice(i, 1); e.unshift(el); return { elements: e, _history: [...s._history.slice(0, s._historyIndex + 1), cloneElements(e)], _historyIndex: s._historyIndex + 1 }; }),

  undo: () => set((s) => { if (s._historyIndex <= 0) return s; const ni = s._historyIndex - 1; return { elements: cloneElements(s._history[ni]), _historyIndex: ni, selectedElementIds: [] }; }),
  redo: () => set((s) => { if (s._historyIndex >= s._history.length - 1) return s; const ni = s._historyIndex + 1; return { elements: cloneElements(s._history[ni]), _historyIndex: ni, selectedElementIds: [] }; }),
  canUndo: () => get()._historyIndex > 0,
  canRedo: () => get()._historyIndex < get()._history.length - 1,

  setCanvasStyle: (style) => {
    set((s) => {
      const updated = { ...s.canvasStyle, ...style };
      if ('gridEnabled' in style) savePersisted({ ...get(), canvasStyle: updated, gridEnabled: updated.gridEnabled });
      return { canvasStyle: updated };
    });
  },
  setExportFormat: (format) => { set({ exportFormat: format }); savePersisted({ ...get(), exportFormat: format }); },
  setExportQuality: (quality) => { set({ exportQuality: quality }); savePersisted({ ...get(), exportQuality: quality }); },
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowHelpDialog: (show) => set({ showHelpDialog: show }),

  resetAll: () => {
    set({
      backgroundImage: null,
      imageSize: { width: 0, height: 0 }, zoom: 1, stagePosition: { x: 0, y: 0 },
      isEditorLaunched: true,
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      showExportDialog: false, showHelpDialog: false,
    });
  },

  goToLanding: () => {
    // Installed PWA should never show landing — stay in editor
    if (isStandalonePwa()) {
      set({ isEditorLaunched: true });
      syncEditorRoute(true);
      return;
    }
    syncEditorRoute(false);
    set({ isEditorLaunched: false, backgroundImage: null });
  },

  getToolScale: () => {
    const { imageSize } = get();
    return getImageToolScale(imageSize.width, imageSize.height);
  },
}));

export { generateId, isStandalonePwa };
