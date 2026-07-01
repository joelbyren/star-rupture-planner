export interface Item {
  id: string;
  name: string;
  type: string;
  stackSize: number | null;
}

export type BuildingTier = 'V1' | 'V2';

export type ResourcePurity = 'impure' | 'normal' | 'pure';
export type ExtractorVersion = 'V1' | 'V2';

export type ExtractorMode = 'calculated' | 'custom';

export interface RawResourceConfig {
  purity: ResourcePurity;
  extractorVersion: ExtractorVersion;
  /** 'custom' = user-entered aggregate rate; absent/'calculated' = purity × version. */
  mode?: ExtractorMode;
  /** Total items/min for the whole extractor cluster; used when mode === 'custom'. */
  customRatePerMin?: number;
}

/** Per-craft ingredient quantity. Engine derives input rate = quantity * outputRatePerMin / outputQuantity. */
export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

// TODO: recipe variants (V1/V2) not present in this source — site models one recipe per item
export interface Recipe {
  id: string;
  outputItemId: string;
  machine: string;
  /** Always null until the source exposes variant data. */
  buildingTier: BuildingTier | null;
  /** Rate at which the building produces output, in items-per-minute. */
  outputRatePerMin: number;
  outputs: RecipeIngredient[];
  inputs: RecipeIngredient[];
  confidence: string | null;
  lastVerified: string | null;
  sourceUrl: string;
}

// ------------------------------------------------------------------
// Factory (sub-factory) types
// A Factory renders as a single node in its parent graph whose handles
// are its declared input/output ports. Its inner graph is stored on the
// node's data (see store). A port's item may be UNSET (null) — shown "?".
// ------------------------------------------------------------------

export interface FactoryPort {
  id: string;
  /** null = UNSET (accepts/produces anything; rendered as "?"). */
  itemId: string | null;
}
