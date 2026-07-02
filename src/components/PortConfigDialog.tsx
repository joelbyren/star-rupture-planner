import { useMemo } from 'react';
import { Modal } from './ui/Modal.tsx';
import { Combobox, type ComboboxOption } from './ui/Combobox.tsx';
import { usePlanStore, isFactoryNode, type FactoryNodeType } from '../store/planStore.ts';
import itemsJson from '../data/items.json';
import type { Item, FactoryPort } from '../engine/types.ts';

const ALL_ITEMS = itemsJson as Item[];
const ITEM_OPTIONS: ComboboxOption[] = Array.from(new Map(ALL_ITEMS.map(i => [i.id, i])).values())
  .map(i => ({ id: i.id, label: i.name, hint: i.type }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function PortConfigDialog() {
  const portDialogPortId = usePlanStore(s => s.portDialogPortId);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const closePortDialog = usePlanStore(s => s.closePortDialog);
  const setPortItem = usePlanStore(s => s.setPortItem);
  const removePort = usePlanStore(s => s.removePort);

  // Resolve the port within the factory whose inner graph is currently open.
  const found = useMemo(() => {
    if (!portDialogPortId || viewPath.length === 0) return null;
    let graph = rootGraph;
    for (const id of viewPath.slice(0, -1)) {
      const f = graph.nodes.find(n => n.id === id && isFactoryNode(n)) as FactoryNodeType | undefined;
      if (!f) return null;
      graph = f.data.inner;
    }
    const fac = graph.nodes.find(n => n.id === viewPath[viewPath.length - 1] && isFactoryNode(n)) as
      | FactoryNodeType
      | undefined;
    if (!fac) return null;
    const input = fac.data.inputs.find((p: FactoryPort) => p.id === portDialogPortId);
    if (input) return { port: input, side: 'input' as const };
    const output = fac.data.outputs.find((p: FactoryPort) => p.id === portDialogPortId);
    if (output) return { port: output, side: 'output' as const };
    return null;
  }, [portDialogPortId, rootGraph, viewPath]);

  const open = !!found;
  if (!found) return <Modal open={false} onClose={closePortDialog}><span /></Modal>;

  const { port, side } = found;

  return (
    <Modal open={open} title={`${side === 'input' ? 'Input' : 'Output'} port`} onClose={closePortDialog}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-ink-dim mb-1">Item {port.itemId === null && <span className="text-ink-dim">(unset — "?")</span>}</label>
          <Combobox
            options={ITEM_OPTIONS}
            value={port.itemId}
            onChange={id => setPortItem(port.id, id)}
            placeholder="Search items…"
            autoFocus
          />
        </div>

        <div className="flex justify-between gap-2 pt-1">
          <button
            onClick={() => removePort(port.id)}
            className="px-3 py-1.5 text-sm rounded bg-danger/80 text-canvas hover:bg-danger"
          >
            Delete port
          </button>
          <div className="flex gap-2">
            {port.itemId !== null && (
              <button
                onClick={() => setPortItem(port.id, null)}
                className="px-3 py-1.5 text-sm rounded bg-panel-2 text-ink-mid hover:text-ink"
              >
                Set to ?
              </button>
            )}
            <button
              onClick={closePortDialog}
              className="px-3 py-1.5 text-sm rounded bg-accent text-canvas hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
