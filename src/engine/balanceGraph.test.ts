import { describe, it, expect } from 'vitest';
import { balanceGraph, balanceTree, type BalanceResult, type FactoryBalanceResult } from './balanceGraph.ts';
import type { Recipe } from './types.ts';

/** Narrowing helper for the item/raw cases (non-factory results). */
const bal = (...args: Parameters<typeof balanceGraph>) =>
  balanceGraph(...args) as Record<string, BalanceResult>;

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
    const b = bal(nodes, edges, RECIPES);
    expect(b['n_rotor'].buildingCountExact).toBeCloseTo(1);
    expect(b['n_rotor'].outputRatePerMin).toBeCloseTo(10);
  });

  it('computes upstream building counts from recipe ratios', () => {
    const b = bal(nodes, edges, RECIPES);
    // Rotor needs 20 wire/min and 20 rod/min; each producer runs 30 IPM → 0.667 buildings.
    expect(b['n_wire'].buildingCountExact).toBeCloseTo(20 / 30);
    expect(b['n_rod'].buildingCountExact).toBeCloseTo(20 / 30);
    expect(b['n_wire'].outputRatePerMin).toBeCloseTo(20);
  });

  it('exposes per-ingredient demand on the consuming node', () => {
    const b = bal(nodes, edges, RECIPES);
    const rotorInputs = b['n_rotor'].inputs;
    expect(rotorInputs.find(i => i.itemId === 'wire_wolfram')!.neededPerMin).toBeCloseTo(20);
    expect(rotorInputs.find(i => i.itemId === 'rod_titanium')!.neededPerMin).toBeCloseTo(20);
  });

  it('treats a node with no recipe as raw (no inputs, demand = needed supply)', () => {
    const withRaw = [...nodes, { id: 'n_ore', itemId: 'ore_wolfram', recipeId: null }];
    // Wire now pulls from an ore node (ratio 1 ingot... here simplified: ore feeds wire handle directly)
    const withRawEdges = [...edges, { source: 'n_ore', target: 'n_wire', targetHandle: 'ingot_wolfram' }];
    const b = bal(withRaw, withRawEdges, RECIPES);
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
    const r = bal(nodes, edges, [A, B]);
    // Pre-norm: A=1 building, B needs 10/min @ 2 IPM = 5 buildings (bottleneck, K=5).
    // After ÷5: B = 1, A = 0.2.
    expect(r['b'].buildingCountExact).toBeCloseTo(1);
    expect(r['a'].buildingCountExact).toBeCloseTo(0.2);
  });

  it('balanceTree equals balanceGraph for the Rotor example (backward compat)', () => {
    const nodes = [
      { id: 'n_rotor', itemId: 'comp_rotor', recipeId: 'recipe_comp_rotor' },
      { id: 'n_wire', itemId: 'wire_wolfram', recipeId: 'recipe_wire_wolfram' },
      { id: 'n_rod', itemId: 'rod_titanium', recipeId: 'recipe_rod_titanium' },
    ];
    const edges = [
      { source: 'n_wire', target: 'n_rotor', targetHandle: 'wire_wolfram' },
      { source: 'n_rod', target: 'n_rotor', targetHandle: 'rod_titanium' },
    ];
    expect(balanceTree(nodes, edges, RECIPES)).toEqual(balanceGraph(nodes, edges, RECIPES));
  });
});

// ----------------------- Factory (sub-factory) balance -----------------------
const BAR: Recipe = {
  id: 'recipe_bar', outputItemId: 'bar_titanium', machine: 'M', buildingTier: null, outputRatePerMin: 30,
  outputs: [{ itemId: 'bar_titanium', quantity: 1 }], inputs: [{ itemId: 'ingot_titanium', quantity: 1 }],
  confidence: null, lastVerified: null, sourceUrl: '',
};
const SMELT: Recipe = {
  id: 'recipe_smelt', outputItemId: 'ingot_titanium', machine: 'M', buildingTier: null, outputRatePerMin: 10,
  outputs: [{ itemId: 'ingot_titanium', quantity: 1 }], inputs: [{ itemId: 'ore_titanium', quantity: 1 }],
  confidence: null, lastVerified: null, sourceUrl: '',
};
const INGOT: Recipe = {
  id: 'recipe_ingot', outputItemId: 'ingot_titanium', machine: 'M', buildingTier: null, outputRatePerMin: 30,
  outputs: [{ itemId: 'ingot_titanium', quantity: 1 }], inputs: [],
  confidence: null, lastVerified: null, sourceUrl: '',
};
const ASM = (barQty: number): Recipe => ({
  id: 'recipe_asm', outputItemId: 'asm', machine: 'M', buildingTier: null, outputRatePerMin: 10,
  outputs: [{ itemId: 'asm', quantity: 1 }], inputs: [{ itemId: 'bar_titanium', quantity: barQty }],
  confidence: null, lastVerified: null, sourceUrl: '',
});
const FAC_RECIPES = [BAR, SMELT, INGOT, ASM(2)];

/** A factory that makes bar_titanium from an ingot_titanium input port. */
const barFactory = (id: string) => ({
  id, itemId: '', recipeId: null, kind: 'factory' as const,
  factory: {
    inputs: [{ portId: 'PIN', itemId: 'ingot_titanium', handleId: 'port-in-PIN', innerNodeId: 'port-in-PIN' }],
    outputs: [{ portId: 'POUT', itemId: 'bar_titanium', handleId: 'port-out-POUT', innerNodeId: 'i_bar' }],
    inner: {
      nodes: [
        { id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar' },
        { id: 'port-in-PIN', itemId: 'ingot_titanium', recipeId: null },
      ],
      edges: [
        { source: 'port-in-PIN', target: 'i_bar', targetHandle: 'ingot_titanium' },
        { source: 'i_bar', target: 'port-out-POUT', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' },
      ],
    },
  },
});

describe('balanceGraph — demand-driven (inner) mode', () => {
  it('anchors output at an absolute rate with no normalization (counts may exceed 1)', () => {
    const r = bal([{ id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar' }], [], FAC_RECIPES,
      { anchors: { i_bar: 200 }, normalize: false });
    expect(r['i_bar'].outputRatePerMin).toBeCloseTo(200);
    expect(r['i_bar'].buildingCountExact).toBeCloseTo(200 / 30); // 6.67, NOT normalized to 1
  });

  it('keeps a multi-building inner chain absolute', () => {
    const nodes = [
      { id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar' },
      { id: 'i_smelt', itemId: 'ingot_titanium', recipeId: 'recipe_smelt' },
      { id: 'i_in', itemId: 'ore_titanium', recipeId: null },
    ];
    const edges = [
      { source: 'i_smelt', target: 'i_bar', targetHandle: 'ingot_titanium' },
      { source: 'i_in', target: 'i_smelt', targetHandle: 'ore_titanium' },
    ];
    const r = bal(nodes, edges, FAC_RECIPES, { anchors: { i_bar: 20 }, normalize: false });
    expect(r['i_bar'].buildingCountExact).toBeCloseTo(20 / 30);
    expect(r['i_smelt'].buildingCountExact).toBeCloseTo(2); // 20/min @ 10 IPM, not divided by the bottleneck
    expect(r['i_in'].outputRatePerMin).toBeCloseTo(20);
  });
});

describe('balanceGraph — factory nodes', () => {
  it('sets output-port demand from parent consumers and surfaces the input requirement', () => {
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, barFactory('F')];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    const r = balanceTree(nodes, edges, FAC_RECIPES);

    expect((r['n_asm'] as BalanceResult).buildingCountExact).toBeCloseTo(1);
    const fr = r['F'] as FactoryBalanceResult;
    expect(fr.isFactory).toBe(true);
    expect(fr.buildingCount).toBe(0);
    expect(fr.outputPorts[0].ratePerMin).toBeCloseTo(20); // asm needs 2×10 = 20 bar/min
    expect(fr.inputPorts[0].ratePerMin).toBeCloseTo(20);   // 1 ingot per bar → 20 ingot/min
    expect((fr.inner['i_bar'] as BalanceResult).buildingCountExact).toBeCloseTo(20 / 30);
  });

  it('scales the inner graph above 1 building while the outer end product stays at 1', () => {
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, barFactory('F')];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    // asm needs 20 bars each → output demand 200/min → inner 6.67 buildings.
    const r = balanceTree(nodes, edges, [BAR, SMELT, INGOT, ASM(20)]);
    expect((r['n_asm'] as BalanceResult).buildingCountExact).toBeCloseTo(1);
    const fr = r['F'] as FactoryBalanceResult;
    expect(fr.buildingCount).toBe(0);
    expect((fr.inner['i_bar'] as BalanceResult).buildingCountExact).toBeGreaterThan(1);
    expect((fr.inner['i_bar'] as BalanceResult).buildingCountExact).toBeCloseTo(200 / 30);
  });

  it('propagates the input requirement onto an upstream parent producer', () => {
    const nodes = [
      { id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' },
      barFactory('F'),
      { id: 'n_ingot', itemId: 'ingot_titanium', recipeId: 'recipe_ingot' },
    ];
    const edges = [
      { source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' },
      { source: 'n_ingot', target: 'F', targetHandle: 'port-in-PIN' },
    ];
    const r = balanceTree(nodes, edges, FAC_RECIPES);
    expect((r['n_ingot'] as BalanceResult).outputRatePerMin).toBeCloseTo(20);
  });

  it('treats UNSET ports as inert (zero demand, no NaN)', () => {
    const unset = {
      id: 'F', itemId: '', recipeId: null, kind: 'factory' as const,
      factory: {
        inputs: [{ portId: 'PIN', itemId: null, handleId: 'port-in-PIN', innerNodeId: 'port-in-PIN' }],
        outputs: [{ portId: 'POUT', itemId: null, handleId: 'port-out-POUT', innerNodeId: undefined }],
        inner: { nodes: [{ id: 'port-in-PIN', itemId: '', recipeId: null }], edges: [] },
      },
    };
    const r = balanceTree([unset], [], FAC_RECIPES);
    const fr = r['F'] as FactoryBalanceResult;
    expect(fr.outputPorts[0].ratePerMin).toBe(0);
    expect(fr.inputPorts[0].ratePerMin).toBe(0);
    expect(Number.isNaN(fr.outputPorts[0].ratePerMin)).toBe(false);
  });

  it('recurses through nested factories (depth 2)', () => {
    // F makes bar; inside F a nested factory G smelts ingot from ore.
    const G = {
      id: 'G', itemId: '', recipeId: null, kind: 'factory' as const,
      factory: {
        inputs: [{ portId: 'GIN', itemId: 'ore_titanium', handleId: 'port-in-GIN', innerNodeId: 'port-in-GIN' }],
        outputs: [{ portId: 'GOUT', itemId: 'ingot_titanium', handleId: 'port-out-GOUT', innerNodeId: 'g_smelt' }],
        inner: {
          nodes: [
            { id: 'g_smelt', itemId: 'ingot_titanium', recipeId: 'recipe_smelt' },
            { id: 'port-in-GIN', itemId: 'ore_titanium', recipeId: null },
          ],
          edges: [
            { source: 'port-in-GIN', target: 'g_smelt', targetHandle: 'ore_titanium' },
            { source: 'g_smelt', target: 'port-out-GOUT', sourceHandle: 'port-out-GOUT' },
          ],
        },
      },
    };
    const F = {
      id: 'F', itemId: '', recipeId: null, kind: 'factory' as const,
      factory: {
        inputs: [],
        outputs: [{ portId: 'POUT', itemId: 'bar_titanium', handleId: 'port-out-POUT', innerNodeId: 'i_bar' }],
        inner: {
          nodes: [{ id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar' }, G],
          edges: [
            { source: 'G', target: 'i_bar', sourceHandle: 'port-out-GOUT', targetHandle: 'ingot_titanium' },
            { source: 'i_bar', target: 'port-out-POUT', sourceHandle: 'port-out-POUT' },
          ],
        },
      },
    };
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, F];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    const r = balanceTree(nodes, edges, FAC_RECIPES);

    const frF = r['F'] as FactoryBalanceResult;
    const frG = frF.inner['G'] as FactoryBalanceResult;
    expect((frF.inner['i_bar'] as BalanceResult).buildingCountExact).toBeCloseTo(20 / 30);
    expect((frG.inner['g_smelt'] as BalanceResult).buildingCountExact).toBeCloseTo(2); // 20 ingot/min @ 10 IPM
    expect(frG.inputPorts[0].ratePerMin).toBeCloseTo(20); // ore requirement bubbles up
  });
});
