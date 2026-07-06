import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ItemNodeType } from '../store/planStore.ts';
import { ALL_RECIPES } from '../data/index.ts';
import { DEFAULT_RAW_CONFIG, machineForResource, rawSupplyInfo } from '../engine/rawResources.ts';
import { itemById } from '../lib/itemVisual.ts';
import { useThemeStore } from '../store/themeStore.ts';
import { useIsNodeDimmed } from '../lib/useNeighbors.ts';
import { useHandleRowTops } from '../lib/useHandleRowTops.ts';
import { TargetMark } from './NodeChrome.tsx';
import { ItemBadge } from './ui/ItemBadge.tsx';

export function ItemNode({ id, data }: NodeProps<ItemNodeType>) {
  const theme = useThemeStore(s => s.theme);
  const dimmed = useIsNodeDimmed(id);
  const item = itemById(data.itemId);
  const recipe = data.recipeId ? ALL_RECIPES.find(r => r.id === data.recipeId) : undefined;
  const balance = data.balance;
  const inputs = balance?.inputs ?? recipe?.inputs.map(i => ({ itemId: i.itemId, neededPerMin: 0 })) ?? [];

  const rawConfig = data.isRaw ? data.rawConfig ?? DEFAULT_RAW_CONFIG : null;
  const { supplyRate, needed, surplus, statusClass } = rawSupplyInfo(data, balance);

  // Measure input-row centers so the left handles line up with their labels.
  const { refs: rowRefs, tops: handleTops } = useHandleRowTops(id, [inputs.map(i => i.itemId).join(','), data.itemId, theme]);

  const [showTip, setShowTip] = useState(false);
  const limitBinding = !!balance?.isLimitBinding;
  const isTarget = !!data.isEndProduct;

  const rootClass = [
    'sr-node',
    'relative rounded-md w-[150px]',
    data.isRaw ? 'sr-node--raw' : 'sr-node--production',
    isTarget ? 'sr-node--target' : '',
    limitBinding ? 'sr-node--limit' : '',
    dimmed ? 'sr-node--dimmed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {isTarget && <TargetMark theme={theme} />}

      {/* Input handles — one per recipe ingredient (none for raw resources) */}
      {inputs.map((inp, i) => (
        <Handle
          key={inp.itemId}
          id={inp.itemId}
          type="target"
          position={Position.Left}
          style={{ top: handleTops[i] ?? 0 }}
        />
      ))}

      <div className="sr-node-frame">
        {/* Header carries ONLY the node type (machine / extractor). The produced
            item name lives in the body below — matches the mockups, where the
            filled header bar is machine-only and the item is the body headline. */}
        <div className="px-2 py-1 sr-node-head">
          <div className="sr-node-machine text-[9px] uppercase tracking-wide leading-tight truncate">
            {data.isRaw
              ? `${machineForResource(data.itemId)}${rawConfig?.mode === 'custom' ? ' (custom)' : rawConfig?.extractorVersion === 'V2' ? ' V2' : ''}`
              : recipe?.machine || '—'}
            {recipe?.buildingTier && <span className="ml-1 font-semibold">{recipe.buildingTier}</span>}
          </div>
        </div>

        <div className="px-2 pb-1.5 pt-1">
          <div className="sr-node-title font-semibold text-xs truncate leading-tight" title={item?.name ?? data.itemId}>
            {item?.name ?? data.itemId}
            {isTarget && theme === 'terminal' && <span className="term-cursor ml-1">&#9612;</span>}
          </div>

          {!data.isRaw ? (
            <div className="text-[10px] leading-tight mt-0.5">
              <span className="sr-rate font-semibold">{balance ? `${balance.outputRatePerMin.toFixed(1)}/min` : '—'}</span>
              {balance && <span className="text-ink-dim ml-1.5">×{balance.buildingCountExact.toFixed(2)}</span>}
              {balance?.hardLimitPerMin != null && (
                <span className={`ml-1.5 ${balance.isLimitBinding ? 'text-accent font-semibold' : 'text-ink-dim'}`}>
                  ≤{balance.hardLimitPerMin.toFixed(0)}
                </span>
              )}
            </div>
          ) : (
            rawConfig && (
              <div
                className={`text-[10px] leading-tight font-medium mt-0.5 ${statusClass}`}
              >
                {supplyRate?.toFixed(0)}/min ({surplus !== null && surplus >= 0 ? '+' : ''}{surplus?.toFixed(0)})
              </div>
            )
          )}

          {/* Compact per-ingredient rows: 2-letter abbreviation badge + rate. */}
          {inputs.length > 0 && (
            <div className="mt-1 space-y-px">
              {inputs.map((inp, i) => {
                const ing = itemById(inp.itemId);
                return (
                  <div
                    key={inp.itemId}
                    ref={el => { rowRefs.current[i] = el; }}
                    className="flex items-center gap-1 leading-none"
                    title={`${ing?.name ?? inp.itemId} — ${inp.neededPerMin.toFixed(1)}/min`}
                  >
                    <ItemBadge itemId={inp.itemId} />
                    <span className="text-[9px] text-ink-dim truncate">{inp.neededPerMin.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Output handle + hover tooltip (full name + rate) */}
      <Handle
        type="source"
        position={Position.Right}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      />
      {showTip && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-20 bg-panel border border-line-soft rounded px-2 py-1.5 shadow-xl whitespace-nowrap pointer-events-none">
          <div className="text-ink text-sm font-medium">{item?.name ?? data.itemId}</div>
          <div className="sr-rate text-xs mt-0.5">{needed.toFixed(2)} items/min</div>
        </div>
      )}
    </div>
  );
}
