import { useEffect, useState } from 'react';
import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../../store/planStore.ts';
import { AutoGrowInput } from '../ui/AutoGrowInput.tsx';

/**
 * Path shown at all times: "Main / Foo / Bar". The deepest crumb is the
 * currently-viewed level (plan root or a nested factory) and is editable
 * inline; every ancestor is a clickable navigation link. This is the only
 * place plan/factory names are edited — there is no separate "main name"
 * field elsewhere.
 */
export function Breadcrumb() {
  const planName = usePlanStore(s => s.planName);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const exitTo = usePlanStore(s => s.exitTo);
  const renameFactory = usePlanStore(s => s.renameFactory);
  const renamePlan = usePlanStore(s => s.renamePlan);

  // Resolve each factory id along the path to its display name.
  const labels: string[] = [];
  let graph = rootGraph;
  for (const id of viewPath) {
    const fac = graph.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
    labels.push(fac?.data.name ?? 'Factory');
    if (fac) graph = fac.data.inner;
  }

  const atRoot = viewPath.length === 0;
  const ancestors = atRoot ? [] : [planName || 'Main', ...labels.slice(0, -1)];
  const currentName = atRoot ? (planName || 'Main') : labels[labels.length - 1];
  const currentKey = atRoot ? 'plan-root' : viewPath[viewPath.length - 1];
  const onRename = atRoot ? renamePlan : renameFactory;

  return <BreadcrumbInner ancestors={ancestors} currentKey={currentKey} currentName={currentName}
    onExit={exitTo} onRename={onRename} />;
}

function BreadcrumbInner({
  ancestors, currentKey, currentName, onExit, onRename,
}: {
  ancestors: string[];
  currentKey: string;
  currentName: string;
  onExit: (index: number) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(currentName);
  useEffect(() => { setDraft(currentName); }, [currentKey, currentName]);

  function commitName() {
    const next = draft.trim();
    if (next && next !== currentName) onRename(next);
    else setDraft(currentName);
  }

  return (
    <div className="flex items-center gap-1 text-xs uppercase tracking-wide">
      {ancestors.map((label, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="sr-crumb-sep text-ink-dim">/</span>}
          <button
            onClick={() => onExit(i)}
            className="text-ink-mid hover:text-ink hover:underline"
          >
            {label}
          </button>
        </span>
      ))}
      {ancestors.length > 0 && <span className="sr-crumb-sep text-ink-dim">/</span>}
      <AutoGrowInput
        id="crumb-rename"
        name="crumb-rename"
        value={draft}
        onChange={setDraft}
        onCommit={commitName}
        onCancel={() => setDraft(currentName)}
        title={ancestors.length > 0 ? 'Rename factory' : 'Rename plan'}
        className="bg-transparent text-ink font-medium px-0.5 rounded border border-transparent hover:border-line-soft focus:border-accent focus:outline-none"
      />
    </div>
  );
}
