import { useMemo } from 'react';
import { Modal } from './ui/Modal.tsx';
import { Combobox, type ComboboxOption } from './ui/Combobox.tsx';
import { Button } from './ui/Button.tsx';
import { usePlanStore, currentFactory } from '../store/planStore.ts';
import { SORTED_ITEMS } from '../data/index.ts';

const ITEM_OPTIONS: ComboboxOption[] = SORTED_ITEMS.map(i => ({ id: i.id, label: i.name, hint: i.type }));

export function PortConfigDialog() {
  const portDialogPortId = usePlanStore(s => s.portDialogPortId);
  const rootGraph = usePlanStore(s => s.rootGraph);
  const viewPath = usePlanStore(s => s.viewPath);
  const closePortDialog = usePlanStore(s => s.closePortDialog);
  const setPortItem = usePlanStore(s => s.setPortItem);
  const removePort = usePlanStore(s => s.removePort);

  // Resolve the port within the factory whose inner graph is currently open.
  const found = useMemo(() => {
    if (!portDialogPortId) return null;
    const fac = currentFactory(rootGraph, viewPath);
    if (!fac) return null;
    const input = fac.data.inputs.find(p => p.id === portDialogPortId);
    if (input) return { port: input, side: 'input' as const };
    const output = fac.data.outputs.find(p => p.id === portDialogPortId);
    if (output) return { port: output, side: 'output' as const };
    return null;
  }, [portDialogPortId, rootGraph, viewPath]);

  if (!found) return null;

  const { port, side } = found;

  return (
    <Modal open title={`${side === 'input' ? 'Input' : 'Output'} port`} onClose={closePortDialog}>
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
          <Button variant="danger" onClick={() => removePort(port.id)}>
            Delete port
          </Button>
          <div className="flex gap-2">
            {port.itemId !== null && (
              <Button variant="ghost" onClick={() => setPortItem(port.id, null)}>
                Set to ?
              </Button>
            )}
            <Button onClick={closePortDialog}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
