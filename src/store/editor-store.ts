import { create } from 'zustand';
import type {
  EditorElement, ToolType, ExportFormat, CanvasStyle,
  StrokeStyle, FillStyle, Arrowhead,
} from '@/types/editor';
import { HANDWRITTEN_FONT } from '@/types/editor';
import { trackPageView } from '@/lib/analytics';
import { getElementBounds, unionBounds } from '@/lib/editor/selection';
import { applySettingToElement } from '@/lib/editor/settings-sync';
import { DEVICE_FRAME_INSETS } from '@/lib/editor/device-frames';
import type { SettingKey } from '@/lib/editor/tool-settings';

// Persisted settings (restored on refresh)
const PERSIST_KEYS = [
  'activeTool', 'strokeColor', 'fillColor', 'strokeWidth', 'fontSize', 'fontFamily',
  'opacity', 'cornerRadius', 'exportFormat', 'stepStartNumber', 'stepRadius',
  'exportQuality', 'gridEnabled', 'blurRadius', 'pixelSize', 'highlighterWidth',
  'strokeStyle', 'fillStyle', 'roughness', 'magnification', 'endArrowhead', 'startArrowhead',
  'fontStyle', 'textAlign',
  'transparentExport', 'keepOriginal',
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
    // Members that live on canvasStyle (grid + transparent export)
    toSave.gridEnabled = state.canvasStyle?.gridEnabled ?? state.gridEnabled;
    toSave.transparentExport = state.canvasStyle?.transparentExport ?? false;
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
  /** Next step number at snapshot time, so undo does not skip a badge number. */
  stepCounter?: number;
  /** Canvas styling (padding / bg / frame / transparent) so style edits are undoable. */
  canvasStyle: CanvasStyle;
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
  /** Font stack for new text annotations. See HANDWRITTEN_FONT / STANDARD_FONT. */
  fontFamily: string;
  /** CSS font-style string for new/selected text ('normal' | 'italic' | 'bold 24px ...'). */
  fontStyle: string;
  /** Text alignment for new/selected text annotations. */
  textAlign: 'left' | 'center' | 'right';
  setFontStyle: (style: string) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
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
  showCommandPalette: boolean;
  showSettings: boolean;
  panelCollapsed: boolean;
  /** True while a paste/URL/file image is decoding - drives skeleton UI */
  imageLoading: boolean;
  stickyTool: boolean;
  strokeStyle: StrokeStyle;
  fillStyle: FillStyle;
  roughness: number;
  /** Default zoom for newly drawn magnifiers. */
  magnification: number;
  endArrowhead: Arrowhead;
  startArrowhead: Arrowhead;
  imageLocked: boolean;
  annotationsLocked: boolean;
  /** Keep full resolution when importing very large images (default off: downscale past ~4096px). */
  keepOriginal: boolean;
  setKeepOriginal: (v: boolean) => void;
  /** Slider-style edits: coalesce per-gesture history pushes into one undo step. */
  beginSettingGesture: () => void;
  endSettingGesture: () => void;

  launchEditor: () => void;
  setImageLoading: (loading: boolean) => void;
  setBackgroundImage: (img: HTMLImageElement, opts?: { clearAnnotations?: boolean }) => void;
  clearImage: () => void;
  replaceImage: () => void;
  setZoom: (zoom: number) => void;
  setStagePosition: (pos: { x: number; y: number }) => void;
  resetView: () => void;
  zoomToActual: () => void;
  zoomToSelection: () => void;
  setActiveTool: (tool: ToolType, opts?: { clearSelection?: boolean }) => void;
  setStickyTool: (v: boolean) => void;
  setStrokeStyle: (v: StrokeStyle) => void;
  setFillStyle: (v: FillStyle) => void;
  setRoughness: (v: number) => void;
  setMagnification: (v: number) => void;
  setEndArrowhead: (v: Arrowhead) => void;
  setStartArrowhead: (v: Arrowhead) => void;
  setImageLocked: (v: boolean) => void;
  setAnnotationsLocked: (v: boolean) => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  lockSelected: () => void;
  unlockSelected: () => void;
  setShowCommandPalette: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  /** Live preview during drag, does not push undo history. */
  updateElementSilent: (id: string, updates: Partial<EditorElement>) => void;
  /** Commit a previewed change as a single undo step. */
  commitElementUpdate: (id: string, updates: Partial<EditorElement>) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;

  setOpacity: (opacity: number) => void;
  setCornerRadius: (radius: number) => void;
  setBlurRadius: (r: number) => void;
  setPixelSize: (s: number) => void;
  setHighlighterWidth: (w: number) => void;
  setStepStartNumber: (n: number) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  handDrawn: boolean;
  setHandDrawn: (v: boolean) => void;
  /** Reset stroke/fill/size prefs to factory defaults (keeps image + annotations). */
  resetToolSettings: () => void;
  addElement: (element: EditorElement) => void;
  addElements: (elements: EditorElement[]) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
  updateSelectedElements: (updates: Partial<EditorElement>) => void;
  nudgeSelected: (dx: number, dy: number) => void;
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
  shadowColor: 'rgba(0,0,0,0.3)', bgStyle: 'none',
  bgColor: '#ffffff', bgGradientStart: '#667eea', bgGradientEnd: '#764ba2',
  deviceFrame: 'none', gridEnabled: true, transparentExport: false,
};

const defaults: Record<string, any> = {
  // First visit: arrow. After that, last used tool is restored from localStorage.
  activeTool: 'arrow' as ToolType,
  strokeColor: '#ef4444',
  fillColor: 'transparent',
  strokeWidth: 3,
  fontSize: 24,
  fontFamily: HANDWRITTEN_FONT,
  fontStyle: 'normal',
  textAlign: 'left' as 'left' | 'center' | 'right',
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
  strokeStyle: 'solid' as StrokeStyle,
  fillStyle: 'hachure' as FillStyle,
  roughness: 1.25,
  magnification: 2.25,
  endArrowhead: 'arrow' as Arrowhead,
  startArrowhead: 'none' as Arrowhead,
};

/** Quality is 10-100. Legacy values were 0-1 fractions. */
function normalizeExportQuality(q: unknown): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return defaults.exportQuality as number;
  if (q > 0 && q <= 1) return Math.round(q * 100);
  return Math.max(10, Math.min(100, Math.round(q)));
}

const persisted = loadPersisted();
const editorPath = '/editor';
const infoPath = '/';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || nav.standalone === true;
}

/**
 * Space taken up by the floating toolbar (top) and the settings rail (left)
 * that overlaps the canvas, so fit-to-screen never hides content behind them.
 */
function getChromeReserve(container: HTMLElement | null): { top: number; left: number } {
  if (!container || typeof document === 'undefined') return { top: 0, left: 0 };
  const cRect = container.getBoundingClientRect();
  let top = 0;
  let left = 0;
  const toolbar = document.querySelector('[data-snapty-toolbar]') as HTMLElement | null;
  if (toolbar) {
    const r = toolbar.getBoundingClientRect();
    if (r.bottom > cRect.top && r.bottom < cRect.bottom) {
      // The contextual tool-tip line sits just under the toolbar; reserve it too
      // so a fitted image never slides under either floating strip.
      top = Math.max(top, r.bottom - cRect.top + 30);
    }
  }
  const rail = document.querySelector('[data-snapty-rail]') as HTMLElement | null;
  if (rail) {
    const r = rail.getBoundingClientRect();
    if (r.right > cRect.left && r.right < cRect.right) {
      left = Math.max(left, r.right - cRect.left + 12);
    }
  }
  return { top, left };
}

function syncEditorRoute(launched: boolean) {
  if (typeof window === 'undefined') return;
  // Installed PWA always stays on the editor root
  if (isStandalonePwa()) {
    if (window.location.pathname !== editorPath) {
      window.history.replaceState({}, '', editorPath);
    }
    return;
  }
  const nextPath = launched ? editorPath : infoPath;
  const samePath = window.location.pathname === nextPath;
  const hasLegacyHash = window.location.hash === '#editor';
  const onLegacyInfo = window.location.pathname === '/info';
  if (!samePath || hasLegacyHash || onLegacyInfo) {
    const method = (hasLegacyHash || onLegacyInfo) ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextPath);
    trackPageView(nextPath);
  }
}

// Editor lives at /editor; the marketing surface is the root.
const shouldAutoLaunch = typeof window === 'undefined'
  ? true
  : window.location.pathname !== infoPath && window.location.pathname !== '/info';

const generateId = () => `el${Math.random().toString(36).slice(2, 11)}`;
/**
 * Elements are immutable - every update maps to fresh objects and nothing
 * mutates an element in place - so history snapshots can share element
 * references instead of deep-cloning the whole array on every edit. This turns
 * undo/redo from O(n) JSON clone per mutation into O(1) array copy.
 *
 * INVARIANT: snapshots share element references, so no code may ever mutate an
 * element object (or its nested arrays like `points`) in place - that would
 * corrupt every history entry that shares it. Always spread-copy: `{ ...el }`,
 * `[...pts]`. If a future feature needs in-place mutation, this must become a
 * deep clone again.
 */
const cloneElements = (els: EditorElement[]) => [...els] as EditorElement[];

type HistorySource = {
  _history: HistorySnapshot[];
  _historyIndex: number;
  imageDataURL: string | null;
  imageSize: { width: number; height: number };
  activeTool: ToolType;
  stepCounter: number;
  canvasStyle: CanvasStyle;
};

function makeSnapshot(
  elements: EditorElement[],
  imageDataURL: string | null,
  imageSize: { width: number; height: number },
  activeTool?: ToolType,
  stepCounter?: number,
  canvasStyle?: CanvasStyle,
): HistorySnapshot {
  return {
    elements: cloneElements(elements),
    imageDataURL,
    imageSize: { width: imageSize.width, height: imageSize.height },
    activeTool,
    stepCounter,
    canvasStyle: canvasStyle ?? initialCanvasStyle,
  };
}

/** Bounded history: drop the oldest entries so undo stays cheap on long sessions. */
const MAX_HISTORY = 100;

/** Push a new history entry. Pass `image` when the background changed (crop). */
function pushHistory(
  s: HistorySource,
  elements: EditorElement[],
  image?: { imageDataURL: string | null; imageSize: { width: number; height: number } },
) {
  const imageDataURL = image ? image.imageDataURL : s.imageDataURL;
  const imageSize = image ? image.imageSize : s.imageSize;
  const snap = makeSnapshot(
    elements, imageDataURL, imageSize, s.activeTool, s.stepCounter, s.canvasStyle,
  );
  const next = [...s._history.slice(0, s._historyIndex + 1), snap];
  let index = s._historyIndex + 1;
  if (next.length > MAX_HISTORY) {
    const drop = next.length - MAX_HISTORY;
    next.splice(0, drop);
    index -= drop;
  }
  return {
    elements,
    ...(image
      ? { imageDataURL: image.imageDataURL, imageSize: { ...image.imageSize } }
      : {}),
    _history: next,
    _historyIndex: index,
  };
}

function emptyHistory(
  imageDataURL: string | null = null,
  imageSize: { width: number; height: number } = { width: 0, height: 0 },
  activeTool?: ToolType,
  stepCounter?: number,
  canvasStyle: CanvasStyle = initialCanvasStyle,
) {
  return {
    _history: [makeSnapshot([], imageDataURL, imageSize, activeTool, stepCounter, canvasStyle)] as HistorySnapshot[],
    _historyIndex: 0,
  };
}

/**
 * Apply one setting change to the current selection as a single undo step.
 *
 * Which element props a setting maps to lives in `applySettingToElement`, so
 * the store, the desktop panel and the mobile strip all read one registry
 * instead of three hand-maintained type lists that had already drifted apart.
 * Returns `{}` when nothing in the selection accepts the setting.
 */
/**
 * Slider-style editing: while a gesture is active, settings changes apply
 * silently and one history entry is pushed on endSettingGesture instead of
 * one per pointer tick (dragging opacity used to create dozens of undos).
 */
let settingsGestureActive = false;
let settingsGestureDirty = false;

function applyToSelection(
  s: EditorState,
  key: SettingKey,
  value: unknown,
): Partial<EditorState> {
  const ids = new Set(s.selectedElementIds);
  if (!ids.size) return {};
  const scale = getImageToolScale(s.imageSize.width, s.imageSize.height);
  let changed = false;
  const els = s.elements.map((el) => {
    if (!ids.has(el.id)) return el;
    const patch = applySettingToElement(key, value, el, scale);
    if (!patch) return el;
    changed = true;
    return { ...el, ...patch } as EditorElement;
  });
  if (!changed) return {};
  if (settingsGestureActive) {
    settingsGestureDirty = true;
    return { elements: els };
  }
  return pushHistory(s, els);
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

  // The badge counter is part of document state: without this, undoing a step
  // and placing a new one skips the number that was just released.
  const counterPatch: Partial<EditorState> =
    typeof snap.stepCounter === 'number' ? { stepCounter: snap.stepCounter } : {};

  if (!imageChanged) {
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
      canvasStyle: snap.canvasStyle,
      ...counterPatch,
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
      canvasStyle: snap.canvasStyle,
      ...toolPatch,
      ...counterPatch,
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
      canvasStyle: snap.canvasStyle,
      ...toolPatch,
      ...counterPatch,
    });
    setTimeout(() => get().resetView(), 30);
  };
  img.onerror = () => {
    if (gen !== historyApplyGen) return;
    set({
      elements: cloneElements(snap.elements),
      _historyIndex: index,
      selectedElementIds: [],
      canvasStyle: snap.canvasStyle,
      ...toolPatch,
      ...counterPatch,
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
  fontFamily: persisted.fontFamily ?? defaults.fontFamily,
  fontStyle: persisted.fontStyle ?? defaults.fontStyle,
  textAlign: persisted.textAlign ?? defaults.textAlign,
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
  canvasStyle: {
    ...initialCanvasStyle,
    gridEnabled: persisted.gridEnabled ?? initialCanvasStyle.gridEnabled,
    transparentExport: persisted.transparentExport ?? initialCanvasStyle.transparentExport,
  },
  exportFormat: persisted.exportFormat ?? defaults.exportFormat,
  exportQuality: normalizeExportQuality(persisted.exportQuality ?? defaults.exportQuality),
  showExportDialog: false,
  showHelpDialog: false,
  showCommandPalette: false,
  showSettings: false,
  panelCollapsed: typeof window !== 'undefined' && window.innerWidth < 900,
  imageLoading: false,
  stickyTool: false,
  strokeStyle: persisted.strokeStyle ?? defaults.strokeStyle,
  fillStyle: persisted.fillStyle ?? defaults.fillStyle,
  roughness: persisted.roughness ?? defaults.roughness,
  magnification: persisted.magnification ?? defaults.magnification,
  endArrowhead: persisted.endArrowhead ?? defaults.endArrowhead,
  startArrowhead: persisted.startArrowhead ?? defaults.startArrowhead,
  imageLocked: false,
  annotationsLocked: false,
  keepOriginal: persisted.keepOriginal ?? false,
  // Hand-drawn mode: default true unless explicitly disabled in previous settings
  handDrawn: (typeof window !== 'undefined')
    ? ((): boolean => { try { return JSON.parse(localStorage.getItem('snapty-tool-settings') || '{"handDrawn":true}').handDrawn !== false; } catch { return true; } })()
    : true,

  launchEditor: () => {
    syncEditorRoute(true);
    set({ isEditorLaunched: true });
  },

  setStickyTool: (v) => set({ stickyTool: v }),
  setStrokeStyle: (v) => {
    set((s) => ({ strokeStyle: v, ...applyToSelection(s, 'strokeStyle', v) }));
    savePersisted({ ...get(), strokeStyle: v });
  },
  setFillStyle: (v) => {
    set((s) => ({ fillStyle: v, ...applyToSelection(s, 'fillStyle', v) }));
    savePersisted({ ...get(), fillStyle: v });
  },
  setRoughness: (v) => {
    const r = Math.max(0, Math.min(3, v));
    set((s) => ({ roughness: r, ...applyToSelection(s, 'roughness', r) }));
    savePersisted({ ...get(), roughness: r });
  },
  setMagnification: (v) => {
    const mag = Math.max(1.5, Math.min(4, v));
    set((s) => ({ magnification: mag, ...applyToSelection(s, 'magnification', mag) }));
    savePersisted({ ...get(), magnification: mag });
  },
  setEndArrowhead: (v) => {
    set((s) => ({
      endArrowhead: v,
      ...applyToSelection(s, 'arrowheads', { endArrowhead: v }),
    }));
    savePersisted({ ...get(), endArrowhead: v });
  },
  setStartArrowhead: (v) => {
    set((s) => ({
      startArrowhead: v,
      ...applyToSelection(s, 'arrowheads', { startArrowhead: v }),
    }));
    savePersisted({ ...get(), startArrowhead: v });
  },
  setImageLocked: (v) => set({ imageLocked: v }),
  setAnnotationsLocked: (v) => set({ annotationsLocked: v }),
  setKeepOriginal: (v) => {
    set({ keepOriginal: v });
    savePersisted({ ...get(), keepOriginal: v });
  },
  beginSettingGesture: () => { settingsGestureActive = true; settingsGestureDirty = false; },
  endSettingGesture: () => {
    settingsGestureActive = false;
    if (settingsGestureDirty) {
      settingsGestureDirty = false;
      // One undo step for the whole gesture (e.g. one slider drag).
      set((s) => pushHistory(s, s.elements));
    }
  },
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),
  setShowSettings: (show) => set({ showSettings: show }),

  duplicateSelected: () => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      if (!ids.size) return s;
      const clones: EditorElement[] = [];
      const newIds: string[] = [];
      for (const el of s.elements) {
        if (!ids.has(el.id)) continue;
        const id = generateId();
        newIds.push(id);
        clones.push({ ...JSON.parse(JSON.stringify(el)), id, x: el.x + 16, y: el.y + 16 } as EditorElement);
      }
      return { ...pushHistory(s, [...s.elements, ...clones]), selectedElementIds: newIds };
    });
  },
  groupSelected: () => {
    set((s) => {
      if (s.selectedElementIds.length < 2) return s;
      const groupId = generateId();
      const ids = new Set(s.selectedElementIds);
      const els = s.elements.map((el) => ids.has(el.id) ? { ...el, groupId } as EditorElement : el);
      return pushHistory(s, els);
    });
  },
  ungroupSelected: () => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      if (!ids.size) return s;
      const groupIds = new Set(
        s.elements.filter((el) => ids.has(el.id) && el.groupId).map((el) => el.groupId as string),
      );
      if (!groupIds.size) return s;
      const els = s.elements.map((el) =>
        el.groupId && groupIds.has(el.groupId) ? { ...el, groupId: undefined } as EditorElement : el,
      );
      return pushHistory(s, els);
    });
  },
  lockSelected: () => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      if (!ids.size) return s;
      const els = s.elements.map((el) => ids.has(el.id) ? { ...el, locked: true, draggable: false } as EditorElement : el);
      return pushHistory(s, els);
    });
  },
  unlockSelected: () => {
    set((s) => {
      const ids = new Set(s.selectedElementIds);
      if (!ids.size) return s;
      const els = s.elements.map((el) => ids.has(el.id) ? { ...el, locked: false, draggable: true } as EditorElement : el);
      return pushHistory(s, els);
    });
  },

  setHandDrawn: (v) => {
    try { if (typeof window !== 'undefined') localStorage.setItem('snapty-tool-settings', JSON.stringify({ handDrawn: v })); } catch {}
    set({ handDrawn: v });
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
        ...emptyHistory(dataURL, size, undefined, undefined, get().canvasStyle),
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
        ...emptyHistory(undefined, undefined, undefined, undefined, get().canvasStyle),
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
      ...emptyHistory(undefined, undefined, undefined, undefined, get().canvasStyle),
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      isEditorLaunched: false,
    });
  },

  // Clear image to show empty state WITHOUT resetting tool or style settings
  replaceImage: () => {
    if (get().imageLocked) return;
    syncEditorRoute(true);
    void import('@/lib/editor/autosave').then(({ clearAutosave }) => clearAutosave());
    return set({
      backgroundImage: null,
      imageDataURL: null,
      imageSize: { width: 0, height: 0 },
      elements: [], selectedElementIds: [],
      ...emptyHistory(undefined, undefined, undefined, undefined, get().canvasStyle),
      stepCounter: get().stepStartNumber,
      zoom: 1, stagePosition: { x: 0, y: 0 },
      // intentionally keep activeTool, colors, sizes, canvasStyle
    });
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setStagePosition: (pos) => set({ stagePosition: pos }),
  resetView: () => {
    const { imageSize, canvasStyle } = get();
    if (!imageSize.width || !imageSize.height) return;
    // Prefer measuring the actual canvas container when available
    const container = document.querySelector('[data-snapty-canvas]') as HTMLElement | null;
    const root = document.querySelector('[data-snapty-root]') as HTMLElement | null;
    // Fallbacks subtract chrome (toolbar ~48 + top bar ~48 + settings ~0-224)
    const cw = (container && container.clientWidth > 0)
      ? container.clientWidth
      : Math.max(200, (root?.clientWidth || window.innerWidth) - 96);
    const ch = (container && container.clientHeight > 0)
      ? container.clientHeight
      : Math.max(200, (root?.clientHeight || window.innerHeight) - 96);
    if (cw < 40 || ch < 40) return;
    // Reserve the floating chrome so a fitted image is never hidden behind the
    // top toolbar or the left settings rail (fullscreen pastes used to slip
    // underneath both). Measured from the live DOM so it tracks whatever is
    // actually on screen, and only counts what overlaps the canvas.
    const reserve = getChromeReserve(container);
    const availW = cw - reserve.left;
    const availH = ch - reserve.top;
    const framePad = canvasStyle.padding || 0;
    const ins = DEVICE_FRAME_INSETS[canvasStyle.deviceFrame];
    const contentW = imageSize.width + framePad * 2 + ins.left + ins.right;
    const contentH = imageSize.height + framePad * 2 + ins.top + ins.bottom;
    const pad = Math.min(80, Math.max(16, Math.min(availW, availH) * 0.08));
    const z = Math.min((availW - pad) / contentW, (availH - pad) / contentH, 1);
    set({
      zoom: Math.max(0.05, z),
      stagePosition: {
        x: reserve.left + (availW - contentW * z) / 2,
        y: reserve.top + (availH - contentH * z) / 2,
      },
    });
  },
  zoomToActual: () => {
    const { imageSize, canvasStyle } = get();
    if (!imageSize.width) return;
    const container = document.querySelector('[data-snapty-canvas]') as HTMLElement | null;
    const cw = container?.clientWidth || window.innerWidth;
    const ch = container?.clientHeight || window.innerHeight;
    const framePad = canvasStyle.padding || 0;
    const ins = DEVICE_FRAME_INSETS[canvasStyle.deviceFrame];
    const contentW = imageSize.width + framePad * 2 + ins.left + ins.right;
    const contentH = imageSize.height + framePad * 2 + ins.top + ins.bottom;
    set({
      zoom: 1,
      stagePosition: {
        x: (cw - contentW) / 2,
        y: (ch - contentH) / 2,
      },
    });
  },
  zoomToSelection: () => {
    const s = get();
    if (!s.selectedElementIds.length) {
      s.resetView();
      return;
    }
    const bounds = unionBounds(
      s.elements
        .filter((el) => s.selectedElementIds.includes(el.id))
        .map((el) => getElementBounds(el, s.imageSize)),
    );
    if (!bounds || bounds.w < 1 || bounds.h < 1) return;
    const container = document.querySelector('[data-snapty-canvas]') as HTMLElement | null;
    const cw = container?.clientWidth || window.innerWidth;
    const ch = container?.clientHeight || window.innerHeight;
    const pad = 64;
    const z = Math.min((cw - pad) / bounds.w, (ch - pad) / bounds.h, 5);
    set({
      zoom: Math.max(0.1, z),
      stagePosition: {
        x: (cw - bounds.w * z) / 2 - bounds.x * z,
        y: (ch - bounds.h * z) / 2 - bounds.y * z,
      },
    });
  },

  setActiveTool: (tool, opts) => {
    const clearSelection = opts?.clearSelection !== false;
    set(clearSelection ? { activeTool: tool, selectedElementIds: [] } : { activeTool: tool });
    savePersisted({ ...get(), activeTool: tool });
  },
  updateElementSilent: (id, updates) => {
    set((s) => ({
      elements: s.elements.map((el) =>
        el.id === id ? { ...el, ...updates } as EditorElement : el
      ),
    }));
  },
  commitElementUpdate: (id, updates) => {
    set((s) => {
      const els = s.elements.map((el) =>
        el.id === id ? { ...el, ...updates } as EditorElement : el
      );
      return pushHistory(s, els);
    });
  },
  setStrokeColor: (color) => {
    set((s) => ({ strokeColor: color, ...applyToSelection(s, 'strokeColor', color) }));
    savePersisted({ ...get(), strokeColor: color });
  },
  setFillColor: (color) => {
    set((s) => ({ fillColor: color, ...applyToSelection(s, 'fillColor', color) }));
    savePersisted({ ...get(), fillColor: color });
  },
  setStrokeWidth: (width) => {
    set((s) => ({ strokeWidth: width, ...applyToSelection(s, 'strokeWidth', width) }));
    savePersisted({ ...get(), strokeWidth: width });
  },
  setFontSize: (size) => {
    set((s) => ({ fontSize: size, ...applyToSelection(s, 'fontSize', size) }));
    savePersisted({ ...get(), fontSize: size });
  },
  setFontFamily: (family) => {
    set((s) => ({ fontFamily: family, ...applyToSelection(s, 'fontFamily', family) }));
    savePersisted({ ...get(), fontFamily: family });
  },
  setFontStyle: (style) => {
    set((s) => ({ fontStyle: style, ...applyToSelection(s, 'fontStyle', style) }));
    savePersisted({ ...get(), fontStyle: style });
  },
  setTextAlign: (align) => {
    set((s) => ({ textAlign: align, ...applyToSelection(s, 'textAlign', align) }));
    savePersisted({ ...get(), textAlign: align });
  },
  setOpacity: (opacity) => {
    const o = Math.max(0, Math.min(1, opacity));
    set((s) => ({ opacity: o, ...applyToSelection(s, 'opacity', o) }));
    savePersisted({ ...get(), opacity: o });
  },
  setCornerRadius: (radius) => {
    set((s) => ({ cornerRadius: radius, ...applyToSelection(s, 'cornerRadius', radius) }));
    savePersisted({ ...get(), cornerRadius: radius });
  },
  setBlurRadius: (r) => {
    const v = Math.max(2, Math.min(40, r));
    set((s) => ({ blurRadius: v, ...applyToSelection(s, 'blurRadius', v) }));
    savePersisted({ ...get(), blurRadius: v });
  },
  setPixelSize: (px) => {
    const v = Math.max(2, Math.min(40, px));
    set((s) => ({ pixelSize: v, ...applyToSelection(s, 'pixelSize', v) }));
    savePersisted({ ...get(), pixelSize: v });
  },
  setHighlighterWidth: (w) => {
    const v = Math.max(4, Math.min(60, w));
    set((s) => ({ highlighterWidth: v, ...applyToSelection(s, 'highlighterWidth', v) }));
    savePersisted({ ...get(), highlighterWidth: v });
  },
  setStepStartNumber: (n) => {
    const start = Math.max(0, Math.round(n));
    set({ stepStartNumber: start, stepCounter: start });
    savePersisted({ ...get(), stepStartNumber: start });
  },
  setStepRadius: (r) => {
    const radius = Math.max(8, Math.min(80, r));
    set((s) => ({ stepRadius: radius, ...applyToSelection(s, 'stepRadius', radius) }));
    savePersisted({ ...get(), stepRadius: radius });
  },
  setPanelCollapsed: (collapsed) => {
    set({ panelCollapsed: collapsed });
  },

  resetToolSettings: () => {
    const next = {
      strokeColor: defaults.strokeColor as string,
      fillColor: defaults.fillColor as string,
      strokeWidth: defaults.strokeWidth as number,
      fontSize: defaults.fontSize as number,
      fontFamily: defaults.fontFamily as string,
      opacity: defaults.opacity as number,
      cornerRadius: defaults.cornerRadius as number,
      blurRadius: defaults.blurRadius as number,
      pixelSize: defaults.pixelSize as number,
      highlighterWidth: defaults.highlighterWidth as number,
      stepRadius: defaults.stepRadius as number,
      stepStartNumber: defaults.stepStartNumber as number,
      stepCounter: defaults.stepStartNumber as number,
      strokeStyle: defaults.strokeStyle as StrokeStyle,
      fillStyle: defaults.fillStyle as FillStyle,
      roughness: defaults.roughness as number,
      magnification: defaults.magnification as number,
      endArrowhead: defaults.endArrowhead as Arrowhead,
      startArrowhead: defaults.startArrowhead as Arrowhead,
      handDrawn: true,
    };
    set(next);
    savePersisted({ ...get(), ...next });
    try {
      localStorage.setItem('snapty-toolbar', JSON.stringify({ orientation: 'horizontal' }));
      localStorage.setItem('snapty-tool-settings', JSON.stringify({ handDrawn: true }));
      window.dispatchEvent(new Event('snapty-toolbar-settings'));
    } catch { /* storage is optional */ }
  },

  addElement: (element) => {
    set((s) => {
      // Bump the counter *before* snapshotting so the snapshot records the
      // post-placement number. Undo then rewinds to the pre-placement counter
      // and redo restores the advanced one; the old code snapshotted first, so
      // redo replayed a number that was already used.
      const stepCounter = element.type === 'step' ? s.stepCounter + 1 : s.stepCounter;
      return {
        stepCounter,
        ...pushHistory({ ...s, stepCounter }, [...s.elements, element]),
      };
    });
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
  nudgeSelected: (dx, dy) => {
    set((s) => {
      if (!s.selectedElementIds.length || (dx === 0 && dy === 0)) return s;
      const ids = new Set(s.selectedElementIds);
      const els = s.elements.map((el) => {
        if (!ids.has(el.id) || el.locked) return el;
        return { ...el, x: el.x + dx, y: el.y + dy } as EditorElement;
      });
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
    const prevPad = get().canvasStyle.padding;
    set((s) => {
      const updated = { ...s.canvasStyle, ...style };
      if ('gridEnabled' in style) savePersisted({ ...get(), canvasStyle: updated, gridEnabled: updated.gridEnabled });
      // Style edits are undoable; sliders coalesce via the settings gesture.
      // (Same gate as applyToSelection - a padding drag must be one undo step.)
      if (settingsGestureActive) {
        settingsGestureDirty = true;
        return { canvasStyle: updated };
      }
      return { canvasStyle: updated, ...pushHistory(s, s.elements) };
    });
    if ('padding' in style && style.padding !== prevPad) {
      // Re-fit so the framed image stays centered when padding changes
      setTimeout(() => get().resetView(), 0);
    }
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
      ...emptyHistory(undefined, undefined, undefined, undefined, get().canvasStyle),
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
