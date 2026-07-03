import type { AnyNode, InnerGraph, PlanSnapshot } from '../store/planStore.ts';

/**
 * Drop everything import regenerates anyway, recursing into factory inner graphs:
 * - `data.balance`   — recomputed by rebalanceRoot on every load
 * - `data.isEndProduct` — recomputed by annotateEndProducts on every projection
 * - `selected` / `dragging` — transient React Flow UI flags
 *
 * These are pure engine output / view chrome, never read back as input, so this
 * roughly halves both the exported file and the localStorage autosave. Kept:
 * `position`, `measured`, `zIndex`, `parentId`, `draggable`, and the real
 * per-node inputs (itemId/recipeId/isRaw/rawConfig/hardLimitPerMin, factory
 * name/inputs/outputs/inner, note text).
 */
function slimNode(node: AnyNode): AnyNode {
  const clone: Record<string, unknown> = { ...node };
  delete clone.selected;
  delete clone.dragging;

  const data: Record<string, unknown> = { ...(clone.data as Record<string, unknown>) };
  delete data.balance;
  delete data.isEndProduct;

  if (clone.type === 'factoryNode') {
    const inner = data.inner as InnerGraph;
    data.inner = { nodes: inner.nodes.map(slimNode), edges: inner.edges };
  }
  clone.data = data;
  return clone as unknown as AnyNode;
}

export function buildSnapshot(store: { planId: string; planName: string; rootGraph: { nodes: PlanSnapshot['nodes']; edges: PlanSnapshot['edges'] } }): PlanSnapshot {
  return {
    planId: store.planId,
    planName: store.planName,
    nodes: store.rootGraph.nodes.map(slimNode),
    edges: store.rootGraph.edges,
  };
}

/**
 * The live plan auto-persists here on every change (see planStore), and is
 * restored on startup — so a page reload resumes where the user left off.
 * IndexedDB/Dexie was overkill for a single JSON document that fits comfortably
 * in localStorage; file Import/Export remains the portable backup path.
 */
const LOCAL_KEY = 'srp.plan';

/** Persist the current plan to localStorage. Silently no-ops if storage is unavailable/full. */
export function saveLocalSnapshot(snapshot: PlanSnapshot): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage disabled (private mode) or quota exceeded — nothing we can do here.
  }
}

/** Restore the auto-saved plan from localStorage, or null if none / corrupt. */
export function loadLocalSnapshot(): PlanSnapshot | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parseSnapshot(raw);
  } catch {
    return null; // stale/corrupt entry — start fresh rather than crash on boot
  }
}

/**
 * File System Access picker id + file-type filter. Requires a secure context
 * (HTTPS or localhost) and a Chromium browser — available on the deployed
 * Cloudflare Pages site (HTTPS); falls back to a plain download elsewhere
 * (Firefox/Safari, or a dev server reached over a non-secure LAN IP).
 */
const FS_PICKER_ID = 'srp-plans';
const FS_PICKER_TYPES = [
  { description: 'Plan JSON', accept: { 'application/json': ['.json'] } },
];

/** True in browsers that support the File System Access API (Chromium, secure context). */
function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/** User dismissed the picker — not an error, just a no-op. */
function isPickerAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ------------------------------------------------------------------
// Remembered folder: FileSystemFileHandle objects are structured-cloneable and
// can be stored in IndexedDB (localStorage can't hold them). We persist the last
// exported/imported file handle and pass it as the picker's `startIn`; the picker
// opens in the directory *containing* that file. So after the first Export into
// Documents/StarRupture, every later Export AND Import defaults to that folder —
// reliably, without depending on the browser's own per-id memory.
// ------------------------------------------------------------------
const HANDLE_DB = 'srp-fs';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'lastPlanFile';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Remember the folder for next time by persisting the file handle. Best-effort. */
async function saveLastFileHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable (private mode etc.) — folder just won't be remembered.
  }
}

/** The last exported/imported file handle, or null. Used only as a `startIn` hint. */
async function loadLastFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openHandleDb();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function exportSnapshot(snapshot: PlanSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot, null, 2);
  const suggestedName = `${snapshot.planName.replace(/\s+/g, '-')}.json`;

  if (fsAccessSupported()) {
    try {
      const last = await loadLastFileHandle();
      const handle = await window.showSaveFilePicker({
        id: FS_PICKER_ID,
        startIn: last ?? 'documents', // open in the last-used folder, else Documents
        suggestedName,
        types: FS_PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      void saveLastFileHandle(handle);
      return;
    } catch (err) {
      if (isPickerAbort(err)) return;
      // Any other failure (e.g. permission denied): fall through to the download path.
    }
  }

  // Fallback (Firefox/Safari, or non-secure context): download to the browser's default folder.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseSnapshot(text: string): PlanSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('This file does not contain a plan.');
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.planId !== 'string' || typeof s.planName !== 'string') {
    throw new Error('Missing plan name or id — this does not look like an exported plan.');
  }
  if (!Array.isArray(s.nodes) || !Array.isArray(s.edges)) {
    throw new Error('Plan is missing its nodes or edges.');
  }
  return raw as PlanSnapshot;
}

/** Opens a file picker and hands the parsed snapshot (or an error message) back to the caller. */
export async function importSnapshotFromFile(
  onLoaded: (snapshot: PlanSnapshot) => void,
  onError: (message: string) => void,
): Promise<void> {
  if (fsAccessSupported()) {
    let file: File;
    try {
      // Open in the same folder Export last used (shared remembered handle).
      const last = await loadLastFileHandle();
      const [handle] = await window.showOpenFilePicker({
        id: FS_PICKER_ID,
        startIn: last ?? 'documents',
        types: FS_PICKER_TYPES,
        multiple: false,
      });
      void saveLastFileHandle(handle);
      file = await handle.getFile();
    } catch (err) {
      if (isPickerAbort(err)) return; // user cancelled
      onError(`Could not open the file picker.\n\n${err instanceof Error ? err.message : 'Unknown error.'}`);
      return;
    }
    try {
      onLoaded(parseSnapshot(await file.text()));
    } catch (err) {
      onError(`Could not import "${file.name}".\n\n${err instanceof Error ? err.message : 'Unknown error.'}`);
    }
    return;
  }

  // Fallback (Firefox/Safari, or non-secure context): hidden <input type="file">.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onLoaded(parseSnapshot(await file.text()));
    } catch (err) {
      onError(`Could not import "${file.name}".\n\n${err instanceof Error ? err.message : 'Unknown error.'}`);
    }
  };
  input.click();
}
