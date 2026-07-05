// In-memory prerequisite DAG for the "Add all prerequisite nodes" feature.
// Given a root item + recipe, expands every ingredient back to raw resources
// and pre-computes final canvas positions, so the store can then create the
// nodes one at a time at their resting places. Pure — no store imports.
//
// Dedupe is per operation only: one step per distinct item. Pre-existing
// canvas nodes are never consulted — the sub-tree is self-contained.

import type { Recipe, RawResourceConfig } from '../engine/types.ts';
import { ALL_RECIPES } from '../data/index.ts';
import { chooseRecipeForItem, defaultRawConfig } from './tierSettings.ts';
import type { TierPrefs } from '../store/settingsStore.ts';
import { LAYOUT_COL_W, LAYOUT_ROW_H } from './layoutConstants.ts';

/** Delay between node-creation steps during the animated build. */
export const PREREQ_STEP_DELAY_MS = 120;

export interface PrereqStep {
  itemId: string;
  /** Recipe chosen by the tier settings (root keeps its manually-picked recipe); null = raw. */
  recipeId: string | null;
  isRaw: boolean;
  rawConfig?: RawResourceConfig;
  /** Final canvas position — computed up front so nodes never shuffle after creation. */
  position: { x: number; y: number };
  /** In-subtree consumers this step feeds. Each edge's targetHandle is this step's own itemId. */
  consumers: string[];
}

/**
 * Expand a root item/recipe into an ordered creation plan: consumers always
 * precede their producers (root first), so every step's `consumers` already
 * exist when the step runs. The map-as-visited-set makes expansion terminate
 * even on cyclic recipe data.
 */
export function buildPrereqPlan(opts: {
  rootItemId: string;
  rootRecipeId: string | null;
  anchor: { x: number; y: number };
  prefs: TierPrefs;
  recipes?: Recipe[];
}): PrereqStep[] {
  const { rootItemId, rootRecipeId, anchor, prefs, recipes = ALL_RECIPES } = opts;
  const recipeById = new Map(recipes.map(r => [r.id, r]));

  interface Entry {
    itemId: string;
    recipe: Recipe | undefined;
    consumers: string[];
  }
  const entries = new Map<string, Entry>();
  entries.set(rootItemId, {
    itemId: rootItemId,
    recipe: rootRecipeId ? recipeById.get(rootRecipeId) : undefined,
    consumers: [],
  });

  const worklist = [rootItemId];
  while (worklist.length > 0) {
    const entry = entries.get(worklist.shift()!)!;
    for (const input of entry.recipe?.inputs ?? []) {
      let dep = entries.get(input.itemId);
      if (!dep) {
        dep = { itemId: input.itemId, recipe: chooseRecipeForItem(input.itemId, prefs, recipes), consumers: [] };
        entries.set(input.itemId, dep);
        worklist.push(input.itemId);
      }
      if (!dep.consumers.includes(entry.itemId)) dep.consumers.push(entry.itemId);
    }
  }

  // Rank = distance from the root (max over consumers), producers to the left.
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  function computeRank(itemId: string): number {
    const cached = rank.get(itemId);
    if (cached !== undefined) return cached;
    if (visiting.has(itemId)) return 0; // cycle fallback, mirrors layoutNodes
    visiting.add(itemId);
    let r = 0;
    for (const c of entries.get(itemId)!.consumers) r = Math.max(r, computeRank(c) + 1);
    visiting.delete(itemId);
    rank.set(itemId, r);
    return r;
  }
  for (const itemId of entries.keys()) computeRank(itemId);

  const maxRank = Math.max(...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const itemId of entries.keys()) layers[rank.get(itemId)!]!.push(itemId);

  // Order each layer by its consumers' vertical order (one barycenter pass,
  // left to right) to keep edges from crossing more than necessary.
  const order = new Map<string, number>([[rootItemId, 0]]);
  for (const layer of layers.slice(1)) {
    layer.sort((a, b) => {
      const mean = (id: string) => {
        const cs = entries.get(id)!.consumers;
        return cs.length === 0 ? 0 : cs.reduce((s, c) => s + (order.get(c) ?? 0), 0) / cs.length;
      };
      return mean(a) - mean(b);
    });
    layer.forEach((id, i) => order.set(id, i));
  }

  const position = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, r) => {
    const x = anchor.x - r * LAYOUT_COL_W;
    layer.forEach((id, i) => {
      position.set(id, { x, y: anchor.y + (i - (layer.length - 1) / 2) * LAYOUT_ROW_H });
    });
  });

  // Rank ascending = topological (each step's consumers sit in lower ranks).
  return layers.flat().map(itemId => {
    const entry = entries.get(itemId)!;
    const isRaw = entry.recipe === undefined;
    return {
      itemId,
      recipeId: entry.recipe?.id ?? null,
      isRaw,
      rawConfig: isRaw ? defaultRawConfig(itemId, prefs) : undefined,
      position: position.get(itemId)!,
      consumers: entry.consumers,
    };
  });
}
