import { describe, it, expect, vi } from 'vitest';
import { machinePower, graphPower, type PowerNode } from './power.ts';

describe('machinePower', () => {
  it('looks up a known machine/tier', () => {
    expect(machinePower('Fabricator', 'V1')).toBe(10);
    expect(machinePower('Fabricator', 'V2')).toBe(25);
  });

  it('unknown machine returns 0 and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(machinePower('Nonexistent Machine', 'V1')).toBe(0);
    warn.mockRestore();
  });
});

describe('graphPower', () => {
  it('production node: buildingCount × machinePower', () => {
    const nodes: PowerNode[] = [{ kind: 'production', recipeId: 'recipe_crafter_titanium-sheet', buildingCount: 3 }];
    expect(graphPower(nodes)).toBe(30); // 3 Fabricators × 10 MW
  });

  it('raw node counts as exactly one extractor regardless of custom rate', () => {
    const nodes: PowerNode[] = [{ kind: 'raw', itemId: 'helium-ore', extractorVersion: 'V2' }];
    expect(graphPower(nodes)).toBe(15); // 1 Helium-3 Extractor × 15 MW (no V2 building → V1 value)
  });

  it('raw node defaults to V1 when extractorVersion is absent', () => {
    const nodes: PowerNode[] = [{ kind: 'raw', itemId: 'titanium-ore' }];
    expect(graphPower(nodes)).toBe(5); // 1 Ore Excavator V1 × 5 MW
  });

  it('recurses into nested factories', () => {
    const nodes: PowerNode[] = [
      {
        kind: 'factory',
        inner: [
          { kind: 'production', recipeId: 'recipe_furnace_glass', buildingCount: 2 },
          {
            kind: 'factory',
            inner: [{ kind: 'raw', itemId: 'sulphur-ore', extractorVersion: 'V1' }],
          },
        ],
      },
    ];
    expect(graphPower(nodes)).toBe(80); // 2 Furnaces × 20 + 1 Sulfur Extractor × 40
  });

  it('unknown recipe id contributes 0', () => {
    const nodes: PowerNode[] = [{ kind: 'production', recipeId: 'not_a_real_recipe', buildingCount: 5 }];
    expect(graphPower(nodes)).toBe(0);
  });

  it('sums across a mixed list', () => {
    const nodes: PowerNode[] = [
      { kind: 'production', recipeId: 'recipe_crafter_titanium-sheet', buildingCount: 1 },
      { kind: 'raw', itemId: 'magic-oil-ore', extractorVersion: 'V1' },
    ];
    expect(graphPower(nodes)).toBe(410); // 1 Fabricator × 10 + 1 Oil Extractor × 400
  });
});
