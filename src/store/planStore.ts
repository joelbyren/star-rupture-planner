import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { NodeResult } from '../engine/types.ts';
import { calculateFromTarget } from '../engine/calculate.ts';
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

  // Actions
  setTarget: (itemId: string, ratePerMin: number) => void;
  setActiveRecipe: (itemId: string, recipeId: string) => void;
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

function resultToNodes(result: NodeResult | null, existing: FactoryNodeType[]): FactoryNodeType[] {
  if (!result) return [];

  const posMap = new Map(existing.map(n => [n.id, n.position]));
  const nodes: FactoryNodeType[] = [];
  let xOffset = 0;

  function walk(node: NodeResult, depth: number) {
    const id = `${node.recipeId}::${depth}::${xOffset}`;
    const existing = posMap.get(id);
    nodes.push({
      id,
      type: 'factoryNode',
      position: existing ?? { x: depth * 240, y: xOffset * 130 },
      data: {
        itemId: node.itemId,
        ratePerMin: node.ratePerMin,
        result: node,
      },
    });
    xOffset++;
    for (const child of node.inputs) walk(child, depth + 1);
  }

  walk(result, 0);
  return nodes;
}

function resultToEdges(result: NodeResult | null, nodes: FactoryNodeType[]): Edge[] {
  if (!result || nodes.length < 2) return [];

  const edges: Edge[] = [];
  let xOffset = 0;

  function walk(node: NodeResult, depth: number, parentId: string | null) {
    const id = `${node.recipeId}::${depth}::${xOffset}`;
    if (parentId) {
      edges.push({
        id: `e-${parentId}-${id}`,
        source: id,
        target: parentId,
        animated: true,
      });
    }
    xOffset++;
    for (const child of node.inputs) walk(child, depth + 1, id);
  }

  walk(result, 0, null);
  return edges;
}

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------

export const usePlanStore = create<PlanState>((set, get) => ({
  planId: crypto.randomUUID(),
  planName: 'New Plan',
  activeRecipes: {},
  targetItemId: 'comp_glass',
  targetRatePerMin: 20,
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

  setNodes(nodes) { set({ nodes }); },
  setEdges(edges) { set({ edges }); },

  loadPlan(snapshot) {
    const result = recompute(snapshot.targetItemId, snapshot.targetRatePerMin, snapshot.activeRecipes);
    const nodes = resultToNodes(result, snapshot.nodes);
    const edges = resultToEdges(result, nodes);
    set({ ...snapshot, result, nodes, edges });
  },
}));
