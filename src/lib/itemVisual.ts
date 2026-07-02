import type { Item } from '../engine/types.ts';

/**
 * Two-letter badge for an item. No clean item icons exist on the scraped
 * source, so we derive a short abbreviation from the display name:
 *   - multiple words  → initial of the first two words ("Titanium Ore" → "TO")
 *   - single word     → first two letters ("Rotor" → "Ro", "Helium-3" → "He")
 */
export function abbr(item: Pick<Item, 'name' | 'id'>): string {
  const name = (item.name ?? item.id).trim();
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).padEnd(2, '·');
}

/** Semantic badge class per item type; colors are defined per-theme (see themes/*.css). */
export const TYPE_CLASSES: Record<string, string> = {
  Resource: 'sr-t-resource',
  Component: 'sr-t-component',
  Fluid: 'sr-t-fluid',
  Powder: 'sr-t-powder',
  Ammo: 'sr-t-ammo',
  Weapon: 'sr-t-weapon',
};

const DEFAULT_CLASS = 'sr-t-default';

export function colorForType(type: string | undefined): string {
  return (type && TYPE_CLASSES[type]) || DEFAULT_CLASS;
}
