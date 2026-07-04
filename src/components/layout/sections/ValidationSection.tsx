import { useMemo, useState } from 'react';
import { usePlanStore, findValidationIssues } from '../../../store/planStore.ts';
import { ITEMS_BY_ID } from '../../../data/index.ts';
import { SidebarSection } from './SidebarSection.tsx';

const itemName = (id: string) => ITEMS_BY_ID.get(id)?.name ?? id;

export function ValidationSection() {
  const nodes = usePlanStore(s => s.nodes);
  const edges = usePlanStore(s => s.edges);
  const issues = useMemo(() => findValidationIssues(nodes, edges), [nodes, edges]);
  const [expanded, setExpanded] = useState(true);

  if (issues.length === 0) return null;

  return (
    <SidebarSection title="Validation">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between w-full text-xs text-danger"
      >
        <span>{issues.length} issue{issues.length === 1 ? '' : 's'}</span>
        <span className="text-ink-dim">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1">
          {issues.map((m, i) => (
            <li key={`${m.nodeId}-${m.itemId}-${i}`} className="text-xs text-ink-mid">
              <span className="text-danger">{itemName(m.itemId)}</span>
              <span className="text-ink-dim"> → {m.consumerItemId ? itemName(m.consumerItemId) : 'unconnected output'}</span>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
