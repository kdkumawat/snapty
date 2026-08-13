import type { CanvasStyle, EditorElement, ToolType } from '@/types/editor';

const DB_NAME = 'snapty-autosave';
const STORE = 'projects';
const KEY = 'current';
const VERSION = 1;

/** Keep at most this many recent sessions so recovery can offer a short history. */
export const MAX_AUTOSAVES = 3;

const PROMPT_KEY = 'snapty-recover-prompt';

export type AutosaveSnapshot = {
  version: number;
  /** Stable per page-load id - one history entry per session, not per keystroke. */
  sessionId: string;
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

/** Recovery prompt preference (the "Don't ask again" checkbox). */
export function isRecoveryPromptEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(PROMPT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setRecoveryPromptEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PROMPT_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

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

type StoredValue = AutosaveSnapshot[] | AutosaveSnapshot | undefined;

/** Read the history list, migrating a legacy single-snapshot value. */
async function readList(): Promise<AutosaveSnapshot[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDb();
    const raw = await new Promise<StoredValue>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as StoredValue);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (Array.isArray(raw)) {
      return raw.filter((s) => !!s && !!s.imageDataURL);
    }
    // Legacy single-snapshot format → migrate in place to a one-entry list.
    if (raw && typeof raw === 'object' && 'elements' in raw) {
      const legacy = raw as AutosaveSnapshot;
      await writeList([{ ...legacy, sessionId: legacy.sessionId ?? `legacy-${legacy.updatedAt}` }]);
      return [{ ...legacy, sessionId: legacy.sessionId ?? `legacy-${legacy.updatedAt}` }];
    }
    return [];
  } catch {
    return [];
  }
}

async function writeList(list: AutosaveSnapshot[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(list, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* quota / private mode */
  }
}

/**
 * Save a snapshot. One entry per session: a snapshot with the same `sessionId`
 * replaces the current entry, so a long editing session never floods the
 * history. Older *different* sessions roll off past {@link MAX_AUTOSAVES}.
 */
export async function saveAutosave(snapshot: AutosaveSnapshot): Promise<void> {
  const list = await readList();
  const next = [
    snapshot,
    ...list.filter((s) => s.sessionId !== snapshot.sessionId),
  ].slice(0, MAX_AUTOSAVES);
  await writeList(next);
}

/** All stored sessions, most recent first. */
export async function listAutosaves(): Promise<AutosaveSnapshot[]> {
  return readList();
}

/** Remove one session (e.g. the user discarded it in the recovery card). */
export async function removeAutosave(updatedAt: number): Promise<void> {
  const list = await readList();
  await writeList(list.filter((s) => s.updatedAt !== updatedAt));
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
  } catch {
    /* ignore */
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutosave(getSnapshot: () => AutosaveSnapshot | null, delay = 800) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const snap = getSnapshot();
    if (snap) void saveAutosave(snap);
  }, delay);
}
