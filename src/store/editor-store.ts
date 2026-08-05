import { create } from 'zustand';
import type { EditorElement, ToolType, ExportFormat, CanvasStyle } from '@/types/editor';

// Persisted settings (restored on refresh)
const PERSIST_KEYS = [
  'activeTool', 'strokeColor', 'fillColor', 'strokeWidth', 'fontSize',
  'opacity', 'cornerRadius', 'exportFormat', 'stepStartNumber', 'stepRadius',
  'exportQuality', 'gridEnabled', 'blurRadius', 'pixelSize', 'highlighterWidth',
  // panelCollapsed is responsive/session - not persisted across reloads
] as const;
type PersistKey = typeof PERSIST_KEYS[number];

function loadPersisted(): Partial<Record<PersistKey, any>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('snapty-settings')
      ?? localStorage.getItem('snapkit-settings');
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
    localStorage.setItem('snapty-settings', JSON.stringify(toSave));
  } catch { /* quota exceeded */ }
}

/** Scale tool sizes so annotations stay readable on large screenshots. */
export function getImageToolScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  if (longest <= 0) return 1;
  // 1200px baseline → 1×; 2400px → 2×; cap at 4×
  return Math.max(1, Math.min(4, longest / 1200));
}

/** Full undo/redo snapshot - elements + image (so crop can be undone). */
export type HistorySnapshot = {
  elements: EditorElement[];
  imageDataURL: string | null;
  imageSize: { width: number; height: number };
  /** Tool active when this state was created; restored on image-changing undo/redo (crop). */
  activeTool?: ToolType;
};

interface EditorState {
  isEditorLaunched: boolean;
  backgroundImage: HTMLImageElement | null;
  /** Cached data-URL of the background (shared across history entries until crop). */
  imageDataURL: string | null;
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
  _history: HistorySnapshot[];
  _historyIndex: number;
  canvasStyle: CanvasStyle;
  exportFormat: ExportFormat;
  exportQuality: number;
  showHelpDialog: boolean;
  showExportDialog: boolean;
  panelCollapsed: boolean;
  /** True while a paste/URL/file image is decoding - drives skeleton UI */
  imageLoading: boolean;

  launchEditor: () => void;
  setImageLoading: (loading: boolean) => void;
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
  /** Crop background image to rect (image coords) and shift annotations. */
  cropToRegion: (region: { x: number; y: number; width: number; height: number }) => void;
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
  exportQuality: 92,
  panelCollapsed: false,
};

/** Quality is 10–100. Legacy values were 0–1 fractions. */
function normalizeExportQuality(q: unknown): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return defaults.exportQuality as number;
  if (q > 0 && q <= 1) return Math.round(q * 100);
  return Math.max(10, Math.min(100, Math.round(q)));
}

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
  // In installed PWA, stay on /editor - no landing route churn
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
const cloneElements = (els: EditorElement[]) => JSON.parse(JSON.stringify(els)) as EditorElement[];

type HistorySource = {
  _history: HistorySnapshot[];
  _historyIndex: number;
  imageDataURL: string | null;
  imageSize: { width: number; height: number };
  activeTool: ToolType;
};

function makeSnapshot(
  elements: EditorElement[],
  imageDataURL: string | null,
  imageSize: { width: number; height: number },
  activeTool?: ToolType,
): HistorySnapshot {
  return {
    elements: cloneElements(elements),
    imageDataURL,
    imageSize: { width: imageSize.width, height: imageSize.height },
    activeTool,
  };
}

/** Push a new history entry. Pass `image` when the background changed (crop). */
function pushHistory(
  s: HistorySource,
  elements: EditorElement[],
  image?: { imageDataURL: string | null; imageSize: { width: number; height: number } },
) {
  const imageDataURL = image ? image.imageDataURL : s.imageDataURL;
  const imageSize = image ? image.imageSize : s.imageSize;
  const snap = makeSnapshot(elements, imageDataURL, imageSize, s.activeTool);
  return {
    elements,
    ...(image
      ? { imageDataURL: image.imageDataURL, imageSize: { ...image.imageSize } }
      : {}),
    _history: [...s._history.slice(0, s._historyIndex + 1), snap],
    _historyIndex: s._historyIndex + 1,
  };
}

function emptyHistory(
  imageDataURL: string | null = null,
  imageSize: { width: number; height: number } = { width: 0, height: 0 },
  activeTool?: ToolType,
) {
  return {
    _history: [makeSnapshot([], imageDataURL, imageSize, activeTool)] as HistorySnapshot[],
    _historyIndex: 0,
  };
}

/** Encode current HTMLImageElement for history (reuse data: URLs as-is). */
function imageToDataURL(img: HTMLImageElement): string | null {
  try {
    if (img.src?.startsWith('data:')) return img.src;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    if (!c.width || !c.height) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Guards against rapid undo/redo while an image is still decoding. */
let historyApplyGen = 0;

function applyHistorySnapshot(
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
  get: () => EditorState,
  snap: HistorySnapshot,
  index: number,
) {
  const s = get();
  const imageChanged =
    snap.imageDataURL !== s.imageDataURL
    || snap.imageSize.width !== s.imageSize.width
    || snap.imageSize.height !== s.imageSize.height;

  // Only restore tool when the image changes (crop undo/redo). Normal annotation
  // undo keeps the user's current tool.
  const toolPatch: Partial<EditorState> =
    imageChanged && snap.activeTool ? { activeTool: snap.activeTool } : {};

  if (!imageChanged) {
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
    });
    return;
  }

  const gen = ++historyApplyGen;
  if (!snap.imageDataURL) {
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
      backgroundImage: null,
      imageDataURL: null,
      imageSize: { width: 0, height: 0 },
      ...toolPatch,
    });
    return;
  }

  const img = new Image();
  img.onload = () => {
    if (gen !== historyApplyGen) return;
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
      backgroundImage: img,
      imageDataURL: snap.imageDataURL,
      imageSize: { width: snap.imageSize.width, height: snap.imageSize.height },
      ...toolPatch,
    });
    setTimeout(() => get().resetView(), 30);
  };
  img.onerror = () => {
    if (gen !== historyApplyGen) return;
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
      ...toolPatch,
    });
  };
  img.src = snap.imageDataURL;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  isEditorLaunched: shouldAutoLaunch,
  backgroundImage: null,
  imageDataURL: null,
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
  ...emptyHistory(),
  canvasStyle: { ...initialCanvasStyle, gridEnabled: persisted.gridEnabled ?? initialCanvasStyle.gridEnabled },
  exportFormat: persisted.exportFormat ?? defaults.exportFormat,
  exportQuality: normalizeExportQuality(persisted.exportQuality ?? defaults.exportQuality),
  showExportDialog: false,
  showHelpDialog: false,
  panelCollapsed: typeof window !== 'undefined' && window.innerWidth < 900,
  imageLoading: false,

  launchEditor: () => {
    syncEditorRoute(true);
    set({ isEditorLaunched: true });
  },

  setImageLoading: (loading) => set({ imageLoading: loading }),

  // Replace/load image. Preserves active tool and all drawing settings.
  // Clears annotations by default (new screenshot = fresh canvas).
  setBackgroundImage: (img, opts) => {
    const clearAnnotations = opts?.clearAnnotations !== false;
    const start = get().stepStartNumber;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const dataURL = imageToDataURL(img);
    syncEditorRoute(true);
    if (clearAnnotations) {
      set({
        backgroundImage: img,
        imageDataURL: dataURL,
        imageSize: size,
        elements: [], selectedElementIds: [],
        ...emptyHistory(dataURL, size),
        stepCounter: start, isEditorLaunched: true,
        imageLoading: false,
      });
    } else {
      set({
        backgroundImage: img,
        imageDataURL: dataURL,
        imageSize: size,
        isEditorLaunched: true,
        imageLoading: false,
      });
    }
  },

  clearImage: () => {
    // In PWA, stay in editor rather than bouncing to landing
    if (isStandalonePwa()) {
      return set({
        backgroundImage: null,
        imageDataURL: null,
        imageSize: { width: 0, height: 0 },
        elements: [], selectedElementIds: [],
        ...emptyHistory(),
        stepCounter: get().stepStartNumber,
        zoom: 1, stagePosition: { x: 0, y: 0 },
        isEditorLaunched: true,
      });
    }
    syncEditorRoute(false);
    return set({
      backgroundImage: null,
      imageDataURL: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      ...emptyHistory(),
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
      imageDataURL: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      ...emptyHistory(),
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
    const container = document.querySelector('[data-snapty-canvas]') as HTMLElement | null;
    const root = document.querySelector('[data-snapty-root]') as HTMLElement | null;
    // Fallbacks subtract chrome (toolbar ~48 + top bar ~48 + settings ~0–224)
    const cw = (container && container.clientWidth > 0)
      ? container.clientWidth
      : Math.max(200, (root?.clientWidth || window.innerWidth) - 96);
    const ch = (container && container.clientHeight > 0)
      ? container.clientHeight
      : Math.max(200, (root?.clientHeight || window.innerHeight) - 96);
    if (cw < 40 || ch < 40) return;
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
        ? { strokeColor: color, ...pushHistory(s, els) }
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
        ? { fillColor: color, ...pushHistory(s, els) }
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
        ? { strokeWidth: width, ...pushHistory(s, els) }
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
        ? { fontSize: size, ...pushHistory(s, els) }
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
      return { opacity: o, ...pushHistory(s, els) };
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
        ? { cornerRadius: radius, ...pushHistory(s, els) }
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
        ? { stepRadius: radius, ...pushHistory(s, els) }
        : { stepRadius: radius };
    });
    savePersisted({ ...get(), stepRadius: radius });
  },
  setPanelCollapsed: (collapsed) => {
    set({ panelCollapsed: collapsed });
  },

  resetToolSettings: () => {
    // Preserve activeTool - only reset stroke/fill/size prefs
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
    set((s) => pushHistory(s, [...s.elements, element]));
    if (element.type === 'step') set((s) => ({ stepCounter: s.stepCounter + 1 }));
  },
  addElements: (elements) => {
    set((s) => pushHistory(s, [...s.elements, ...elements]));
  },
  updateElement: (id, updates) => {
    set((s) => {
      const els = s.elements.map((el) => el.id === id ? { ...el, ...updates } as EditorElement : el);
      return pushHistory(s, els);
    });
  },
  updateSelectedElements: (updates) => {
    set((s) => {
      if (!s.selectedElementIds.length) return s;
      const els = s.elements.map((el) =>
        s.selectedElementIds.includes(el.id) ? { ...el, ...updates } as EditorElement : el
      );
      return pushHistory(s, els);
    });
  },
  removeElements: (ids) => {
    set((s) => {
      const els = s.elements.filter((el) => !ids.includes(el.id));
      return {
        ...pushHistory(s, els),
        selectedElementIds: s.selectedElementIds.filter((id) => !ids.includes(id)),
      };
    });
  },
  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  clearElements: () => set((s) => ({ ...pushHistory(s, []), selectedElementIds: [] })),

  bringForward: (id) => set((s) => {
    const i = s.elements.findIndex((el) => el.id === id);
    if (i < 0 || i >= s.elements.length - 1) return s;
    const e = [...s.elements];
    [e[i], e[i + 1]] = [e[i + 1], e[i]];
    return pushHistory(s, e);
  }),
  sendBackward: (id) => set((s) => {
    const i = s.elements.findIndex((el) => el.id === id);
    if (i <= 0) return s;
    const e = [...s.elements];
    [e[i], e[i - 1]] = [e[i - 1], e[i]];
    return pushHistory(s, e);
  }),
  bringToFront: (id) => set((s) => {
    const i = s.elements.findIndex((el) => el.id === id);
    if (i < 0) return s;
    const e = [...s.elements];
    const [el] = e.splice(i, 1);
    e.push(el);
    return pushHistory(s, e);
  }),
  sendToBack: (id) => set((s) => {
    const i = s.elements.findIndex((el) => el.id === id);
    if (i < 0) return s;
    const e = [...s.elements];
    const [el] = e.splice(i, 1);
    e.unshift(el);
    return pushHistory(s, e);
  }),

  undo: () => {
    const s = get();
    if (s._historyIndex <= 0) return;
    applyHistorySnapshot(set, get, s._history[s._historyIndex - 1], s._historyIndex - 1);
  },
  redo: () => {
    const s = get();
    if (s._historyIndex >= s._history.length - 1) return;
    applyHistorySnapshot(set, get, s._history[s._historyIndex + 1], s._historyIndex + 1);
  },
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
  setExportQuality: (quality) => {
    const q = normalizeExportQuality(quality);
    set({ exportQuality: q });
    savePersisted({ ...get(), exportQuality: q });
  },
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowHelpDialog: (show) => set({ showHelpDialog: show }),

  resetAll: () => {
    set({
      backgroundImage: null,
      imageDataURL: null,
      imageSize: { width: 0, height: 0 }, zoom: 1, stagePosition: { x: 0, y: 0 },
      isEditorLaunched: true,
      elements: [], selectedElementIds: [],
      ...emptyHistory(),
      showExportDialog: false, showHelpDialog: false,
    });
  },

  goToLanding: () => {
    // Installed PWA should never show landing - stay in editor
    if (isStandalonePwa()) {
      set({ isEditorLaunched: true });
      syncEditorRoute(true);
      return;
    }
    syncEditorRoute(false);
    set({ isEditorLaunched: false, backgroundImage: null, imageDataURL: null });
  },

  getToolScale: () => {
    const { imageSize } = get();
    return getImageToolScale(imageSize.width, imageSize.height);
  },

  cropToRegion: (region) => {
    const state = get();
    const { backgroundImage, imageSize, elements } = state;
    if (!backgroundImage || !imageSize.width || !imageSize.height) return;

    // Ensure pre-crop image is stored on history so undo can restore it
    if (!state.imageDataURL) {
      const encoded = imageToDataURL(backgroundImage);
      if (encoded) {
        const hist = state._history.map((snap) =>
          snap.imageDataURL
            ? snap
            : { ...snap, imageDataURL: encoded, imageSize: { ...imageSize } },
        );
        set({ imageDataURL: encoded, _history: hist });
      }
    }

    const x = Math.max(0, Math.round(region.x));
    const y = Math.max(0, Math.round(region.y));
    const w = Math.max(1, Math.round(region.width));
    const h = Math.max(1, Math.round(region.height));
    const cropX = Math.min(x, imageSize.width - 1);
    const cropY = Math.min(y, imageSize.height - 1);
    const cropW = Math.min(w, imageSize.width - cropX);
    const cropH = Math.min(h, imageSize.height - cropY);
    if (cropW < 2 || cropH < 2) return;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(backgroundImage, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Stamp crop tool onto the current (pre-crop) history entry so undo restores it
    const toolBeforeCrop = state.activeTool;
    {
      const s0 = get();
      const hist = [...s0._history];
      const idx = s0._historyIndex;
      if (hist[idx]) {
        hist[idx] = { ...hist[idx], activeTool: toolBeforeCrop };
        set({ _history: hist });
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      // Shift annotations captured at crop time so they stay aligned
      const shifted = elements.map((el) => {
        const next = { ...el, x: el.x - cropX, y: el.y - cropY } as EditorElement;
        if (el.type === 'pencil' || el.type === 'highlighter') {
          const pts = [...(el as any).points] as number[];
          for (let i = 0; i < pts.length; i += 2) {
            pts[i] -= cropX;
            pts[i + 1] -= cropY;
          }
          return { ...next, x: 0, y: 0, points: pts } as EditorElement;
        }
        return next;
      });
      const size = { width: cropW, height: cropH };
      const s = get();
      // Stay on crop tool so further crops / undo keep the same tool
      set({
        backgroundImage: img,
        selectedElementIds: [],
        activeTool: 'crop',
        ...pushHistory(
          { ...s, activeTool: 'crop' },
          shifted,
          { imageDataURL: dataUrl, imageSize: size },
        ),
      });
      setTimeout(() => get().resetView(), 30);
    };
    img.src = dataUrl;
  },
}));

export { generateId, isStandalonePwa };
