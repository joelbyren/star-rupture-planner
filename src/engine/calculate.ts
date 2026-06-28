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
 * Rate model:
 *   recipe.outputRatePerMin — total items/min produced by one building for the
 *   primary output (as reported by the site; already accounts for output quantity).
 *
 *   outputSpec.quantity and inputSpec.quantity are per-craft amounts that define
 *   the INPUT/OUTPUT RATIO only:
 *     inputRatePerBuilding = inputSpec.quantity / outputSpec.quantity × outputRatePerMin
 *
 *   Building count uses outputRatePerMin directly (not × quantity):
 *     buildingCountExact = targetRatePerMin / outputRatePerMin
 *
 * TODO: A future javascript-lp-solver pass would slot in here, replacing the
 * greedy per-node expansion with an LP solve over the full graph to minimize
 * resource usage or building count.
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
  if (!recipe) {
    return {
      recipeId: `raw::${targetItemId}`,
      itemId: targetItemId,
      machine: '',
      buildingTier: null,
      ratePerMin: targetRatePerMin,
      buildingCount: 0,
      buildingCountExact: 0,
      inputs: [],
      isRaw: true,
    };
  }

  const outputSpec = recipe.outputs.find(o => o.itemId === targetItemId);
  if (!outputSpec) return null;

  // outputRatePerMin is total items/min from one building — use it directly.
  const buildingCountExact = targetRatePerMin / recipe.outputRatePerMin;
  const buildingCount = Math.ceil(buildingCountExact);

  const inputs: NodeResult[] = [];
  for (const inputSpec of recipe.inputs) {
    // Ratio: how many input items per output item, scaled to the target rate.
    const inputRatePerBuilding = (inputSpec.quantity / outputSpec.quantity) * recipe.outputRatePerMin;
    const requiredInputRate = inputRatePerBuilding * buildingCountExact;
    const child = calculateFromTarget(inputSpec.itemId, requiredInputRate, options, depth + 1);
    if (child) inputs.push(child);
  }

  return {
    recipeId: recipe.id,
    itemId: targetItemId,
    machine: recipe.machine,
    buildingTier: recipe.buildingTier,
    ratePerMin: targetRatePerMin,
    buildingCount,
    buildingCountExact,
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
  const { recipes, activeRecipes = {} } = options;

  const outputRecipe = resolveRecipe(outputItemId, recipes, activeRecipes);
  if (!outputRecipe) return null;

  const outputSpec = outputRecipe.outputs.find(o => o.itemId === outputItemId);
  if (!outputSpec) return null;

  const inputSpec = outputRecipe.inputs.find(i => i.itemId === sourceItemId);
  if (!inputSpec) {
    // sourceItemId is not a direct input — not yet supported for deep chains.
    // TODO: traverse deeper and find the choke point.
    return null;
  }

  const inputRatePerBuilding = (inputSpec.quantity / outputSpec.quantity) * outputRecipe.outputRatePerMin;
  const buildingCountExact = supplyRatePerMin / inputRatePerBuilding;
  const achievableRate = buildingCountExact * outputRecipe.outputRatePerMin;

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
    const found = recipes.find(r => r.id === preferredId && r.outputItemId === itemId);
    if (found) return found;
  }
  return recipes.find(r => r.outputItemId === itemId);
}
