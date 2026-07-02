import { Modal } from './ui/Modal.tsx';
import { usePlanStore, type ItemNodeType } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item, ResourcePurity, ExtractorVersion, ExtractorMode } from '../engine/types.ts';
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
  const setNodeHardLimit = usePlanStore(s => s.setNodeHardLimit);
  const openNoteDialogCreate = useUiStore(s => s.openNoteDialogCreate);

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
            <div>
              <label className="block text-xs text-ink-dim mb-1">Extractor mode</label>
              <select
                value={rawConfig.mode ?? 'calculated'}
                onChange={e => setNodeRawConfig(node.id, { mode: e.target.value as ExtractorMode })}
                className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5 cursor-pointer"
              >
                <option value="calculated">Calculated (purity × version)</option>
                <option value="custom">Custom (aggregate rate)</option>
              </select>
            </div>

            {rawConfig.mode === 'custom' ? (
              <div>
                <label className="block text-xs text-ink-dim mb-1">Aggregate rate (items/min)</label>
                <input
                  type="number"
                  min={0}
                  value={rawConfig.customRatePerMin ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setNodeRawConfig(node.id, { customRatePerMin: v === '' ? undefined : Number(v) });
                  }}
                  className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Purity</label>
                  <select
                    value={rawConfig.purity}
                    onChange={e => setNodeRawConfig(node.id, { purity: e.target.value as ResourcePurity })}
                    className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5 cursor-pointer"
                  >
                    {PURITY.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Extractor</label>
                  <select
                    value={rawConfig.extractorVersion}
                    onChange={e => setNodeRawConfig(node.id, { extractorVersion: e.target.value as ExtractorVersion })}
                    className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5 cursor-pointer"
                  >
                    {VERSIONS.filter(v => v === 'V1' || showV2).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className={`text-xs font-medium ${balance?.isLimitBinding ? 'text-accent' : surplus !== null && surplus >= 0 ? 'text-emerald-400' : 'text-danger'}`}>
              {supplyRate?.toFixed(0)}/min supply (physical cap)
              <span className="text-ink-dim font-normal ml-1">
                ({surplus !== null && surplus >= 0 ? '+' : ''}{surplus?.toFixed(0)} spare vs {needed.toFixed(0)} used)
              </span>
            </div>

            {balance?.isLimitBinding && (
              <div className="text-xs text-accent font-medium">
                This extractor is the binding constraint on the network — extend it to raise the max output.
              </div>
            )}
          </>
        )}

        {recipe && (
          <div className="text-xs text-ink-mid bg-panel-2 rounded p-2 space-y-1">
            <div>
              <span className="text-ink-dim">Machine:</span> {recipe.machine}
              {recipe.buildingTier && <span className="text-comp ml-1">{recipe.buildingTier}</span>}
              <span className="text-ink-dim ml-2">{recipe.outputRatePerMin}/min</span>
            </div>
            <div className="text-ink-dim">
              Inputs: {recipe.inputs.map(i => `${itemById(i.itemId)?.name ?? i.itemId} ×${i.quantity}`).join(', ') || '—'}
            </div>
            {balance && (
              <div className="text-ink-dim">
                Buildings: <span className="text-accent">{balance.buildingCountExact.toFixed(2)}</span>
              </div>
            )}
            <div className="text-ink-dim italic pt-1">To change the recipe, delete this node and add a new one.</div>
          </div>
        )}

        {recipe && (
          <div>
            <label className="block text-xs text-ink-dim mb-1">Max output (items/min) — blank = unlimited</label>
            <input
              type="number"
              min={0}
              value={data.hardLimitPerMin ?? ''}
              onChange={e => {
                const v = Number(e.target.value);
                setNodeHardLimit(node.id, e.target.value === '' || !v ? null : v);
              }}
              className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5"
            />
            {balance?.isLimitBinding && (
              <div className="text-xs text-accent font-medium mt-1">
                This limit is the binding constraint on the network.
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => openNoteDialogCreate(node.id)}
          className="w-full px-3 py-1.5 text-sm rounded bg-panel-2 text-ink-mid hover:text-ink"
        >
          + Add note
        </button>

        <div className="flex justify-between gap-2 pt-1">
          <button
            onClick={() => removeNode(node.id)}
            className="px-3 py-1.5 text-sm rounded bg-danger/80 text-canvas hover:bg-danger"
          >
            Delete node
          </button>
          <button
            onClick={closeConfig}
            className="px-3 py-1.5 text-sm rounded bg-panel-2 text-ink-mid hover:text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
