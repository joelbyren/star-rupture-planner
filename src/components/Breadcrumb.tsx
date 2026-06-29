import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../store/planStore.ts';

/** Path bar shown while inside one or more nested factories: "Main / Foo / Bar". */
export function Breadcrumb() {
  const planName = usePlanStore(s => s.planName);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const exitTo = usePlanStore(s => s.exitTo);

  if (viewPath.length === 0) return null;

  // Resolve each factory id along the path to its display name.
  const labels: string[] = [];
  let graph = rootGraph;
  for (const id of viewPath) {
    const fac = graph.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
    labels.push(fac?.data.name ?? 'Factory');
    if (fac) graph = fac.data.inner;
  }

  const crumbs = [planName || 'Main', ...labels];

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-xs shadow-lg">
      {crumbs.map((label, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-600">/</span>}
          {i < crumbs.length - 1 ? (
            <button onClick={() => exitTo(i)} className="text-violet-300 hover:text-violet-200 hover:underline">
              {label}
            </button>
          ) : (
            <span className="text-slate-200 font-medium">{label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
