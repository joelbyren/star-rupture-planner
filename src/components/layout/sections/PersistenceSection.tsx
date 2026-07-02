import { usePlanStore } from '../../../store/planStore.ts';
import { buildSnapshot, saveSnapshot, loadLatestSnapshot, exportSnapshot, importSnapshotFromFile } from '../../../lib/persistence.ts';
import { SidebarSection, SidebarButton } from './SidebarSection.tsx';

export function PersistenceSection() {
  const store = usePlanStore();

  async function handleSave() {
    await saveSnapshot(buildSnapshot(store));
    alert('Plan saved.');
  }

  async function handleLoad() {
    const snapshot = await loadLatestSnapshot();
    if (!snapshot) { alert('No saved plans found.'); return; }
    store.loadPlan(snapshot);
  }

  function handleExport() {
    exportSnapshot(buildSnapshot(store));
  }

  function handleImport() {
    importSnapshotFromFile(
      snapshot => store.loadPlan(snapshot),
      message => alert(message),
    );
  }

  return (
    <SidebarSection title="Persistence">
      <div className="flex flex-col gap-1.5">
        <SidebarButton onClick={handleSave}>Save</SidebarButton>
        <SidebarButton onClick={handleLoad}>Load</SidebarButton>
        <SidebarButton onClick={handleExport}>Export JSON</SidebarButton>
        <SidebarButton onClick={handleImport}>Import JSON</SidebarButton>
      </div>
    </SidebarSection>
  );
}
