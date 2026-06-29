import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal.tsx';
import { Combobox, type ComboboxOption } from './ui/Combobox.tsx';
import { usePlanStore } from '../store/planStore.ts';
import recipesJson from '../data/recipes.json';
import itemsJson from '../data/items.json';
import type { Recipe, Item } from '../engine/types.ts';

const ALL_RECIPES = recipesJson as Recipe[];
const ALL_ITEMS = itemsJson as Item[];

// De-duplicate items by id (source data has a known duplicate), then sort
// alphabetically by name rather than leaving them in raw data-file order.
const ITEM_OPTIONS: ComboboxOption[] = Array.from(
  new Map(ALL_ITEMS.map(i => [i.id, i])).values(),
)
  .map(i => ({ id: i.id, label: i.name, hint: i.type }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Recipes producing an item, sorted alphabetically (machine → tier → rate)
// rather than in raw recipe-file order.
function recipesForItem(itemId: string): Recipe[] {
  return ALL_RECIPES
    .filter(r => r.outputItemId === itemId)
    .sort(
      (a, b) =>
        a.machine.localeCompare(b.machine) ||
        (a.buildingTier ?? '').localeCompare(b.buildingTier ?? '') ||
        a.outputRatePerMin - b.outputRatePerMin,
    );
}

export function AddNodeDialog() {
  const open = usePlanStore(s => s.addDialogOpen);
  const pos = usePlanStore(s => s.addDialogPos);
  const prefillItemId = usePlanStore(s => s.addDialogPrefillItemId);
  const filterInputItemId = usePlanStore(s => s.addDialogFilterInputItemId);
  const closeAddDialog = usePlanStore(s => s.closeAddDialog);
  const addNode = usePlanStore(s => s.addNode);
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

  const recipes = useMemo(() => (itemId ? recipesForItem(itemId) : []), [itemId]);
  const isRaw = itemId !== null && recipes.length === 0;

  function pickItem(id: string) {
    setItemId(id);
    const rs = recipesForItem(id);
    setRecipeId(rs[0]?.id ?? null);
  }

  // When opened via drag-off-a-handle, pre-select that ingredient.
  useEffect(() => {
    if (open && prefillItemId) pickItem(prefillItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillItemId]);

  function reset() {
    setItemId(null);
    setRecipeId(null);
  }

  function confirm() {
    if (!itemId) return;
    addNode(itemId, isRaw ? null : recipeId, pos ?? undefined);
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
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-violet-600/20 border border-violet-600/60 text-violet-200 hover:bg-violet-600/30 text-sm"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-600 text-white text-xs font-bold">F</span>
          <span className="font-medium">Factory</span>
          <span className="text-xs text-violet-300/70 ml-auto">sub-diagram</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-[10px] uppercase tracking-wide text-slate-500">or item</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Item</label>
          <Combobox
            options={options}
            value={itemId}
            onChange={pickItem}
            placeholder="Search items…"
            autoFocus={!prefillItemId}
          />
        </div>

        {recipes.length > 1 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Recipe / version</label>
            <select
              value={recipeId ?? ''}
              onChange={e => setRecipeId(e.target.value)}
              className="w-full bg-slate-700 border border-slate-500 rounded text-sm text-white px-2 py-1.5 cursor-pointer"
            >
              {recipes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.machine}
                  {r.buildingTier ? ` ${r.buildingTier}` : ''} — {r.outputRatePerMin}/min
                </option>
              ))}
            </select>
          </div>
        )}

        {isRaw && (
          <p className="text-xs text-amber-300/80">Raw resource — extractor settings can be configured after adding.</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={close}
            className="px-3 py-1.5 text-sm rounded text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!itemId}
            className="px-3 py-1.5 text-sm rounded bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}
