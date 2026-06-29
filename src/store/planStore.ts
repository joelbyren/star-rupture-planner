import { create } from 'zustand';
import type { Node, Edge, Connection } from '@xyflow/react';
import type { NodeResult, RawResourceConfig } from '../engine/types.ts';
import { calculateFromTarget } from '../engine/calculate.ts';
import { DEFAULT_RAW_CONFIG } from '../engine/rawResources.ts';
import { balanceGraph, type BalanceResult } from '../engine/balanceGraph.ts';
import recipesJson from '../data/recipes.json';
import type { Recipe } from '../engine/types.ts';

const ALL_RECIPES = recipesJson as Recipe[];

// ------------------------------------------------------------------
// Domain model — kept separate from React Flow canvas state
// ------------------------------------------------------------------

export interface FactoryNodeData {
  itemId: string;
  ratePerMin: number;
  /** recipeId override; undefined = use first matching recipe */
  activeRecipeId?: string;
  /** Computed result (re-derived whenever inputs change) */
  result: NodeResult | null;
  [key: string]: unknown;
}

/** React Flow node type for factory nodes (legacy push-model — kept for old saved plans) */
export type FactoryNodeType = Node<FactoryNodeData, 'factoryNode'>;

// ------------------------------------------------------------------
// Universal manual-graph node (the primary node going forward)
// ------------------------------------------------------------------

export interface ItemNodeData {
  itemId: string;
  /** Chosen recipe/version; null = raw resource. Fixed at creation. */
  recipeId: string | null;
  isRaw: boolean;
  /** Extractor config for raw nodes (purity + version). */
  rawConfig?: RawResourceConfig;
  /** Latest balance result, recomputed on every structural change. */
  balance?: BalanceResult;
  [key: string]: unknown;
}

export type ItemNodeType = Node<ItemNodeData, 'itemNode'>;

/** Any node currently on the canvas (new itemNode or legacy factoryNode). */
export type AnyNode = ItemNodeType | FactoryNodeType;

export interface PlanState {
  // Domain
  planId: string;
  planName: string;
  /** Maps itemId → recipeId (the user's active recipe choice per item) */
  activeRecipes: Record<string, string>;
  /** The root target: what the user wants to produce */
  targetItemId: string;
  targetRatePerMin: number;
  /** Computed result tree, derived from target + activeRecipes */
  result: NodeResult | null;

  // React Flow canvas state
  nodes: AnyNode[];
  edges: Edge[];

  /** Per-node extractor config for raw resource nodes, keyed by node pathId (legacy) */
  rawResourceConfigs: Record<string, RawResourceConfig>;

  // --- Dialog UI state (manual builder) ---
  addDialogOpen: boolean;
  addDialogPos: { x: number; y: number } | null;
  /** Pre-selected item for the add dialog (e.g. when dragged off an input handle). */
  addDialogPrefillItemId: string | null;
  /** Restrict the add dialog to items whose recipe can consume this item as an input
   *  (set when dragged off an output handle). */
  addDialogFilterInputItemId: string | null;
  /** A drag-to-create in progress: connect the new node to this origin handle. */
  pendingConnect: PendingConnect | null;
  editingNodeId: string | null;
  /** Bumped by autoLayout so the canvas can re-fit the view after repositioning. */
  layoutTick: number;

  // Legacy push-model actions (dormant — no UI drives them currently)
  setTarget: (itemId: string, ratePerMin: number) => void;
  setActiveRecipe: (itemId: string, recipeId: string) => void;
  setRawResourceConfig: (pathId: string, config: Partial<RawResourceConfig>) => void;

  // Canvas plumbing
  setNodes: (nodes: AnyNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  loadPlan: (snapshot: PlanSnapshot) => void;

  // Manual builder actions
  addNode: (itemId: string, recipeId: string | null, position?: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  setNodeRawConfig: (id: string, patch: Partial<RawResourceConfig>) => void;
  connectNodes: (connection: Connection) => void;
  /** Re-arrange the current graph into a clean layered layout. */
  autoLayout: () => void;

  // Dialog actions
  openAddDialog: (opts?: {
    pos?: { x: number; y: number };
    prefillItemId?: string;
    filterInputItemId?: string;
    pending?: PendingConnect;
  }) => void;
  closeAddDialog: () => void;
  openConfig: (id: string) => void;
  closeConfig: () => void;
}

/** Origin handle of an in-progress drag-to-create. */
export interface PendingConnect {
  fromNodeId: string;
  fromHandleId: string | null;
  fromHandleType: 'source' | 'target';
}

// ------------------------------------------------------------------
// Snapshot type for import/export
// ------------------------------------------------------------------

export interface PlanSnapshot {
  planId: string;
  planName: string;
  activeRecipes: Record<string, string>;
  rawResourceConfigs?: Record<string, RawResourceConfig>;
  targetItemId: string;
  targetRatePerMin: number;
  nodes: AnyNode[];
  edges: Edge[];
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function recompute(
  targetItemId: string,
  targetRatePerMin: number,
  activeRecipes: Record<string, string>,
): NodeResult | null {
  if (!targetItemId || targetRatePerMin <= 0) return null;
  return calculateFromTarget(targetItemId, targetRatePerMin, {
    recipes: ALL_RECIPES,
    activeRecipes,
  });
}

const NODE_W = 240;
const NODE_H = 130;

function treeMaxDepth(node: NodeResult): number {
  if (node.inputs.length === 0) return 0;
  return 1 + Math.max(...node.inputs.map(treeMaxDepth));
}

function resultToNodes(result: NodeResult | null, existing: AnyNode[]): FactoryNodeType[] {
  if (!result) return [];

  const posMap = new Map(existing.map(n => [n.id, n.position]));
  const nodes: FactoryNodeType[] = [];
  let leafIndex = 0;
  const maxDepth = treeMaxDepth(result);

  // Path-based IDs (e.g. "glass/silica/sand") are unique per tree position
  // and stable across recomputations so saved positions survive recipe changes.
  // X is flipped so raw materials sit on the left and the end product on the right.
  function walk(node: NodeResult, depth: number, pathId: string) {
    const startLeaf = leafIndex;
    for (const child of node.inputs) walk(child, depth + 1, `${pathId}/${child.itemId}`);
    const endLeaf = node.inputs.length === 0 ? ++leafIndex : leafIndex;

    const savedPos = posMap.get(pathId);
    const yCentered = ((startLeaf + endLeaf - 1) / 2) * NODE_H;
    nodes.push({
      id: pathId,
      type: 'factoryNode',
      position: savedPos ?? { x: (maxDepth - depth) * NODE_W, y: yCentered },
      data: {
        itemId: node.itemId,
        ratePerMin: node.ratePerMin,
        result: node,
      },
    });
  }

  walk(result, 0, result.itemId);
  return nodes;
}

function resultToEdges(result: NodeResult | null, nodes: FactoryNodeType[]): Edge[] {
  if (!result || nodes.length < 2) return [];

  const edges: Edge[] = [];

  function walk(node: NodeResult, depth: number, pathId: string, parentId: string | null) {
    if (parentId) {
      edges.push({
        id: `e-${parentId}-${pathId}`,
        source: pathId,
        target: parentId,
        animated: true,
      });
    }
    for (const child of node.inputs) walk(child, depth + 1, `${pathId}/${child.itemId}`, pathId);
  }

  walk(result, 0, result.itemId, null);
  return edges;
}

// ------------------------------------------------------------------
// Manual-builder helpers
// ------------------------------------------------------------------

function isItemNode(n: AnyNode): n is ItemNodeType {
  return n.type === 'itemNode';
}

/** Run the balance engine over the itemNodes and write the result back into each node's data. */
function withBalance(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  const itemNodes = nodes.filter(isItemNode);
  if (itemNodes.length === 0) return nodes;

  const balance = balanceGraph(
    itemNodes.map(n => ({ id: n.id, itemId: n.data.itemId, recipeId: n.data.recipeId })),
    edges.map(e => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })),
    ALL_RECIPES,
  );

  return nodes.map(n =>
    isItemNode(n) ? { ...n, data: { ...n.data, balance: balance[n.id] } } : n,
  );
}

/**
 * Build a validated producer→consumer edge: the source node's output item must
 * match the consumer's input handle. Returns null if invalid.
 */
function buildEdge(
  nodes: AnyNode[],
  source: string,
  target: string,
  targetHandle: string | null | undefined,
): Edge | null {
  const src = nodes.find(n => n.id === source);
  if (!src || !isItemNode(src)) return null;
  if (targetHandle && src.data.itemId !== targetHandle) return null;
  return {
    id: `e-${source}-${target}-${targetHandle ?? src.data.itemId}`,
    source,
    target,
    targetHandle: targetHandle ?? undefined,
    animated: true,
  };
}

/** Highest zIndex currently on the canvas (so new nodes can stack on top). */
function topZ(nodes: AnyNode[]): number {
  return nodes.reduce((max, n) => Math.max(max, n.zIndex ?? 0), 0);
}

/** A recipe ingredient on a node that has no producer edge feeding it. */
export interface MissingInput {
  nodeId: string;
  /** Item produced by the node that's missing the input. */
  consumerItemId: string;
  /** The ingredient itemId that isn't being supplied. */
  itemId: string;
}

/**
 * Find every recipe input handle with no incoming edge. An empty list means the
 * graph is fully fed (every recipe node has all its ingredients connected).
 */
export function findMissingInputs(nodes: AnyNode[], edges: Edge[]): MissingInput[] {
  const recipeById = new Map(ALL_RECIPES.map(r => [r.id, r]));
  const missing: MissingInput[] = [];
  for (const n of nodes) {
    if (!isItemNode(n) || n.data.recipeId === null) continue; // raw nodes have no inputs
    const recipe = recipeById.get(n.data.recipeId);
    if (!recipe) continue;
    for (const inp of recipe.inputs) {
      const fed = edges.some(e => e.target === n.id && e.targetHandle === inp.itemId);
      if (!fed) missing.push({ nodeId: n.id, consumerItemId: n.data.itemId, itemId: inp.itemId });
    }
  }
  return missing;
}

// Layered auto-layout spacing.
const LAYOUT_COL_W = 240;
const LAYOUT_ROW_H = 120;

/**
 * Arrange nodes into a clean layered (Sugiyama-style) layout.
 * Edges point producer→consumer, so a node's "rank" is its longest-path
 * distance from a final product (a node with no consumers). Higher rank sits
 * further left, so raw materials land on the left and end products on the right
 * — matching the push-model layout convention. Within each layer, nodes are
 * ordered by the barycenter of their neighbours to reduce edge crossings.
 */
function layoutNodes(nodes: AnyNode[], edges: Edge[]): AnyNode[] {
  if (nodes.length === 0) return nodes;

  const idSet = new Set(nodes.map(n => n.id));
  const consumers = new Map<string, string[]>();
  const producers = new Map<string, string[]>();
  for (const n of nodes) { consumers.set(n.id, []); producers.set(n.id, []); }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    consumers.get(e.source)!.push(e.target);
    producers.get(e.target)!.push(e.source);
  }

  // rank = longest path to a sink (node with no consumers); memoized DFS.
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  function computeRank(id: string): number {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let r = 0;
    for (const c of consumers.get(id)!) r = Math.max(r, computeRank(c) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  }
  for (const n of nodes) computeRank(n.id);

  const maxRank = Math.max(...rank.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) layers[rank.get(n.id)!].push(n.id);

  // Barycenter ordering: relax each layer toward the mean position of its
  // neighbours over a few sweeps to untangle crossings.
  const order = new Map<string, number>();
  layers.forEach(layer => layer.forEach((id, i) => order.set(id, i)));
  for (let iter = 0; iter < 8; iter++) {
    for (const layer of layers) {
      const bary = new Map<string, number>();
      for (const id of layer) {
        const nb = [...producers.get(id)!, ...consumers.get(id)!];
        bary.set(id, nb.length === 0
          ? order.get(id)!
          : nb.reduce((s, x) => s + (order.get(x) ?? 0), 0) / nb.length);
      }
      layer.sort((a, b) => bary.get(a)! - bary.get(b)!);
      layer.forEach((id, i) => order.set(id, i));
    }
  }

  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, rankVal) => {
    const x = (maxRank - rankVal) * LAYOUT_COL_W;
    layer.forEach((id, i) => pos.set(id, { x, y: (i - (layer.length - 1) / 2) * LAYOUT_ROW_H }));
  });

  return nodes.map(n => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------

export const usePlanStore = create<PlanState>((set, get) => ({
  planId: crypto.randomUUID(),
  planName: 'New Plan',
  activeRecipes: {},
  rawResourceConfigs: {},
  targetItemId: 'comp_rotor',
  targetRatePerMin: 10,
  result: null,
  nodes: [],
  edges: [],

  addDialogOpen: false,
  addDialogPos: null,
  addDialogPrefillItemId: null,
  addDialogFilterInputItemId: null,
  pendingConnect: null,
  editingNodeId: null,
  layoutTick: 0,

  setTarget(itemId, ratePerMin) {
    const { activeRecipes, nodes } = get();
    const result = recompute(itemId, ratePerMin, activeRecipes);
    const newNodes = resultToNodes(result, nodes);
    const edges = resultToEdges(result, newNodes);
    set({ targetItemId: itemId, targetRatePerMin: ratePerMin, result, nodes: newNodes, edges });
  },

  setActiveRecipe(itemId, recipeId) {
    const { targetItemId, targetRatePerMin, nodes } = get();
    const activeRecipes = { ...get().activeRecipes, [itemId]: recipeId };
    const result = recompute(targetItemId, targetRatePerMin, activeRecipes);
    const newNodes = resultToNodes(result, nodes);
    const edges = resultToEdges(result, newNodes);
    set({ activeRecipes, result, nodes: newNodes, edges });
  },

  setRawResourceConfig(pathId, patch) {
    const current = get().rawResourceConfigs[pathId] ?? DEFAULT_RAW_CONFIG;
    set({ rawResourceConfigs: { ...get().rawResourceConfigs, [pathId]: { ...current, ...patch } } });
  },

  setNodes(nodes) { set({ nodes: withBalance(nodes, get().edges) }); },
  setEdges(edges) { set({ edges, nodes: withBalance(get().nodes, edges) }); },

  loadPlan(snapshot) {
    // Manual graph: load the saved nodes/edges directly and rebalance.
    // (result is recomputed only so any legacy display fields stay populated.)
    const result = recompute(snapshot.targetItemId, snapshot.targetRatePerMin, snapshot.activeRecipes);
    set({ ...snapshot, result, nodes: withBalance(snapshot.nodes, snapshot.edges), edges: snapshot.edges });
  },

  // --- Manual builder ---

  addNode(itemId, recipeId, position) {
    const { nodes, edges, pendingConnect } = get();
    const isRaw = recipeId === null;
    const count = nodes.length;
    const node: ItemNodeType = {
      id: crypto.randomUUID(),
      type: 'itemNode',
      // Cascade button-added nodes so they don't stack exactly on top of each other.
      position: position ?? { x: 40 + count * 28, y: 40 + count * 28 },
      zIndex: topZ(nodes) + 1,
      data: {
        itemId,
        recipeId,
        isRaw,
        rawConfig: isRaw ? DEFAULT_RAW_CONFIG : undefined,
      },
    };
    const allNodes = [...nodes, node];

    // Auto-connect if this add came from a drag-to-create off an existing handle.
    let nextEdges = edges;
    if (pendingConnect) {
      let edge: Edge | null = null;
      if (pendingConnect.fromHandleType === 'target') {
        // Dragged off an input handle → the new node is the producer for that ingredient.
        edge = buildEdge(allNodes, node.id, pendingConnect.fromNodeId, pendingConnect.fromHandleId);
      } else {
        // Dragged off an output handle → the origin feeds an input of the new node.
        const origin = nodes.find(n => n.id === pendingConnect.fromNodeId);
        const originItemId = origin && isItemNode(origin) ? origin.data.itemId : null;
        if (originItemId) edge = buildEdge(allNodes, pendingConnect.fromNodeId, node.id, originItemId);
      }
      if (edge) nextEdges = [...edges.filter(e => e.id !== edge!.id), edge];
    }

    set({
      nodes: withBalance(allNodes, nextEdges),
      edges: nextEdges,
      addDialogOpen: false,
      addDialogPos: null,
      addDialogPrefillItemId: null,
      addDialogFilterInputItemId: null,
      pendingConnect: null,
    });
  },

  removeNode(id) {
    const edges = get().edges.filter(e => e.source !== id && e.target !== id);
    const nodes = get().nodes.filter(n => n.id !== id);
    set({ nodes: withBalance(nodes, edges), edges, editingNodeId: null });
  },

  setNodeRawConfig(id, patch) {
    const nodes = get().nodes.map(n =>
      isItemNode(n) && n.id === id
        ? { ...n, data: { ...n.data, rawConfig: { ...(n.data.rawConfig ?? DEFAULT_RAW_CONFIG), ...patch } } }
        : n,
    );
    set({ nodes });
  },

  connectNodes(connection) {
    const { source, target, targetHandle } = connection;
    if (!source || !target) return;
    const newEdge = buildEdge(get().nodes, source, target, targetHandle);
    if (!newEdge) return; // mismatched / invalid connection rejected
    // One producer per input handle: drop any existing edge feeding this handle.
    const edges = get().edges.filter(e => !(e.target === target && e.targetHandle === targetHandle));
    const next = [...edges, newEdge];
    set({ edges: next, nodes: withBalance(get().nodes, next) });
  },

  autoLayout() {
    const { nodes, edges, layoutTick } = get();
    set({ nodes: layoutNodes(nodes, edges), layoutTick: layoutTick + 1 });
  },

  // --- Dialog state ---

  openAddDialog(opts) {
    set({
      addDialogOpen: true,
      addDialogPos: opts?.pos ?? null,
      addDialogPrefillItemId: opts?.prefillItemId ?? null,
      addDialogFilterInputItemId: opts?.filterInputItemId ?? null,
      pendingConnect: opts?.pending ?? null,
    });
  },
  closeAddDialog() {
    set({
      addDialogOpen: false,
      addDialogPos: null,
      addDialogPrefillItemId: null,
      addDialogFilterInputItemId: null,
      pendingConnect: null,
    });
  },
  openConfig(id) { set({ editingNodeId: id }); },
  closeConfig() { set({ editingNodeId: null }); },
}));
