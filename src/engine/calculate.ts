// Pure calculation engine — no React, Zustand, or UI imports allowed here.
import type { Recipe, NodeResult } from './types.ts';

export interface CalculateOptions {
  /** All available recipes (loaded from src/data/recipes.json) */
  recipes: Recipe[];
  /**
   * Maps itemId → recipeId for any item that has more than one recipe.
   * If an itemId is not present the engine picks the first matching recipe.
   */
  activeRecipes?: Record<string, string>;
  /** Guard against circular recipe graphs */
  maxDepth?: number;
}

/**
 * Expand a target production requirement downward through the recipe graph.
 *
 * Returns a NodeResult tree rooted at the target item. Each node carries the
 * required rate, exact + ceiled building count, and the recursively resolved
 * input subtree.
 *
 * TODO: A future javascript-lp-solver pass would slot in here, replacing the
 * greedy per-node expansion with an LP solve over the full graph to minimize
 * resource usage or building count. The NodeResult shape is already suitable
 * as the LP variable set; the inputs arrays become constraint rows.
 */
export function calculateFromTarget(
  targetItemId: string,
  targetRatePerMin: number,
  options: CalculateOptions,
  depth = 0,
): NodeResult | null {
  const { recipes, activeRecipes = {}, maxDepth = 50 } = options;

  if (depth > maxDepth) {
    throw new Error(`Max recursion depth (${maxDepth}) exceeded — possible cycle in recipe graph`);
  }

  const recipe = resolveRecipe(targetItemId, recipes, activeRecipes);
  if (!recipe) return null; // raw resource — no recipe needed

  // The recipe produces `outputRate` of targetItemId per building per minute.
  const outputSpec = recipe.outputs.find(o => o.itemId === targetItemId);
  if (!outputSpec) return null;

  const buildingCountExact = targetRatePerMin / outputSpec.ratePerMin;
  const buildingCount = Math.ceil(buildingCountExact);

  const inputs: NodeResult[] = [];
  for (const inputSpec of recipe.inputs) {
    const requiredInputRate = inputSpec.ratePerMin * buildingCountExact;
    const child = calculateFromTarget(inputSpec.itemId, requiredInputRate, options, depth + 1);
    if (child) inputs.push(child);
  }

  return {
    recipeId: recipe.id,
    itemId: targetItemId,
    ratePerMin: targetRatePerMin,
    buildingCount,
    buildingCountExact,
    buildingTier: recipe.buildingTier,
    inputs,
  };
}

/**
 * Expand upward from a known raw-resource supply.
 *
 * Given that `sourceItemId` is available at `supplyRatePerMin`, compute what
 * the chosen recipe chain can produce. Returns the output NodeResult tree.
 *
 * TODO: LP slot — same as calculateFromTarget; the forward pass can feed into
 * an LP that maximises output given the resource ceiling.
 */
export function calculateFromSource(
  sourceItemId: string,
  supplyRatePerMin: number,
  outputItemId: string,
  options: CalculateOptions,
): NodeResult | null {
  // Find the recipe chain from outputItemId back to sourceItemId, then
  // determine how much output the supply supports.
  const { recipes, activeRecipes = {} } = options;

  const outputRecipe = resolveRecipe(outputItemId, recipes, activeRecipes);
  if (!outputRecipe) return null;

  const outputSpec = outputRecipe.outputs.find(o => o.itemId === outputItemId);
  if (!outputSpec) return null;

  // Walk the chain to find the input that references sourceItemId (direct link).
  const inputSpec = outputRecipe.inputs.find(i => i.itemId === sourceItemId);
  if (!inputSpec) {
    // sourceItemId is not a direct input — not yet supported for deep chains.
    // TODO: traverse deeper and find the choke point.
    return null;
  }

  const buildingCountExact = supplyRatePerMin / inputSpec.ratePerMin;
  const achievableRate = buildingCountExact * outputSpec.ratePerMin;

  return calculateFromTarget(outputItemId, achievableRate, options);
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function resolveRecipe(
  itemId: string,
  recipes: Recipe[],
  activeRecipes: Record<string, string>,
): Recipe | undefined {
  const preferredId = activeRecipes[itemId];
  if (preferredId) {
    const found = recipes.find(r => r.id === preferredId && r.itemId === itemId);
    if (found) return found;
  }
  return recipes.find(r => r.itemId === itemId);
}
