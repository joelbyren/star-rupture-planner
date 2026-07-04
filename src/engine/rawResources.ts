import type { RawResourceConfig } from './types.ts';

/** Extractor machine name per raw resource. */
const MACHINE_NAMES: Record<string, string> = {
  gas_helium3: 'Helium Extractor',
  ore_sulfur: 'Sulphur Extractor',
  fluid_crude_oil: 'Oil Pump',
};
const DEFAULT_MACHINE = 'Ore Extractor';

export function machineForResource(itemId: string): string {
  return MACHINE_NAMES[itemId] ?? DEFAULT_MACHINE;
}

/** Normal-purity, V1-extractor rate for each raw resource (items/min). */
const BASE_RATES: Record<string, number> = {
  gas_helium3: 240,
  ore_titanium: 120,
  ore_wolfram: 120,
  ore_calcium: 120,
  ore_goethite: 120,
  ore_sulfur: 120,
  fluid_crude_oil: 120,
};

const DEFAULT_BASE_RATE = 120;

const PURITY_MULT: Record<string, number> = { impure: 0.5, normal: 1.0, pure: 2.0 };
const VERSION_MULT: Record<string, number> = { V1: 1.0, V2: 2.0 };

function baseRateForItem(itemId: string): number {
  return BASE_RATES[itemId] ?? DEFAULT_BASE_RATE;
}

export function calcSupplyRate(itemId: string, config: RawResourceConfig): number {
  if (config.mode === 'custom') return config.customRatePerMin ?? 0;
  return baseRateForItem(itemId) * PURITY_MULT[config.purity] * VERSION_MULT[config.extractorVersion];
}

export const DEFAULT_RAW_CONFIG: RawResourceConfig = {
  purity: 'normal',
  extractorVersion: 'V1',
};
