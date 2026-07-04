import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FactoryNodeType } from '../store/planStore.ts';
import { portNodeId } from '../store/planStore.ts';
import { itemById } from '../lib/itemVisual.ts';
import { useIsNodeDimmed } from '../lib/useNeighbors.ts';
import { useHandleRowTops } from '../lib/useHandleRowTops.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { ItemBadge } from './ui/ItemBadge.tsx';

function PortBadge({ itemId }: { itemId: string | null }) {
  return <ItemBadge itemId={itemId} title={itemById(itemId)?.name ?? itemId ?? 'Unset'} />;
}

export function FactoryNode({ id, data }: NodeProps<FactoryNodeType>) {
  const { inputs, outputs } = data;
  const dimmed = useIsNodeDimmed(id);
  const theme = useThemeStore(s => s.theme);

  // Measure port-row centers so the side handles line up with their badges.
  const { refs: inRefs, tops: inTops } = useHandleRowTops(id, [inputs.length, theme]);
  const { refs: outRefs, tops: outTops } = useHandleRowTops(id, [outputs.length, theme]);

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
