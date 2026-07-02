import { useEffect, useState } from 'react';
import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../../store/planStore.ts';

/**
 * Path shown while inside one or more nested factories: "Main / Foo / Bar".
 * The deepest crumb is the current factory and is editable inline. Factory
 * actions (ports, delete) live in the sidebar's Actions section, not here.
 */
export function Breadcrumb() {
  const planName = usePlanStore(s => s.planName);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const exitTo = usePlanStore(s => s.exitTo);
  const renameFactory = usePlanStore(s => s.renameFactory);

  if (viewPath.length === 0) return null;

  // Resolve each factory id along the path to its display name.
  const labels: string[] = [];
  let graph = rootGraph;
  for (const id of viewPath) {
    const fac = graph.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
    labels.push(fac?.data.name ?? 'Factory');
    if (fac) graph = fac.data.inner;
  }

  const currentId = viewPath[viewPath.length - 1];
  const currentName = labels[labels.length - 1] ?? '';
  const ancestors = [planName || 'Main', ...labels.slice(0, -1)];

  return <BreadcrumbInner ancestors={ancestors} currentId={currentId} currentName={currentName}
    onExit={exitTo} onRename={renameFactory} />;
}

function BreadcrumbInner({
  ancestors, currentId, currentName, onExit, onRename,
}: {
  ancestors: string[];
  currentId: string;
  currentName: string;
  onExit: (index: number) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(currentName);
  useEffect(() => { setDraft(currentName); }, [currentId, currentName]);

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
      <span className="sr-crumb-sep text-ink-dim">/</span>
      <input
        id="factory-rename"
        name="factory-rename"
        autoComplete="off"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { setDraft(currentName); e.currentTarget.blur(); }
        }}
        title="Rename factory"
        className="bg-transparent text-ink font-medium px-0.5 rounded border border-transparent hover:border-line-soft focus:border-accent focus:outline-none"
        style={{ width: `${Math.max(draft.length, 4) + 1}ch` }}
      />
    </div>
  );
}
