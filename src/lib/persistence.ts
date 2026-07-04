import type { Edge } from '@xyflow/react';
import type { FactoryPort } from '../engine/types.ts';
import type {
  AnyNode,
  FactoryNodeType,
  InnerGraph,
  ItemNodeType,
  NoteNodeType,
  PlanSnapshot,
} from '../store/planStore.ts';

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
function slimItemNode(node: ItemNodeType): ItemNodeType {
  const { selected: _selected, dragging: _dragging, data, ...rest } = node;
  const { balance: _balance, isEndProduct: _isEndProduct, ...restData } = data;
  return { ...rest, data: restData };
}

function slimFactoryNode(node: FactoryNodeType): FactoryNodeType {
  const { selected: _selected, dragging: _dragging, data, ...rest } = node;
  const { balance: _balance, inner, ...restData } = data;
  return { ...rest, data: { ...restData, inner: { nodes: inner.nodes.map(slimNode), edges: inner.edges } } };
}

function slimNoteNode(node: NoteNodeType): NoteNodeType {
  const { selected: _selected, dragging: _dragging, ...rest } = node;
  return rest;
}

function slimNode(node: AnyNode): AnyNode {
  switch (node.type) {
    case 'itemNode':
      return slimItemNode(node);
    case 'factoryNode':
      return slimFactoryNode(node);
    case 'noteNode':
      return slimNoteNode(node);
    default: {
      // Exhaustiveness guard: a new AnyNode variant must be handled above.
      const unreachable: never = node;
      throw new Error(`slimNode: unhandled node type '${(unreachable as AnyNode).type}'`);
    }
  }
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

// ------------------------------------------------------------------
// Structural validation — hand-edited or stale exports must be rejected with a
// clear message rather than crashing downstream in rebalanceRoot/buildFactoryDef
// or React Flow itself. Deliberately permissive about fields the app already
// tolerates being absent (e.g. `rawConfig`, `hardLimitPerMin`, `balance`,
// `isEndProduct` — all optional in the corresponding *Data interfaces, and
// `balance`/`isEndProduct` are recomputed on every load anyway).
// ------------------------------------------------------------------

/** Throws a plain (unprefixed) validation message; callers add the "Invalid plan file:" prefix. */
function invalid(message: string): never {
  throw new Error(message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteXY(v: unknown): v is { x: number; y: number } {
  return (
    isRecord(v) &&
    typeof v.x === 'number' && Number.isFinite(v.x) &&
    typeof v.y === 'number' && Number.isFinite(v.y)
  );
}

function validatePort(port: unknown, where: string): FactoryPort {
  if (!isRecord(port)) invalid(`${where} is not an object`);
  const id = port.id;
  if (typeof id !== 'string') invalid(`${where} is missing 'id'`);
  const itemId = port.itemId;
  if (itemId !== null && typeof itemId !== 'string') invalid(`${where} has an invalid 'itemId'`);
  return { id, itemId };
}

function validateEdge(edge: unknown, where: string): Edge {
  if (!isRecord(edge)) invalid(`${where} is not an object`);
  if (typeof edge.id !== 'string') invalid(`${where} is missing 'id'`);
  if (typeof edge.source !== 'string') invalid(`${where} is missing 'source'`);
  if (typeof edge.target !== 'string') invalid(`${where} is missing 'target'`);
  if (edge.sourceHandle != null && typeof edge.sourceHandle !== 'string') {
    invalid(`${where} has an invalid 'sourceHandle'`);
  }
  if (edge.targetHandle != null && typeof edge.targetHandle !== 'string') {
    invalid(`${where} has an invalid 'targetHandle'`);
  }
  return edge as Edge;
}

function validateInnerGraph(graph: unknown, where: string): InnerGraph {
  if (!isRecord(graph)) invalid(`${where} is not an object`);
  if (!Array.isArray(graph.nodes)) invalid(`${where} is missing 'nodes'`);
  if (!Array.isArray(graph.edges)) invalid(`${where} is missing 'edges'`);
  return {
    nodes: graph.nodes.map((n, i) => validateNode(n, `${where} node ${i}`)),
    edges: graph.edges.map((e, i) => validateEdge(e, `${where} edge ${i}`)),
  };
}

/**
 * Validate one node (recursing into factory inner graphs) and return it typed
 * as AnyNode. Only fields the app actually requires (non-optional in the
 * corresponding *Data interface, plus the React Flow essentials id/position/
 * data) are enforced — everything else round-trips untouched.
 */
function validateNode(node: unknown, where: string): AnyNode {
  if (!isRecord(node)) invalid(`${where} is not an object`);
  if (typeof node.id !== 'string') invalid(`${where} is missing 'id'`);
  const label = `${where} (id '${node.id}')`;
  if (!isFiniteXY(node.position)) invalid(`${label} has an invalid 'position'`);
  if (!isRecord(node.data)) invalid(`${label} is missing 'data'`);
  const data = node.data;

  switch (node.type) {
    case 'itemNode': {
      if (typeof data.itemId !== 'string') invalid(`${label} is missing 'data.itemId'`);
      if (data.recipeId !== null && typeof data.recipeId !== 'string') {
        invalid(`${label} has an invalid 'data.recipeId'`);
      }
      if (typeof data.isRaw !== 'boolean') invalid(`${label} is missing 'data.isRaw'`);
      return node as ItemNodeType;
    }
    case 'factoryNode': {
      if (typeof data.name !== 'string') invalid(`${label} is missing 'data.name'`);
      if (!Array.isArray(data.inputs)) invalid(`${label} is missing 'data.inputs'`);
      if (!Array.isArray(data.outputs)) invalid(`${label} is missing 'data.outputs'`);
      data.inputs.forEach((p, i) => validatePort(p, `${label} input port ${i}`));
      data.outputs.forEach((p, i) => validatePort(p, `${label} output port ${i}`));
      const inner = validateInnerGraph(data.inner, `${label} inner graph`);
      return { ...node, data: { ...data, inner } } as FactoryNodeType;
    }
    case 'noteNode': {
      if (typeof data.text !== 'string') invalid(`${label} is missing 'data.text'`);
      return node as NoteNodeType;
    }
    default:
      return invalid(`${label} has an unknown node type '${String(node.type)}'`);
  }
}

export function parseSnapshot(text: string): PlanSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(raw)) {
    throw new Error('This file does not contain a plan.');
  }
  if (typeof raw.planId !== 'string' || typeof raw.planName !== 'string') {
    throw new Error('Missing plan name or id — this does not look like an exported plan.');
  }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new Error('Plan is missing its nodes or edges.');
  }
  try {
    const nodes = raw.nodes.map((n, i) => validateNode(n, `node ${i}`));
    const edges = raw.edges.map((e, i) => validateEdge(e, `edge ${i}`));
    return { planId: raw.planId, planName: raw.planName, nodes, edges };
  } catch (err) {
    throw new Error(`Invalid plan file: ${err instanceof Error ? err.message : 'unknown validation error'}`);
  }
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
      if (!handle) return; // picker returned no selection
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
