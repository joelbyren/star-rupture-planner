import { describe, it, expect } from 'vitest';
import {
  recipesProducing,
  applyTierFilter,
  pickDefaultRecipe,
  chooseRecipeForItem,
  defaultRawConfig,
} from './tierSettings.ts';
import type { TierPrefs } from '../store/settingsStore.ts';

const NONE: TierPrefs = {};

describe('recipesProducing', () => {
  it('returns both variants for a V1/V2 pair, V1 first', () => {
    const rs = recipesProducing('rotor');
    expect(rs.map(r => r.id)).toEqual(['recipe_crafter_rotor', 'recipe_crafter-tier2_rotor-v2']);
  });

  it('returns empty for raw resources', () => {
    expect(recipesProducing('titanium-ore')).toEqual([]);
  });
});

describe('applyTierFilter', () => {
  it('only-v1 drops the V2 variant', () => {
    const rs = applyTierFilter(recipesProducing('rotor'), { Fabricator: 'only-v1' });
    expect(rs.map(r => r.id)).toEqual(['recipe_crafter_rotor']);
  });

  it('prefer-v1 and prefer-v2 keep both variants', () => {
    for (const pref of ['prefer-v1', 'prefer-v2'] as const) {
      const rs = applyTierFilter(recipesProducing('rotor'), { Fabricator: pref });
      expect(rs).toHaveLength(2);
    }
  });

  it('falls back to the unfiltered list when filtering would leave nothing', () => {
    const v2Only = recipesProducing('rotor').filter(r => r.buildingTier === 'V2');
    expect(applyTierFilter(v2Only, { Fabricator: 'only-v1' })).toEqual(v2Only);
  });
});

describe('pickDefaultRecipe', () => {
  it('defaults to V1 without a preference', () => {
    expect(pickDefaultRecipe(recipesProducing('rotor'), NONE)?.id).toBe('recipe_crafter_rotor');
  });

  it('prefer-v2 picks the V2 variant', () => {
    const picked = pickDefaultRecipe(recipesProducing('rotor'), { Fabricator: 'prefer-v2' });
    expect(picked?.id).toBe('recipe_crafter-tier2_rotor-v2');
  });

  it('prefer-v2 falls back to V1 when no V2 variant exists', () => {
    const picked = pickDefaultRecipe(recipesProducing('wolfram-bar'), { Smelter: 'prefer-v2' });
    expect(picked?.id).toBe('recipe_smelter_wolfram-bar');
  });
});

describe('chooseRecipeForItem', () => {
  it('returns undefined for raw resources', () => {
    expect(chooseRecipeForItem('titanium-ore', NONE)).toBeUndefined();
  });

  it('only-v1 resolves to the V1 recipe', () => {
    expect(chooseRecipeForItem('rotor', { Fabricator: 'only-v1' })?.id).toBe('recipe_crafter_rotor');
  });
});

describe('defaultRawConfig', () => {
  it('defaults to normal purity + V1', () => {
    expect(defaultRawConfig('titanium-ore', NONE)).toEqual({ purity: 'normal', extractorVersion: 'V1' });
  });

  it('prefer-v2 on the Ore Excavator defaults ores to V2', () => {
    expect(defaultRawConfig('titanium-ore', { 'Ore Excavator': 'prefer-v2' })).toEqual({
      purity: 'normal',
      extractorVersion: 'V2',
    });
  });

  it('only-v1 keeps V1', () => {
    expect(defaultRawConfig('titanium-ore', { 'Ore Excavator': 'only-v1' }).extractorVersion).toBe('V1');
  });

  it('non-ore raws never default to V2 (no confirmed V2 extractor)', () => {
    expect(defaultRawConfig('helium-ore', { 'Helium-3 Extractor': 'prefer-v2' }).extractorVersion).toBe('V1');
    expect(defaultRawConfig('magic-oil-ore', { 'Oil Extractor': 'prefer-v2' }).extractorVersion).toBe('V1');
  });

  it('the Ore Excavator preference does not leak onto other extractor machines', () => {
    expect(defaultRawConfig('sulphur-ore', { 'Ore Excavator': 'prefer-v2' }).extractorVersion).toBe('V1');
  });
});
