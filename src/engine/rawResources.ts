import type { ExtractorVersion, RawResourceConfig, ResourcePurity } from './types.ts';

/** Extractor machine name per raw resource (keys are starrupture.tools item ids). */
const MACHINE_NAMES: Record<string, string> = {
  'helium-ore': 'Helium-3 Extractor',
  'sulphur-ore': 'Sulfur Extractor',
  'magic-oil-ore': 'Oil Extractor',
  'goethite-ore': 'Laser Drill',
};
const DEFAULT_MACHINE = 'Ore Excavator';

/** Ores mined by the Ore Excavator — the only extractor with a V2 building. */
const V2_ORES = new Set(['titanium-ore', 'wolfram-ore', 'calcium-ore']);

export function machineForResource(itemId: string): string {
  return MACHINE_NAMES[itemId] ?? DEFAULT_MACHINE;
}

/** Whether a V2 extractor variant exists for this resource. */
export function hasV2Extractor(itemId: string): boolean {
  return V2_ORES.has(itemId);
}

/**
 * Normal-purity, V1-extractor rate for each raw resource (items/min), measured
 * from the extraction-building recipes on starrupture.tools. Foraged organics
 * (crab-egg, glowcap, …) have no extractor building and fall back to the
 * default — use custom mode to enter a real rate for those.
 */
const BASE_RATES: Record<string, number> = {
  'helium-ore': 240,
  'sulphur-ore': 240,
  'magic-oil-ore': 10,
  'goethite-ore': 15,
  'titanium-ore': 120,
  'wolfram-ore': 120,
  'calcium-ore': 120,
};

const DEFAULT_BASE_RATE = 120;

const PURITY_MULT: Record<ResourcePurity, number> = { impure: 0.5, normal: 1.0, pure: 2.0 };
// Ore Excavator v.2 mines 300/min at normal purity vs 120 for V1 → ×2.5.
const VERSION_MULT: Record<ExtractorVersion, number> = { V1: 1.0, V2: 2.5 };

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
