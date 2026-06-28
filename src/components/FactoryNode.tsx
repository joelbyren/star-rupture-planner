import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FactoryNodeType } from '../store/planStore.ts';
import { usePlanStore } from '../store/planStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item, ResourcePurity, ExtractorVersion, RawResourceConfig } from '../engine/types.ts';
import { calcSupplyRate, DEFAULT_RAW_CONFIG } from '../engine/rawResources.ts';

const ALL_RECIPES = recipesJson as Recipe[];
const ALL_ITEMS = itemsJson as Item[];

const PURITY_LABELS: { value: ResourcePurity; label: string }[] = [
  { value: 'impure', label: 'Impure' },
  { value: 'normal', label: 'Normal' },
  { value: 'pure',   label: 'Pure' },
];

function configToKey(c: Pick<RawResourceConfig, 'purity' | 'extractorVersion'>) {
  return `${c.purity}-${c.extractorVersion}`;
}
function keyToConfig(key: string): RawResourceConfig {
  const [purity, extractorVersion] = key.split('-') as [ResourcePurity, ExtractorVersion];
  return { purity, extractorVersion };
}

export function FactoryNode({ id, data }: NodeProps<FactoryNodeType>) {
  const setActiveRecipe = usePlanStore(s => s.setActiveRecipe);
  const activeRecipes = usePlanStore(s => s.activeRecipes);
  const rawResourceConfigs = usePlanStore(s => s.rawResourceConfigs);
  const setRawResourceConfig = usePlanStore(s => s.setRawResourceConfig);

  const item = ALL_ITEMS.find(i => i.id === data.itemId);
  const result = data.result;
  const variantRecipes = ALL_RECIPES.filter(r => r.outputItemId === data.itemId);
  const hasVariants = variantRecipes.length > 1;

  const activeRecipeId = activeRecipes[data.itemId] ?? variantRecipes[0]?.id;

  const rawConfig = result?.isRaw ? (rawResourceConfigs[id] ?? DEFAULT_RAW_CONFIG) : null;
  const supplyRate = rawConfig ? calcSupplyRate(data.itemId, rawConfig) : null;
  const needed = result?.ratePerMin ?? 0;
  const surplus = supplyRate !== null ? supplyRate - needed : null;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 min-w-[190px] shadow-lg">
      {!result?.isRaw && (
        <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      )}

      <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
        {result?.machine || '—'}
        {result?.buildingTier && (
          <span className="ml-1 text-violet-400">{result.buildingTier}</span>
        )}
        {rawConfig?.extractorVersion === 'V2' && (
          <span className="ml-1 text-violet-400">V2</span>
        )}
      </div>

      <div className="font-semibold text-white text-sm mb-1 truncate">
        {item?.name ?? data.itemId}
      </div>

      <div className="text-violet-400 text-xs mb-2">
        {result ? `${result.ratePerMin.toFixed(2)}/min` : `${data.ratePerMin}/min`}
      </div>

      {result && !result.isRaw && (
        <div className="text-slate-300 text-xs mb-2">
          Buildings: <span className="text-amber-400 font-medium">{result.buildingCount}</span>
          {result.buildingCountExact !== result.buildingCount && (
            <span className="text-slate-500 ml-1">({result.buildingCountExact.toFixed(2)} exact)</span>
          )}
        </div>
      )}
      {result?.isRaw && rawConfig && (
        <div className="mt-1 space-y-1">
          <select
            value={configToKey(rawConfig)}
            onChange={e => setRawResourceConfig(id, keyToConfig(e.target.value))}
            className="w-full bg-slate-700 border border-slate-500 rounded text-xs text-white px-1 py-0.5 cursor-pointer"
          >
            <optgroup label="V1">
              {PURITY_LABELS.map(o => (
                <option key={`${o.value}-V1`} value={`${o.value}-V1`}>{o.label}</option>
              ))}
            </optgroup>
            {item?.type === 'Resource' && (
              <optgroup label="V2">
                {PURITY_LABELS.map(o => (
                  <option key={`${o.value}-V2`} value={`${o.value}-V2`}>{o.label}</option>
                ))}
              </optgroup>
            )}
          </select>

          <div className={`text-xs font-medium pt-0.5 ${surplus !== null && surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {supplyRate?.toFixed(1)}/min supply
            {surplus !== null && (
              <span className="text-slate-400 font-normal ml-1">
                ({surplus >= 0 ? '+' : ''}{surplus.toFixed(1)} vs needed)
              </span>
            )}
          </div>
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
              {r.machine} — {r.outputRatePerMin}/min
            </option>
          ))}
        </select>
      )}

      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  );
}
