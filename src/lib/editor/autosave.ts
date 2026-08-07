import type { CanvasStyle, EditorElement, ToolType } from '@/types/editor';

const DB_NAME = 'snapty-autosave';
const STORE = 'projects';
const KEY = 'current';
const VERSION = 1;

export type AutosaveSnapshot = {
  version: number;
  updatedAt: number;
  imageDataURL: string | null;
  imageSize: { width: number; height: number };
  elements: EditorElement[];
  canvasStyle: CanvasStyle;
  zoom: number;
  stagePosition: { x: number; y: number };
  activeTool: ToolType;
  stepCounter: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosave(snapshot: AutosaveSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* quota / private mode */
  }
}

export async function loadAutosave(): Promise<AutosaveSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    const result = await new Promise<AutosaveSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AutosaveSnapshot) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutosave(getSnapshot: () => AutosaveSnapshot | null, delay = 800) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const snap = getSnapshot();
    if (snap) void saveAutosave(snap);
  }, delay);
}
