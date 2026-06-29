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
// Factories (sub-factories) extend this: a factory is a container node with
// input/output ports and an inner graph. Its OUTPUT-port demand is set by the
// parent graph's downstream consumers; its inner graph is balanced DEMAND-DRIVEN
// (anchored at those rates, NOT normalized — inner machine counts may exceed 1),
// and its INPUT-port requirements flow back out to size the parent's upstream
// producers. The whole factory result is then scaled by the parent's normalize
// factor (linear), so it stays consistent with the rest of the parent graph.
//
//   inputRatePerBuilding = (input.quantity / output.quantity) × outputRatePerMin
//   buildingCount        = requiredRate / outputRatePerMin
//
// SWAP SEAM: a stronger balancer can replace this module — the
// (nodes, edges, recipes, options) → Record<id, AnyBalanceResult> contract is
// all the store/UI depend on. The `anchors`/`normalize` options are also the
// substrate for future explicit per-node limits.

import type { Recipe } from './types.ts';

export type BalanceNodeKind = 'item' | 'raw' | 'factory';

/** One output/input port of a factory, as the engine needs to see it. */
export interface FactoryPortDef {
  portId: string;
  itemId: string | null;
  /** Outer handle id — sourceHandle for outputs, targetHandle for inputs. */
  handleId: string;
  /**
   * Outputs: the inner node that produces into this port (anchored at the port's demand).
   * Inputs: the inner raw "input-port" node whose pulled supply IS this port's requirement.
   */
  innerNodeId?: string;
}

export interface FactoryDef {
  inputs: FactoryPortDef[];
  outputs: FactoryPortDef[];
  inner: { nodes: BalanceNodeInput[]; edges: BalanceEdge[] };
}

export interface BalanceNodeInput {
  id: string;
  itemId: string;
  /** Chosen recipe id; null = raw resource (no production recipe). */
  recipeId: string | null;
  /** Optional discriminant. Absent ⇒ inferred from recipeId (factory only when set). */
  kind?: BalanceNodeKind;
  /** Present iff kind === 'factory'. */
  factory?: FactoryDef;
}

export interface BalanceEdge {
  source: string;
  target: string;
  /** Producer-side handle id; for a factory source it identifies the output port. */
  sourceHandle?: string | null;
  /** Consumer-side handle id; equals the ingredient itemId it feeds (or a factory input port). */
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

export interface FactoryPortResult {
  portId: string;
  itemId: string | null;
  ratePerMin: number;
}

export interface FactoryBalanceResult {
  isFactory: true;
  buildingCount: 0;
  buildingCountExact: 0;
  /** Per-output-port demand imposed by the parent graph. */
  outputPorts: FactoryPortResult[];
  /** Per-input-port requirement derived from the inner (demand-driven) solve. */
  inputPorts: FactoryPortResult[];
  /** The solved inner graph, at the same (parent-scaled) absolute scale. */
  inner: Record<string, AnyBalanceResult>;
}

export type AnyBalanceResult = BalanceResult | FactoryBalanceResult;

export interface BalanceOptions {
  /** Fix a node's output at an absolute rate (overrides the end-product anchor). */
  anchors?: Record<string, number>;
  /** true (default) = bottleneck-normalize to 1; false = absolute (demand-driven inner graphs). */
  normalize?: boolean;
}

function kindOf(n: BalanceNodeInput): BalanceNodeKind {
  return n.kind ?? (n.factory ? 'factory' : n.recipeId ? 'item' : 'raw');
}

/** Multiply a result (recursively, for factories) by a linear scale factor. */
function scaleResult(r: AnyBalanceResult, k: number): AnyBalanceResult {
  if (k === 1) return r;
  if ('isFactory' in r) {
    return {
      ...r,
      outputPorts: r.outputPorts.map(p => ({ ...p, ratePerMin: p.ratePerMin * k })),
      inputPorts: r.inputPorts.map(p => ({ ...p, ratePerMin: p.ratePerMin * k })),
      inner: Object.fromEntries(Object.entries(r.inner).map(([id, ir]) => [id, scaleResult(ir, k)])),
    };
  }
  const exact = r.buildingCountExact * k;
  return {
    ...r,
    buildingCountExact: exact,
    buildingCount: Math.ceil(exact),
    outputRatePerMin: r.outputRatePerMin * k,
    inputs: r.inputs.map(i => ({ ...i, neededPerMin: i.neededPerMin * k })),
  };
}

export function balanceGraph(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
  recipes: Recipe[],
  options: BalanceOptions = {},
): Record<string, AnyBalanceResult> {
  const normalize = options.normalize ?? true;
  const anchors = options.anchors ?? {};

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

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const factoryCache = new Map<string, FactoryBalanceResult>();

  // Solve a factory: output-port demand (from this graph) → demand-driven inner
  // solve → input-port requirements. Memoized per factory node id.
  function solveFactory(fNode: BalanceNodeInput): FactoryBalanceResult {
    const cached = factoryCache.get(fNode.id);
    if (cached) return cached;
    const def = fNode.factory!;

    const innerAnchors: Record<string, number> = {};
    const outputPorts: FactoryPortResult[] = def.outputs.map(op => {
      let d = 0;
      if (op.itemId != null) {
        for (const e of outEdges.get(fNode.id) ?? []) {
          if ((e.sourceHandle ?? null) === op.handleId) d += demandOnEdge(e);
        }
        if (op.innerNodeId) innerAnchors[op.innerNodeId] = (innerAnchors[op.innerNodeId] ?? 0) + d;
      }
      return { portId: op.portId, itemId: op.itemId, ratePerMin: d };
    });

    const inner = balanceGraph(def.inner.nodes, def.inner.edges, recipes, {
      anchors: innerAnchors,
      normalize: false,
    });

    const inputPorts: FactoryPortResult[] = def.inputs.map(ip => {
      let req = 0;
      if (ip.itemId != null && ip.innerNodeId) {
        const r = inner[ip.innerNodeId];
        if (r && 'outputRatePerMin' in r) req = r.outputRatePerMin;
      }
      return { portId: ip.portId, itemId: ip.itemId, ratePerMin: req };
    });

    const result: FactoryBalanceResult = {
      isFactory: true,
      buildingCount: 0,
      buildingCountExact: 0,
      outputPorts,
      inputPorts,
      inner,
    };
    factoryCache.set(fNode.id, result);
    return result;
  }

  /** The demand this edge places on its SOURCE node. */
  function demandOnEdge(e: BalanceEdge): number {
    const consumer = byId.get(e.target)!;
    if (kindOf(consumer) === 'factory') {
      // Demand on the producer = the factory's input-port requirement for that handle.
      const r = solveFactory(consumer);
      const idx = consumer.factory!.inputs.findIndex(p => p.handleId === (e.targetHandle ?? null));
      return idx >= 0 ? r.inputPorts[idx].ratePerMin : 0;
    }
    const cRecipe = recipeForNode(consumer);
    if (!cRecipe) return 0; // raw consumers have no inputs
    const ingredientId = e.targetHandle ?? byId.get(e.source)!.itemId;
    const ing = cRecipe.inputs.find(i => i.itemId === ingredientId);
    if (!ing) return 0;
    return (ing.quantity / outputQty(cRecipe, consumer.itemId)) * demand(e.target);
  }

  // demand(node) = items/min this node must output.
  function demand(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);

    const node = byId.get(id)!;
    let result: number;
    if (kindOf(node) === 'factory') {
      result = 0; // factories carry no scalar demand (only per-port demand)
    } else {
      const recipe = recipeForNode(node);
      const consumers = outEdges.get(id) ?? [];
      const anchor = anchors[id];
      const base = anchor ?? (consumers.length === 0 && recipe ? recipe.outputRatePerMin : 0);
      let sum = 0;
      for (const e of consumers) sum += demandOnEdge(e);
      result = base + sum;
    }

    visiting.delete(id);
    memo.set(id, result);
    return result;
  }

  for (const n of nodes) {
    if (kindOf(n) === 'factory') solveFactory(n);
    else demand(n.id);
  }

  // Normalize to the bottleneck (largest building count among recipe nodes).
  let scale = 1;
  if (normalize) {
    let maxBuildings = 0;
    for (const n of nodes) {
      const recipe = recipeForNode(n);
      if (!recipe) continue;
      const bc = demand(n.id) / recipe.outputRatePerMin;
      if (bc > maxBuildings) maxBuildings = bc;
    }
    scale = maxBuildings > 0 ? 1 / maxBuildings : 1;
  }

  const out: Record<string, AnyBalanceResult> = {};
  for (const n of nodes) {
    if (kindOf(n) === 'factory') {
      out[n.id] = scaleResult(factoryCache.get(n.id)!, scale);
      continue;
    }
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

/** Root entry point: normalized balance over the top-level graph. */
export function balanceTree(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
  recipes: Recipe[],
): Record<string, AnyBalanceResult> {
  return balanceGraph(nodes, edges, recipes);
}
