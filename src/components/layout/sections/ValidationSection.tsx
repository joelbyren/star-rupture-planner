import { useMemo, useState } from 'react';
import { usePlanStore, findMissingInputs } from '../../../store/planStore.ts';
import itemsJson from '../../../data/items.json';
import type { Item } from '../../../engine/types.ts';
import { SidebarSection } from './SidebarSection.tsx';

const ITEM_NAMES = new Map((itemsJson as Item[]).map(i => [i.id, i.name]));
const itemName = (id: string) => ITEM_NAMES.get(id) ?? id;

export function ValidationSection() {
  const nodes = usePlanStore(s => s.nodes);
  const edges = usePlanStore(s => s.edges);
  const missing = useMemo(() => findMissingInputs(nodes, edges), [nodes, edges]);
  const [expanded, setExpanded] = useState(true);

  if (missing.length === 0) return null;

  return (
    <SidebarSection title="Validation">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between w-full text-xs text-danger"
      >
        <span>{missing.length} empty input{missing.length === 1 ? '' : 's'}</span>
        <span className="text-ink-dim">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1">
          {missing.map((m, i) => (
            <li key={`${m.nodeId}-${m.itemId}-${i}`} className="text-xs text-ink-mid">
              <span className="text-danger">{itemName(m.itemId)}</span>
              <span className="text-ink-dim"> → {itemName(m.consumerItemId)}</span>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
