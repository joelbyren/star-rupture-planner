import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FactoryNodeType, FactoryNodeData } from '../store/planStore.ts';
import { portNodeId } from '../store/planStore.ts';
import itemsJson from '../data/items.json';
import type { Item } from '../engine/types.ts';
import { abbr, colorForType } from '../lib/itemVisual.ts';

const ALL_ITEMS = itemsJson as Item[];
const itemById = (id: string | null) => (id ? ALL_ITEMS.find(i => i.id === id) : undefined);

function PortBadge({ itemId }: { itemId: string | null }) {
  const item = itemById(itemId);
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-[14px] rounded-sm border text-[8px] font-bold shrink-0 ${
        itemId ? colorForType(item?.type) : 'bg-slate-600/40 text-slate-300 border-slate-500/50'
      }`}
      title={item?.name ?? (itemId ?? 'Unset')}
    >
      {itemId ? (item ? abbr(item) : '??') : '?'}
    </span>
  );
}

export function FactoryNode({ data }: NodeProps<FactoryNodeType>) {
  const { inputs, outputs } = data as FactoryNodeData;

  const inRefs = useRef<(HTMLDivElement | null)[]>([]);
  const outRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [inTops, setInTops] = useState<number[]>([]);
  const [outTops, setOutTops] = useState<number[]>([]);
  useLayoutEffect(() => {
    setInTops(inRefs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
    setOutTops(outRefs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
  }, [inputs.length, outputs.length]);

  return (
    <div className="relative bg-slate-800 border-2 border-violet-700/70 rounded-md w-[170px] shadow-lg">
      {inputs.map((p, i) => (
        <Handle
          key={p.id}
          id={portNodeId('input', p.id)}
          type="target"
          position={Position.Left}
          style={{ top: inTops[i] ?? 0 }}
          className="!bg-violet-500 !w-2.5 !h-2.5"
        />
      ))}
      {outputs.map((p, i) => (
        <Handle
          key={p.id}
          id={portNodeId('output', p.id)}
          type="source"
          position={Position.Right}
          style={{ top: outTops[i] ?? 0 }}
          className="!bg-violet-500 !w-2.5 !h-2.5"
        />
      ))}

      <div className="px-2 py-1.5">
        <div className="text-[9px] text-violet-300 uppercase tracking-wide leading-tight">Factory</div>
        <div className="font-semibold text-white text-xs truncate leading-tight" title={data.name}>
          {data.name}
        </div>
        <div className="text-[8px] text-slate-500 italic leading-tight mb-1">double-click to open</div>

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
  );
}
