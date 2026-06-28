export interface Item {
  id: string;
  name: string;
  type: string;
  stackSize: number | null;
}

export type BuildingTier = 'V1' | 'V2';

export type ResourcePurity = 'impure' | 'normal' | 'pure';
export type ExtractorVersion = 'V1' | 'V2';

export interface RawResourceConfig {
  purity: ResourcePurity;
  extractorVersion: ExtractorVersion;
}

/** Per-craft ingredient quantity. Engine derives input rate = quantity * outputRatePerMin / outputQuantity. */
export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

/** RateSpec is kept for SubFactory ports, which deal in rates not per-craft quantities. */
export interface RateSpec {
  itemId: string;
  ratePerMin: number;
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
// SubFactory types
// A SubFactory is its own graph document. In a parent graph it renders
// as a single node whose handles are the declared inputs/outputs.
// ------------------------------------------------------------------

export interface SubFactoryPort {
  itemId: string;
  ratePerMin: number;
}

export interface SubFactory {
  id: string;
  name: string;
  /** Items consumed from the parent graph */
  inputs: SubFactoryPort[];
  /** Items produced into the parent graph */
  outputs: SubFactoryPort[];
  /** The inner graph (stored as its own plan document id) */
  innerPlanId: string | null;
}

// ------------------------------------------------------------------
// Calculation results
// NOTE: calc engine needs updating — Recipe.inputs now use quantity
// not ratePerMin. Input rate = ingredient.quantity * recipe.outputRatePerMin
// / outputIngredient.quantity.
// ------------------------------------------------------------------

export interface NodeResult {
  recipeId: string;
  itemId: string;
  machine: string;
  buildingTier: BuildingTier | null;
  ratePerMin: number;
  /** How many buildings are required (ceiling of fractional count) */
  buildingCount: number;
  /** Exact (possibly fractional) building count before ceiling */
  buildingCountExact: number;
  inputs: NodeResult[];
  /** True for raw resources that have no production recipe (ores, etc.) */
  isRaw?: boolean;
}
