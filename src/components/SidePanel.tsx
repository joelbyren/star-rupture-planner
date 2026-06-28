import { usePlanStore } from '../store/planStore.ts';
import itemsJson from '../data/items.json';
import type { Item, NodeResult } from '../engine/types.ts';

const ALL_ITEMS = itemsJson as Item[];

export function SidePanel() {
  const { targetItemId, targetRatePerMin, result, setTarget } = usePlanStore();

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col p-4 gap-4 overflow-y-auto">
      <h1 className="text-lg font-bold text-white">StarRupture Planner</h1>

      <section>
        <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
          Target Item
        </label>
        <select
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
          value={targetItemId}
          onChange={e => setTarget(e.target.value, targetRatePerMin)}
        >
          {ALL_ITEMS.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </section>

      <section>
        <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1">
          Target Rate (per min)
        </label>
        <input
          type="number"
          min={0.1}
          step={0.5}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
          value={targetRatePerMin}
          onChange={e => setTarget(targetItemId, Number(e.target.value))}
        />
      </section>

      {result && (
        <section className="border-t border-slate-700 pt-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Computed Chain</div>
          <ChainSummary result={result} depth={0} />
        </section>
      )}
    </div>
  );
}

function ChainSummary({ result, depth }: { result: NodeResult; depth: number }) {
  return (
    <div style={{ paddingLeft: depth * 12 }} className="mb-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-300">{result.itemId}</span>
        <span className="text-violet-400">{result.ratePerMin.toFixed(1)}/min</span>
      </div>
      <div className="text-xs text-slate-500">
        {result.buildingTier} × {result.buildingCount}
      </div>
      {result.inputs.map((child, i) => (
        <ChainSummary key={i} result={child} depth={depth + 1} />
      ))}
    </div>
  );
}
