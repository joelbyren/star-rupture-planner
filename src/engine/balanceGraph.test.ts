import { describe, it, expect } from 'vitest';
import { balanceGraph, balanceTree, type BalanceResult, type FactoryBalanceResult } from './balanceGraph.ts';
import type { Recipe } from './types.ts';

/** Narrowing helper for the item/raw cases (non-factory results). */
const bal = (...args: Parameters<typeof balanceGraph>) =>
  balanceGraph(...args) as Record<string, BalanceResult>;

/** Narrows a Record lookup for test assertions — throws with a clear message if the key is absent. */
function at<T>(record: Record<string, T>, key: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`Expected an entry for "${key}"`);
  return value;
}

/** Narrows an array index for test assertions — throws with a clear message if out of range. */
function nth<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) throw new Error(`Expected an element at index ${index}`);
  return value;
}

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
    expect(at(b, 'n_rotor').buildingCountExact).toBeCloseTo(1);
    expect(at(b, 'n_rotor').outputRatePerMin).toBeCloseTo(10);
  });

  it('computes upstream building counts from recipe ratios', () => {
    const b = bal(nodes, edges, RECIPES);
    // Rotor needs 20 wire/min and 20 rod/min; each producer runs 30 IPM → 0.667 buildings.
    expect(at(b, 'n_wire').buildingCountExact).toBeCloseTo(20 / 30);
    expect(at(b, 'n_rod').buildingCountExact).toBeCloseTo(20 / 30);
    expect(at(b, 'n_wire').outputRatePerMin).toBeCloseTo(20);
  });

  it('exposes per-ingredient demand on the consuming node', () => {
    const b = bal(nodes, edges, RECIPES);
    const rotorInputs = at(b, 'n_rotor').inputs;
    expect(rotorInputs.find(i => i.itemId === 'wire_wolfram')!.neededPerMin).toBeCloseTo(20);
    expect(rotorInputs.find(i => i.itemId === 'rod_titanium')!.neededPerMin).toBeCloseTo(20);
  });

  it('treats a node with no recipe as raw (no inputs, demand = needed supply)', () => {
    const withRaw = [...nodes, { id: 'n_ore', itemId: 'ore_wolfram', recipeId: null }];
    // Wire now pulls from an ore node (ratio 1 ingot... here simplified: ore feeds wire handle directly)
    const withRawEdges = [...edges, { source: 'n_ore', target: 'n_wire', targetHandle: 'ingot_wolfram' }];
    const b = bal(withRaw, withRawEdges, RECIPES);
    expect(at(b, 'n_ore').isRaw).toBe(true);
    expect(at(b, 'n_ore').inputs).toHaveLength(0);
    expect(at(b, 'n_ore').buildingCount).toBe(0);
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
    expect(at(r, 'b').buildingCountExact).toBeCloseTo(1);
    expect(at(r, 'a').buildingCountExact).toBeCloseTo(0.2);
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
    expect(at(r, 'i_bar').outputRatePerMin).toBeCloseTo(200);
    expect(at(r, 'i_bar').buildingCountExact).toBeCloseTo(200 / 30); // 6.67, NOT normalized to 1
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
    expect(at(r, 'i_bar').buildingCountExact).toBeCloseTo(20 / 30);
    expect(at(r, 'i_smelt').buildingCountExact).toBeCloseTo(2); // 20/min @ 10 IPM, not divided by the bottleneck
    expect(at(r, 'i_in').outputRatePerMin).toBeCloseTo(20);
  });
});

describe('balanceGraph — factory nodes', () => {
  it('sets output-port demand from parent consumers and surfaces the input requirement', () => {
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, barFactory('F')];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    const r = balanceTree(nodes, edges, FAC_RECIPES);

    expect((at(r, 'n_asm') as BalanceResult).buildingCountExact).toBeCloseTo(1);
    const fr = at(r, 'F') as FactoryBalanceResult;
    expect(fr.isFactory).toBe(true);
    expect(fr.buildingCount).toBe(0);
    expect(nth(fr.outputPorts, 0).ratePerMin).toBeCloseTo(20); // asm needs 2×10 = 20 bar/min
    expect(nth(fr.inputPorts, 0).ratePerMin).toBeCloseTo(20);   // 1 ingot per bar → 20 ingot/min
    expect((at(fr.inner, 'i_bar') as BalanceResult).buildingCountExact).toBeCloseTo(20 / 30);
  });

  it('scales the inner graph above 1 building while the outer end product stays at 1', () => {
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, barFactory('F')];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    // asm needs 20 bars each → output demand 200/min → inner 6.67 buildings.
    const r = balanceTree(nodes, edges, [BAR, SMELT, INGOT, ASM(20)]);
    expect((at(r, 'n_asm') as BalanceResult).buildingCountExact).toBeCloseTo(1);
    const fr = at(r, 'F') as FactoryBalanceResult;
    expect(fr.buildingCount).toBe(0);
    expect((at(fr.inner, 'i_bar') as BalanceResult).buildingCountExact).toBeGreaterThan(1);
    expect((at(fr.inner, 'i_bar') as BalanceResult).buildingCountExact).toBeCloseTo(200 / 30);
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
    expect((at(r, 'n_ingot') as BalanceResult).outputRatePerMin).toBeCloseTo(20);
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
    const fr = at(r, 'F') as FactoryBalanceResult;
    expect(nth(fr.outputPorts, 0).ratePerMin).toBe(0);
    expect(nth(fr.inputPorts, 0).ratePerMin).toBe(0);
    expect(Number.isNaN(nth(fr.outputPorts, 0).ratePerMin)).toBe(false);
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

    const frF = at(r, 'F') as FactoryBalanceResult;
    const frG = at(frF.inner, 'G') as FactoryBalanceResult;
    expect((at(frF.inner, 'i_bar') as BalanceResult).buildingCountExact).toBeCloseTo(20 / 30);
    expect((at(frG.inner, 'g_smelt') as BalanceResult).buildingCountExact).toBeCloseTo(2); // 20 ingot/min @ 10 IPM
    expect(nth(frG.inputPorts, 0).ratePerMin).toBeCloseTo(20); // ore requirement bubbles up
  });
});

describe('balanceGraph — hard limits', () => {
  it('no limits set → normalization unchanged (regression)', () => {
    const nodes = [
      { id: 'a', itemId: 'A', recipeId: 'rA' },
      { id: 'b', itemId: 'B', recipeId: 'rB' },
    ];
    const A: Recipe = {
      id: 'rA', outputItemId: 'A', machine: 'M', buildingTier: null, outputRatePerMin: 10,
      outputs: [{ itemId: 'A', quantity: 1 }], inputs: [{ itemId: 'B', quantity: 1 }],
      confidence: null, lastVerified: null, sourceUrl: '',
    };
    const B: Recipe = {
      id: 'rB', outputItemId: 'B', machine: 'M', buildingTier: null, outputRatePerMin: 2,
      outputs: [{ itemId: 'B', quantity: 1 }], inputs: [], confidence: null, lastVerified: null, sourceUrl: '',
    };
    const edges = [{ source: 'b', target: 'a', targetHandle: 'B' }];
    const r = bal(nodes, edges, [A, B]);
    expect(at(r, 'b').buildingCountExact).toBeCloseTo(1);
    expect(at(r, 'a').buildingCountExact).toBeCloseTo(0.2);
    expect(at(r, 'a').isLimitBinding).toBeUndefined();
  });

  const A: Recipe = {
    id: 'rA', outputItemId: 'A', machine: 'M', buildingTier: null, outputRatePerMin: 10,
    outputs: [{ itemId: 'A', quantity: 1 }], inputs: [{ itemId: 'B', quantity: 1 }],
    confidence: null, lastVerified: null, sourceUrl: '',
  };
  const B: Recipe = {
    id: 'rB', outputItemId: 'B', machine: 'M', buildingTier: null, outputRatePerMin: 2,
    outputs: [{ itemId: 'B', quantity: 1 }], inputs: [], confidence: null, lastVerified: null, sourceUrl: '',
  };
  const abNodes = (bLimit: number, aLimit?: number) => [
    { id: 'a', itemId: 'A', recipeId: 'rA', hardLimit: aLimit },
    { id: 'b', itemId: 'B', recipeId: 'rB', hardLimit: bLimit },
  ];
  const abEdges = [{ source: 'b', target: 'a', targetHandle: 'B' }];

  it('scales DOWN to a production limit', () => {
    // Relative solution: a=1 building (10/min A → 10/min B demand), b relative rate 10.
    const r = bal(abNodes(1), abEdges, [A, B]);
    expect(at(r, 'b').outputRatePerMin).toBeCloseTo(1);
    expect(at(r, 'a').outputRatePerMin).toBeCloseTo(1);
    expect(at(r, 'b').isLimitBinding).toBe(true);
    expect(at(r, 'b').hardLimitPerMin).toBe(1);
  });

  it('scales UP past 1 building', () => {
    const r = bal(abNodes(20), abEdges, [A, B]);
    expect(at(r, 'b').buildingCountExact).toBeCloseTo(10);
    expect(at(r, 'a').buildingCountExact).toBeCloseTo(2);
    expect(at(r, 'b').isLimitBinding).toBe(true);
  });

  it('most restrictive of several limits wins; only it is binding', () => {
    // relative demand: b = 10, a(building) relative demand-based rate = 10 (outputRatePerMin).
    // limit on a with ratio 3 (limit 30) vs limit on b with ratio 1 (limit 10) → b's ratio wins.
    const r = bal(abNodes(10, 30), abEdges, [A, B]);
    expect(at(r, 'b').isLimitBinding).toBe(true);
    expect(at(r, 'a').isLimitBinding).toBe(false);
    expect(at(r, 'a').outputRatePerMin).toBeLessThan(at(r, 'a').hardLimitPerMin!);
  });

  it('equal ratios → both marked binding', () => {
    // relative: b=10, a=10 (outputRatePerMin both 10 pre-scale... a's relative demand equals its own anchor 10)
    const r = bal(abNodes(10, 10), abEdges, [A, B]);
    expect(at(r, 'b').isLimitBinding).toBe(true);
    expect(at(r, 'a').isLimitBinding).toBe(true);
  });

  it('raw-node limit constrains its consumers (rotor fixture)', () => {
    const withRaw = [
      { id: 'n_rotor', itemId: 'comp_rotor', recipeId: 'recipe_comp_rotor' },
      { id: 'n_wire', itemId: 'wire_wolfram', recipeId: 'recipe_wire_wolfram' },
      { id: 'n_rod', itemId: 'rod_titanium', recipeId: 'recipe_rod_titanium' },
      { id: 'n_ore', itemId: 'ore_wolfram', recipeId: null, hardLimit: 10 },
    ];
    const withRawEdges = [
      { source: 'n_wire', target: 'n_rotor', targetHandle: 'wire_wolfram' },
      { source: 'n_rod', target: 'n_rotor', targetHandle: 'rod_titanium' },
      { source: 'n_ore', target: 'n_wire', targetHandle: 'ingot_wolfram' },
    ];
    const r = bal(withRaw, withRawEdges, RECIPES);
    expect(at(r, 'n_ore').outputRatePerMin).toBeCloseTo(10);
    expect(at(r, 'n_ore').isLimitBinding).toBe(true);
  });

  it('limit on a disconnected/zero-demand node is ignored → falls back to normalization', () => {
    const nodes = [
      { id: 'a', itemId: 'A', recipeId: 'rA' },
      { id: 'b', itemId: 'B', recipeId: 'rB' },
      { id: 'orphan', itemId: 'C', recipeId: null, hardLimit: 50 },
    ];
    const r = bal(nodes, abEdges, [A, B]);
    expect(at(r, 'b').buildingCountExact).toBeCloseTo(1);
    expect(at(r, 'a').buildingCountExact).toBeCloseTo(0.2);
    expect(at(r, 'orphan').isLimitBinding).toBeFalsy();
  });

  it('limit inside a factory constrains the parent', () => {
    const F = {
      id: 'F', itemId: '', recipeId: null, kind: 'factory' as const,
      factory: {
        inputs: [{ portId: 'PIN', itemId: 'ingot_titanium', handleId: 'port-in-PIN', innerNodeId: 'port-in-PIN' }],
        outputs: [{ portId: 'POUT', itemId: 'bar_titanium', handleId: 'port-out-POUT', innerNodeId: 'i_bar' }],
        inner: {
          nodes: [
            { id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar', hardLimit: 10 },
            { id: 'port-in-PIN', itemId: 'ingot_titanium', recipeId: null },
          ],
          edges: [
            { source: 'port-in-PIN', target: 'i_bar', targetHandle: 'ingot_titanium' },
            { source: 'i_bar', target: 'port-out-POUT', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' },
          ],
        },
      },
    };
    const nodes = [{ id: 'n_asm', itemId: 'asm', recipeId: 'recipe_asm' }, F];
    const edges = [{ source: 'F', target: 'n_asm', sourceHandle: 'port-out-POUT', targetHandle: 'bar_titanium' }];
    const r = balanceTree(nodes, edges, FAC_RECIPES);
    expect((at(r, 'n_asm') as BalanceResult).buildingCountExact).toBeCloseTo(0.5);
    expect((at(r, 'n_asm') as BalanceResult).outputRatePerMin).toBeCloseTo(5);
    const fr = at(r, 'F') as FactoryBalanceResult;
    expect((at(fr.inner, 'i_bar') as BalanceResult).outputRatePerMin).toBeCloseTo(10);
    expect((at(fr.inner, 'i_bar') as BalanceResult).isLimitBinding).toBe(true);
    expect(nth(fr.inputPorts, 0).ratePerMin).toBeCloseTo(10);
  });

  it('limit two factories deep', () => {
    const G = {
      id: 'G', itemId: '', recipeId: null, kind: 'factory' as const,
      factory: {
        inputs: [{ portId: 'GIN', itemId: 'ore_titanium', handleId: 'port-in-GIN', innerNodeId: 'port-in-GIN' }],
        outputs: [{ portId: 'GOUT', itemId: 'ingot_titanium', handleId: 'port-out-GOUT', innerNodeId: 'g_smelt' }],
        inner: {
          nodes: [
            { id: 'g_smelt', itemId: 'ingot_titanium', recipeId: 'recipe_smelt', hardLimit: 10 },
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
    // Relative: g_smelt at 20 ingot/min (from earlier nested test). Limit 10 → scale 0.5.
    const frF = at(r, 'F') as FactoryBalanceResult;
    const frG = at(frF.inner, 'G') as FactoryBalanceResult;
    expect((at(r, 'n_asm') as BalanceResult).buildingCountExact).toBeCloseTo(0.5);
    expect((at(frG.inner, 'g_smelt') as BalanceResult).isLimitBinding).toBe(true);
    expect((at(frG.inner, 'g_smelt') as BalanceResult).outputRatePerMin).toBeCloseTo(10);
  });

  it('inner solves (normalize: false) don\'t apply limit scaling', () => {
    const r = bal([{ id: 'i_bar', itemId: 'bar_titanium', recipeId: 'recipe_bar', hardLimit: 50 }], [], FAC_RECIPES,
      { anchors: { i_bar: 200 }, normalize: false });
    expect(at(r, 'i_bar').outputRatePerMin).toBeCloseTo(200); // anchor wins, limit ignored
    expect(at(r, 'i_bar').hardLimitPerMin).toBe(50);
    expect(at(r, 'i_bar').isLimitBinding).not.toBe(true);
  });

  it('cycle containing a limited node → finite results, no NaN', () => {
    const CYCLE_RECIPE: Recipe = {
      id: 'rCyc', outputItemId: 'X', machine: 'M', buildingTier: null, outputRatePerMin: 10,
      outputs: [{ itemId: 'X', quantity: 1 }], inputs: [{ itemId: 'X', quantity: 1 }],
      confidence: null, lastVerified: null, sourceUrl: '',
    };
    const nodes = [{ id: 'x', itemId: 'X', recipeId: 'rCyc', hardLimit: 5 }];
    const edges = [{ source: 'x', target: 'x', targetHandle: 'X' }];
    const r = bal(nodes, edges, [CYCLE_RECIPE]);
    expect(Number.isFinite(at(r, 'x').outputRatePerMin)).toBe(true);
    expect(Number.isNaN(at(r, 'x').outputRatePerMin)).toBe(false);
  });
});
