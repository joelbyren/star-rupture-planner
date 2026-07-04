import type { ExtractorVersion, RawResourceConfig, ResourcePurity } from './types.ts';

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

const PURITY_MULT: Record<ResourcePurity, number> = { impure: 0.5, normal: 1.0, pure: 2.0 };
const VERSION_MULT: Record<ExtractorVersion, number> = { V1: 1.0, V2: 2.0 };

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

export type RawSupplyStatus = 'binding' | 'ok' | 'deficit';

export interface RawSupplyInfo {
  /** Physical supply cap (items/min), or null for non-raw nodes. */
  supplyRate: number | null;
  /** Items/min currently demanded downstream. */
  needed: number;
  /** supplyRate - needed, or null when supplyRate is null. */
  surplus: number | null;
  status: RawSupplyStatus;
  /** Tailwind text-color class for `status` — identical at every call site today. */
  statusClass: string;
}

/**
 * Raw-resource supply vs. demand for a node, plus the status coloring every
 * call site (ItemNode, NodeConfigDialog) derives the same way: binding limit
 * takes priority, then whether supply covers demand.
 */
export function rawSupplyInfo(
  data: { itemId: string; isRaw: boolean; rawConfig?: RawResourceConfig },
  balance: { outputRatePerMin?: number; isLimitBinding?: boolean } | undefined,
): RawSupplyInfo {
  const rawConfig = data.rawConfig ?? DEFAULT_RAW_CONFIG;
  const supplyRate = data.isRaw ? calcSupplyRate(data.itemId, rawConfig) : null;
  const needed = balance?.outputRatePerMin ?? 0;
  const surplus = supplyRate !== null ? supplyRate - needed : null;

  const status: RawSupplyStatus = balance?.isLimitBinding
    ? 'binding'
    : surplus !== null && surplus >= 0
      ? 'ok'
      : 'deficit';
  const statusClass = status === 'binding' ? 'text-accent' : status === 'ok' ? 'text-ok' : 'text-danger';

  return { supplyRate, needed, surplus, status, statusClass };
}
