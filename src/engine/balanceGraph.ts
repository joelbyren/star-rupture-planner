// Pure graph-balancing engine — no React, Zustand, or UI imports allowed here.
//
// Operates on the USER-BUILT graph (manually placed nodes + edges), not on
// recipe auto-expansion. Three-pass, near-linear normalization:
//
//   Pass 1 — anchor each end product (a node nothing consumes) at 1 building.
//   Pass 2 — propagate demand upstream along edges, summing across consumers,
//            yielding a fractional building count for every node.
//   Pass 3 — scale each weakly-connected component of the graph by its own
//            factor: if any node in the component carries a hard limit, scale
//            so the component's most restrictive limit is hit exactly (may
//            scale UP or DOWN); otherwise bottleneck-normalize the component
//            so its most-demanded node becomes exactly 1 building. Disconnected
//            trees on the canvas therefore balance independently.
//
// Factories (sub-factories) extend this: a factory is a container node with
// input/output ports and an inner graph. Its OUTPUT-port demand is set by the
// parent graph's downstream consumers; its inner graph is balanced DEMAND-DRIVEN
// (anchored at those rates, NOT normalized — inner machine counts may exceed 1),
// and its INPUT-port requirements flow back out to size the parent's upstream
// producers. The whole factory result is then scaled by the parent's normalize
// factor (linear), so it stays consistent with the rest of the parent graph.
// Hard limits on inner factory nodes constrain the scale of the factory node's
// component, since factoryCache stores the pre-scaling (scale 1) inner solve.
//
//   inputRatePerBuilding = (input.quantity / output.quantity) × outputRatePerMin
//   buildingCount        = requiredRate / outputRatePerMin
//
// SWAP SEAM: a stronger balancer can replace this module — the
// (nodes, edges, recipes, options) → Record<id, AnyBalanceResult> contract is
// all the store/UI depend on.

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
  /** Max items/min this node's output may reach; the network scales to respect it. */
  hardLimit?: number;
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
  /** Echo of the node's effective hard limit, for display. Not itself scaled. */
  hardLimitPerMin?: number;
  /** True iff this limit is (one of) the binding constraint(s) on its component's scale. */
  isLimitBinding?: boolean;
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

/**
 * Partition nodes into weakly-connected components of the top-level graph.
 * Edges whose endpoints are not both present are ignored (same guard as the
 * outEdges construction). Isolated nodes get their own component. Factory
 * nodes are single vertices; their inner nodes are not part of this graph.
 */
function computeComponents(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
): Map<string, number> {
  const ids = new Set(nodes.map(n => n.id));
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    link(e.source, e.target);
    link(e.target, e.source);
  }
  const componentOf = new Map<string, number>();
  let nextId = 0;
  for (const n of nodes) {
    if (componentOf.has(n.id)) continue;
    const compId = nextId++;
    const stack = [n.id]; // iterative DFS — no recursion-depth risk
    componentOf.set(n.id, compId);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!componentOf.has(nb)) {
          componentOf.set(nb, compId);
          stack.push(nb);
        }
      }
    }
  }
  return componentOf;
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
      return idx >= 0 ? (r.inputPorts[idx]?.ratePerMin ?? 0) : 0;
    }
    const cRecipe = recipeForNode(consumer);
    if (!cRecipe) return 0; // raw consumers have no inputs
    // e.source may reference a node absent from a malformed/imported plan — fall
    // back to undefined rather than asserting, so the `!ing` guard below catches it.
    const ingredientId = e.targetHandle ?? byId.get(e.source)?.itemId;
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

  // Pass 3: scale each weakly-connected component by its own factor.
  let componentOf: Map<string, number> | null = null;
  const componentScale = new Map<number, number>();
  if (normalize) {
    componentOf = computeComponents(nodes, edges);

    // Hard limits: cap each component's scale so no limited node exceeds its max.
    const ratiosByComp = new Map<number, number[]>();
    const pushRatio = (comp: number, ratio: number) => {
      const list = ratiosByComp.get(comp);
      if (list) list.push(ratio);
      else ratiosByComp.set(comp, [ratio]);
    };
    // A factory's inner limits belong to the factory node's outer component.
    const visitFactory = (comp: number, def: FactoryDef, fr: FactoryBalanceResult) => {
      for (const m of def.inner.nodes) {
        const r = fr.inner[m.id];
        if (!r) continue;
        if ('isFactory' in r) { if (m.factory) visitFactory(comp, m.factory, r); continue; }
        if (m.hardLimit != null && m.hardLimit > 0 && r.outputRatePerMin > 0)
          pushRatio(comp, m.hardLimit / r.outputRatePerMin);
      }
    };
    for (const n of nodes) {
      const comp = componentOf.get(n.id)!;
      if (kindOf(n) === 'factory') {
        const fr = factoryCache.get(n.id);
        if (fr && n.factory) visitFactory(comp, n.factory, fr);
        continue;
      }
      const rel = demand(n.id); // memoized above — free
      if (n.hardLimit != null && n.hardLimit > 0 && rel > 0) pushRatio(comp, n.hardLimit / rel);
    }

    // No limits in a component: normalize it to its own bottleneck.
    const maxBuildingsByComp = new Map<number, number>();
    for (const n of nodes) {
      const recipe = recipeForNode(n);
      if (!recipe) continue;
      const comp = componentOf.get(n.id)!;
      const bc = demand(n.id) / recipe.outputRatePerMin;
      if (bc > (maxBuildingsByComp.get(comp) ?? 0)) maxBuildingsByComp.set(comp, bc);
    }

    for (const comp of new Set(componentOf.values())) {
      const ratios = ratiosByComp.get(comp);
      if (ratios && ratios.length > 0) {
        componentScale.set(comp, Math.min(...ratios)); // may be > 1: scale UP to the max
      } else {
        const mb = maxBuildingsByComp.get(comp) ?? 0;
        componentScale.set(comp, mb > 0 ? 1 / mb : 1);
      }
    }
  }

  const scaleFor = (id: string): number =>
    componentOf ? (componentScale.get(componentOf.get(id)!) ?? 1) : 1;

  const out: Record<string, AnyBalanceResult> = {};
  for (const n of nodes) {
    if (kindOf(n) === 'factory') {
      out[n.id] = scaleResult(factoryCache.get(n.id)!, scaleFor(n.id));
      continue;
    }
    const recipe = recipeForNode(n);
    const scaledDemand = demand(n.id) * scaleFor(n.id);

    if (!recipe) {
      out[n.id] = {
        buildingCountExact: 0,
        buildingCount: 0,
        outputRatePerMin: scaledDemand,
        inputs: [],
        isRaw: true,
        hardLimitPerMin: n.hardLimit,
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
      hardLimitPerMin: n.hardLimit,
    };
  }

  if (normalize) markBinding(out);

  return out;
}

function markBinding(res: Record<string, AnyBalanceResult>): void {
  for (const r of Object.values(res)) {
    if ('isFactory' in r) { markBinding(r.inner); continue; }
    if (r.hardLimitPerMin != null && r.outputRatePerMin > 0)
      r.isLimitBinding = r.outputRatePerMin >= r.hardLimitPerMin * (1 - 1e-9);
  }
}

/** Root entry point: normalized balance over the top-level graph. */
export function balanceTree(
  nodes: BalanceNodeInput[],
  edges: BalanceEdge[],
  recipes: Recipe[],
): Record<string, AnyBalanceResult> {
  return balanceGraph(nodes, edges, recipes);
}
