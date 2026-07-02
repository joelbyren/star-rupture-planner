import { describe, it, expect, vi } from 'vitest';
import { machinePower, graphPower, type PowerNode } from './power.ts';

describe('machinePower', () => {
  it('looks up a known machine/tier', () => {
    expect(machinePower('Fabricator', 'V1')).toBe(10);
    expect(machinePower('Fabricator', 'V2')).toBe(10);
  });

  it('unknown machine returns 0 and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(machinePower('Nonexistent Machine', 'V1')).toBe(0);
    warn.mockRestore();
  });
});

describe('graphPower', () => {
  it('production node: buildingCount × machinePower', () => {
    const nodes: PowerNode[] = [{ kind: 'production', recipeId: 'recipe_sheet_calcite', buildingCount: 3 }];
    expect(graphPower(nodes)).toBe(30); // 3 Fabricators × 10 kW
  });

  it('raw node counts as exactly one extractor regardless of custom rate', () => {
    const nodes: PowerNode[] = [{ kind: 'raw', itemId: 'gas_helium3', extractorVersion: 'V2' }];
    expect(graphPower(nodes)).toBe(10); // 1 Helium Extractor V2 × 10 kW
  });

  it('raw node defaults to V1 when extractorVersion is absent', () => {
    const nodes: PowerNode[] = [{ kind: 'raw', itemId: 'ore_titanium' }];
    expect(graphPower(nodes)).toBe(10);
  });

  it('recurses into nested factories', () => {
    const nodes: PowerNode[] = [
      {
        kind: 'factory',
        inner: [
          { kind: 'production', recipeId: 'recipe_comp_glass', buildingCount: 2 },
          {
            kind: 'factory',
            inner: [{ kind: 'raw', itemId: 'ore_sulfur', extractorVersion: 'V1' }],
          },
        ],
      },
    ];
    expect(graphPower(nodes)).toBe(30); // 2 Furnaces × 10 + 1 Sulphur Extractor × 10
  });

  it('unknown recipe id contributes 0', () => {
    const nodes: PowerNode[] = [{ kind: 'production', recipeId: 'not_a_real_recipe', buildingCount: 5 }];
    expect(graphPower(nodes)).toBe(0);
  });

  it('sums across a mixed list', () => {
    const nodes: PowerNode[] = [
      { kind: 'production', recipeId: 'recipe_sheet_calcite', buildingCount: 1 },
      { kind: 'raw', itemId: 'fluid_crude_oil', extractorVersion: 'V1' },
    ];
    expect(graphPower(nodes)).toBe(20);
  });
});
