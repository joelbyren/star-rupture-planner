import { useMemo } from 'react';
import { usePlanStore } from '../../../store/planStore.ts';
import { selectScopedNodes } from '../../../lib/scopedTotals.ts';
import { toPowerNodes } from '../../../lib/powerNodes.ts';
import { graphPower } from '../../../engine/power.ts';
import { SidebarSection } from './SidebarSection.tsx';

export function PowerSection() {
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);

  const totalMw = useMemo(() => {
    const scoped = selectScopedNodes(rootGraph, viewPath);
    return graphPower(toPowerNodes(scoped));
  }, [rootGraph, viewPath]);

  return (
    <SidebarSection title="Power">
      <p className="text-xs text-ink-mid">
        Total: <span className="text-ink tabular-nums">{totalMw.toFixed(0)} MW</span>
      </p>
    </SidebarSection>
  );
}
