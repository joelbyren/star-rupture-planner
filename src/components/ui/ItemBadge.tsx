import { abbr, colorForType, itemById } from '../../lib/itemVisual.ts';

/** Two-letter item badge: `?` for an unset slot, `??` for an unknown item id. */
export function ItemBadge({ itemId, title }: { itemId: string | null | undefined; title?: string }) {
  const item = itemById(itemId);
  return (
    <span className={`sr-badge ${itemId ? colorForType(item?.type) : 'sr-t-unset'}`} title={title}>
      {itemId ? (item ? abbr(item) : '??') : '?'}
    </span>
  );
}
