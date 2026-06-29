// Pure graph-balancing engine — no React, Zustand, or UI imports allowed here.
//
// Operates on the USER-BUILT graph (manually placed nodes + edges), not on
// recipe auto-expansion. Three-pass, near-linear normalization:
//
//   Pass 1 — anchor each end product (a node nothing consumes) at 1 building.
//   Pass 2 — propagate demand upstream along edges, summing across consumers,
//            yielding a fractional building count for every node.
//   Pass 3 — normalize to the bottleneck: divide every building count by the
//            largest one (K), so the most-demanded node becomes exactly 1 and
//            all others scale relative to it.
//
// The math (input ratio + building count) matches src/engine/calculate.ts:
//   inputRatePerBuilding = (input.quantity / output.quantity) × outputRatePerMin
//   buildingCount        = requiredRate / outputRatePerMin
//
// SWAP SEAM: a stronger balancer (LP solve, exact integer ratio) can replace
// this whole module — the (nodes, edges, recipes) → Record<id, BalanceResult>
// contract is all the store/UI depend on.

import type { Recipe } from './types.ts';

export interface BalanceNodeInput {
  id: string;
  itemId: string;
  /** Chosen recipe id; null = raw resource (no production recipe). */
  recipeId: string | null;
}

export interface BalanceEdge {
  source: string;
  target: string;
  /** Consumer-side handle id; equals the ingredient itemId it feeds. */
  targetHandle?: string | null;
}

export interface BalanceInputDemand {
  itemId: string;
  neededPerMin: number;
}

export interface BalanceResult {
  buildingCountExact: number;
  buildingCount: number;
  /** Items/min this node outputs (recipe nodes) or must be supplied (raw). */
  outputRatePerMin: number;
  inputs: BalanceInputDemand[];
  isRaw: boolean;
}

export function balanceGraph(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
  recipes: Recipe[],
): Record<string, BalanceResult> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const recipeById = new Map(recipes.map(r => [r.id, r]));

  const recipeForNode = (n: BalanceNodeInput): Recipe | undefined =>
    n.recipeId ? recipeById.get(n.recipeId) : undefined;

  const outputQty = (recipe: Recipe, itemId: string): number =>
    recipe.outputs.find(o => o.itemId === itemId)?.quantity ?? 1;

  // Outgoing edges per node (node is the producer → feeds these consumers).
  const outEdges = new Map<string, BalanceEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const list = outEdges.get(e.source) ?? [];
    list.push(e);
    outEdges.set(e.source, list);
  }

  // Pass 1 + 2: demand(node) = items/min this node must output.
  //   - no consumers (end product): anchor at one building → recipe.outputRatePerMin.
  //   - otherwise: sum over consumers of the input demand they place on this node.
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function demand(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);

    const node = byId.get(id)!;
    const recipe = recipeForNode(node);
    const consumers = outEdges.get(id) ?? [];

    let result: number;
    if (consumers.length === 0) {
      // End product: anchor at 1 building. Raw-only isolated node → 0.
      result = recipe ? recipe.outputRatePerMin : 0;
    } else {
      let sum = 0;
      for (const e of consumers) {
        const consumer = byId.get(e.target)!;
        const cRecipe = recipeForNode(consumer);
        if (!cRecipe) continue; // raw nodes have no inputs
        const ingredientId = e.targetHandle ?? node.itemId;
        const ing = cRecipe.inputs.find(i => i.itemId === ingredientId);
        if (!ing) continue;
        const ratio = ing.quantity / outputQty(cRecipe, consumer.itemId);
        sum += ratio * demand(e.target);
      }
      result = sum;
    }

    visiting.delete(id);
    memo.set(id, result);
    return result;
  }

  for (const n of nodes) demand(n.id);

  // Pass 3: normalize to the bottleneck (largest building count among recipe nodes).
  let maxBuildings = 0;
  for (const n of nodes) {
    const recipe = recipeForNode(n);
    if (!recipe) continue;
    const bc = demand(n.id) / recipe.outputRatePerMin;
    if (bc > maxBuildings) maxBuildings = bc;
  }
  const scale = maxBuildings > 0 ? 1 / maxBuildings : 1;

  const out: Record<string, BalanceResult> = {};
  for (const n of nodes) {
    const recipe = recipeForNode(n);
    const scaledDemand = demand(n.id) * scale;

    if (!recipe) {
      out[n.id] = {
        buildingCountExact: 0,
        buildingCount: 0,
        outputRatePerMin: scaledDemand,
        inputs: [],
        isRaw: true,
      };
      continue;
    }

    const buildingCountExact = scaledDemand / recipe.outputRatePerMin;
    const outQty = outputQty(recipe, n.itemId);
    out[n.id] = {
      buildingCountExact,
      buildingCount: Math.ceil(buildingCountExact),
      outputRatePerMin: scaledDemand,
      inputs: recipe.inputs.map(i => ({
        itemId: i.itemId,
        neededPerMin: (i.quantity / outQty) * scaledDemand,
      })),
      isRaw: false,
    };
  }

  return out;
}
