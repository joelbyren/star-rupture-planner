import { usePlanStore } from '../../../store/planStore.ts';
import { buildSnapshot, exportSnapshot, importSnapshotFromFile } from '../../../lib/persistence.ts';
import { SidebarSection, SidebarButton } from './SidebarSection.tsx';

export function PersistenceSection() {
  const store = usePlanStore();

  function handleExport() {
    exportSnapshot(buildSnapshot(store));
  }

  function handleImport() {
    importSnapshotFromFile(
      snapshot => store.loadPlan(snapshot),
      message => alert(message),
    );
  }

  function handleNew() {
    // The plan auto-saves to the browser, so starting fresh discards it — warn first.
    if (!confirm('Start a new plan? The current plan will be cleared. Export it first if you want to keep a copy.')) return;
    store.newPlan();
  }

  return (
    <SidebarSection title="Plan">
      <p className="text-[10px] leading-snug text-ink-dim mb-2">
        Your plan is saved in this browser automatically. Use Export to back it up or move it to another machine.
      </p>
      <div className="flex flex-col gap-1.5">
        <SidebarButton onClick={handleExport}>Export JSON</SidebarButton>
        <SidebarButton onClick={handleImport}>Import JSON</SidebarButton>
        <SidebarButton onClick={handleNew} danger>New plan</SidebarButton>
      </div>
    </SidebarSection>
  );
}
