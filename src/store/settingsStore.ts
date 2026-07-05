import { create } from 'zustand';

/**
 * Per-building-type tier preference. Settings only affect the UI at
 * creation/edit time — they never mutate existing nodes or imported plans
 * (V2 recipes can have different inputs than their V1 counterpart, so
 * rewriting a saved plan would corrupt it).
 */
export type TierPreference = 'only-v1' | 'prefer-v1' | 'prefer-v2';

/** Tier preference per machine name (as in recipes.json / power.json). */
export type TierPrefs = Record<string, TierPreference>;

// Machines with a settings row. Only types with confirmed V2 variants are
// listed — extend as V2 recipe data lands for the remaining machines.
export const TIER_MACHINES = ['Ore Extractor', 'Fabricator', 'Furnace', 'Mega Press'] as const;

const TIER_PREFERENCES: TierPreference[] = ['only-v1', 'prefer-v1', 'prefer-v2'];
const STORAGE_KEY = 'srp.settings';

function isTierPreference(value: unknown): value is TierPreference {
  return typeof value === 'string' && (TIER_PREFERENCES as string[]).includes(value);
}

function loadMachineTiers(): TierPrefs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
    const tiers = (parsed as { machineTiers?: unknown })?.machineTiers;
    if (typeof tiers !== 'object' || tiers === null) return {};
    return Object.fromEntries(Object.entries(tiers).filter(([, v]) => isTierPreference(v))) as TierPrefs;
  } catch {
    return {};
  }
}

/** The effective preference for a machine; unset machines default to prefer-v1. */
export function tierPrefFor(prefs: TierPrefs, machine: string): TierPreference {
  return prefs[machine] ?? 'prefer-v1';
}

interface SettingsState {
  machineTiers: TierPrefs;
  setMachineTier: (machine: string, pref: TierPreference) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  machineTiers: loadMachineTiers(),
  setMachineTier: (machine, pref) => {
    const machineTiers = { ...get().machineTiers, [machine]: pref };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ machineTiers }));
    set({ machineTiers });
  },
}));
