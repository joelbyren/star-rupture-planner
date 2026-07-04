// Pure power-consumption engine — no React, Zustand, or UI imports allowed here.
//
// Consumes a minimal structural node shape (not the store's AnyNode) so this
// module stays decoupled from planStore, mirroring balanceGraph.ts's contract.

import type { BuildingTier } from './types.ts';
import { machineForResource } from './rawResources.ts';
import { POWER, ALL_RECIPES } from '../data/index.ts';

// "Chemicals at" is a known scrape artifact in recipes.json's `machine` field — kept
// verbatim here since it's the only join key recipes expose for that machine.
const RECIPE_BY_ID = new Map(ALL_RECIPES.map(r => [r.id, r]));

/** Power draw (kW) for one machine at a given tier; unknown machine → 0 (+ dev warning). */
export function machinePower(machine: string, tier: BuildingTier): number {
  const entry = POWER[machine];
  if (!entry) {
    if (import.meta.env.DEV) console.warn(`engine/power: unknown machine "${machine}"`);
    return 0;
  }
  return entry[tier];
}

/** Minimal structural node shape graphPower needs, decoupled from the store's node types. */
export interface PowerNode {
  kind: 'production' | 'raw' | 'factory';
  /** Production nodes: chosen recipe id. */
  recipeId?: string | null;
  /** Production nodes: ceil'd building count from the balance result. */
  buildingCount?: number;
  /** Raw nodes: the resource item id, used to look up its extractor machine. */
  itemId?: string;
  /** Raw nodes: extractor version; defaults to V1. */
  extractorVersion?: BuildingTier;
  /** Factory nodes: the inner graph to recurse into. */
  inner?: PowerNode[];
}

/** Total power (kW) for a list of nodes, recursing into nested factories. */
export function graphPower(nodes: PowerNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.kind === 'factory') {
      total += graphPower(n.inner ?? []);
    } else if (n.kind === 'raw') {
      const machine = machineForResource(n.itemId ?? '');
      total += machinePower(machine, n.extractorVersion ?? 'V1');
    } else {
      const recipe = n.recipeId ? RECIPE_BY_ID.get(n.recipeId) : undefined;
      if (recipe) total += (n.buildingCount ?? 0) * machinePower(recipe.machine, recipe.buildingTier ?? 'V1');
    }
  }
  return total;
}
