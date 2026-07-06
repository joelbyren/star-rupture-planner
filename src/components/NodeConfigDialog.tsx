import { Modal } from './ui/Modal.tsx';
import { TextInput } from './ui/TextInput.tsx';
import { Select } from './ui/Select.tsx';
import { Button } from './ui/Button.tsx';
import { usePlanStore, isItemNode } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { useSettingsStore, tierPrefFor } from '../store/settingsStore.ts';
import { ALL_RECIPES } from '../data/index.ts';
import type { ResourcePurity, ExtractorVersion, ExtractorMode } from '../engine/types.ts';
import { DEFAULT_RAW_CONFIG, hasV2Extractor, machineForResource, rawSupplyInfo } from '../engine/rawResources.ts';
import { itemById } from '../lib/itemVisual.ts';

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
  const closeConfig = usePlanStore(s => s.closeConfig);
  const removeNode = usePlanStore(s => s.removeNode);
  const setNodeRawConfig = usePlanStore(s => s.setNodeRawConfig);
  const setNodeHardLimit = usePlanStore(s => s.setNodeHardLimit);
  const openNoteDialogCreate = useUiStore(s => s.openNoteDialogCreate);
  const machineTiers = useSettingsStore(s => s.machineTiers);

  const node = nodes.find(n => n.id === editingNodeId);
  if (!node || !isItemNode(node)) return null;

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
              </div>
            )}
            <div className="text-ink-dim italic pt-1">To change the recipe, delete this node and add a new one.</div>
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
