import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { NodeResult, RawResourceConfig } from '../engine/types.ts';
import { calculateFromTarget } from '../engine/calculate.ts';
import { DEFAULT_RAW_CONFIG } from '../engine/rawResources.ts';
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

/** React Flow node type for factory nodes */
export type FactoryNodeType = Node<FactoryNodeData, 'factoryNode'>;

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

  // React Flow canvas state (positions only — domain data lives above)
  nodes: FactoryNodeType[];
  edges: Edge[];

  /** Per-node extractor config for raw resource nodes, keyed by node pathId */
  rawResourceConfigs: Record<string, RawResourceConfig>;

  // Actions
  setTarget: (itemId: string, ratePerMin: number) => void;
  setActiveRecipe: (itemId: string, recipeId: string) => void;
  setRawResourceConfig: (pathId: string, config: Partial<RawResourceConfig>) => void;
  setNodes: (nodes: FactoryNodeType[]) => void;
  setEdges: (edges: Edge[]) => void;
  loadPlan: (snapshot: PlanSnapshot) => void;
}

// ------------------------------------------------------------------
// Snapshot type for import/export
// ------------------------------------------------------------------

export interface PlanSnapshot {
  planId: string;
  planName: string;
  activeRecipes: Record<string, string>;
  rawResourceConfigs: Record<string, RawResourceConfig>;
  targetItemId: string;
  targetRatePerMin: number;
  nodes: FactoryNodeType[];
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

function resultToNodes(result: NodeResult | null, existing: FactoryNodeType[]): FactoryNodeType[] {
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

  setNodes(nodes) { set({ nodes }); },
  setEdges(edges) { set({ edges }); },

  loadPlan(snapshot) {
    const result = recompute(snapshot.targetItemId, snapshot.targetRatePerMin, snapshot.activeRecipes);
    const nodes = resultToNodes(result, snapshot.nodes);
    const edges = resultToEdges(result, nodes);
    set({ ...snapshot, result, nodes, edges });
  },
}));
