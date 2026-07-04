import { useMemo } from 'react';
import { usePlanStore } from '../../../store/planStore.ts';
import { selectScopedNodes, aggregateRawIntake } from '../../../lib/scopedTotals.ts';
import { itemById } from '../../../lib/itemVisual.ts';
import { SidebarSection } from './SidebarSection.tsx';
import { ItemBadge } from '../../ui/ItemBadge.tsx';

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
            const item = itemById(row.itemId);
            return (
              <li key={row.itemId} className="flex items-center gap-2 text-xs">
                <ItemBadge itemId={row.itemId} />
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
