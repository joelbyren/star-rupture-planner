import { usePlanStore } from '../store/planStore.ts';
import { Modal } from './ui/Modal.tsx';

/** Elements queued for deletion, awaiting the user's confirmation. */
export interface PendingDelete {
  nodeIds: string[];
  edgeIds: string[];
}

interface DeleteSelectionDialogProps {
  pending: PendingDelete | null;
  onClose: () => void;
}

/** Confirms deletion of the selected nodes (edge-only deletions never get here — they delete instantly). */
export function DeleteSelectionDialog({ pending, onClose }: DeleteSelectionDialogProps) {
  const removeElements = usePlanStore(s => s.removeElements);
  const count = pending?.nodeIds.length ?? 0;
  const label = count === 1 ? '1 node' : `${count} nodes`;

  function confirm() {
    if (pending) removeElements(pending.nodeIds, pending.edgeIds);
    onClose();
  }

  return (
    <Modal open={pending !== null} title={`Delete ${label}?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-mid">
          Delete the {count === 1 ? 'selected node' : `${count} selected nodes`}? Connected edges
          are removed too, and factories are deleted with everything inside them.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded text-ink-mid hover:bg-panel-2"
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={confirm}
            className="px-3 py-1.5 text-sm rounded bg-danger text-canvas hover:opacity-90"
          >
            Delete {label}
          </button>
        </div>
      </div>
    </Modal>
  );
}
