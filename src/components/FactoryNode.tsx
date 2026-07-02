import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FactoryNodeType, FactoryNodeData } from '../store/planStore.ts';
import { portNodeId } from '../store/planStore.ts';
import itemsJson from '../data/items.json';
import type { Item } from '../engine/types.ts';
import { abbr, colorForType } from '../lib/itemVisual.ts';
import { useIsNodeDimmed } from '../lib/useNeighbors.ts';

const ALL_ITEMS = itemsJson as Item[];
const itemById = (id: string | null) => (id ? ALL_ITEMS.find(i => i.id === id) : undefined);

function PortBadge({ itemId }: { itemId: string | null }) {
  const item = itemById(itemId);
  return (
    <span
      className={`sr-badge ${itemId ? colorForType(item?.type) : 'sr-t-unset'}`}
      title={item?.name ?? (itemId ?? 'Unset')}
    >
      {itemId ? (item ? abbr(item) : '??') : '?'}
    </span>
  );
}

export function FactoryNode({ id, data }: NodeProps<FactoryNodeType>) {
  const { inputs, outputs } = data as FactoryNodeData;
  const dimmed = useIsNodeDimmed(id);

  const inRefs = useRef<(HTMLDivElement | null)[]>([]);
  const outRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [inTops, setInTops] = useState<number[]>([]);
  const [outTops, setOutTops] = useState<number[]>([]);
  useLayoutEffect(() => {
    setInTops(inRefs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
    setOutTops(outRefs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
  }, [inputs.length, outputs.length]);

  return (
    <div className={`sr-node sr-node--factory relative rounded-md w-[170px] ${dimmed ? 'sr-node--dimmed' : ''}`}>
      {inputs.map((p, i) => (
        <Handle
          key={p.id}
          id={portNodeId('input', p.id)}
          type="target"
          position={Position.Left}
          style={{ top: inTops[i] ?? 0 }}
        />
      ))}
      {outputs.map((p, i) => (
        <Handle
          key={p.id}
          id={portNodeId('output', p.id)}
          type="source"
          position={Position.Right}
          style={{ top: outTops[i] ?? 0 }}
        />
      ))}

      <div className="sr-node-frame">
        <div className="px-2 py-1 sr-node-head">
          <div className="sr-node-machine text-[9px] uppercase tracking-wide leading-tight">Factory</div>
        </div>

        <div className="px-2 pb-1.5 pt-1">
          <div className="sr-node-title font-semibold text-xs truncate leading-tight" title={data.name}>
            {data.name}
          </div>
          <div className="text-[8px] text-ink-dim italic leading-tight mb-1">double-click to open</div>

          <div className="flex justify-between gap-2">
            <div className="space-y-px min-w-0">
              {inputs.map((p, i) => (
                <div key={p.id} ref={el => { inRefs.current[i] = el; }} className="flex items-center gap-1 leading-none">
                  <PortBadge itemId={p.itemId} />
                </div>
              ))}
            </div>
            <div className="space-y-px min-w-0">
              {outputs.map((p, i) => (
                <div key={p.id} ref={el => { outRefs.current[i] = el; }} className="flex items-center gap-1 leading-none justify-end">
                  <PortBadge itemId={p.itemId} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
