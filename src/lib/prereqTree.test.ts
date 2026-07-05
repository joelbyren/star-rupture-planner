import { describe, it, expect } from 'vitest';
import { buildPrereqPlan } from './prereqTree.ts';
import { LAYOUT_COL_W } from './layoutConstants.ts';
import type { Recipe } from '../engine/types.ts';
import type { TierPrefs } from '../store/settingsStore.ts';

const NONE: TierPrefs = {};
const ANCHOR = { x: 1000, y: 500 };

// Full V1 chain: comp_rotor ← {wire_wolfram, rod_titanium} ← {ingot_wolfram,
// ingot_titanium} ← {ore_wolfram, ore_titanium} — 7 distinct items.
const plan = () =>
  buildPrereqPlan({ rootItemId: 'comp_rotor', rootRecipeId: 'recipe_comp_rotor', anchor: ANCHOR, prefs: NONE });

describe('buildPrereqPlan', () => {
  it('expands the whole chain, one step per distinct item, root first', () => {
    const steps = plan();
    expect(steps[0]!.itemId).toBe('comp_rotor');
    expect(steps.map(s => s.itemId).sort()).toEqual(
      ['comp_rotor', 'ingot_titanium', 'ingot_wolfram', 'ore_titanium', 'ore_wolfram', 'rod_titanium', 'wire_wolfram'],
    );
  });

  it('orders consumers before their producers', () => {
    const steps = plan();
    const index = new Map(steps.map((s, i) => [s.itemId, i]));
    for (const step of steps) {
      for (const consumer of step.consumers) {
        expect(index.get(consumer)!).toBeLessThan(index.get(step.itemId)!);
      }
    }
  });

  it('marks recipe-less leaves raw with a default extractor config', () => {
    const ore = plan().find(s => s.itemId === 'ore_titanium')!;
    expect(ore.isRaw).toBe(true);
    expect(ore.recipeId).toBeNull();
    expect(ore.rawConfig).toEqual({ purity: 'normal', extractorVersion: 'V1' });
    expect(ore.consumers).toEqual(['ingot_titanium']);
  });

  it('applies extractor settings to raw leaves', () => {
    const steps = buildPrereqPlan({
      rootItemId: 'comp_rotor',
      rootRecipeId: 'recipe_comp_rotor',
      anchor: ANCHOR,
      prefs: { 'Ore Extractor': 'prefer-v2' },
    });
    expect(steps.find(s => s.itemId === 'ore_titanium')!.rawConfig?.extractorVersion).toBe('V2');
  });

  it('children follow the tier settings while the root keeps its manual recipe', () => {
    const steps = buildPrereqPlan({
      rootItemId: 'comp_rotor',
      rootRecipeId: 'recipe_comp_rotor', // manual V1 pick
      anchor: ANCHOR,
      prefs: { Fabricator: 'prefer-v2' },
    });
    expect(steps[0]!.recipeId).toBe('recipe_comp_rotor');
    // rod_titanium is also made in a Fabricator → prefer-v2 picks its V2 recipe.
    expect(steps.find(s => s.itemId === 'rod_titanium')!.recipeId).toBe('recipe_rod_titanium_v2');
  });

  it('places the root at the anchor and each rank one column to the left', () => {
    const steps = plan();
    const byId = new Map(steps.map(s => [s.itemId, s]));
    expect(byId.get('comp_rotor')!.position).toEqual(ANCHOR);
    expect(byId.get('wire_wolfram')!.position.x).toBe(ANCHOR.x - LAYOUT_COL_W);
    expect(byId.get('ingot_wolfram')!.position.x).toBe(ANCHOR.x - 2 * LAYOUT_COL_W);
    expect(byId.get('ore_wolfram')!.position.x).toBe(ANCHOR.x - 3 * LAYOUT_COL_W);
  });

  it('terminates on cyclic recipe data', () => {
    const cyclic: Recipe[] = [
      {
        id: 'r_a', outputItemId: 'a', machine: 'M', buildingTier: null, outputRatePerMin: 1,
        outputs: [{ itemId: 'a', quantity: 1 }], inputs: [{ itemId: 'b', quantity: 1 }],
        confidence: null, lastVerified: null, sourceUrl: '',
      },
      {
        id: 'r_b', outputItemId: 'b', machine: 'M', buildingTier: null, outputRatePerMin: 1,
        outputs: [{ itemId: 'b', quantity: 1 }], inputs: [{ itemId: 'a', quantity: 1 }],
        confidence: null, lastVerified: null, sourceUrl: '',
      },
    ];
    const steps = buildPrereqPlan({
      rootItemId: 'a', rootRecipeId: 'r_a', anchor: ANCHOR, prefs: NONE, recipes: cyclic,
    });
    expect(steps).toHaveLength(2);
  });
});
