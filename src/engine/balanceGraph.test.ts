import { describe, it, expect } from 'vitest';
import { balanceGraph } from './balanceGraph.ts';
import type { Recipe } from './types.ts';

// Rotor V1 chain (real scraped values):
//   Rotor:        Fabricator, 10 IPM, out rotor ×1, in wire_wolfram ×2, rod_titanium ×2
//   Wire Wolfram: Fabricator, 30 IPM, out wire ×2,  in ingot_wolfram ×1
//   Rod Titanium: Fabricator, 30 IPM, out rod ×1,   in ingot_titanium ×1
const ROTOR: Recipe = {
  id: 'recipe_comp_rotor', outputItemId: 'comp_rotor', machine: 'Fabricator', buildingTier: null,
  outputRatePerMin: 10, outputs: [{ itemId: 'comp_rotor', quantity: 1 }],
  inputs: [{ itemId: 'wire_wolfram', quantity: 2 }, { itemId: 'rod_titanium', quantity: 2 }],
  confidence: null, lastVerified: null, sourceUrl: '',
};
const WIRE: Recipe = {
  id: 'recipe_wire_wolfram', outputItemId: 'wire_wolfram', machine: 'Fabricator', buildingTier: null,
  outputRatePerMin: 30, outputs: [{ itemId: 'wire_wolfram', quantity: 2 }],
  inputs: [{ itemId: 'ingot_wolfram', quantity: 1 }], confidence: null, lastVerified: null, sourceUrl: '',
};
const ROD: Recipe = {
  id: 'recipe_rod_titanium', outputItemId: 'rod_titanium', machine: 'Fabricator', buildingTier: null,
  outputRatePerMin: 30, outputs: [{ itemId: 'rod_titanium', quantity: 1 }],
  inputs: [{ itemId: 'ingot_titanium', quantity: 1 }], confidence: null, lastVerified: null, sourceUrl: '',
};
const RECIPES = [ROTOR, WIRE, ROD];

describe('balanceGraph — Rotor V1 worked example', () => {
  // Producer → consumer edges; targetHandle = the ingredient itemId it feeds.
  const nodes = [
    { id: 'n_rotor', itemId: 'comp_rotor', recipeId: 'recipe_comp_rotor' },
    { id: 'n_wire', itemId: 'wire_wolfram', recipeId: 'recipe_wire_wolfram' },
    { id: 'n_rod', itemId: 'rod_titanium', recipeId: 'recipe_rod_titanium' },
  ];
  const edges = [
    { source: 'n_wire', target: 'n_rotor', targetHandle: 'wire_wolfram' },
    { source: 'n_rod', target: 'n_rotor', targetHandle: 'rod_titanium' },
  ];

  it('anchors the end product (Rotor) at 1 building', () => {
    const b = balanceGraph(nodes, edges, RECIPES);
    expect(b['n_rotor'].buildingCountExact).toBeCloseTo(1);
    expect(b['n_rotor'].outputRatePerMin).toBeCloseTo(10);
  });

  it('computes upstream building counts from recipe ratios', () => {
    const b = balanceGraph(nodes, edges, RECIPES);
    // Rotor needs 20 wire/min and 20 rod/min; each producer runs 30 IPM → 0.667 buildings.
    expect(b['n_wire'].buildingCountExact).toBeCloseTo(20 / 30);
    expect(b['n_rod'].buildingCountExact).toBeCloseTo(20 / 30);
    expect(b['n_wire'].outputRatePerMin).toBeCloseTo(20);
  });

  it('exposes per-ingredient demand on the consuming node', () => {
    const b = balanceGraph(nodes, edges, RECIPES);
    const rotorInputs = b['n_rotor'].inputs;
    expect(rotorInputs.find(i => i.itemId === 'wire_wolfram')!.neededPerMin).toBeCloseTo(20);
    expect(rotorInputs.find(i => i.itemId === 'rod_titanium')!.neededPerMin).toBeCloseTo(20);
  });

  it('treats a node with no recipe as raw (no inputs, demand = needed supply)', () => {
    const withRaw = [...nodes, { id: 'n_ore', itemId: 'ore_wolfram', recipeId: null }];
    // Wire now pulls from an ore node (ratio 1 ingot... here simplified: ore feeds wire handle directly)
    const withRawEdges = [...edges, { source: 'n_ore', target: 'n_wire', targetHandle: 'ingot_wolfram' }];
    const b = balanceGraph(withRaw, withRawEdges, RECIPES);
    expect(b['n_ore'].isRaw).toBe(true);
    expect(b['n_ore'].inputs).toHaveLength(0);
    expect(b['n_ore'].buildingCount).toBe(0);
  });
});

describe('balanceGraph — normalization to the bottleneck', () => {
  // A (end): 10 IPM, in B ×1. B: a slow 2 IPM producer (the bottleneck).
  const A: Recipe = {
    id: 'rA', outputItemId: 'A', machine: 'M', buildingTier: null, outputRatePerMin: 10,
    outputs: [{ itemId: 'A', quantity: 1 }], inputs: [{ itemId: 'B', quantity: 1 }],
    confidence: null, lastVerified: null, sourceUrl: '',
  };
  const B: Recipe = {
    id: 'rB', outputItemId: 'B', machine: 'M', buildingTier: null, outputRatePerMin: 2,
    outputs: [{ itemId: 'B', quantity: 1 }], inputs: [], confidence: null, lastVerified: null, sourceUrl: '',
  };

  it('scales so the most-demanded node becomes 1 building, others < 1', () => {
    const nodes = [
      { id: 'a', itemId: 'A', recipeId: 'rA' },
      { id: 'b', itemId: 'B', recipeId: 'rB' },
    ];
    const edges = [{ source: 'b', target: 'a', targetHandle: 'B' }];
    const r = balanceGraph(nodes, edges, [A, B]);
    // Pre-norm: A=1 building, B needs 10/min @ 2 IPM = 5 buildings (bottleneck, K=5).
    // After ÷5: B = 1, A = 0.2.
    expect(r['b'].buildingCountExact).toBeCloseTo(1);
    expect(r['a'].buildingCountExact).toBeCloseTo(0.2);
  });
});
