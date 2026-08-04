import { create } from 'zustand';
import type { EditorElement, ToolType, ExportFormat, CanvasStyle } from '@/types/editor';

// Persisted settings (restored on refresh)
const PERSIST_KEYS = ['activeTool', 'strokeColor', 'fillColor', 'strokeWidth', 'fontSize', 'opacity', 'cornerRadius', 'exportFormat', 'stepStartNumber', 'stepRadius', 'exportQuality', 'gridEnabled'] as const;
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
    localStorage.setItem('snapkit-settings', JSON.stringify(toSave));
  } catch { /* quota exceeded */ }
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

  launchEditor: () => void;
  setBackgroundImage: (img: HTMLImageElement) => void;
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
  setStepStartNumber: (n: number) => void;
  addElement: (element: EditorElement) => void;
  addElements: (elements: EditorElement[]) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
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
}

const initialCanvasStyle: CanvasStyle = {
  padding: 0, borderRadius: 0, shadowEnabled: false,
  shadowBlur: 20, shadowOffsetX: 0, shadowOffsetY: 4,
  shadowColor: 'rgba(0,0,0,0.3)', bgStyle: 'glass',
  bgColor: '#ffffff', bgGradientStart: '#667eea', bgGradientEnd: '#764ba2',
  deviceFrame: 'none', gridEnabled: false,
};

const defaults: Record<PersistKey, any> = {
  activeTool: 'select' as ToolType,
  strokeColor: '#ef4444',
  fillColor: 'transparent',
  strokeWidth: 3, fontSize: 24, opacity: 1, cornerRadius: 8,
  exportFormat: 'png' as ExportFormat,
  stepStartNumber: 1,
  stepRadius: 16,
};

const persisted = loadPersisted();
const editorPath = '/editor';

function syncEditorRoute(launched: boolean) {
  if (typeof window === 'undefined') return;
  const nextPath = launched ? editorPath : '/';
  const samePath = window.location.pathname === nextPath;
  const hasLegacyHash = window.location.hash === '#editor';
  if (!samePath || hasLegacyHash) {
    const method = hasLegacyHash && window.location.pathname === '/' ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextPath);
  }
}

// Auto-launch editor if URL is the dedicated editor path or the legacy hash bookmark
const shouldAutoLaunch = typeof window !== 'undefined' && (window.location.pathname === editorPath || window.location.hash === '#editor');

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
  elements: [],
  selectedElementIds: [],
  stepCounter: persisted.stepStartNumber ?? defaults.stepStartNumber,
  stepStartNumber: persisted.stepStartNumber ?? defaults.stepStartNumber,
  stepRadius: persisted.stepRadius ?? defaults.stepRadius,
  _history: [[]],
  _historyIndex: 0,
  canvasStyle: { ...initialCanvasStyle, gridEnabled: persisted.gridEnabled ?? initialCanvasStyle.gridEnabled },
  exportFormat: persisted.exportFormat ?? defaults.exportFormat,
  exportQuality: persisted.exportQuality ?? 1,
  showExportDialog: false,
  showHelpDialog: false,

  launchEditor: () => {
    syncEditorRoute(true);
    set({ isEditorLaunched: true });
  },

  setBackgroundImage: (img) => {
    const start = get().stepStartNumber;
    syncEditorRoute(true);
    set({
      backgroundImage: img,
      imageSize: { width: img.naturalWidth, height: img.naturalHeight },
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      stepCounter: start, isEditorLaunched: true,
    });
  },

  clearImage: () => {
    syncEditorRoute(false);
    return set({
      backgroundImage: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      canvasStyle: { ...initialCanvasStyle },
      isEditorLaunched: false,
    });
  },

  replaceImage: () => {
    syncEditorRoute(true);
    return set({
      backgroundImage: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      _history: [[]], _historyIndex: 0,
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      canvasStyle: { ...initialCanvasStyle },
      activeTool: 'select',
    });
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setStagePosition: (pos) => set({ stagePosition: pos }),
  resetView: () => {
    const { imageSize } = get();
    if (!imageSize.width || !imageSize.height) return;
    const cw = window.innerWidth - 320;
    const ch = window.innerHeight - 56;
    const z = Math.min((cw - 100) / imageSize.width, (ch - 100) / imageSize.height, 1);
    set({ zoom: z, stagePosition: { x: (cw - imageSize.width * z) / 2, y: (ch - imageSize.height * z) / 2 } });
  },

  setActiveTool: (tool) => { set({ activeTool: tool, selectedElementIds: [] }); savePersisted({ ...get(), activeTool: tool }); },
  setStrokeColor: (color) => { set({ strokeColor: color }); savePersisted({ ...get(), strokeColor: color }); },
  setFillColor: (color) => { set({ fillColor: color }); savePersisted({ ...get(), fillColor: color }); },
  setStrokeWidth: (width) => { set({ strokeWidth: width }); savePersisted({ ...get(), strokeWidth: width }); },
  setFontSize: (size) => { set({ fontSize: size }); savePersisted({ ...get(), fontSize: size }); },
  setOpacity: (opacity) => { set({ opacity: Math.max(0, Math.min(1, opacity)) }); savePersisted({ ...get(), opacity }); },
  setCornerRadius: (radius) => { set({ cornerRadius: radius }); savePersisted({ ...get(), cornerRadius: radius }); },
  setStepStartNumber: (n) => { set({ stepStartNumber: n, stepCounter: n }); savePersisted({ ...get(), stepStartNumber: n }); },
  setStepRadius: (r) => { set({ stepRadius: Math.max(8, Math.min(40, r)) }); savePersisted({ ...get(), stepRadius: r }); },

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
    syncEditorRoute(false);
    set({ isEditorLaunched: false, backgroundImage: null });
  },
}));

export { generateId };
