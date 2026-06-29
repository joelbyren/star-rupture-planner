import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PortNodeType } from '../store/planStore.ts';
import { usePlanStore } from '../store/planStore.ts';
import itemsJson from '../data/items.json';
import type { Item } from '../engine/types.ts';
import { abbr, colorForType } from '../lib/itemVisual.ts';

const ALL_ITEMS = itemsJson as Item[];
const itemById = (id: string | null) => (id ? ALL_ITEMS.find(i => i.id === id) : undefined);

/**
 * A factory's input/output port, pinned on the inner canvas. An input port is a
 * SOURCE that feeds inner nodes (handle on the right); an output port is a SINK
 * that consumes from inner nodes (handle on the left). Click to edit/delete.
 */
export function PortNode({ data }: NodeProps<PortNodeType>) {
  const openPortDialog = usePlanStore(s => s.openPortDialog);
  const item = itemById(data.itemId);
  const isInput = data.side === 'input';

  return (
    <div
      className="relative bg-slate-900 border border-violet-600/70 rounded-md px-2 py-1.5 w-[120px] shadow-lg cursor-pointer hover:border-violet-400"
      onClick={() => openPortDialog(data.portId)}
      title="Click to set item or delete"
    >
      <Handle
        type={isInput ? 'source' : 'target'}
        position={isInput ? Position.Right : Position.Left}
        className="!bg-violet-500 !w-2.5 !h-2.5"
      />
      <div className="text-[9px] text-violet-300 uppercase tracking-wide leading-tight">
        {isInput ? 'Input' : 'Output'}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span
          className={`inline-flex items-center justify-center w-5 h-[14px] rounded-sm border text-[8px] font-bold shrink-0 ${
            data.itemId ? colorForType(item?.type) : 'bg-slate-600/40 text-slate-300 border-slate-500/50'
          }`}
        >
          {data.itemId ? (item ? abbr(item) : '??') : '?'}
        </span>
        <span className="text-[10px] text-slate-200 truncate">
          {item?.name ?? (data.itemId ? data.itemId : 'Unset')}
        </span>
      </div>
    </div>
  );
}
