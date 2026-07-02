import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../../../store/planStore.ts';
import { abbr, colorForType } from '../../../lib/itemVisual.ts';
import itemsJson from '../../../data/items.json';
import type { Item } from '../../../engine/types.ts';
import type { FactoryPortResult } from '../../../engine/balanceGraph.ts';
import { SidebarSection } from './SidebarSection.tsx';

const ITEMS_BY_ID = new Map((itemsJson as Item[]).map(i => [i.id, i]));

function PortRow({ port }: { port: FactoryPortResult }) {
  const item = port.itemId ? ITEMS_BY_ID.get(port.itemId) : undefined;
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={`sr-badge ${item ? colorForType(item.type) : 'sr-t-unset'}`}>
        {item ? abbr(item) : '?'}
      </span>
      <span className="flex-1 text-ink-mid truncate">{item?.name ?? 'Unset'}</span>
      <span className="text-ink tabular-nums">{port.ratePerMin.toFixed(1)}/min</span>
    </li>
  );
}

/** Only rendered inside a factory: the currently-viewed factory's port rates. */
export function PortRatesSection() {
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);

  if (viewPath.length === 0) return null;

  let parent = rootGraph;
  for (const id of viewPath.slice(0, -1)) {
    const fac = parent.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
    if (!fac) break;
    parent = fac.data.inner;
  }
  const facId = viewPath[viewPath.length - 1];
  const fac = parent.nodes.find(n => n.id === facId && isFactoryNode(n)) as FactoryNodeType | undefined;
  const balance = fac?.data.balance;
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
