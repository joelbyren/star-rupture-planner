export interface Item {
  id: string;
  name: string;
}

export type BuildingTier = 'V1' | 'V2';

export interface RateSpec {
  itemId: string;
  ratePerMin: number;
}

export interface Recipe {
  id: string;
  /** The primary output item */
  itemId: string;
  buildingTier: BuildingTier;
  inputs: RateSpec[];
  outputs: RateSpec[];
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
// ------------------------------------------------------------------

export interface NodeResult {
  recipeId: string;
  itemId: string;
  ratePerMin: number;
  /** How many buildings are required (ceiling of fractional count) */
  buildingCount: number;
  /** Exact (possibly fractional) building count before ceiling */
  buildingCountExact: number;
  buildingTier: BuildingTier;
  inputs: NodeResult[];
}
