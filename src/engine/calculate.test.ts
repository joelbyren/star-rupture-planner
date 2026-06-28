import { describe, it, expect } from 'vitest';
import { calculateFromTarget, calculateFromSource } from './calculate.ts';
import type { Recipe } from './types.ts';

// --------------- fixture recipes (quantity-based format) ---------------
//
// Glass:          Furnace,  20 IPM, outputs: glass ×1,   inputs: helium ×1, calcium powder ×2
// Calcium Powder: Furnace,  60 IPM, outputs: powder ×3,  inputs: block_calcium ×1
// (Helium-3, block_calcium are raw resources — no recipe)
//
// outputRatePerMin = total items/min from one building (scraper value).
// quantity in inputs/outputs defines the per-craft ratio, not the rate.

const GLASS: Recipe = {
  id: 'recipe_comp_glass',
  outputItemId: 'comp_glass',
  machine: 'Furnace',
  buildingTier: null,
  outputRatePerMin: 20,
  outputs: [{ itemId: 'comp_glass', quantity: 1 }],
  inputs: [
    { itemId: 'gas_helium3', quantity: 1 },
    { itemId: 'powder_calcium', quantity: 2 },
  ],
  confidence: 'High Confidence',
  lastVerified: '2026-01-09',
  sourceUrl: 'https://starruptureplanner.com/items/comp_glass',
};

// Real scraped data: 60 IPM, 3 powder per craft, 1 block per craft.
const CALCIUM_POWDER: Recipe = {
  id: 'recipe_powder_calcium',
  outputItemId: 'powder_calcium',
  machine: 'Furnace',
  buildingTier: null,
  outputRatePerMin: 60,
  outputs: [{ itemId: 'powder_calcium', quantity: 3 }],
  inputs: [{ itemId: 'block_calcium', quantity: 1 }],
  confidence: 'High Confidence',
  lastVerified: '2026-01-09',
  sourceUrl: 'https://starruptureplanner.com/items/powder_calcium',
};

const ALL_RECIPES = [GLASS, CALCIUM_POWDER];

// --------------------------------------------------

describe('calculateFromTarget — single recipe', () => {
  it('computes correct building count for Glass at 40/min', () => {
    // 40 glass/min ÷ 20 IPM = 2 buildings
    const result = calculateFromTarget('comp_glass', 40, { recipes: ALL_RECIPES });

    expect(result).not.toBeNull();
    expect(result!.recipeId).toBe('recipe_comp_glass');
    expect(result!.machine).toBe('Furnace');
    expect(result!.buildingTier).toBeNull();
    expect(result!.buildingCount).toBe(2);
    expect(result!.buildingCountExact).toBeCloseTo(2);
  });

  it('computes input rates correctly from per-craft ratios', () => {
    // 40 glass/min, 1 building = 20 IPM, input ratio: 2 calcium per 1 glass
    // → calcium powder needed: (2/1) × 20 × 2 buildings = 80/min
    // Helium-3 is raw → leaf node; Calcium Powder has a recipe → processed node
    const result = calculateFromTarget('comp_glass', 40, { recipes: ALL_RECIPES });
    expect(result!.inputs).toHaveLength(2);
    const heliumNode = result!.inputs[0];
    expect(heliumNode.itemId).toBe('gas_helium3');
    expect(heliumNode.isRaw).toBe(true);
    const calciumNode = result!.inputs[1];
    expect(calciumNode.itemId).toBe('powder_calcium');
    expect(calciumNode.ratePerMin).toBeCloseTo(80);
  });

  it('returns a raw leaf node for a resource with no recipe', () => {
    const result = calculateFromTarget('gas_helium3', 30, { recipes: ALL_RECIPES });
    expect(result).not.toBeNull();
    expect(result!.isRaw).toBe(true);
    expect(result!.ratePerMin).toBeCloseTo(30);
    expect(result!.inputs).toHaveLength(0);
  });

  it('rounds building count up (ceiling) for fractional demands', () => {
    // 30 glass/min ÷ 20 IPM = 1.5 → ceiling 2
    const result = calculateFromTarget('comp_glass', 30, { recipes: ALL_RECIPES });
    expect(result!.buildingCountExact).toBeCloseTo(1.5);
    expect(result!.buildingCount).toBe(2);
  });
});

describe('calculateFromTarget — output quantity > 1', () => {
  it('uses outputRatePerMin directly for building count (not multiplied by output qty)', () => {
    // Calcium Powder: 60 IPM, output qty 3. Building count for 60/min = 60/60 = 1,
    // NOT 60/(60×3) = 0.33. The site reports IPM as total items/min already.
    const result = calculateFromTarget('powder_calcium', 60, { recipes: ALL_RECIPES });
    expect(result!.buildingCountExact).toBeCloseTo(1);
    expect(result!.buildingCount).toBe(1);
  });

  it('computes input rate via per-craft ratio (inputQty / outputQty × outputRatePerMin)', () => {
    // 1 Calcium Powder building: input ratio 1 block / 3 powder.
    // inputRatePerBuilding = (1/3) × 60 = 20 block_calcium/min.
    // For 1 building: 20 block_calcium/min consumed.
    const result = calculateFromTarget('powder_calcium', 60, { recipes: ALL_RECIPES });
    expect(result!.buildingCount).toBe(1);
    expect(result!.inputs).toHaveLength(1); // block_calcium is raw → leaf node
    expect(result!.inputs[0].isRaw).toBe(true);
    expect(result!.inputs[0].ratePerMin).toBeCloseTo(20);
  });
});

describe('calculateFromTarget — two-level chain', () => {
  it('recursively resolves Glass → Calcium Powder → block_calcium', () => {
    // Want 20 glass/min (1 Furnace).
    //   Calcium Powder needed: (2/1) × 20 × 1 building = 40/min
    //   Calcium Powder recipe: 60 IPM → 40/60 = 0.667 buildings (ceil 1)
    //   block_calcium consumed: (1/3) × 60 × 0.667 = 13.33/min (raw — no further node)
    const result = calculateFromTarget('comp_glass', 20, { recipes: ALL_RECIPES });

    expect(result).not.toBeNull();
    expect(result!.buildingCount).toBe(1);

    const calcNode = result!.inputs[1];
    expect(calcNode.itemId).toBe('powder_calcium');
    expect(calcNode.ratePerMin).toBeCloseTo(40);
    expect(calcNode.buildingCountExact).toBeCloseTo(40 / 60);
    expect(calcNode.buildingCount).toBe(1);
    expect(calcNode.machine).toBe('Furnace');
    expect(calcNode.inputs).toHaveLength(1); // block_calcium is raw → leaf node
    expect(calcNode.inputs[0].isRaw).toBe(true);
  });
});

describe('calculateFromSource', () => {
  it('computes achievable Glass output given a Calcium Powder supply', () => {
    // Supply 40 powder_calcium/min.
    // Glass recipe: input ratio (2/1) × 20 = 40 powder/building/min
    // → buildingCountExact = 40/40 = 1 → achievableRate = 1 × 20 = 20 glass/min
    const result = calculateFromSource('powder_calcium', 40, 'comp_glass', { recipes: ALL_RECIPES });
    expect(result).not.toBeNull();
    expect(result!.ratePerMin).toBeCloseTo(20);
    expect(result!.buildingCountExact).toBeCloseTo(1);
  });
});
