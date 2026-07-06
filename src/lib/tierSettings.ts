// Pure helpers applying the per-machine tier preferences (settingsStore) to
// recipe choice and raw-extractor defaults. Shared by the add-node dialog and
// the prerequisite-tree builder so both resolve recipes identically.

import type { Recipe, RawResourceConfig } from '../engine/types.ts';
import { ALL_RECIPES } from '../data/index.ts';
import { DEFAULT_RAW_CONFIG, hasV2Extractor, machineForResource } from '../engine/rawResources.ts';
import { tierPrefFor, type TierPrefs } from '../store/settingsStore.ts';

/**
 * Recipes producing an item, sorted alphabetically (machine → tier → rate)
 * rather than in raw recipe-file order. A null buildingTier (≈V1) sorts
 * before 'V2', so the V1 variant always comes first.
 */
export function recipesProducing(itemId: string, recipes: Recipe[] = ALL_RECIPES): Recipe[] {
  return recipes
    .filter(r => r.outputItemId === itemId)
    .sort(
      (a, b) =>
        a.machine.localeCompare(b.machine) ||
        (a.buildingTier ?? '').localeCompare(b.buildingTier ?? '') ||
        a.outputRatePerMin - b.outputRatePerMin,
    );
}

function isV2(r: Recipe): boolean {
  return r.buildingTier === 'V2';
}

/**
 * Drop V2 recipes whose machine is set to only-v1. Defensive: if filtering
 * would leave an item with no recipe at all (a future V2-only item), the
 * unfiltered list is returned — hiding every recipe would misclassify the
 * item as a raw resource.
 */
export function applyTierFilter(recipes: Recipe[], prefs: TierPrefs): Recipe[] {
  const filtered = recipes.filter(r => !(isV2(r) && tierPrefFor(prefs, r.machine) === 'only-v1'));
  return filtered.length > 0 ? filtered : recipes;
}

/** The recipe to preselect: the preferred tier's variant when available, else the first. */
export function pickDefaultRecipe(recipes: Recipe[], prefs: TierPrefs): Recipe | undefined {
  const preferred = recipes.find(r =>
    tierPrefFor(prefs, r.machine) === 'prefer-v2' ? isV2(r) : !isV2(r),
  );
  return preferred ?? recipes[0];
}

/** Resolve the recipe the settings would choose for an item; undefined = raw resource. */
export function chooseRecipeForItem(
  itemId: string,
  prefs: TierPrefs,
  recipes: Recipe[] = ALL_RECIPES,
): Recipe | undefined {
  const producing = applyTierFilter(recipesProducing(itemId, recipes), prefs);
  return pickDefaultRecipe(producing, prefs);
}

/**
 * Extractor config for a new raw node. V2 only when the resource's extractor
 * machine is set to prefer-v2 AND a V2 extractor actually exists for it
 * (only Ore Excavator ores — the same gate the config dialog uses).
 */
export function defaultRawConfig(itemId: string, prefs: TierPrefs): RawResourceConfig {
  if (hasV2Extractor(itemId) && tierPrefFor(prefs, machineForResource(itemId)) === 'prefer-v2') {
    return { purity: 'normal', extractorVersion: 'V2' };
  }
  return DEFAULT_RAW_CONFIG;
}
