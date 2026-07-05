import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal.tsx';
import { Combobox, type ComboboxOption } from './ui/Combobox.tsx';
import { Select } from './ui/Select.tsx';
import { Button } from './ui/Button.tsx';
import { usePlanStore } from '../store/planStore.ts';
import { useSettingsStore } from '../store/settingsStore.ts';
import { applyTierFilter, pickDefaultRecipe, recipesProducing } from '../lib/tierSettings.ts';
import { ALL_RECIPES, SORTED_ITEMS } from '../data/index.ts';

const ITEM_OPTIONS: ComboboxOption[] = SORTED_ITEMS.map(i => ({ id: i.id, label: i.name, hint: i.type }));

export function AddNodeDialog() {
  const open = usePlanStore(s => s.addDialogOpen);
  const pos = usePlanStore(s => s.addDialogPos);
  const prefillItemId = usePlanStore(s => s.addDialogPrefillItemId);
  const filterInputItemId = usePlanStore(s => s.addDialogFilterInputItemId);
  const pendingConnect = usePlanStore(s => s.pendingConnect);
  const closeAddDialog = usePlanStore(s => s.closeAddDialog);
  const addNode = usePlanStore(s => s.addNode);
  const addPrerequisiteTree = usePlanStore(s => s.addPrerequisiteTree);
  const addFactoryNode = usePlanStore(s => s.addFactoryNode);

  // When dragged off an output handle, only offer items that can consume that
  // output (i.e. items with a recipe listing it as an input).
  const options = useMemo(() => {
    if (!filterInputItemId) return ITEM_OPTIONS;
    const consumers = new Set(
      ALL_RECIPES
        .filter(r => r.inputs.some(inp => inp.itemId === filterInputItemId))
        .map(r => r.outputItemId),
    );
    return ITEM_OPTIONS.filter(o => consumers.has(o.id));
  }, [filterInputItemId]);

  const [itemId, setItemId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  // Deliberately not persisted — always starts unchecked so a stale "on" can't
  // surprise someone with a whole tree of nodes.
  const [withPrereqs, setWithPrereqs] = useState(false);

  const machineTiers = useSettingsStore(s => s.machineTiers);
  const recipes = useMemo(
    () => (itemId ? applyTierFilter(recipesProducing(itemId), machineTiers) : []),
    [itemId, machineTiers],
  );
  const isRaw = itemId !== null && recipes.length === 0;

  function pickItem(id: string) {
    setItemId(id);
    const rs = applyTierFilter(recipesProducing(id), machineTiers);
    setRecipeId(pickDefaultRecipe(rs, machineTiers)?.id ?? null);
  }

  // When opened via drag-off-a-handle, pre-select that ingredient.
  useEffect(() => {
    if (open && prefillItemId) pickItem(prefillItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillItemId]);

  // Prerequisites can only be offered when moving backward toward raw materials:
  // a standalone add, or a drag off an INPUT handle (the new node is the producer,
  // its output auto-wired). Dragging off an output handle moves forward — the new
  // consumer's dragged-in ingredient is already fed, so the option never shows.
  const selectedRecipe = recipes.find(r => r.id === recipeId);
  const canOfferPrereqs =
    !filterInputItemId &&
    (pendingConnect === null || pendingConnect.fromHandleType === 'target') &&
    !isRaw &&
    (selectedRecipe?.inputs.length ?? 0) > 0;

  function reset() {
    setItemId(null);
    setRecipeId(null);
    setWithPrereqs(false);
  }

  function confirm() {
    if (!itemId) return;
    if (withPrereqs && canOfferPrereqs) {
      addPrerequisiteTree(itemId, recipeId, pos ?? undefined);
    } else {
      addNode(itemId, isRaw ? null : recipeId, pos ?? undefined);
    }
    reset();
  }

  function close() {
    reset();
    closeAddDialog();
  }

  function addFactory() {
    addFactoryNode(pos ?? undefined);
    reset();
  }

  return (
    <Modal open={open} title="Add node" onClose={close}>
      <div className="space-y-3">
        <button
          onClick={addFactory}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-accent/20 border border-accent/60 text-ink hover:bg-accent/30 text-sm"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-accent text-canvas text-xs font-bold">F</span>
          <span className="font-medium">Factory</span>
          <span className="text-xs text-ink-dim ml-auto">sub-diagram</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-line-soft" />
          <span className="text-[10px] uppercase tracking-wide text-ink-dim">or item</span>
          <div className="flex-1 h-px bg-line-soft" />
        </div>

        <div>
          <label className="block text-xs text-ink-dim mb-1">Item</label>
          <Combobox
            options={options}
            value={itemId}
            onChange={pickItem}
            placeholder="Search items…"
            autoFocus={!prefillItemId}
          />
        </div>

        {canOfferPrereqs && (
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withPrereqs}
              onChange={e => setWithPrereqs(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Add all prerequisite nodes
          </label>
        )}

        {recipes.length > 1 && (
          <div>
            <label className="block text-xs text-ink-dim mb-1">Recipe / version</label>
            <Select
              value={recipeId ?? ''}
              onChange={e => setRecipeId(e.target.value)}
            >
              {recipes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.machine}
                  {r.buildingTier ? ` ${r.buildingTier}` : ''} — {r.outputRatePerMin}/min
                </option>
              ))}
            </Select>
          </div>
        )}

        {isRaw && (
          <p className="text-xs text-accent/80">Raw resource — extractor settings can be configured after adding.</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={close}
            className="px-3 py-1.5 text-sm rounded text-ink-mid hover:bg-panel-2"
          >
            Cancel
          </button>
          <Button
            onClick={confirm}
            disabled={!itemId}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
