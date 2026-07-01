import { describe, it, expect } from 'vitest';
import { calcSupplyRate } from './rawResources.ts';
import type { RawResourceConfig } from './types.ts';

describe('calcSupplyRate', () => {
  it('calculated mode returns purity × version table', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1' };
    expect(calcSupplyRate('ore_titanium', config)).toBeCloseTo(120);
    expect(calcSupplyRate('ore_titanium', { purity: 'pure', extractorVersion: 'V2' })).toBeCloseTo(480);
  });

  it('custom mode returns customRatePerMin', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1', mode: 'custom', customRatePerMin: 240 };
    expect(calcSupplyRate('ore_titanium', config)).toBe(240);
  });

  it('custom mode with missing rate returns 0', () => {
    const config: RawResourceConfig = { purity: 'normal', extractorVersion: 'V1', mode: 'custom' };
    expect(calcSupplyRate('ore_titanium', config)).toBe(0);
  });
});
