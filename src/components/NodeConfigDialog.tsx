import { Modal } from './ui/Modal.tsx';
import { usePlanStore, type ItemNodeType } from '../store/planStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item, ResourcePurity, ExtractorVersion } from '../engine/types.ts';
import { calcSupplyRate, DEFAULT_RAW_CONFIG } from '../engine/rawResources.ts';

const ALL_RECIPES = recipesJson as Recipe[];
const ALL_ITEMS = itemsJson as Item[];

const PURITY: { value: ResourcePurity; label: string }[] = [
  { value: 'impure', label: 'Impure' },
  { value: 'normal', label: 'Normal' },
  { value: 'pure', label: 'Pure' },
];
const VERSIONS: ExtractorVersion[] = ['V1', 'V2'];

function itemById(id: string) {
  return ALL_ITEMS.find(i => i.id === id);
}

export function NodeConfigDialog() {
  const editingNodeId = usePlanStore(s => s.editingNodeId);
  const nodes = usePlanStore(s => s.nodes);
  const closeConfig = usePlanStore(s => s.closeConfig);
  const removeNode = usePlanStore(s => s.removeNode);
  const setNodeRawConfig = usePlanStore(s => s.setNodeRawConfig);

  const node = nodes.find(n => n.id === editingNodeId && n.type === 'itemNode') as
    | ItemNodeType
    | undefined;
  const open = !!node;
  if (!node) return <Modal open={false} onClose={closeConfig}><span /></Modal>;

  const data = node.data;
  const item = itemById(data.itemId);
  const recipe = data.recipeId ? ALL_RECIPES.find(r => r.id === data.recipeId) : undefined;
  const rawConfig = data.rawConfig ?? DEFAULT_RAW_CONFIG;
  const balance = data.balance;

  const supplyRate = data.isRaw ? calcSupplyRate(data.itemId, rawConfig) : null;
  const needed = balance?.outputRatePerMin ?? 0;
  const surplus = supplyRate !== null ? supplyRate - needed : null;
  const showV2 = item?.type === 'Resource';

  return (
    <Modal open={open} title={item?.name ?? data.itemId} onClose={closeConfig}>
      <div className="space-y-3">
        {data.isRaw && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Purity</label>
                <select
                  value={rawConfig.purity}
                  onChange={e => setNodeRawConfig(node.id, { purity: e.target.value as ResourcePurity })}
                  className="w-full bg-slate-700 border border-slate-500 rounded text-sm text-white px-2 py-1.5 cursor-pointer"
                >
                  {PURITY.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Extractor</label>
                <select
                  value={rawConfig.extractorVersion}
                  onChange={e => setNodeRawConfig(node.id, { extractorVersion: e.target.value as ExtractorVersion })}
                  className="w-full bg-slate-700 border border-slate-500 rounded text-sm text-white px-2 py-1.5 cursor-pointer"
                >
                  {VERSIONS.filter(v => v === 'V1' || showV2).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={`text-xs font-medium ${surplus !== null && surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {supplyRate?.toFixed(0)}/min supply
              <span className="text-slate-400 font-normal ml-1">
                ({surplus !== null && surplus >= 0 ? '+' : ''}{surplus?.toFixed(0)} vs {needed.toFixed(0)} needed)
              </span>
            </div>
          </>
        )}

        {recipe && (
          <div className="text-xs text-slate-300 bg-slate-900/50 rounded p-2 space-y-1">
            <div>
              <span className="text-slate-400">Machine:</span> {recipe.machine}
              {recipe.buildingTier && <span className="text-violet-400 ml-1">{recipe.buildingTier}</span>}
              <span className="text-slate-400 ml-2">{recipe.outputRatePerMin}/min</span>
            </div>
            <div className="text-slate-400">
              Inputs: {recipe.inputs.map(i => `${itemById(i.itemId)?.name ?? i.itemId} ×${i.quantity}`).join(', ') || '—'}
            </div>
            {balance && (
              <div className="text-slate-400">
                Buildings: <span className="text-amber-400">{balance.buildingCountExact.toFixed(2)}</span>
              </div>
            )}
            <div className="text-slate-500 italic pt-1">To change the recipe, delete this node and add a new one.</div>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <button
            onClick={() => removeNode(node.id)}
            className="px-3 py-1.5 text-sm rounded bg-red-600/80 text-white hover:bg-red-600"
          >
            Delete node
          </button>
          <button
            onClick={closeConfig}
            className="px-3 py-1.5 text-sm rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
