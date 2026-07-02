import { db } from '../db/db.ts';
import type { PlanSnapshot } from '../store/planStore.ts';

export function buildSnapshot(store: { planId: string; planName: string; rootGraph: { nodes: PlanSnapshot['nodes']; edges: PlanSnapshot['edges'] } }): PlanSnapshot {
  return {
    planId: store.planId,
    planName: store.planName,
    nodes: store.rootGraph.nodes,
    edges: store.rootGraph.edges,
  };
}

export async function saveSnapshot(snapshot: PlanSnapshot): Promise<void> {
  await db.plans.put(snapshot);
}

export async function loadLatestSnapshot(): Promise<PlanSnapshot | null> {
  const plans = await db.plans.toArray();
  return plans.length ? plans[plans.length - 1] : null;
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
