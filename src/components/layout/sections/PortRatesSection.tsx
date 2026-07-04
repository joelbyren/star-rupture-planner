import { usePlanStore, currentFactoryBalance } from '../../../store/planStore.ts';
import { itemById } from '../../../lib/itemVisual.ts';
import type { FactoryPortResult } from '../../../engine/balanceGraph.ts';
import { SidebarSection } from './SidebarSection.tsx';
import { ItemBadge } from '../../ui/ItemBadge.tsx';

function PortRow({ port }: { port: FactoryPortResult }) {
  const item = itemById(port.itemId);
  return (
    <li className="flex items-center gap-2 text-xs">
      <ItemBadge itemId={port.itemId} />
      <span className="flex-1 text-ink-mid truncate">{item?.name ?? 'Unset'}</span>
      <span className="text-ink tabular-nums">{port.ratePerMin.toFixed(1)}/min</span>
    </li>
  );
}

/** Only rendered inside a factory: the currently-viewed factory's port rates. */
export function PortRatesSection() {
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);

  const balance = currentFactoryBalance(rootGraph, viewPath);
  if (!balance) return null;

  return (
    <SidebarSection title="Port rates">
      {balance.inputPorts.length === 0 && balance.outputPorts.length === 0 ? (
        <p className="text-xs text-ink-dim">No ports defined.</p>
      ) : (
        <div className="space-y-2">
          {balance.inputPorts.length > 0 && (
            <div>
              <div className="text-[9px] tracking-widest uppercase text-ink-dim mb-1">Inputs</div>
              <ul className="space-y-1">
                {balance.inputPorts.map(p => <PortRow key={p.portId} port={p} />)}
              </ul>
            </div>
          )}
          {balance.outputPorts.length > 0 && (
            <div>
              <div className="text-[9px] tracking-widest uppercase text-ink-dim mb-1">Outputs</div>
              <ul className="space-y-1">
                {balance.outputPorts.map(p => <PortRow key={p.portId} port={p} />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </SidebarSection>
  );
}
