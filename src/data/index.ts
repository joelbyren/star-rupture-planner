// Single point of entry for the raw scraped JSON game data. Every consumer
// should import typed constants from here instead of importing the JSON
// files directly + casting — keeps the `as`-casts in one place and avoids
// re-parsing/re-deriving the same lookups per call site.

import itemsJson from './items.json';
import recipesJson from './recipes.json';
import powerJson from './power.json';
import type { Item, Recipe, MachinePower } from '../engine/types.ts';

export const ALL_ITEMS: Item[] = itemsJson as Item[];
export const ALL_RECIPES: Recipe[] = recipesJson as Recipe[];
export const POWER: MachinePower = powerJson as MachinePower;

/** Canonical item-by-id lookup, shared by every badge/label render. */
export const ITEMS_BY_ID: Map<string, Item> = new Map(ALL_ITEMS.map(i => [i.id, i]));

// De-duplicate items by id (source data has a known duplicate), then sort
// alphabetically by name rather than leaving them in raw data-file order.
// Consumers building a Combobox map this to ComboboxOption at the call site
// so this module doesn't need to depend on a UI component type.
export const SORTED_ITEMS: Item[] = Array.from(ITEMS_BY_ID.values())
  .sort((a, b) => a.name.localeCompare(b.name));
