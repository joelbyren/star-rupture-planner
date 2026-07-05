import { useState } from 'react';
import { usePlanStore } from '../../../store/planStore.ts';
import { Modal } from '../../ui/Modal.tsx';
import { SettingsDialog } from '../../SettingsDialog.tsx';
import { SidebarSection, SidebarButton } from './SidebarSection.tsx';

export function ActionsSection() {
  const viewPath = usePlanStore(s => s.viewPath);
  const openAddDialog = usePlanStore(s => s.openAddDialog);
  const autoLayout = usePlanStore(s => s.autoLayout);
  const addInputPort = usePlanStore(s => s.addInputPort);
  const addOutputPort = usePlanStore(s => s.addOutputPort);
  const removeCurrentFactory = usePlanStore(s => s.removeCurrentFactory);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const insideFactory = viewPath.length > 0;

  return (
    <SidebarSection title="Actions">
      <div className="flex flex-col gap-1.5">
        <SidebarButton onClick={() => setSettingsOpen(true)}>Settings</SidebarButton>
        <SidebarButton onClick={() => openAddDialog()}>+ Add node</SidebarButton>
        <SidebarButton onClick={() => autoLayout()}>Auto layout</SidebarButton>
        {insideFactory && (
          <>
            <div className="h-px bg-line-soft my-1" />
            <SidebarButton onClick={() => addInputPort()}>+ Input port</SidebarButton>
            <SidebarButton onClick={() => addOutputPort()}>+ Output port</SidebarButton>
            <SidebarButton danger onClick={() => setConfirmDelete(true)}>Delete factory</SidebarButton>
          </>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Modal open={confirmDelete} title="Delete factory?" onClose={() => setConfirmDelete(false)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-mid">
            Delete this factory and everything inside it? This also removes its connections
            in the parent graph. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-sm rounded text-ink-mid hover:bg-panel-2"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); removeCurrentFactory(); }}
              className="px-3 py-1.5 text-sm rounded bg-danger text-canvas hover:opacity-90"
            >
              Delete factory
            </button>
          </div>
        </div>
      </Modal>
    </SidebarSection>
  );
}
