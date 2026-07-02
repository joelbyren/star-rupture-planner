import { useMemo } from 'react';
import { usePlanStore } from '../../../store/planStore.ts';
import { selectScopedNodes, aggregateRawIntake } from '../../../lib/scopedTotals.ts';
import { abbr, colorForType } from '../../../lib/itemVisual.ts';
import itemsJson from '../../../data/items.json';
import type { Item } from '../../../engine/types.ts';
import { SidebarSection } from './SidebarSection.tsx';

const ITEMS_BY_ID = new Map((itemsJson as Item[]).map(i => [i.id, i]));

export function RawIntakeSection() {
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);

  const rows = useMemo(() => {
    const scoped = selectScopedNodes(rootGraph, viewPath);
    return aggregateRawIntake(scoped);
  }, [rootGraph, viewPath]);

  return (
    <SidebarSection title="Raw intake">
      {rows.length === 0 ? (
        <p className="text-xs text-ink-dim">No raw resources in scope.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(row => {
            const item = ITEMS_BY_ID.get(row.itemId);
            return (
              <li key={row.itemId} className="flex items-center gap-2 text-xs">
                <span className={`sr-badge ${colorForType(item?.type)}`}>
                  {item ? abbr(item) : '??'}
                </span>
                <span className="flex-1 text-ink-mid truncate">{item?.name ?? row.itemId}</span>
                <span className="text-ink tabular-nums">{row.ratePerMin.toFixed(1)}/min</span>
              </li>
            );
          })}
        </ul>
      )}
    </SidebarSection>
  );
}
