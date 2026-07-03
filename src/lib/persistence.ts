import type { PlanSnapshot } from '../store/planStore.ts';

export function buildSnapshot(store: { planId: string; planName: string; rootGraph: { nodes: PlanSnapshot['nodes']; edges: PlanSnapshot['edges'] } }): PlanSnapshot {
  return {
    planId: store.planId,
    planName: store.planName,
    nodes: store.rootGraph.nodes,
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

export function exportSnapshot(snapshot: PlanSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${snapshot.planName.replace(/\s+/g, '-')}.json`;
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
export function importSnapshotFromFile(
  onLoaded: (snapshot: PlanSnapshot) => void,
  onError: (message: string) => void,
): void {
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
