import { usePlanStore } from '../store/planStore.ts';
import { db } from '../db/db.ts';
import type { PlanSnapshot } from '../store/planStore.ts';

export function PersistenceBar() {
  const store = usePlanStore();

  async function handleSave() {
    const snapshot: PlanSnapshot = {
      planId: store.planId,
      planName: store.planName,
      activeRecipes: store.activeRecipes,
      targetItemId: store.targetItemId,
      targetRatePerMin: store.targetRatePerMin,
      nodes: store.nodes,
      edges: store.edges,
    };
    await db.plans.put(snapshot);
    alert('Plan saved.');
  }

  async function handleLoad() {
    const plans = await db.plans.toArray();
    if (!plans.length) { alert('No saved plans found.'); return; }
    // Load the most recently saved plan.
    store.loadPlan(plans[plans.length - 1]);
  }

  function handleExport() {
    const snapshot: PlanSnapshot = {
      planId: store.planId,
      planName: store.planName,
      activeRecipes: store.activeRecipes,
      targetItemId: store.targetItemId,
      targetRatePerMin: store.targetRatePerMin,
      nodes: store.nodes,
      edges: store.edges,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.planName.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const snapshot = JSON.parse(text) as PlanSnapshot;
      store.loadPlan(snapshot);
    };
    input.click();
  }

  return (
    <div className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex gap-2 items-center">
      <span className="text-slate-400 text-xs mr-2">Plan:</span>
      <input
        className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-white text-sm w-40"
        value={store.planName}
        onChange={e => usePlanStore.setState({ planName: e.target.value })}
      />
      <div className="flex gap-1 ml-auto">
        {[
          { label: 'Save', action: handleSave },
          { label: 'Load', action: handleLoad },
          { label: 'Export JSON', action: handleExport },
          { label: 'Import JSON', action: handleImport },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className="bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white text-xs px-3 py-1 rounded transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
