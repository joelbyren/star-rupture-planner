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

/** Tailwind classes (badge background + text) per item type. */
export const TYPE_COLORS: Record<string, string> = {
  Resource:  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Component: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  Fluid:     'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  Powder:    'bg-orange-500/20 text-orange-300 border-orange-500/40',
  Ammo:      'bg-rose-500/20 text-rose-300 border-rose-500/40',
  Weapon:    'bg-red-500/20 text-red-300 border-red-500/40',
};

const DEFAULT_COLOR = 'bg-slate-500/20 text-slate-300 border-slate-500/40';

export function colorForType(type: string | undefined): string {
  return (type && TYPE_COLORS[type]) || DEFAULT_COLOR;
}
