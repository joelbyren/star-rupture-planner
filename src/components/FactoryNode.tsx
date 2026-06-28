import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FactoryNodeType } from '../store/planStore.ts';
import { usePlanStore } from '../store/planStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item } from '../engine/types.ts';

const ALL_RECIPES = recipesJson as Recipe[];
const ALL_ITEMS = itemsJson as Item[];

export function FactoryNode({ data }: NodeProps<FactoryNodeType>) {
  const setActiveRecipe = usePlanStore(s => s.setActiveRecipe);
  const activeRecipes = usePlanStore(s => s.activeRecipes);

  const item = ALL_ITEMS.find(i => i.id === data.itemId);
  const result = data.result;
  const variantRecipes = ALL_RECIPES.filter(r => r.itemId === data.itemId);
  const hasVariants = variantRecipes.length > 1;

  const activeRecipeId = activeRecipes[data.itemId] ?? variantRecipes[0]?.id;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 min-w-[190px] shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />

      <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
        {result?.buildingTier ?? '—'}
      </div>

      <div className="font-semibold text-white text-sm mb-1 truncate">
        {item?.name ?? data.itemId}
      </div>

      <div className="text-violet-400 text-xs mb-2">
        {result ? `${result.ratePerMin.toFixed(2)}/min` : `${data.ratePerMin}/min`}
      </div>

      {result && (
        <div className="text-slate-300 text-xs mb-2">
          Buildings: <span className="text-amber-400 font-medium">{result.buildingCount}</span>
          {result.buildingCountExact !== result.buildingCount && (
            <span className="text-slate-500 ml-1">({result.buildingCountExact.toFixed(2)} exact)</span>
          )}
        </div>
      )}

      {hasVariants && (
        <select
          className="w-full bg-slate-700 border border-slate-500 rounded text-xs text-white px-1 py-0.5 mt-1 cursor-pointer"
          value={activeRecipeId}
          onChange={e => setActiveRecipe(data.itemId, e.target.value)}
        >
          {variantRecipes.map(r => (
            <option key={r.id} value={r.id}>
              {r.buildingTier} — {r.outputs[0]?.ratePerMin}/min
            </option>
          ))}
        </select>
      )}

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  );
}
