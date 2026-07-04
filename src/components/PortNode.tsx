import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PortNodeType } from '../store/planStore.ts';
import { PORT_W, usePlanStore } from '../store/planStore.ts';
import { itemById } from '../lib/itemVisual.ts';
import { useIsNodeDimmed } from '../lib/useNeighbors.ts';
import { ItemBadge } from './ui/ItemBadge.tsx';

/**
 * A factory's input/output port, pinned on the inner canvas. An input port is a
 * SOURCE that feeds inner nodes (handle on the right); an output port is a SINK
 * that consumes from inner nodes (handle on the left). Click to edit/delete.
 */
export function PortNode({ id, data }: NodeProps<PortNodeType>) {
  const openPortDialog = usePlanStore(s => s.openPortDialog);
  const dimmed = useIsNodeDimmed(id);
  const item = itemById(data.itemId);
  const isInput = data.side === 'input';

  return (
    <div
      className={`sr-node relative rounded-md cursor-pointer hover:border-accent ${dimmed ? 'sr-node--dimmed' : ''}`}
      style={{ width: PORT_W }}
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
          <ItemBadge itemId={data.itemId} />
          <span className="text-[10px] text-ink truncate">
            {item?.name ?? (data.itemId ? data.itemId : 'Unset')}
          </span>
        </div>
      </div>
    </div>
  );
}
