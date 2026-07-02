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
      className="sr-node relative rounded-md w-[120px] cursor-pointer hover:border-accent"
      onClick={() => openPortDialog(data.portId)}
      title="Click to set item or delete"
    >
      <Handle
        type={isInput ? 'source' : 'target'}
        position={isInput ? Position.Right : Position.Left}
      />
      <div className="sr-node-frame px-2 py-1.5">
        <div className="text-[9px] uppercase tracking-wide leading-tight text-ink-dim">
          {isInput ? 'Input' : 'Output'}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`sr-badge ${data.itemId ? colorForType(item?.type) : 'sr-t-unset'}`}>
            {data.itemId ? (item ? abbr(item) : '??') : '?'}
          </span>
          <span className="text-[10px] text-ink truncate">
            {item?.name ?? (data.itemId ? data.itemId : 'Unset')}
          </span>
        </div>
      </div>
    </div>
  );
}
