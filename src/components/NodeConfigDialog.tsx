import { useState } from 'react';
import { Modal } from './ui/Modal.tsx';
import { TextInput } from './ui/TextInput.tsx';
import { Select } from './ui/Select.tsx';
import { Button } from './ui/Button.tsx';
import { ItemBadge } from './ui/ItemBadge.tsx';
import { usePlanStore, isItemNode, computeRecipeChangePreview, type ItemNodeType } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useSettingsStore, tierPrefFor } from '../store/settingsStore.ts';
import { ALL_RECIPES } from '../data/index.ts';
import type { ResourcePurity, ExtractorVersion, ExtractorMode, Recipe } from '../engine/types.ts';
import { DEFAULT_RAW_CONFIG, hasV2Extractor, machineForResource, rawSupplyInfo } from '../engine/rawResources.ts';
import { machinePower } from '../engine/power.ts';
import { itemById } from '../lib/itemVisual.ts';
import { recipesProducing } from '../lib/tierSettings.ts';

const PURITY: { value: ResourcePurity; label: string }[] = [
  { value: 'impure', label: 'Impure' },
  { value: 'normal', label: 'Normal' },
  { value: 'pure', label: 'Pure' },
];
const PURITY_VALUES = PURITY.map(p => p.value);

const VERSIONS: ExtractorVersion[] = ['V1', 'V2'];

const EXTRACTOR_MODES: { value: ExtractorMode; label: string }[] = [
  { value: 'calculated', label: 'Calculated (purity × version)' },
  { value: 'custom', label: 'Custom (aggregate rate)' },
];
const EXTRACTOR_MODE_VALUES = EXTRACTOR_MODES.map(m => m.value);

/** Narrow a <select>'s raw string value to a known option, falling back if it's ever stale/invalid. */
function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function NodeConfigDialog() {
  const editingNodeId = usePlanStore(s => s.editingNodeId);
  const nodes = usePlanStore(s => s.nodes);
  const node = nodes.find(n => n.id === editingNodeId);
  if (!node || !isItemNode(node)) return null;
  // Keyed so local state (e.g. a pending recipe switch) resets between nodes.
  return <NodeConfigDialogBody key={node.id} node={node} />;
}

function variantLabel(variant: Recipe, current: Recipe | undefined): string {
  const tier = variant.buildingTier ?? 'V1';
  return variant.machine === current?.machine
    ? `Switch recipe to ${tier}`
    : `Switch recipe to ${variant.machine} ${tier}`;
}

function NodeConfigDialogBody({ node }: { node: ItemNodeType }) {
  const closeConfig = usePlanStore(s => s.closeConfig);
  const removeNode = usePlanStore(s => s.removeNode);
  const setNodeRawConfig = usePlanStore(s => s.setNodeRawConfig);
  const setNodeHardLimit = usePlanStore(s => s.setNodeHardLimit);
  const setNodeRecipe = usePlanStore(s => s.setNodeRecipe);
  const edges = usePlanStore(s => s.edges);
  const openNoteDialogCreate = useUiStore(s => s.openNoteDialogCreate);
  const machineTiers = useSettingsStore(s => s.machineTiers);
  const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null);

  const data = node.data;
  const item = itemById(data.itemId);
  const recipe = data.recipeId ? ALL_RECIPES.find(r => r.id === data.recipeId) : undefined;
  const rawConfig = data.rawConfig ?? DEFAULT_RAW_CONFIG;
  const balance = data.balance;

  const { supplyRate, needed, surplus, statusClass } = rawSupplyInfo(data, balance);
  const showV2 = hasV2Extractor(data.itemId);
  // Under "Only V1" the version dropdown disappears — but only while the node is
  // actually V1. A legacy/imported V2 node keeps it so it can be inspected or
  // downgraded (settings never mutate existing nodes).
  const hideVersion =
    tierPrefFor(machineTiers, machineForResource(data.itemId)) === 'only-v1' &&
    rawConfig.extractorVersion === 'V1';

  // Every other recipe variant that produces this item. Shown regardless of the
  // "only V1" machine setting — that preference gates defaults for new nodes,
  // not an explicit user action on an existing one.
  const variants = data.isRaw ? [] : recipesProducing(data.itemId).filter(r => r.id !== data.recipeId);
  const pendingRecipe = pendingRecipeId ? ALL_RECIPES.find(r => r.id === pendingRecipeId) : undefined;
  const preview = pendingRecipe ? computeRecipeChangePreview(node.id, edges, pendingRecipe) : null;

  function confirmSwitch() {
    if (pendingRecipeId) setNodeRecipe(node.id, pendingRecipeId);
    setPendingRecipeId(null);
  }

  return (
    <Modal open title={item?.name ?? data.itemId} onClose={closeConfig}>
      <div className="space-y-3">
        {data.isRaw && (
          <>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Extractor mode</label>
              <Select
                value={rawConfig.mode ?? 'calculated'}
                onChange={e =>
                  setNodeRawConfig(node.id, {
                    mode: oneOf(EXTRACTOR_MODE_VALUES, e.target.value, rawConfig.mode ?? 'calculated'),
                  })
                }
              >
                {EXTRACTOR_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </div>

            {rawConfig.mode === 'custom' ? (
              <div>
                <label className="block text-xs text-ink-dim mb-1">Aggregate rate (items/min)</label>
                <TextInput
                  type="number"
                  min={0}
                  value={rawConfig.customRatePerMin ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setNodeRawConfig(node.id, { customRatePerMin: v === '' ? undefined : Number(v) });
                  }}
                />
              </div>
            ) : (
              <div className={`grid gap-2 ${hideVersion ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Purity</label>
                  <Select
                    value={rawConfig.purity}
                    onChange={e => setNodeRawConfig(node.id, { purity: oneOf(PURITY_VALUES, e.target.value, rawConfig.purity) })}
                  >
                    {PURITY.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </Select>
                </div>
                {!hideVersion && (
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Extractor</label>
                    <Select
                      value={rawConfig.extractorVersion}
                      onChange={e =>
                        setNodeRawConfig(node.id, {
                          extractorVersion: oneOf(VERSIONS, e.target.value, rawConfig.extractorVersion),
                        })
                      }
                    >
                      {VERSIONS.filter(v => v === 'V1' || showV2).map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className={`text-xs font-medium ${statusClass}`}>
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
                <span className="ml-4">
                  Power: <span className="text-accent">
                    {(machinePower(recipe.machine, recipe.buildingTier ?? 'V1') * balance.buildingCount).toFixed(0)}
                  </span> MW
                </span>
              </div>
            )}
          </div>
        )}

        {recipe && (
          <div>
            <label className="block text-xs text-ink-dim mb-1">Max output (items/min) — blank = unlimited</label>
            <TextInput
              type="number"
              min={0}
              value={data.hardLimitPerMin ?? ''}
              onChange={e => {
                const v = Number(e.target.value);
                setNodeHardLimit(node.id, e.target.value === '' || !v ? null : v);
              }}
            />
            {balance?.isLimitBinding && (
              <div className="text-xs text-accent font-medium mt-1">
                This limit is the binding constraint on the network.
              </div>
            )}
          </div>
        )}

        {recipe && !pendingRecipe && variants.length > 0 && (
          <div className="space-y-1.5">
            {variants.map(v => (
              <Button
                key={v.id}
                variant="ghost"
                className="w-full"
                onClick={() => setPendingRecipeId(v.id)}
              >
                {variantLabel(v, recipe)}
              </Button>
            ))}
          </div>
        )}

        {pendingRecipe && preview && (
          <div className="text-xs bg-panel-2 rounded p-2 space-y-2 border border-line-soft">
            <div className="font-medium text-ink">
              Switch to {pendingRecipe.machine}
              {pendingRecipe.buildingTier ? ` ${pendingRecipe.buildingTier}` : ''}?
            </div>

            {preview.kept.length > 0 && (
              <div>
                <div className="text-ink-dim mb-0.5">Connections kept</div>
                <div className="space-y-0.5">
                  {preview.kept.map(k => (
                    <div key={k.itemId} className="flex items-center gap-1.5">
                      <ItemBadge itemId={k.itemId} />
                      <span>{itemById(k.itemId)?.name ?? k.itemId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.dropped.length > 0 && (
              <div>
                <div className="text-danger mb-0.5">Will be disconnected</div>
                <div className="space-y-0.5">
                  {preview.dropped.map(d => (
                    <div key={d.itemId} className="flex items-center gap-1.5 text-danger">
                      <ItemBadge itemId={d.itemId} />
                      <span>{itemById(d.itemId)?.name ?? d.itemId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.unfed.length > 0 && (
              <div>
                <div className="text-ink-dim mb-0.5">New inputs (unconnected)</div>
                <div className="space-y-0.5">
                  {preview.unfed.map(itemId => (
                    <div key={itemId} className="flex items-center gap-1.5">
                      <ItemBadge itemId={itemId} />
                      <span>{itemById(itemId)?.name ?? itemId}</span>
                    </div>
                  ))}
                </div>
                <div className="text-ink-dim italic mt-1">Validation will flag these as unconnected.</div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPendingRecipeId(null)}>Cancel</Button>
              <Button onClick={confirmSwitch}>Confirm switch</Button>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={() => openNoteDialogCreate(node.id)}
          className="w-full"
        >
          + Add note
        </Button>

        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="danger"
            onClick={() => removeNode(node.id)}
          >
            Delete node
          </Button>
          <Button
            variant="ghost"
            onClick={closeConfig}
          >
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
