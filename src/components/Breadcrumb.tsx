import { useEffect, useState } from 'react';
import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../store/planStore.ts';
import { Modal } from './ui/Modal.tsx';

/**
 * Path bar shown while inside one or more nested factories: "Main / Foo / Bar".
 * The deepest crumb is the current factory and is editable inline; the bar also
 * hosts the factory's actions (add input/output port, delete factory).
 */
export function Breadcrumb() {
  const planName = usePlanStore(s => s.planName);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const exitTo = usePlanStore(s => s.exitTo);
  const renameFactory = usePlanStore(s => s.renameFactory);
  const removeCurrentFactory = usePlanStore(s => s.removeCurrentFactory);
  const addInputPort = usePlanStore(s => s.addInputPort);
  const addOutputPort = usePlanStore(s => s.addOutputPort);

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

  // Inline rename draft, re-synced whenever we navigate to a different factory.
  const [draft, setDraft] = useState(currentName);
  useEffect(() => { setDraft(currentName); }, [currentId, currentName]);

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (viewPath.length === 0) return null;

  const ancestors = [planName || 'Main', ...labels.slice(0, -1)];

  function commitName() {
    const next = draft.trim();
    if (next && next !== currentName) renameFactory(next);
    else setDraft(currentName);
  }

  const btn = 'text-[11px] px-1.5 py-0.5 rounded shadow-sm';

  return (
    <>
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded px-2 py-1 text-xs shadow-lg">
        <div className="flex items-center gap-1">
          {ancestors.map((label, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-600">/</span>}
              <button
                onClick={() => exitTo(i)}
                className="text-violet-300 hover:text-violet-200 hover:underline"
              >
                {label}
              </button>
            </span>
          ))}
          <span className="text-slate-600">/</span>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') { setDraft(currentName); e.currentTarget.blur(); }
            }}
            title="Rename factory"
            className="bg-transparent text-slate-200 font-medium px-0.5 rounded border border-transparent hover:border-slate-600 focus:border-violet-500 focus:bg-slate-800 focus:outline-none"
            style={{ width: `${Math.max(draft.length, 4) + 1}ch` }}
          />
        </div>

        <span className="w-px h-4 bg-slate-700" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => addInputPort()}
            className={`${btn} bg-violet-600 hover:bg-violet-500 text-white`}
          >
            + input
          </button>
          <button
            onClick={() => addOutputPort()}
            className={`${btn} bg-violet-600 hover:bg-violet-500 text-white`}
          >
            + output
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className={`${btn} bg-red-600/80 hover:bg-red-600 text-white`}
          >
            Delete
          </button>
        </div>
      </div>

      <Modal open={confirmDelete} title="Delete factory?" onClose={() => setConfirmDelete(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Delete <span className="font-semibold text-white">{currentName}</span> and everything inside
            it? This also removes its connections in the parent graph. This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-sm rounded text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); removeCurrentFactory(); }}
              className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-500"
            >
              Delete factory
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
