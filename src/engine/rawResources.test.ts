import { describe, it, expect } from 'vitest';
import { calcSupplyRate } from './rawResources.ts';
import type { RawResourceConfig } from './types.ts';

describe('calcSupplyRate', () => {
  it('calculated mode returns purity × version table', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1' };
    expect(calcSupplyRate('titanium-ore', config)).toBeCloseTo(120);
    // pure ×2 · V2 ×2.5 → 120 × 5 = 600
    expect(calcSupplyRate('titanium-ore', { purity: 'pure', extractorVersion: 'V2' })).toBeCloseTo(600);
  });

  it('uses the measured per-resource base rates', () => {
    const v1: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1' };
    expect(calcSupplyRate('helium-ore', v1)).toBeCloseTo(240);
    expect(calcSupplyRate('magic-oil-ore', v1)).toBeCloseTo(10);
    expect(calcSupplyRate('goethite-ore', v1)).toBeCloseTo(15);
  });

  it('custom mode returns customRatePerMin', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1', mode: 'custom', customRatePerMin: 240 };
    expect(calcSupplyRate('titanium-ore', config)).toBe(240);
  });

  it('custom mode with missing rate returns 0', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1', mode: 'custom' };
    expect(calcSupplyRate('titanium-ore', config)).toBe(0);
  });
});
