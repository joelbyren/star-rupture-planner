import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ItemNodeType } from '../store/planStore.ts';
import { usePlanStore } from '../store/planStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item } from '../engine/types.ts';
import { calcSupplyRate, DEFAULT_RAW_CONFIG, machineForResource } from '../engine/rawResources.ts';
import { abbr, colorForType } from '../lib/itemVisual.ts';

const ALL_RECIPES = recipesJson as Recipe[];
const ALL_ITEMS = itemsJson as Item[];

function itemById(id: string): Item | undefined {
  return ALL_ITEMS.find(i => i.id === id);
}

export function ItemNode({ id, data }: NodeProps<ItemNodeType>) {
  const openConfig = usePlanStore(s => s.openConfig);

  const item = itemById(data.itemId);
  const recipe = data.recipeId ? ALL_RECIPES.find(r => r.id === data.recipeId) : undefined;
  const balance = data.balance;
  const inputs = balance?.inputs ?? recipe?.inputs.map(i => ({ itemId: i.itemId, neededPerMin: 0 })) ?? [];

  const rawConfig = data.isRaw ? data.rawConfig ?? DEFAULT_RAW_CONFIG : null;
  const supplyRate = rawConfig ? calcSupplyRate(data.itemId, rawConfig) : null;
  const needed = balance?.outputRatePerMin ?? 0;
  const surplus = supplyRate !== null ? supplyRate - needed : null;

  // Measure input-row centers so the left handles line up with their labels.
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [handleTops, setHandleTops] = useState<number[]>([]);
  useLayoutEffect(() => {
    setHandleTops(rowRefs.current.map(el => (el ? el.offsetTop + el.offsetHeight / 2 : 0)));
  }, [inputs.length, data.itemId]);

  const [showTip, setShowTip] = useState(false);

  return (
    <div
      className="relative bg-slate-800 border border-slate-600 rounded-md w-[150px] shadow-lg"
      onDoubleClick={e => { e.stopPropagation(); openConfig(id); }}
    >
      {/* Input handles — one per recipe ingredient (none for raw resources) */}
      {inputs.map((inp, i) => (
        <Handle
          key={inp.itemId}
          id={inp.itemId}
          type="target"
          position={Position.Left}
          style={{ top: handleTops[i] ?? 0 }}
          className="!bg-violet-500 !w-2.5 !h-2.5"
        />
      ))}

      <div className="px-2 py-1.5">
        <div className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight truncate">
          {data.isRaw
            ? `${machineForResource(data.itemId)}${rawConfig?.extractorVersion === 'V2' ? ' V2' : ''}`
            : recipe?.machine || '—'}
          {recipe?.buildingTier && <span className="text-violet-400 ml-1">{recipe.buildingTier}</span>}
        </div>

        <div className="font-semibold text-white text-xs truncate leading-tight" title={item?.name ?? data.itemId}>
          {item?.name ?? data.itemId}
        </div>

        {!data.isRaw ? (
          <div className="text-[10px] leading-tight">
            <span className="text-violet-400">{balance ? `${balance.outputRatePerMin.toFixed(1)}/min` : '—'}</span>
            {balance && <span className="text-amber-400 ml-1.5">×{balance.buildingCountExact.toFixed(2)}</span>}
          </div>
        ) : (
          rawConfig && (
            <div className={`text-[10px] leading-tight font-medium ${surplus !== null && surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                  <span
                    className={`inline-flex items-center justify-center w-5 h-[14px] rounded-sm border text-[8px] font-bold shrink-0 ${colorForType(ing?.type)}`}
                  >
                    {ing ? abbr(ing) : '??'}
                  </span>
                  <span className="text-[9px] text-slate-400 truncate">{inp.neededPerMin.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Output handle + hover tooltip (full name + rate) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !w-2.5 !h-2.5"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      />
      {showTip && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-20 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 shadow-xl whitespace-nowrap pointer-events-none">
          <div className="text-white text-sm font-medium">{item?.name ?? data.itemId}</div>
          <div className="text-violet-300 text-xs mt-0.5">{needed.toFixed(2)} items/min</div>
        </div>
      )}
    </div>
  );
}
