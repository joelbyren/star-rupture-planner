import { describe, it, expect } from 'vitest';
import { calculateFromTarget } from './calculate.ts';
import type { Recipe } from './types.ts';

// --------------- fixture recipes ---------------

const SMELT_V1: Recipe = {
  id: 'smelt-iron-v1',
  itemId: 'iron-plate',
  buildingTier: 'V1',
  inputs:  [{ itemId: 'iron-ore',   ratePerMin: 30 }],
  outputs: [{ itemId: 'iron-plate', ratePerMin: 20 }],
};

const SMELT_V2: Recipe = {
  id: 'smelt-iron-v2',
  itemId: 'iron-plate',
  buildingTier: 'V2',
  inputs:  [{ itemId: 'iron-ore',   ratePerMin: 45 }],
  outputs: [{ itemId: 'iron-plate', ratePerMin: 30 }],
};

const MAKE_ROD: Recipe = {
  id: 'make-iron-rod',
  itemId: 'iron-rod',
  buildingTier: 'V1',
  inputs:  [{ itemId: 'iron-plate', ratePerMin: 15 }],
  outputs: [{ itemId: 'iron-rod',   ratePerMin: 15 }],
};

const MAKE_SCREW: Recipe = {
  id: 'make-screw',
  itemId: 'screw',
  buildingTier: 'V1',
  inputs:  [{ itemId: 'iron-rod',  ratePerMin: 10 }],
  outputs: [{ itemId: 'screw',     ratePerMin: 40 }],
};

const ALL_RECIPES = [SMELT_V1, SMELT_V2, MAKE_ROD, MAKE_SCREW];

// --------------------------------------------------

describe('calculateFromTarget — single recipe', () => {
  it('computes correct building count and input rate for iron plate', () => {
    // Want 40 iron-plate/min. V1 produces 20/min → need 2 buildings.
    // Each building consumes 30 iron-ore/min → total 60 iron-ore/min.
    const result = calculateFromTarget('iron-plate', 40, { recipes: ALL_RECIPES });

    expect(result).not.toBeNull();
    expect(result!.recipeId).toBe('smelt-iron-v1');
    expect(result!.buildingCount).toBe(2);
    expect(result!.buildingCountExact).toBeCloseTo(2);
    expect(result!.inputs).toHaveLength(0); // iron-ore is a raw resource — no recipe
  });

  it('returns null for a raw resource (no recipe defined)', () => {
    const result = calculateFromTarget('iron-ore', 30, { recipes: ALL_RECIPES });
    expect(result).toBeNull();
  });

  it('rounds building count up (ceiling) for fractional demands', () => {
    // Want 30 iron-plate/min. V1 produces 20/min → exact 1.5 → ceiling 2.
    const result = calculateFromTarget('iron-plate', 30, { recipes: ALL_RECIPES });
    expect(result!.buildingCountExact).toBeCloseTo(1.5);
    expect(result!.buildingCount).toBe(2);
  });
});

describe('calculateFromTarget — two-level chain', () => {
  it('recursively resolves iron-rod → iron-plate → iron-ore', () => {
    // Want 15 iron-rod/min.
    // MAKE_ROD: 1 building, consumes 15 iron-plate/min.
    // SMELT_V1: 15/20 = 0.75 buildings (ceil → 1), consumes 0.75*30=22.5 iron-ore/min.
    const result = calculateFromTarget('iron-rod', 15, { recipes: ALL_RECIPES });

    expect(result).not.toBeNull();
    expect(result!.recipeId).toBe('make-iron-rod');
    expect(result!.buildingCount).toBe(1);

    const plateNode = result!.inputs[0];
    expect(plateNode.itemId).toBe('iron-plate');
    expect(plateNode.ratePerMin).toBeCloseTo(15);
    expect(plateNode.buildingCountExact).toBeCloseTo(0.75);
    expect(plateNode.buildingCount).toBe(1);

    // iron-ore is raw — no further inputs
    expect(plateNode.inputs).toHaveLength(0);
  });
});

describe('calculateFromTarget — V1 vs V2 recipe switching', () => {
  it('uses V1 by default (first matching recipe)', () => {
    const result = calculateFromTarget('iron-plate', 60, { recipes: ALL_RECIPES });
    expect(result!.buildingTier).toBe('V1');
    // V1 outputs 20/min → 60/20 = 3 buildings, consumes 3*30=90 iron-ore
    expect(result!.buildingCount).toBe(3);
    expect(result!.buildingCountExact).toBeCloseTo(3);
  });

  it('uses V2 when activeRecipes selects it, changing building count', () => {
    const result = calculateFromTarget('iron-plate', 60, {
      recipes: ALL_RECIPES,
      activeRecipes: { 'iron-plate': 'smelt-iron-v2' },
    });
    // V2 outputs 30/min → 60/30 = 2 buildings, consumes 2*45=90 iron-ore
    expect(result!.buildingTier).toBe('V2');
    expect(result!.buildingCount).toBe(2);
    expect(result!.buildingCountExact).toBeCloseTo(2);
  });

  it('V1 and V2 produce different iron-ore consumption for the same output target', () => {
    const v1 = calculateFromTarget('iron-plate', 60, { recipes: ALL_RECIPES });
    const v2 = calculateFromTarget('iron-plate', 60, {
      recipes: ALL_RECIPES,
      activeRecipes: { 'iron-plate': 'smelt-iron-v2' },
    });
    // Both happen to need 90 ore here, but building counts differ (3 vs 2).
    expect(v1!.buildingCount).not.toBe(v2!.buildingCount);
    expect(v1!.buildingTier).toBe('V1');
    expect(v2!.buildingTier).toBe('V2');
  });
});
